/**
 * Shared utility for generating valid public webhook URLs for Plivo.
 * Ensures Plivo webhooks NEVER hit localhost or internal private IP addresses.
 */
export function getPlivoWebhookBaseUrl(req) {
  // 1. If explicit environment variable is set, prioritize it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  // 2. Extract from request headers (x-forwarded-host / host)
  if (req) {
    try {
      const headers = req.headers;
      const host = (typeof headers?.get === 'function' ? headers.get('x-forwarded-host') || headers.get('host') : headers?.['x-forwarded-host'] || headers?.host) || '';
      const proto = (typeof headers?.get === 'function' ? headers.get('x-forwarded-proto') : headers?.['x-forwarded-proto']) || 'https';

      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        return `${proto}://${host}`;
      }
    } catch (_e) {}
  }

  // 3. Fallback to production app domain
  return 'https://app.supujacreations.com';
}
