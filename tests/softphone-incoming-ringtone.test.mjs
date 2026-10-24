import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { createIncomingCallGuard, incomingCallUuid } from '../src/lib/softphoneIncomingCall.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compile = file => swc.transformSync(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') },
    target: 'es2022', transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' }
}).code;
const hookCode = compile('src/components/CallCenter/useIncomingRingtone.js');
const widgetCode = compile('src/components/CallCenter/GlobalSoftphoneWidget.jsx');
const flush = () => new Promise(resolve => setImmediate(resolve));
const browserSdk = fs.readFileSync(require.resolve('plivo-browser-sdk'), 'utf8');
const headerModule = browserSdk.match(/"\.\/lib\/utils\/headers\.ts":function\(e,t,n\)\{([\s\S]*?)\},"\.\/lib\/utils\/loggerUtil\.ts"/);
assert.ok(headerModule, 'Locate the installed Plivo browser SDK header parser');
const browserHeaders = {};
vm.runInNewContext(`(function(e,t,n){${headerModule[1]}})`)({}, browserHeaders, () => {});

function audioFixture(options = {}) {
  const contexts = [], voices = [], timers = new Map(), listeners = new Map();
  const storage = options.storage || new Map();
  let nextTimer = 0, resolveResume;
  class AudioContext {
    constructor() {
      if (options.createFailure) throw new Error('Audio unavailable');
      this.state = options.suspended ? 'suspended' : 'running';
      this.currentTime = 100;
      this.destination = {};
      contexts.push(this);
    }
    resume() {
      if (options.resumeFailure) return Promise.reject(new Error('Autoplay blocked'));
      if (options.deferred) return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; });
      this.state = 'running';
      return Promise.resolve();
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() {
      if (options.toneFailure) { options.toneFailure = false; throw new Error('Temporary audio failure'); }
      const voice = { frequency: {}, start(at) { this.started = at; }, stop(at) { this.stopped = at ?? true; }, disconnect() { this.disconnected = true; } };
      voice.connect = gain => { voice.gain = gain; };
      voices.push(voice);
      return voice;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() { this.disconnected = true; } }; }
  }
  const window = {
    AudioContext,
    localStorage: {
      getItem(key) { if (options.storageFailure) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (options.storageFailure) throw new Error('Storage blocked'); storage.set(key, value); }
    },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }
  };
  return { contexts, voices, timers, storage, listeners, window,
    schedule(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    cancel(id) { timers.delete(id); },
    tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); },
    gesture() { for (const fn of listeners.get('pointerdown') || []) fn(); },
    resume() { resolveResume?.(); }
  };
}

function hooksFixture(audio, initialState = {}) {
  const state = { ...initialState }, refs = [], effects = [];
  let stateAt = 0, refAt = 0, effectAt = 0;
  const hooks = { ...React,
    useState(initial) {
      const at = stateAt++;
      if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial;
      return [state[at], value => { state[at] = typeof value === 'function' ? value(state[at]) : value; }];
    },
    useRef(initial) { const at = refAt++; return refs[at] ||= { current: initial }; },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const at = effectAt++, previous = effects[at];
      const changed = !previous || !deps || !previous.deps || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      effects[at] = { fn, deps, changed, cleanup: previous?.cleanup };
    }
  };
  const load = (code, dependencies = {}) => {
    const loaded = { exports: {} };
    vm.runInNewContext(code, {
      module: loaded, exports: loaded.exports, window: audio.window, URL, URLSearchParams, AbortSignal, crypto: require('node:crypto').webcrypto,
      setTimeout: audio.schedule, clearTimeout: audio.cancel,
      fetch: async (url, init) => {
        if (url === '/api/plivo/incoming-control') return audio.control(JSON.parse(init.body));
        assert.ok(['/api/plivo/token', '/api/plivo/session-status'].includes(url), 'Tests must never contact live services');
        return { ok: true, headers: { get: () => 'application/json' },
          json: async () => ({ username: 'test-sip', password: 'test-only' }) };
      },
      console: { log() {}, warn() {}, error() {} },
      require(name) {
        if (name === 'react') return hooks;
        if (name in dependencies) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      }
    });
    return loaded.exports;
  };
  return { hooks, state, refs, effects, load,
    render(fn) { stateAt = 0; refAt = 0; effectAt = 0; return fn(); },
    commit(predicate = () => true) {
      for (const effect of effects) {
        if (!effect.changed || !predicate(effect.fn)) continue;
        effect.cleanup?.(); effect.cleanup = effect.fn(); effect.changed = false;
      }
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); }
  };
}

