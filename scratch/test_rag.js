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

async function testRAG() {
  const queryText = "What products does Swan offer?";
  console.log("Fetching embeddings from OpenAI...");
  try {
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: queryText })
    });
    console.log("Embeddings status:", embRes.status);
    if (!embRes.ok) {
      console.error("Failed embeddings:", await embRes.text());
      return;
    }
    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding;
    
    console.log("Calling supabase RPC match_company_documents...");
    const { data: matchedDocs, error } = await supabase.rpc('match_company_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.25,
      match_count: 10
    });
    
    if (error) {
      console.error("RPC Error:", error);
    } else {
      console.log("RPC Success. Matched docs count:", matchedDocs ? matchedDocs.length : 0);
      console.log("Sample docs:", matchedDocs ? matchedDocs.slice(0, 2) : []);
    }
  } catch (err) {
    console.error("RAG Test Error:", err);
  }
}

testRAG();
