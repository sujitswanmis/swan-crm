import crypto from 'node:crypto';

function getTelemetrySecret() {
  const secret = process.env.FIELD_TELEMETRY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) {
    throw new Error('Telemetry signing secret is not configured');
  }
  return secret;
}

/**
 * Signs a user-scoped field telemetry token (HMAC-SHA256) so Android background
 * services can upload buffered GPS pings without embedding Supabase service keys.
 */
export function signFieldTelemetryToken({ userId, company = 'TNT00001', branchCode = null, ttlMs = 7 * 24 * 3600 * 1000 }) {
  if (!userId) throw new Error('userId is required to sign telemetry token');
  const payload = {
    uid: String(userId),
    cmp: String(company || 'TNT00001'),
    br: branchCode ? String(branchCode) : null,
    exp: Date.now() + ttlMs
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', getTelemetrySecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifyFieldTelemetryToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSigB64 = crypto
      .createHmac('sha256', getTelemetrySecret())
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSigB64, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!claims?.uid || !claims?.exp || Number(claims.exp) < Date.now()) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