function hookHarness(options = {}) {
  const audio = audioFixture(options), h = hooksFixture(audio);
  const { useIncomingRingtone } = h.load(hookCode);
  const props = { userId: 'agent-a', callId: null };
  const render = () => { const result = h.render(() => useIncomingRingtone(props.userId, props.callId)); h.commit(); return result; };
  return { ...h, audio, props, render };
}

test('incoming ringtone repeats only for the current call and immediately disconnects every voice on stop', () => {
  const audio = audioFixture(), h = hooksFixture(audio), blocked = [];
  const { createIncomingRingtone } = h.load(hookCode);
  const ringer = createIncomingRingtone({ createContext: () => new audio.window.AudioContext(),
    schedule: audio.schedule, cancel: audio.cancel, onBlocked: value => blocked.push(value) });
  assert.equal(audio.contexts.length, 0);
  ringer.unlock();
  assert.equal(audio.voices.length, 0, 'A user gesture alone must stay silent');
  ringer.start('call-a');
  assert.equal(audio.voices.length, 3); assert.equal(audio.timers.size, 1);
  ringer.start('call-a'); assert.equal(audio.voices.length, 3, 'Duplicate metadata must not restart the ringtone');
  audio.tick(); assert.equal(audio.voices.length, 6); assert.equal(audio.timers.size, 1);
  ringer.start('call-b');
  assert.equal(audio.voices.length, 9);
  ringer.stop('call-a'); assert.equal(audio.timers.size, 1, 'A stale call cannot silence its replacement');
  ringer.stop('call-b');
  assert.equal(audio.timers.size, 0);
  assert.ok(audio.voices.every(voice => voice.disconnected && voice.stopped === true && voice.gain.disconnected));
  assert.ok(blocked.every(value => value === false));
  ringer.destroy(); assert.equal(audio.contexts[0].state, 'closed');
});

test('sound defaults On; per-call Silence stops audio without suppressing the next incoming call', () => {
  const h = hookHarness();
  assert.equal(h.render().enabled, true); assert.equal(h.audio.voices.length, 0);
  h.props.callId = 'call-a'; let controls = h.render();
  assert.equal(h.audio.voices.length, 3);
  controls.silence(); assert.equal(h.audio.timers.size, 0);
  controls = h.render(); assert.equal(controls.isSilenced, true);
  h.audio.gesture(); assert.equal(h.audio.voices.length, 3);
  assert.equal(h.audio.storage.size, 0, 'Silencing one call does not change the saved preference');
  h.props.callId = null; h.render();
  h.props.callId = 'call-b'; controls = h.render();
  assert.equal(controls.isSilenced, false); assert.equal(h.audio.voices.length, 6);
  h.unmount(); assert.equal(h.audio.timers.size, 0);
  assert.ok([...h.audio.listeners.values()].every(listeners => listeners.size === 0));
});

test('Silent preference persists per agent across refresh while another agent still defaults to Sound On', () => {
  const storage = new Map(), first = hookHarness({ storage });
  first.render().toggleEnabled(); assert.equal(first.render().enabled, false);
  first.props.callId = 'call-a'; first.render(); assert.equal(first.audio.voices.length, 0);
  first.unmount();
  const refreshed = hookHarness({ storage });
  refreshed.props.callId = 'call-b'; assert.equal(refreshed.render().enabled, false);
  assert.equal(refreshed.audio.voices.length, 0);
  refreshed.props.userId = 'agent-b'; assert.equal(refreshed.render().enabled, true);
  assert.equal(refreshed.audio.voices.length, 3);
  refreshed.props.userId = 'agent-a'; assert.equal(refreshed.render().enabled, false);
  assert.equal(refreshed.audio.timers.size, 0);
  refreshed.render().toggleEnabled(); assert.equal(refreshed.render().enabled, true);
  assert.equal(storage.get('softphone_incoming_sound:agent-a'), 'on');
  refreshed.unmount();
});

