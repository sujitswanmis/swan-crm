const plivo = require('plivo');
const client = new plivo.Client('MAXXXXXXXXXXXXXXXXXX', 'auth_token');
console.log('calls keys:', Object.keys(client.calls));
console.log('calls prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(client.calls)));
