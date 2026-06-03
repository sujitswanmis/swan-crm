import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { messages, userId } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required for AI usage tracking. Please refresh the page.' }, { status: 400 });
    }

    // 1. Check AI Token Usage
    const { data: usageData, error: usageError } = await supabase
      .from('ai_token_usage')
      .select('total_tokens, token_limit')
      .eq('user_id', userId)
      .single();

    // If user has a record and has exceeded the limit, block the request
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

    // Call OpenAI API using native fetch
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `You are New Swan AI, an extremely smart and adaptive professional CRM assistant. You have FULL VISION CAPABILITIES and can analyze data, text, and uploaded images perfectly. 
- If the user uploads an image, YOU MUST LOOK AT THE IMAGE and describe it or answer questions about it. Do not say you cannot see it.
- You are STRICTLY FORBIDDEN from generating, drawing, or attempting to create images under any circumstances.

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
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      
      const errorMessage = errorData.error?.message || 'Failed to communicate with AI provider';
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;
    const tokensUsed = data.usage?.total_tokens || 0;

    // 2. Update Token Usage
    if (tokensUsed > 0) {
      if (!usageError && usageData) {
        // Supabase returns BIGINT as a string, so we must parse it to avoid string concatenation
        let currentTokens = Number(usageData.total_tokens) || 0;
        
        // If the user got stuck with a string concatenated bug (e.g., 145645), let's reset it to a sane value
        if (currentTokens > 100000 && tokensUsed < 2000) {
           currentTokens = 0; // Reset bugged tokens
        }

        await supabase.from('ai_token_usage').update({ 
          total_tokens: currentTokens + tokensUsed 
        }).eq('user_id', userId);
      } else {
        // Insert new record if one doesn't exist
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          total_tokens: tokensUsed,
          token_limit: 100000 // Default limit
        });
      }
    }

    return NextResponse.json({ content: aiMessage });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