test('blocked browser storage or unavailable audio never throws or blocks the incoming UI', () => {
  for (const options of [{ storageFailure: true }, { createFailure: true }, { suspended: true, resumeFailure: true }]) {
    const h = hookHarness(options);
    h.props.callId = 'call-a';
    assert.doesNotThrow(() => h.render());
    assert.doesNotThrow(() => h.render().silence());
    assert.equal(h.render().isSilenced, true);
    assert.doesNotThrow(() => h.render().toggleEnabled());
    assert.equal(h.render().enabled, false);
    h.unmount();
  }
});

test('autoplay waits for interaction, resumes once, and cannot restart a cancelled call after a late resume', async () => {
  const h = hookHarness({ suspended: true, deferred: true });
  h.props.callId = 'call-a'; h.render();
  assert.equal(h.render().blocked, true); assert.equal(h.audio.voices.length, 0);
  h.audio.resume(); await flush();
  assert.equal(h.audio.voices.length, 3); assert.equal(h.render().blocked, false);
  h.audio.gesture(); assert.equal(h.audio.voices.length, 3);
  h.props.callId = null; h.render(); assert.equal(h.audio.timers.size, 0);
  h.unmount();

  for (const end of ['cancel', 'silence', 'unmount']) {
    const late = hookHarness({ suspended: true, deferred: true });
    late.props.callId = 'late-call'; const controls = late.render();
    if (end === 'cancel') { late.props.callId = null; late.render(); }
    if (end === 'silence') controls.silence();
    if (end === 'unmount') late.unmount();
    late.audio.resume(); await flush();
    assert.equal(late.audio.voices.length, 0, end); assert.equal(late.audio.timers.size, 0, end);
    if (end !== 'unmount') late.unmount();
  }
});

test('Enable sound retries a temporary audio failure for the same invitation without starting a different call', () => {
  const h = hookHarness({ toneFailure: true });
  h.props.callId = 'call-a'; h.render();
  assert.equal(h.render().blocked, true); assert.equal(h.audio.timers.size, 0);
  h.render().enableSound();
  assert.equal(h.audio.voices.length, 3); assert.equal(h.render().blocked, false);
  h.unmount();
});

const flatten = node => !node || typeof node !== 'object' ? [] :
  [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];
const label = node => typeof node === 'string' ? node : React.Children.toArray(node?.props?.children).map(label).join(' ');

