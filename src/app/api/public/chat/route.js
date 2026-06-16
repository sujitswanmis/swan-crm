import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is missing on the server' }, { status: 500 });
    }

    // --- RAG Knowledge Base Retrieval (Public Only) ---
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
              match_count: 10
            });
            
            // Filter to only allow documents starting with [public]
            const publicDocs = (matchedDocs || [])
              .filter(d => d.title.startsWith('[public]'))
              .slice(0, 3);
            
            if (publicDocs.length > 0) {
              knowledgeContext = "\n\n--- COMPANY KNOWLEDGE BASE ---\nUse the following official company rules/policies to answer the user if relevant:\n\n" + 
                publicDocs.map(d => {
                  // Clean both [public] and type prefix, e.g. [public][text]Title -> Title
                  const cleanTitle = d.title.replace(/^\[public\]\[(text|url|pdf)\]/, '');
                  return `Title: ${cleanTitle}\nContent: ${d.content}`;
                }).join('\n\n') +
                "\n--- END KNOWLEDGE BASE ---\n";
            }
          }
        }
      }
    } catch (err) {
      console.error('RAG Error:', err);
    }

    const systemPrompt = `You are the Public AI Assistant for New Swan. You are extremely helpful, friendly, and professional. 
Current Date and Time (IST): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}${knowledgeContext}
- Use the provided company knowledge base to answer questions about New Swan's products, services, company details, etc.
- You do NOT have access to CRM internal tools or databases (like leads, users, sales activity) to preserve security.
- Keep your answers clear, concise, and focused on helping customers learn about Swan.
- Always write responses using advanced, beautiful Markdown formatting:
  * Use clear headings (### or ####) for separate sections.
  * Use bullet points or numbered lists for lists/points.
  * Use bold text for emphasis.
  * Use Markdown tables (| Header | Header |) for stats, lists, comparisons.
  * Keep layout clean, readable, and easy to scan. NEVER use raw HTML tags.`;

    const sanitizedMessages = messages.map(m => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

    const currentMessages = [
      { role: 'system', content: systemPrompt },
      ...sanitizedMessages
    ];

    const payload = {
      model: 'gpt-4o-mini',
      messages: currentMessages,
      temperature: 0.7,
      max_tokens: 1000
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
    const finalContent = data.choices[0].message.content;

    return NextResponse.json({ content: finalContent });

  } catch (error) {
    console.error('Public Chat API Error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
