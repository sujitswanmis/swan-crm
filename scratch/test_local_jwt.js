const jwt = require('jsonwebtoken');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const endpointUsername = 'admin434792858589734357666520';
const appId = '18308736089742385';

const now = Math.floor(Date.now() / 1000);
const payload = {
  jti: `${endpointUsername}-${Date.now()}`,
  iss: authId,
  sub: endpointUsername,
  nbf: now - 300, // 5 mins in past
  exp: now + 82800, // 23 hours
  app: appId,
  per: {
    voice: {
      incoming_allow: true,
      outgoing_allow: true
    }
  },
  grants: {
    voice: {
      incoming_allow: true,
      outgoing_allow: true
    }
  }
};

const options = {
  header: {
    typ: 'JWT',
    cty: 'plivo;v=1'
  },
  noTimestamp: true
};

const token = jwt.sign(payload, authToken, options);
console.log('Generated Token:', token);

// Verify/Decode
const decoded = jwt.decode(token, { complete: true });
console.log('Decoded Header:', JSON.stringify(decoded.header));
console.log('Decoded Payload:', JSON.stringify(decoded.payload));