async function widgetHarness({ outbound = false, legacy = false, control, headerName = 'X-PH-CrmInbound' } = {}) {
  const audio = audioFixture();
  const h = hooksFixture(audio, { 0: false, 1: true, 3: 'online', 13: {
    id: 'agent-a', user_id: 'user-a', plivo_endpoint_key: '174793004058391', plivo_username: 'test-sip'
  } });
  const callbacks = new Map(), actions = [], flags = [], routeActions = [];
  audio.control = async body => {
    if (control) return control(body);
    if (body.action === 'options') return { ok: true, json: async () => ({ canNext: true, canForward: true, canDecline: true }) };
    routeActions.push(body);
    return { ok: true, json: async () => ({ success: true, action: body.action,
      message: body.action === 'decline' ? 'Call Declined' : body.action === 'next' ? 'Call sent to next agent' : 'Call forwarded to default number' }) };
  };
  let invitation = null;
  const client = {
    on(name, fn) { callbacks.set(name, fn); },
    getIncomingCalls: () => invitation ? [invitation] : [],
    setRingTone(value) { flags.push(['ringtone', value]); },
    setRingToneBack(value) { flags.push(['ringback', value]); },
    stopRingTone() {},
    login() { callbacks.get('onLogin')(); },
    logout() { callbacks.get('onLogout')(); },
    answer(uuid) { actions.push(['answer', uuid]); invitation = null; },
    reject(uuid) { actions.push(['reject', uuid]); invitation = null; }
  };
  const ringtone = h.load(hookCode);
  const { default: Widget } = h.load(widgetCode, {
    'lucide-react': require('lucide-react'), 'react-draggable': props => props.children,
    './ActiveCallPanel': () => null, './Softphone.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    './useSoftphoneContacts': { useSoftphoneContacts: () => () => ({ name: 'Tenant Business', source: 'party' }) },
    './useIncomingRingtone': ringtone,
    '@/utils/supabase/client': { createClient: () => ({}) },
    '@/app/actions/team': { getRecentCalls: async () => [] },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber: number => number },
    '@/app/api/plivo/outbound-intent': { incomingMatchesOutboundRoom: () => false, shouldAutoAnswerOutbound: () => outbound },
    '@/lib/softphoneIncomingCall': { createIncomingCallGuard, incomingCallUuid },
    'plivo-browser-sdk': { __esModule: true, default: class { constructor() { this.client = client; } } }
  });
  const effectFilter = fn => /createIncomingRingtone|controller\?\.start|initPlivo|agentDataRef.current = agentData|loadIncomingOptions/.test(String(fn));
  // Only run the actual audio and SDK effects. Other CRM reads/timers have
  // separate regression suites and must never contact a live service here.
  const render = () => {
    const tree = h.render(() => Widget({ userId: 'user-a' })); h.commit(effectFilter); return flatten(tree);
  };
  // connectSoftphone fetches its test credentials using the sandbox global.
  // The fixture's VM rejects all other dependencies and has no network access.
  render(); await flush();
  return { ...h, audio, actions, flags, routeActions, client, render,
    async incoming(uuid = 'customer-call', headers = legacy ? {} : { [headerName]: `signed-${uuid}` }) {
      invitation = { callUUID: uuid, state: 'ringing' };
      await callbacks.get('onIncomingCall')('+919876543210', headers, invitation);
      render(); await flush();
      return render();
    },
    event(name, ...args) { callbacks.get(name)(...args); return render(); },
    button(name) { return render().find(node => node.type === 'button' && label(node).trim() === name); }
  };
}

test('widget rings while docked; Silence leaves Answer guarded and Decline controls the parent through the server', async () => {
  for (const action of ['Answer', 'Decline Call']) {
    const h = await widgetHarness();
    const tree = await h.incoming();
    assert.equal(h.audio.voices.length, 3);
    assert.ok(tree.some(node => node.props?.className === 'incomingName' && label(node) === 'Tenant Business'));
    assert.equal(h.state[8], false, 'Ringtone must not mute the call microphone');
    h.button('Silence this call').props.onClick();
    assert.equal(h.audio.timers.size, 0); assert.equal(h.actions.length, 0);
    assert.equal(h.button('Silenced').props.disabled, true);
    await h.button(action).props.onClick(); h.render();
    if (action === 'Answer') assert.deepEqual(h.actions, [['answer', 'customer-call']]);
    else { assert.equal(h.actions.length, 0); assert.equal(h.routeActions[0].action, 'decline'); }
    assert.equal(h.state[7], null); assert.equal(h.audio.timers.size, 0);
    h.unmount();
  }
});

test('answer, decline, cancel, failure, termination, logout and unmount all stop incoming audio', async () => {
  for (const end of ['Answer', 'Decline Call', 'onIncomingCallCanceled', 'onCallFailed', 'onCallTerminated', 'onLogout', 'unmount']) {
    const h = await widgetHarness(); await h.incoming();
    assert.equal(h.audio.timers.size, 1, end);
    if (end === 'Answer' || end === 'Decline Call') { await h.button(end).props.onClick(); h.render(); }
    else if (end === 'onCallFailed') h.event(end, 'failed', { callUUID: 'customer-call' });
    else if (end === 'unmount') h.unmount();
    else h.event(end, { callUUID: 'customer-call' });
    assert.equal(h.audio.timers.size, 0, end);
    assert.ok(h.audio.voices.every(voice => voice.disconnected), end);
    if (end !== 'unmount') h.unmount();
  }
});

