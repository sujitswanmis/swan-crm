import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createSoftphoneConnectionRecovery } from '../src/lib/softphoneConnectionRecovery.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(authenticate) {
  const flags = { online: true, connected: false, registered: false, connecting: false, call: null };
  const states = [], requests = [], timers = new Map();
  let time = 0, next = 0, logouts = 0, ready = 0;
  const client = { isConnected: () => flags.connected, isRegistered: () => flags.registered,
    isConnecting: () => flags.connecting, getCallUUID: () => flags.call, logout: () => { logouts++; } };
  const recovery = createSoftphoneConnectionRecovery({ client, online: () => flags.online,
    onState: state => states.push(state), onReady: () => { ready++; },
    schedule(fn, delay) { const id = ++next; timers.set(id, { at: time + delay, fn }); return id; },
    cancel: id => timers.delete(id),
    authenticate: async valid => { requests.push(valid); return authenticate ? authenticate(valid) : { accepted: true }; }
  });
  return { recovery, flags, states, requests, timers,
    get logouts() { return logouts; }, get ready() { return ready; },
    async tick(ms) {
      time += ms;
      for (const [id, task] of [...timers]) if (task.at <= time) { timers.delete(id); task.fn(); }
      await flush();
    },
    register() { flags.connected = flags.registered = true; recovery.registered(); },
    state: () => states.at(-1),
  };
}

test('offline startup makes no credential request; internet resume registers without duplicate retries', async () => {
  const h = fixture(); h.flags.online = false; await h.recovery.start();
  assert.equal(h.requests.length, 0); assert.equal(h.state().status, 'offline');
  h.flags.online = true;
  await Promise.all([h.recovery.resume(), h.recovery.resume(), h.recovery.resume()]);
  assert.equal(h.requests.length, 1);
  h.register(); assert.equal(h.state().status, 'online'); assert.equal(h.ready, 1); assert.equal(h.timers.size, 0);
  await h.recovery.resume(); assert.equal(h.requests.length, 1); assert.equal(h.ready, 1);
});

test('the installed SDK emits state events and an SDK-managed reconnect synchronizes the UI without re-login', async () => {
  const require = createRequire(import.meta.url);
  const sdk = fs.readFileSync(require.resolve('plivo-browser-sdk'), 'utf8');
  assert.match(sdk, /connectionInfo=\{state:[^}]+CONNECTED/);
  const h = fixture(); h.register();
  h.flags.connected = h.flags.registered = false;
  h.recovery.connectionChanged({ state: 'disconnected', reason: 'Ping Timed Out' });
  assert.equal(h.state().status, 'connecting');
  h.flags.connected = h.flags.registered = true;
  h.recovery.connectionChanged({ state: 'connected' });
  assert.equal(h.state().status, 'online'); assert.equal(h.requests.length, 0); assert.equal(h.ready, 2);
  await h.tick(60000); assert.equal(h.requests.length, 0);
});

test('unexpected logout and transport loss recover automatically while manual Disconnect stays intentional', async () => {
  const h = fixture(); h.recovery.loggedOut(); await h.tick(2000);
  assert.equal(h.requests.length, 1); h.register();
  h.recovery.disconnect(); assert.equal(h.logouts, 1); assert.equal(h.state().status, 'offline');
  h.flags.registered = h.flags.connected = false;
  h.recovery.loggedOut(); h.recovery.connectionChanged({ state: 'disconnected' });
  await h.recovery.resume(); await h.tick(120000); assert.equal(h.requests.length, 1);
  await h.recovery.connect(); assert.equal(h.requests.length, 2); h.recovery.destroy();
});

test('recovery never replaces an active call or duplicates an SDK connection in progress', async () => {
  for (const state of ['call', 'connecting']) {
    const h = fixture(); h.flags[state] = state === 'call' ? 'active-call' : true;
    await h.recovery.resume(); await h.tick(2000);
    assert.equal(h.requests.length, 0); assert.equal(h.logouts, 0);
    h.flags[state] = state === 'call' ? null : false;
    await h.recovery.resume(); assert.equal(h.requests.length, 1); h.recovery.destroy();
  }
});

test('fresh authorization failures and revoked/disabled endpoints stop automatic credential retries', async () => {
  for (const result of [{ fatal: true, error: 'Session expired' }, { disabled: true }]) {
    const h = fixture(async () => result); await h.recovery.start();
    await h.tick(120000); await h.recovery.resume();
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
    assert.equal(h.state().status, result.disabled ? 'offline' : 'error');
    h.flags.connected = h.flags.registered = true;
    await h.recovery.connect();
    assert.equal(h.requests.length, 2, 'An old SDK registration cannot bypass a fresh access denial');
    assert.equal(h.state().status, result.disabled ? 'offline' : 'error');
  }
  const h = fixture(); await h.recovery.start(); h.recovery.loginFailed('INVALID_CREDENTIALS');
  await h.tick(120000); await h.recovery.resume(); assert.equal(h.requests.length, 1);
});

test('transient credential errors back off to at most one request per minute and pause while offline', async () => {
  const h = fixture(async () => ({ retry: true })); await h.recovery.start();
  for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    assert.equal(h.timers.size, 1);
    const task = [...h.timers.values()][0];
    await h.tick(delay - 1); const before = h.requests.length;
    await h.tick(1); assert.equal(h.requests.length, before + 1); assert.ok(task.at > 0);
  }
  h.flags.online = false; h.recovery.offline(); await h.tick(120000);
  assert.equal(h.timers.size, 0); h.recovery.destroy();
});

test('manual Disconnect, offline and unmount invalidate late credentials before the SDK can log in', async () => {
  for (const action of ['disconnect', 'offline', 'destroy']) {
    let finish, logins = 0;
    const h = fixture(valid => new Promise(resolve => { finish = () => { if (valid()) logins++; resolve({ accepted: true }); }; }));
    const pending = h.recovery.start(); await flush();
    if (action === 'offline') h.flags.online = false;
    h.recovery[action](); finish(); await pending;
    assert.equal(logins, 0); assert.equal(h.timers.size, 0); h.recovery.destroy();
  }
});

test('registration watchdog retries a missing callback, and confirmed registration clears every recovery timer', async () => {
  const h = fixture(); await h.recovery.start(); await h.recovery.resume();
  assert.equal(h.requests.length, 1);
  await h.tick(15000); await h.tick(2000); assert.equal(h.requests.length, 2);
  h.register(); assert.equal(h.timers.size, 0); h.recovery.destroy();
});
