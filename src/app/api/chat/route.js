import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tools = [
  {
    type: "function",
    function: {
      name: "get_leads_summary",
      description: "Get a summary of leads grouped by status. Useful for answering questions like 'how many leads do I have?' or 'team summary'.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If the user asks for 'my leads', use 'me'. If the user asks for 'all leads' or 'team leads' (and they are an admin), use 'all'."
          }
        },
        required: ["scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Search leads by name, email, phone, or company.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search term (name, company, phone, etc.)"
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "If searching only personal leads use 'me', if searching the entire company database use 'all'."
          }
        },
        required: ["query", "scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recent_follow_ups",
      description: "Get leads that have a follow-up scheduled for today or are overdue.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope of follow-ups ('me' for user's own, 'all' for entire team)."
          }
        },
        required: ["scope"]
      }
    }
  }
];

async function executeTool(toolCall, userId, isAdmin) {
  const name = toolCall.function.name;
  let args = {};
  try {
    args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch (e) {
    // Ignore parse error
  }
  
  const scope = isAdmin && args.scope === 'all' ? 'all' : 'me';
  
  try {
    if (name === 'get_leads_summary' || name === 'get_my_leads_summary') {
      let query = supabase.from('leads').select('status');
      if (scope === 'me') query = query.eq('assigned_to', userId);
        
      const { data, error } = await query;
      if (error) throw error;
      
      const summary = data.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {});
      
      return JSON.stringify({ total: data.length, summary, scope_applied: scope });
    }
    
    if (name === 'search_leads' || name === 'search_my_leads') {
      let query = supabase
        .from('leads')
        .select('id, name, company, phone, email, status, follow_up_date, requirement')
        .or(`name.ilike.%${args.query}%,company.ilike.%${args.query}%,phone.ilike.%${args.query}%`);
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
      query = query.limit(10);
        
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ results: data, scope_applied: scope });
    }
    
    if (name === 'get_recent_follow_ups') {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('leads')
        .select('id, name, company, phone, status, follow_up_date')
        .lte('follow_up_date', today)
        .neq('status', 'Converted')
        .order('follow_up_date', { ascending: true })
        .limit(15);
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
        
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ follow_ups: data, scope_applied: scope });
    }
    
    return JSON.stringify({ error: 'Tool not found' });
  } catch (error) {
    return JSON.stringify({ error: error.message });
  }
}

