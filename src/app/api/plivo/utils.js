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

/** Map provider and carrier telecom outcomes accurately for Indian and international networks. */
export function categorizeHangupCause(callStatus, hangupCause, hangupSource, _ringingSec = 0, hasAnswered = false, hangupCauseCode = null, dialRingStatus = null) {
  const s = (callStatus || '').toLowerCase();
  const h = (hangupCause || '').toLowerCase();
  const src = (hangupSource || '').toLowerCase();
  const code = Number(hangupCauseCode);

  if (hasAnswered) return 'customer_hangup';

  // 1. User Busy (Code 17 = Q.850 User Busy, 486 = SIP Busy Here, 600 = Busy Everywhere, 3010/3100 = Plivo)
  if (
    [17, 486, 600, 3010, 3100].includes(code) ||
    h.includes('busy') ||
    s.includes('busy')
  ) {
    return 'busy';
  }

  // 2. Call Rejected / Declined (Code 21 = Q.850 Call Rejected, 603 = SIP Decline, 3020/3110 = Plivo)
  if (
    [21, 603, 3020, 3110].includes(code) ||
    h.includes('reject') ||
    h.includes('decline') ||
    s.includes('reject') ||
    s.includes('decline')
  ) {
    return 'rejected';
  }

  // 3. Unreachable / Switched Off / Absent / Out of Coverage
  // (Code 20 = Q.850 Subscriber Absent, 480 = SIP Temporarily Unavailable, 2010/2020 = Plivo)
  if (
    [20, 480, 2010, 2020].includes(code) ||
    /out of service|not registered|subscriber absent|unreachable|switched.?off|power.?off|not reachable|unavailable/.test(h) ||
    s.includes('unreachable')
  ) {
    return 'unreachable';
  }

  // Destination never rang (DialRingStatus is false/0) and call ended without answering
  // In Indian telecom (Jio, Airtel, Vi): Early media played carrier announcement ("switched off / unreachable")
  if (
    (dialRingStatus === false || dialRingStatus === 'false' || dialRingStatus === '0') &&
    (code === 16 || /normal clearing|unallocated|failed/.test(h) || s === 'failed')
  ) {
    return 'unreachable';
  }

  // 4. Invalid / Unallocated Number (Code 1 = Q.850 Unallocated, 28 = Incomplete, 404 = Not Found, 2000/3050/3120 = Plivo)
  if (
    [1, 28, 404, 2000, 3050, 3120].includes(code) ||
    /invalid destination|unallocated|user does not exist|not found|unassigned/.test(h) ||
    s.includes('invalid') ||
    s.includes('unallocated')
  ) {
    return 'invalid_number';
  }

  // 5. No Answer / Ring Timeout (Code 18/19 = Q.850 No Answer, 408 = Timeout, 3000/6010 = Plivo)
  if (
    [18, 19, 408, 3000, 6010].includes(code) ||
    /no.?answer|timeout|ring.?timeout|timed.?out/.test(h) ||
    ['no-answer', 'timeout', 'ring-timeout'].some(x => s.includes(x))
  ) {
    return 'no_answer';
  }

  // 6. Network Error / Congestion (Code 34, 38, 41, 42, 47, 503, 3070, 3080, 3090, 5000, 5020, 6020)
  if (
    [34, 38, 41, 42, 47, 503, 3070, 3080, 3090, 5000, 5020, 6020].includes(code) ||
    /congestion|network|routing error|route error|temporary failure|circuit/.test(h)
  ) {
    return 'network_error';
  }

  // 7. Capacity / Setup errors
  if ([1010, 1020, 5030].includes(code)) return 'capacity_error';
  if ([2030, 2040, 2050, 2060, 2070, 3030, 3040, 3130, 3140, 5010, 7011, 8011].includes(code)) return 'setup_error';

  // 8. Cancelled / Agent Hangup
  if (src === 'api request' || /cancel/.test(h) || /cancel/.test(s)) return 'call_cancelled';

  return 'failed';
}
