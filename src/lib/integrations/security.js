import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';

export class IntegrationError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message); this.name = 'IntegrationError'; this.status = status; this.code = code;
  }
}
export function assertEnabled() {
  if (process.env.INTEGRATIONS_ENABLED !== 'true') throw new IntegrationError('Integrations are paused. Ask an administrator to complete setup.', 503, 'integrations_paused');
}
export function hashSecret(value) { return createHash('sha256').update(String(value)).digest('hex'); }
export function createSecret(prefix = 'int') { return `${prefix}_${randomBytes(32).toString('base64url')}`; }
export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function encryptionKey() {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new IntegrationError('Integration encryption key is not configured.', 503, 'setup_required');
  return Buffer.from(raw, 'hex');
}
export function encryptSecret(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}
export function decryptSecret(value) {
  try {
    const [iv, tag, data] = String(value).split('.').map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError('Connection credentials need to be reconnected.', 503, 'reconnect_required');
  }
}
export function signPayload(secret, raw, timestamp) {
  return 'sha256=' + createHmac('sha256', secret).update(timestamp ? `${timestamp}.${raw}` : raw).digest('hex');
}
export function verifySignature(secret, raw, signature, timestamp, now = Date.now()) {
  if (!secret || !signature) return false;
  if (timestamp !== undefined && (!/^\d{10}$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300)) return false;
  return safeEqual(signPayload(secret, raw, timestamp), signature);
}
export function redact(value) {
  // Logs contain operational metadata only; never reflect provider errors or payload PII.
  const allowed = ['operation', 'status', 'event_type', 'http_status', 'attempt', 'record_count', 'code'];
  return Object.fromEntries(allowed.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
}
export function publicError(error) {
  const expected = error instanceof IntegrationError;
  return { success: false, error: expected ? error.message : 'Integration service is unavailable. Please retry.', code: expected ? error.code : 'service_unavailable' };
}
export function errorResponse(error) {
  return Response.json(publicError(error), { status: error instanceof IntegrationError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
export function consoleOriginAllowed(request, trustedOrigin = process.env.INTEGRATIONS_PUBLIC_ORIGIN) {
  try {
    const value=request.headers.get('origin'),origin=new URL(value),url=new URL(request.url);
    if(!['http:','https:'].includes(origin.protocol) || origin.origin!==value) return false;
    if(origin.origin===url.origin) return true;
    if(trustedOrigin) {
      const trusted=new URL(trustedOrigin);
      if(trusted.protocol==='https:' && trusted.origin===origin.origin) return true;
    }
    // Next may construct an internal request URL behind a reverse proxy/custom server.
    // Browsers cannot forge Host; require its exact host/port and the actual forwarded scheme.
    const host=request.headers.get('host');
    const protocol=request.headers.get('x-forwarded-proto') || url.protocol.slice(0,-1);
    return Boolean(host && ['http','https'].includes(protocol) && origin.host===host.toLowerCase() && origin.protocol===`${protocol}:`);
  } catch{return false;}
}
export async function readBody(request, maximum = 262144) {
  if (Number(request.headers.get('content-length')) > maximum) throw new IntegrationError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new IntegrationError('Request is too large.', 413); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseJson(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new IntegrationError('A JSON object is required.'); }
}
export function istDateBound(value, nextDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new IntegrationError('Use an IST date in YYYY-MM-DD format.');
  const date = new Date(`${value}T00:00:00+05:30`);
  const parts = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(date) : [];
  const part = type => parts.find(item=>item.type===type)?.value;
  if (`${part('year')}-${part('month')}-${part('day')}` !== value) throw new IntegrationError('Enter a valid IST calendar date.');
  return new Date(date.getTime()+(nextDay?86400000:0)).toISOString();
}
export function isPublicAddress(address) {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (kind === 6) {
    const [first, second] = address.split(':').map(part=>Number.parseInt(part,16));
    return first>=0x2000 && first<0x3fff && first!==0x2002 && !(first===0x2001 && (second<0x200 || second===0xdb8));
  }
  return false;
}
export async function validateDestination(value, resolver = lookup) {
  let url;
  try { url = new URL(value); } catch { throw new IntegrationError('Enter a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash) throw new IntegrationError('Use an HTTPS URL on port 443 without embedded credentials or fragments.');
  if (url.searchParams.size) throw new IntegrationError('Keep credentials and query parameters in the connection configuration, not the URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(host)) throw new IntegrationError('Private or local destinations are not allowed.');
  let addresses, timer;
  try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([resolver(host, { all: true, verbatim: true }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS timeout')),3000);})]); }
  catch { throw new IntegrationError('Destination DNS could not be verified.', 422, 'dns_unavailable'); }
  finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new IntegrationError('Destination must resolve only to public addresses.');
  return { url, addresses };
}
export async function safeRequest(value, options = {}, dependencies = {}) {
  const { url, addresses } = await validateDestination(value, dependencies.lookup || lookup);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  const pinned = addresses.find(item=>item.family===4) || addresses[0];
  const body = options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  if (body && Buffer.byteLength(body) > 262144) throw new IntegrationError('Outbound payload is too large.', 413);
  const headers = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) { headers['Content-Type'] ||= 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
  return new Promise((resolve, reject) => {
    let settled = false, deadline;
    const fail = error => { if (!settled) { settled = true; clearTimeout(deadline); reject(error instanceof IntegrationError ? error : new IntegrationError('External service could not be reached.', 502, 'external_unavailable')); } };
    const req = (dependencies.request || httpsRequest)(url, {
      method: options.method || 'GET', headers, family: pinned.family, autoSelectFamily: false,
      // Pin the already-validated DNS result, preventing DNS rebinding between validation and connect.
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) { response.resume(); fail(new IntegrationError('Redirect destinations are not permitted.', 502, 'redirect_rejected')); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > (options.maxBytes || 1048576)) { response.destroy(); fail(new IntegrationError('External response exceeded the size limit.', 502, 'response_too_large')); }
        else chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { /* Non-JSON responses are never reflected into logs. */ }
        resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, data });
      });
    });
    req.on('error', fail);
    deadline=setTimeout(()=>{req.destroy();fail(new IntegrationError('External request timed out.',504,'external_timeout'));},Math.min(options.timeoutMs || 10000,15000));
    req.setTimeout(Math.min(options.timeoutMs || 10000, 15000), () => { req.destroy(); fail(new IntegrationError('External request timed out.', 504, 'external_timeout')); });
    if (body !== undefined) req.write(body);
    req.end();
  });
}
