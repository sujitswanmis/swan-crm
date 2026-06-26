const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log("Definitions keys:", Object.keys(data.definitions || {}));
  })
  .catch(err => console.error(err));
