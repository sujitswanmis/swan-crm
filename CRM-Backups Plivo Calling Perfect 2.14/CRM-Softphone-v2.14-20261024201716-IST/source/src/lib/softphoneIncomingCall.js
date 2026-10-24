export function incomingCallUuid(call) {
  if (typeof call === 'string') return call;
  return call?.callInfo?.callUUID || call?.callUUID || call?.callInfo?.callId || call?.callId || '';
}

// The SDK owns ringing state. React metadata lookups may finish after a call
// has ended, and must never recreate an invitation or answer a different call.
export function createIncomingCallGuard() {
  let current = null;
  const settled = new Set();
  const remember = uuid => {
    settled.add(uuid);
    if (settled.size > 32) settled.delete(settled.values().next().value);
  };
  const ringing = (client, uuid) => {
    if (!uuid || typeof client?.getIncomingCalls !== 'function') return false;
    try {
      const calls = client.getIncomingCalls();
      return Array.isArray(calls) && calls.some(call => incomingCallUuid(call) === uuid &&
        String(call.state || '').toLowerCase() === 'ringing');
    } catch { return false; }
  };
  const clear = (client, call) => {
    const uuid = incomingCallUuid(call);
    if (!current || (client && current.client !== client) || (uuid && current.uuid !== uuid)) return false;
    remember(current.uuid);
    current = null;
    return true;
  };
  return {
    begin(client, call) {
      const uuid = incomingCallUuid(call);
      if (settled.has(uuid) || !ringing(client, uuid)) return null;
      current = { client, uuid };
      return current;
    },
    isCurrent(ticket) {
      return !!ticket && current === ticket && ringing(ticket.client, ticket.uuid);
    },
    current: () => current,
    clear,
    act(client, call, action) {
      const uuid = incomingCallUuid(call);
      if (!['answer', 'reject'].includes(action)) return { success: false, reason: 'invalid' };
      if (!current || current.client !== client || current.uuid !== uuid || !ringing(client, uuid)) {
        if (uuid) clear(client, call);
        return { success: false, reason: 'stale' };
      }
      // Claim before invoking the SDK: double-clicks and synchronous SDK
      // callbacks cannot answer/reject this invite twice.
      clear(client, call);
      try {
        return client[action](uuid) === true
          ? { success: true }
          : { success: false, reason: 'failed' };
      } catch { return { success: false, reason: 'failed' }; }
    },
  };
}
