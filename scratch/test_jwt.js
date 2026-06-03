const plivo = require('plivo');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const endpointUsername = 'admin434792858589734357666520';

const tokenObj = new plivo.AccessToken(authId, authToken, endpointUsername);
tokenObj.addVoiceGrants(true, true);
const token = tokenObj.toJwt();
console.log('Token:', token);

// Decode payload
const parts = token.split('.');
const payload = Buffer.from(parts[1], 'base64').toString('utf8');
console.log('Payload:', payload);
