const plivo = require('plivo');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

try {
  const token = new plivo.AccessToken(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN, 'admin434792858589734357666520', {
    validTill: Math.floor(Date.now()/1000) + 3600
  }, "test_user_id_123");
  token.addVoiceGrants(true, true);
  console.log('JWT:', token.toJwt());
  
  // Decode JWT payload
  const parts = token.toJwt().split('.');
  const payload = Buffer.from(parts[1], 'base64').toString('utf8');
  console.log('Payload:', payload);
} catch(e) {
  console.error('Error:', e.message);
}
