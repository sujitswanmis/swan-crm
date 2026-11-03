import test from 'node:test';
import assert from 'node:assert/strict';
import {signPayload,verifySignature,validateDestination,isPublicAddress,encryptSecret,decryptSecret,readBody,consoleOriginAllowed} from '../src/lib/integrations/security.js';
import {mapRecord,validateMapping,readPath} from '../src/lib/integrations/connectors.js';
test('webhook verification rejects tampering and old timestamps',()=>{
  const body='{"name":"Example"}',timestamp='1793428200',now=Number(timestamp)*1000;
  const signature=signPayload('secret',body,timestamp);
  assert.equal(verifySignature('secret',body,signature,timestamp,now),true);
  assert.equal(verifySignature('secret',body+' ',signature,timestamp,now),false);
  assert.equal(verifySignature('secret',body,signature,timestamp,now+301000),false);
  assert.equal(verifySignature('',body,signature,timestamp,now),false);
});
test('outbound targets reject private IPv4, IPv6, mixed DNS answers and redirects through validation',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','172.20.1.1','169.254.169.254','100.64.0.1','192.168.1.1','::1','fe80::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(isPublicAddress(address),false,address);
  const resolver=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.2',family:4}];
  await assert.rejects(validateDestination('https://example.com/api',resolver),/public/);
  for(const url of ['http://example.com','https://example.com:3000','https://user:password@example.com','https://localhost','https://example.com?api_key=secret']) await assert.rejects(validateDestination(url),/HTTPS|Private|credentials|query/);
  assert.equal((await validateDestination('https://example.com/api',async()=>[{address:'8.8.8.8',family:4}])).addresses[0].address,'8.8.8.8');
});
test('encrypted connection credentials authenticate ciphertext and never appear in plaintext',()=>{
  const before=process.env.INTEGRATIONS_ENCRYPTION_KEY;process.env.INTEGRATIONS_ENCRYPTION_KEY='ab'.repeat(32);
  try {const value=encryptSecret({token:'private-token'});assert.equal(value.includes('private-token'),false);assert.deepEqual(decryptSecret(value),{token:'private-token'});assert.throws(()=>decryptSecret(value.slice(0,-5)+'xxxxx'),/reconnected/);}finally{process.env.INTEGRATIONS_ENCRYPTION_KEY=before || '';}
});
test('field mapping cannot traverse prototypes or map arbitrary internal lead fields',()=>{
  assert.throws(()=>validateMapping({tenant_id:'tenant'}),/unsupported/);
  assert.throws(()=>readPath({},'__proto__.secret'),/simple/);
  assert.deepEqual({...mapRecord({contact:{phone:123},name:'A'},{phone:'contact.phone',name:'name'})},{phone:'123',name:'A'});
});
test('request body size limit also applies to streaming bodies without Content-Length',async()=>{
  const request=new Request('https://example.com',{method:'POST',body:'x'.repeat(100)});
  await assert.rejects(readBody(request,50),/too large/);
});
test('console origin verification supports real proxy hosts while rejecting cross-site origins',()=>{
  const request=headers=>new Request('http://localhost:3000/api/integrations/v1/lookups',{headers});
  assert.equal(consoleOriginAllowed(request({origin:'http://127.0.0.1:3201',host:'127.0.0.1:3201'}),''),true);
  assert.equal(consoleOriginAllowed(request({origin:'https://crm.example.com',host:'crm.example.com','x-forwarded-proto':'https'}),''),true);
  assert.equal(consoleOriginAllowed(request({origin:'https://crm.example.com',host:'localhost:3000'}),'https://crm.example.com'),true);
  assert.equal(consoleOriginAllowed(request({origin:'https://evil.example',host:'crm.example.com','x-forwarded-proto':'https'}),''),false);
  assert.equal(consoleOriginAllowed(request({origin:'null',host:'localhost:3000'}),''),false);
  assert.equal(consoleOriginAllowed(request({host:'localhost:3000'}),''),false);
});
