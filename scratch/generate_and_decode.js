const plivo = require('plivo');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const now = Math.floor(Date.now() / 1000);
const token = new plivo.AccessToken(
  env.PLIVO_AUTH_ID,
  env.PLIVO_AUTH_TOKEN,
  'admin434792858589734357666520',
  {
    validFrom: now - 300,
    lifetime: 86400
  },
  '4623e039-5d06-4d38-907a-caa24211cd2d'
);

token.addVoiceGrants(true, true);
const jwtStr = token.toJwt();

console.log('Raw JWT:');
console.log(jwtStr);
console.log('\nDecoded Header:');
console.log(Buffer.from(jwtStr.split('.')[0], 'base64').toString());
console.log('\nDecoded Payload:');
console.log(Buffer.from(jwtStr.split('.')[1], 'base64').toString());