test('outgoing auto-answer agent legs remain silent and retain real carrier audio settings', async () => {
  const h = await widgetHarness({ outbound: true }); await h.incoming('outbound-agent-leg');
  assert.deepEqual(h.actions, [['answer', 'outbound-agent-leg']]);
  assert.equal(h.state[7], null); assert.equal(h.audio.voices.length, 0);
  assert.deepEqual(h.flags, [['ringtone', false], ['ringback', false]]);
  h.unmount();
});

test('the widget header toggles saved incoming sound without changing microphone or call state', async () => {
  const h = await widgetHarness();
  const soundButton = () => h.render().find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Incoming ringtone:'));
  assert.equal(soundButton().props['aria-label'], 'Incoming ringtone: Sound On');
  soundButton().props.onClick();
  assert.equal(soundButton().props['aria-label'], 'Incoming ringtone: Silent');
  await h.incoming(); assert.equal(h.audio.voices.length, 0);
  assert.equal(h.button('Ringtone Silent').props.disabled, true);
  assert.equal(h.actions.length, 0); assert.equal(h.state[8], false);
  assert.equal(h.audio.storage.get('softphone_incoming_sound:user-a'), 'silent');
  soundButton().props.onClick(); h.render();
  assert.equal(h.audio.voices.length, 3);
  assert.equal(h.state[7].callerNumber, '+919876543210');
  h.unmount();
});

test('Forward, Next Agent and Decline use distinct authenticated actions and do not show an expected Rejected error', async () => {
  for (const [button, action] of [['Default Forward Call', 'forward'], ['Next Agent', 'next'], ['Decline Call', 'decline']]) {
    const h = await widgetHarness(); await h.incoming();
    assert.equal(h.button(button).props.disabled, false);
    await h.button(button).props.onClick(); h.render();
    assert.equal(h.routeActions.length, 1); assert.equal(h.routeActions[0].action, action);
    assert.equal(h.routeActions[0].userId, 'user-a'); assert.equal(h.routeActions[0].inviteUuid, 'customer-call');
    assert.equal(h.actions.length, 0, 'Do not use SDK Reject as a substitute for a whole-call action');
    h.event('onCallFailed', 'Rejected', { callUUID: 'customer-call' });
    assert.equal(h.state[4], ''); assert.equal(h.state[7], null);
    // An unrelated failure must remain visible; do not suppress SDK failures globally.
    h.event('onCallFailed', 'Network error', { callUUID: 'other-call' });
    assert.equal(h.state[4], 'Call failed: Network error');
    h.unmount();
  }
});

test('missing routing metadata and unavailable options disable routing while keeping Answer and Silence available', async () => {
  for (const options of [{ legacy: true }, { control: async () => ({ ok: true, json: async () => ({ canForward: false, canNext: false, canDecline: true }) }) }]) {
    const h = await widgetHarness(options); await h.incoming();
    assert.equal(h.button('Default Forward Call').props.disabled, true);
    assert.equal(h.button('Next Agent').props.disabled, true);
    assert.equal(h.button('Answer').props.disabled, false);
    assert.equal(h.button('Silence this call').props.disabled, false);
    if (options.legacy) assert.equal(h.button('Decline Call').props.disabled, true);
    h.unmount();
  }
});

test('an explicit routing rejection keeps the incoming call actionable and never reports a successful decline', async () => {
  const h = await widgetHarness({ control: async body => body.action === 'options'
    ? { ok: true, json: async () => ({ canForward: true, canNext: true, canDecline: true }) }
    : { ok: false, status: 409, json: async () => ({ error: 'Agent no longer available' }) } });
  await h.incoming(); await h.button('Next Agent').props.onClick();
  assert.equal(h.state[7].callInfo.callUUID, 'customer-call');
  assert.equal(h.button('Answer').props.disabled, false);
  assert.ok(h.render().some(node => node.props?.role === 'status' && label(node).includes('Agent no longer available')));
  assert.equal(h.audio.timers.size, 1); h.unmount();
});

