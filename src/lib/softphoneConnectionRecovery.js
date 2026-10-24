// Registration recovery only. Call media, incoming guards and customer dialing
// remain owned by the SDK and the existing call lifecycle.
export function createSoftphoneConnectionRecovery({ client, authenticate, onState, onReady = () => {},
  online = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  schedule = setTimeout, cancel = clearTimeout }) {
  let desired = true, disposed = false, blocked = false, inFlight = false;
  let timer = null, watchdog = null, generation = 0, failures = 0, ready = false;
  const read = method => { try { return !!client[method]?.(); } catch { return false; } };
  const clearTimers = () => {
    if (timer !== null) cancel(timer);
    if (watchdog !== null) cancel(watchdog);
    timer = watchdog = null;
  };
  const emit = (status, error = '') => onState({ status, error,
    isConnected: status === 'online', isRegistered: status === 'online' });
  const allowed = () => desired && !disposed && !blocked;
  const backoff = () => Math.min(60000, 2000 * 2 ** Math.min(failures++, 5));
  const enqueue = delay => {
    if (!allowed() || !online() || timer !== null) return;
    timer = schedule(() => { timer = null; void attempt(); }, delay);
  };
  const registered = () => {
    if (!allowed() || !online()) return;
    clearTimers(); generation++; inFlight = false; failures = 0;
    emit('online');
    if (!ready) { ready = true; onReady(); }
  };
  const lost = (message = 'Connection interrupted. Reconnecting…') => {
    if (!allowed()) return;
    ready = false;
    emit(online() ? 'connecting' : 'offline', message);
    enqueue(2000); // Give the SDK's own transport recovery the first opportunity.
  };
  async function attempt(forceAuthorization = false) {
    if (!allowed()) return;
    if (!online()) { ready = false; emit('offline', 'Internet disconnected. Waiting for connection…'); return; }
    if (!forceAuthorization && read('isConnected') && read('isRegistered')) { registered(); return; }
    if (inFlight || watchdog !== null) return;
    // Re-login can replace the SDK transport. Never force it over a live media
    // session or an SDK registration already in progress.
    if (read('getCallUUID') || read('isConnecting')) { lost(); return; }
    ready = false; inFlight = true; emit('connecting');
    const requestGeneration = ++generation;
    const isCurrent = () => allowed() && generation === requestGeneration && online();
    let result;
    try { result = await authenticate(isCurrent); }
    catch { result = { retry: true, error: 'Connection unavailable. Retrying…' }; }
    if (disposed || generation !== requestGeneration) return;
    inFlight = false;
    if (!allowed()) return;
    if (result?.fatal || result?.disabled) {
      blocked = true; clearTimers(); emit(result.disabled ? 'offline' : 'error', result.error || ''); return;
    }
    if (!online()) { lost('Internet disconnected. Waiting for connection…'); return; }
    if (read('isConnected') && read('isRegistered')) { registered(); return; }
    if (result?.accepted) {
      watchdog = schedule(() => {
        watchdog = null; emit('connecting', 'Registration timed out. Reconnecting…'); enqueue(backoff());
      }, 15000);
    } else {
      emit('connecting', result?.error || 'Connection unavailable. Retrying…'); enqueue(backoff());
    }
  }
  return {
    start: () => attempt(),
    connect() {
      if (disposed) return;
      const reauthorize = blocked;
      desired = true; blocked = false; failures = 0; clearTimers(); return attempt(reauthorize);
    },
    registered,
    connectionChanged(info) {
      if (!allowed()) return;
      const state = String(info?.state || info?.status || '').toLowerCase();
      if (state === 'connected') {
        if (read('isRegistered') && read('isConnected')) registered();
        else { lost('Registering Softphone…'); }
      } else if (['disconnected', 'failed'].includes(state)) lost();
    },
    loginFailed(reason) {
      if (!allowed()) return;
      generation++; inFlight = false; ready = false; clearTimers();
      if (/unauthori[sz]ed|invalid.*(credential|password|token|grant)|expired.*token|forbidden|revoked/i.test(String(reason))) {
        blocked = true; emit('error', 'Softphone authorization failed. Please reconnect after checking access.');
      } else { emit('connecting', 'Connection unavailable. Retrying…'); enqueue(backoff()); }
    },
    loggedOut() { if (allowed()) { generation++; inFlight = false; lost(); } },
    offline() {
      if (!allowed()) return;
      generation++; inFlight = false; ready = false; clearTimers();
      emit('offline', 'Internet disconnected. Waiting for connection…');
    },
    resume() { if (allowed()) { if (timer !== null) cancel(timer); timer = null; return attempt(); } },
    disconnect() {
      desired = false; ready = false; generation++; inFlight = false; clearTimers(); emit('offline');
      try { client.logout(); } catch { /* Explicit disconnect remains intentional. */ }
    },
    destroy() { disposed = true; generation++; inFlight = false; clearTimers(); },
  };
}
