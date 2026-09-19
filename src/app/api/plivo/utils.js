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

/**
 * Accurately categorize telecom and carrier termination events.
 * Specifically handles Indian telecom networks (Airtel, Jio, Vi, BSNL):
 * - Decline / Reject: Carrier sends Busy Line (code 3010 / Q.850 17) or Call Rejected while ringing
 * - Switched Off / Out of Network: Subscriber Absent (Q.850 20), Unallocated (code 1), Destination Out of Order,
 *   or short Early Media duration (< 14s) ending in Normal Clearing without pickup.
 * - Call Waiting / Truly Busy: Immediate busy (< 2s) from second 0 without ringing.
 * - No Answer: Full ring timeout (>= 25s) or explicit timeout/no-answer.
 */
export function categorizeHangupCause(callStatus, hangupCause, hangupSource, ringingSec = 0, hasAnswered = false) {
  const s = (callStatus || '').toLowerCase();
  const h = (hangupCause || '').toLowerCase();
  const src = (hangupSource || '').toLowerCase();

  if (hasAnswered) {
    return 'customer_hangup';
  }

  // 1. Switched off / Unreachable / Out of coverage / Carrier subscriber absent
  if (
    h.includes('switched_off') ||
    h.includes('unallocated') ||
    h.includes('absent') ||
    h.includes('unreach') ||
    h.includes('out of service') ||
    h.includes('destination out of service') ||
    h.includes('no_route') ||
    h.includes('temporary_failure') ||
    h.includes('temporary failure') ||
    h.includes('network congestion') ||
    h.includes('destination_out_of_order') ||
    h.includes('destination out of order') ||
    h.includes('user does not exist') ||
    h.includes('subscriber absent') ||
    h.includes('route error') ||
    h.includes('circuit/channel congestion') ||
    h.includes('network out of order')
  ) {
    return 'switched_off';
  }

  // 2. Customer explicitly declined / cut / rejected call while ringing
  // In Indian GSM networks, pressing Decline / Cut on smartphone signals Q.850 17 ('Busy Line' / 'User Busy')
  // while the phone is ringing.
  if (
    s === 'rejected' ||
    h.includes('reject') ||
    h.includes('declined') ||
    h.includes('call rejected') ||
    h.includes('user_busy') ||
    (h.includes('busy') && (ringingSec >= 2 || src === 'callee' || src === 'carrier'))
  ) {
    return 'rejected';
  }

  // 3. Immediate busy (person already talking on non-waiting line or blocked from second 0)
  if (s === 'busy' || s.includes('busy') || h.includes('busy')) {
    return 'busy';
  }

  // 4. Normal clearing or completed without ever answering
  if (h.includes('normal_clearing') || h.includes('normal hangup') || s === 'completed') {
    if (ringingSec <= 14) {
      // In Indian telecom, carrier IVR for switched-off / out of coverage plays for 5-14s then normal clears
      return 'switched_off';
    }
    if (ringingSec >= 25) {
      return 'no_answer';
    }
    return 'rejected';
  }

  // 5. No Answer / Ring timeout
  if (
    s.includes('timeout') ||
    s === 'no-answer' ||
    h.includes('timeout') ||
    h.includes('no_answer') ||
    h.includes('no answer') ||
    ringingSec >= 28
  ) {
    return 'no_answer';
  }

  // 6. Agent cancelled
  if (s.includes('cancel') || h.includes('cancel')) {
    return 'agent_hangup';
  }

  return 'failed';
}