export async function POST(req) {
  try {
    const { messages, userId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required for AI usage tracking. Please refresh the page.' }, { status: 400 });
    }

    // New check: Is user an Admin?
    const { data: userRoleData } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
    const isAdmin = userRoleData?.role === 'admin';

    // 1. Check AI Token Usage
    const { data: usageData, error: usageError } = await supabase
      .from('ai_token_usage')
      .select('total_tokens, token_limit')
      .eq('user_id', userId)
      .single();

    if (!usageError && usageData) {
      const currentTokens = Number(usageData.total_tokens) || 0;
      if (currentTokens >= usageData.token_limit) {
        return NextResponse.json({ error: 'Token limit exceeded. Please contact your administrator to increase your AI allowance.' }, { status: 403 });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is missing on the server' }, { status: 500 });
    }

    // --- RAG Knowledge Base Retrieval ---
    let knowledgeContext = "";
    try {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const queryText = typeof lastUserMsg.content === 'string' 
          ? lastUserMsg.content 
          : Array.isArray(lastUserMsg.content) 
            ? lastUserMsg.content.filter(c => c.type === 'text').map(c => c.text).join(' ') 
            : '';

        if (queryText.trim().length > 5) {
          const embRes = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'text-embedding-3-small', input: queryText })
          });
          if (embRes.ok) {
            const embData = await embRes.json();
            const queryEmbedding = embData.data[0].embedding;
            
            const { data: matchedDocs } = await supabase.rpc('match_company_documents', {
              query_embedding: queryEmbedding,
              match_threshold: 0.25,
              match_count: 3
            });
            
            if (matchedDocs && matchedDocs.length > 0) {
              knowledgeContext = "\n\n--- COMPANY KNOWLEDGE BASE ---\nUse the following official company rules/policies to answer the user if relevant:\n\n" + 
                matchedDocs.map(d => `Title: ${d.title}\nContent: ${d.content}`).join('\n\n') +
                "\n--- END KNOWLEDGE BASE ---\n";
            }
          }
        }
      }
    } catch (err) {
      console.error('RAG Error:', err);
    }

    let currentMessages = [
      { 
        role: 'system', 
        content: `You are New Swan AI, an extremely smart and adaptive professional CRM assistant. You have FULL VISION CAPABILITIES and can analyze data, text, and uploaded images perfectly. 
Current Date and Time (IST): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}${knowledgeContext}
- If the user uploads an image, YOU MUST LOOK AT THE IMAGE and describe it or answer questions about it. Do not say you cannot see it.
- You are STRICTLY FORBIDDEN from generating, drawing, or attempting to create images under any circumstances.
- You have access to tools that fetch live CRM data. When a user asks about their leads, use the tools.
${isAdmin ? "- YOU ARE TALKING TO AN ADMIN. You have the super-power to view data for the ENTIRE TEAM. If the admin asks for team data or 'all' leads, set the scope to 'all' in your tools." : "- You ONLY see data belonging to the logged-in user."}

IMPORTANT BEHAVIORAL RULES:
1. ALWAYS adapt your tone and language to match the user. If they use short, casual phrases, you reply concisely. 
2. HINGLISH RULE: If the user speaks in Hinglish (Hindi written in English alphabet, e.g. "kya haal hai"), you MUST reply in natural, conversational WhatsApp-style Hinglish. 
   - DO NOT use stiff, formal Hindi transliterations (e.g., avoid "karya karne mein saksham").
   - DO NOT use phonetic spellings with diacritics (e.g., write "Computer" instead of "Kampyūtar" or "Kampyutar").
   - Use standard English spellings for common English loan words (e.g., "Computer", "Data", "Internet", "Keyboard").
   - Use natural conversational phrasing (e.g., "Computer ek electronic device hai jo data ko process karta hai").
3. Always use Markdown to make your responses look beautiful and easy to read. Use clear Markdown tables for data. NEVER use raw HTML tags like <br> in your responses. Use bullet points or numbered lists. Use bold text for emphasis.`
      },
      ...messages
    ];

    let totalTokensUsed = 0;
    let finalContent = '';

    // Tool calling loop
    for (let i = 0; i < 4; i++) {
      const payload = {
        model: 'gpt-4o-mini',
        messages: currentMessages,
        temperature: 0.7,
        max_tokens: 1000,
        tools: tools,
        tool_choice: "auto"
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', errorData);
        return NextResponse.json({ error: errorData.error?.message || 'Failed to communicate with AI provider' }, { status: response.status });
      }

      const data = await response.json();
      const choice = data.choices[0];
      totalTokensUsed += data.usage?.total_tokens || 0;

      if (choice.finish_reason === 'tool_calls') {
        const toolCalls = choice.message.tool_calls;
        currentMessages.push(choice.message); // Append assistant's tool call request
        
        for (const toolCall of toolCalls) {
          const result = await executeTool(toolCall, userId, isAdmin);
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result
          });
        }
        // Continue loop to let OpenAI generate response with tool results
      } else {
        finalContent = choice.message.content;
        break; // Done
      }
    }

    // 2. Update Token Usage
    if (totalTokensUsed > 0) {
      if (!usageError && usageData) {
        let currentTokens = Number(usageData.total_tokens) || 0;
        if (currentTokens > 100000 && totalTokensUsed < 2000) {
           currentTokens = 0;
        }
        await supabase.from('ai_token_usage').update({ 
          total_tokens: currentTokens + totalTokensUsed 
        }).eq('user_id', userId);
      } else {
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          total_tokens: totalTokensUsed,
          token_limit: 100000
        });
      }
    }

    return NextResponse.json({ content: finalContent });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
