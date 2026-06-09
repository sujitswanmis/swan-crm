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
  },
  {
    type: "function",
    function: {
      name: "get_leads_by_date",
      description: "Get leads that were created or followed up on a specific date. MUST be used when the user asks about activity on a specific day (e.g. 'yesterday', 'today', 'on Monday').",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "The date in YYYY-MM-DD format (e.g., '2026-06-08'). Calculate this based on the current date provided in the system prompt."
          },
          scope: {
            type: "string",
            enum: ["me", "all"],
            description: "Scope of leads ('me' for user's own, 'all' for entire team)."
          }
        },
        required: ["date", "scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_users_summary",
      description: "Get the total count of registered users/employees/agents in the CRM system, grouped by role. Use this whenever the user asks about 'users', 'agents', or 'team members'.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_users",
      description: "Search for an employee, agent, or user by their name, email, or employee ID. Use this when the user asks for details about a specific employee.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The name, email, or employee ID to search for."
          }
        },
        required: ["query"]
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
      let allData = [];
      let page = 0;
      while (true) {
        let query = supabase.from('leads').select('status').range(page * 1000, (page + 1) * 1000 - 1);
        if (scope === 'me') query = query.eq('assigned_to', userId);
          
        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allData = allData.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      
      const summary = allData.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {});
      
      return JSON.stringify({ total: allData.length, summary, scope_applied: scope });
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
    
    if (name === 'get_users_summary') {
      const { data, error } = await supabase.from('user_roles').select('role, is_approved');
      if (error) throw error;
      const summary = data.reduce((acc, user) => {
        const key = `${user.role} (${user.is_approved ? 'Approved' : 'Pending'})`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return JSON.stringify({ total_users: data.length, breakdown: summary });
    }
    
    if (name === 'search_users') {
      const { data, error } = await supabase
        .from('user_roles')
        .select('emp_id, emp_name, email, role, emp_department, emp_designation, is_approved')
        .or(`emp_name.ilike.%${args.query}%,email.ilike.%${args.query}%,emp_id.ilike.%${args.query}%`)
        .limit(10);
      if (error) throw error;
      return JSON.stringify({ results: data });
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
    
    if (name === 'get_leads_by_date') {
      // Find leads created on that date or follow up date is that date
      let query = supabase
        .from('leads')
        .select('id, name, company, phone, status, follow_up_date, created_at')
        .or(`and(created_at.gte.${args.date}T00:00:00.000Z,created_at.lte.${args.date}T23:59:59.999Z),follow_up_date.eq.${args.date}`)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (scope === 'me') query = query.eq('assigned_to', userId);
        
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ leads: data, date: args.date, scope_applied: scope });
    }
    
    return JSON.stringify({ error: 'Tool not found' });
  } catch (error) {
    return JSON.stringify({ error: error.message });
  }
}

export async function POST(req) {
  try {
    const { messages, userId, selectedAiModel } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required for AI usage tracking. Please refresh the page.' }, { status: 400 });
    }

    const selectedAiModelInput = selectedAiModel || 'gpt-4o-mini';

    // New check: Is user an Admin?
    const { data: userRoleData } = await supabase.from('user_roles').select('role, module_access').eq('user_id', userId).single();
    const isAdmin = userRoleData?.role === 'admin';
    const assignedAiModels = (userRoleData?.module_access || {}).ai_models || ['gpt-4o-mini'];
    const premiumLimit = (userRoleData?.module_access || {}).premium_limit || 10000;

    let assignedAiModel = 'gpt-4o-mini';
    if (assignedAiModels.includes(selectedAiModelInput)) {
      assignedAiModel = selectedAiModelInput;
    } else if (assignedAiModels.length > 0) {
      assignedAiModel = assignedAiModels[0];
    }

    // 1. Check AI Token Usage
    const { data: usageData, error: usageError } = await supabase
      .from('ai_token_usage')
      .select('total_tokens, token_limit')
      .eq('user_id', userId)
      .single();

    if (usageData && usageData.total_tokens >= usageData.token_limit) {
      return NextResponse.json({ error: 'Token limit exceeded. Please contact your admin.' }, { status: 403 });
    }

    // Premium Limit Fallback Logic
    let isPremiumFallback = false;
    if (assignedAiModel !== 'gpt-4o-mini' && assignedAiModel !== 'gpt-3.5-turbo') {
      if (usageData && usageData.total_tokens >= premiumLimit) {
        assignedAiModel = 'gpt-4o-mini'; // Fallback to basic model
        isPremiumFallback = true;
      }
    }

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
- Use the search_users tool to look up details about any specific employee, agent, or team member mentioned by the user (e.g. "Who is Sujit Kumar Gupta?").
- Read and respect the user's intent.${isPremiumFallback ? ' Note: The user has reached their premium model limit, so you are running on a fallback basic model.' : ''}
- You are STRICTLY FORBIDDEN from generating, drawing, or attempting to create images under any circumstances.
- You have access to tools that fetch live CRM data. When a user asks about their leads, use the tools.
- CRITICAL: BEFORE using the search_leads tool, ALWAYS check the "COMPANY KNOWLEDGE BASE" section (if provided above). If the requested information (like company contact details, policies, etc.) is in the knowledge base, use that instead of searching for a lead!
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
        model: assignedAiModel,
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