test('double-clicks cannot send two actions or Answer while routing; a late action cannot erase a new invitation', async () => {
  let complete, sent = 0;
  const h = await widgetHarness({ control: async body => {
    if (body.action === 'options') return { ok: true, json: async () => ({ canForward: true, canNext: true, canDecline: true }) };
    sent++;
    return new Promise(resolve => { complete = () => resolve({ ok: true, json: async () => ({ success: true, message: 'Call forwarded' }) }); });
  } });
  await h.incoming(); const button = h.button('Default Forward Call');
  const pending = button.props.onClick(); await button.props.onClick(); h.button('Answer').props.onClick();
  assert.equal(sent, 1); assert.equal(h.actions.length, 0); assert.equal(h.button('Answer').props.disabled, true);
  await h.incoming('new-customer-call'); complete(); await pending;
  assert.equal(h.state[7].callInfo.callUUID, 'new-customer-call');
  assert.equal(h.button('Answer').props.disabled, false); assert.equal(h.audio.timers.size, 1);
  h.unmount();
});

test('an unconfirmed network action blocks another action or Answer until the invitation ends', async () => {
  const h = await widgetHarness({ control: async body => {
    if (body.action === 'options') return { ok: true, json: async () => ({ canForward: true, canNext: true, canDecline: true }) };
    throw new Error('Network unavailable');
  } });
  await h.incoming(); await h.button('Decline Call').props.onClick();
  assert.equal(h.button('Answer').props.disabled, true); assert.equal(h.button('Next Agent').props.disabled, true);
  assert.ok(h.render().some(node => node.props?.role === 'status' && label(node).includes('awaiting confirmation')));
  assert.equal(h.actions.length, 0); h.unmount();
});

test('SDK header casing and stripped X-PH prefixes both resolve the same signed routing options', async () => {
  for (const headerName of ['X-PH-CrmInbound', 'x-ph-crminbound', 'CrmInbound']) {
    const h = await widgetHarness({ headerName }); await h.incoming();
    assert.equal(h.button('Decline Call').props.disabled, false, headerName); h.unmount();
  }
});

test('numbered headers surviving the actual SDK restore the full signed capability and enable all routing buttons', async () => {
  const token = 'a'.repeat(218) + '.' + 'b'.repeat(43), parts = token.match(/.{1,100}/g);
  for (const prefix of ['X-PH-', 'x-ph-']) {
    const wire = { [`${prefix}CrmInboundParts`]: String(parts.length),
      ...Object.fromEntries(parts.map((part, index) => [`${prefix}CrmInbound${index + 1}`, part])) };
    const delivered = browserHeaders.receiveExtraHeader({ getHeader: key => wire[key] }, wire);
    const received = [];
    const h = await widgetHarness({ control: async body => {
      received.push(body);
      return { ok: true, json: async () => body.action === 'options'
        ? { canForward: true, canNext: true, canDecline: true } : { success: true, action: body.action } };
    } });
    await h.incoming('chunked-call', delivered);
    for (const name of ['Default Forward Call', 'Next Agent', 'Decline Call', 'Answer']) {
      assert.equal(h.button(name).props.disabled, false, name);
    }
    assert.equal(received[0].token, token);
    await h.button('Decline Call').props.onClick();
    assert.equal(received[1].token, token); assert.equal(received[1].inviteUuid, 'chunked-call');
    h.unmount();
  }
});

test('incomplete or malformed token chunks keep routing disabled while Answer and Silence remain available', async () => {
  for (const headers of [
    { 'X-PH-CrmInboundParts': '3', 'X-PH-CrmInbound1': 'first', 'X-PH-CrmInbound3': 'last' },
    { 'X-PH-CrmInboundParts': '99', 'X-PH-CrmInbound1': 'first' },
    { 'X-PH-CrmInboundParts': 'NaN' },
    { 'X-PH-CrmInboundParts': '1', 'X-PH-CrmInbound1': 'invalid value' }
  ]) {
    const received = [];
    const h = await widgetHarness({ control: async body => { received.push(body); throw new Error('Unexpected control request'); } });
    await h.incoming('incomplete-call', headers);
    assert.equal(h.button('Decline Call').props.disabled, true);
    assert.equal(h.button('Answer').props.disabled, false);
    assert.equal(h.button('Silence this call').props.disabled, false);
    assert.equal(received.length, 0); h.unmount();
  }
});
