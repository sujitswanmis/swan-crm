const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const apiKey = envVars['OPENAI_API_KEY'];
const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Using API key prefix:", apiKey ? apiKey.substring(0, 15) : "none");
  const messages = [
    { role: 'user', content: 'What products does Swan offer?' }
  ];

  try {
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are public AI assistant for New Swan.' },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1000
    };

    console.log("Sending request to OpenAI...");
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", response.status);
    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI API Error detail:", data);
    } else {
      console.log("OpenAI Response content:", data.choices[0].message.content);
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

test();
