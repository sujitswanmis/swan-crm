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
const widgetCode = swc.transformSync(fs.readFileSync(new URL('../src/components/CallCenter/GlobalSoftphoneWidget.jsx', import.meta.url), 'utf8'), {
  filename: 'GlobalSoftphoneWidget.jsx',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
  module: { type: 'commonjs' }
}).code;
const flush = () => new Promise(resolve => setImmediate(resolve));
const slots = { minimized: 0, activeCall: 5, optimisticCall: 6, duration: 9, session: 10, agent: 13 };
const agent = { id: 'agent-a', user_id: 'user-a', plivo_endpoint_key: '174793004058391' };
const connectedSession = overrides => ({ id: 'session-a', room_name: 'room-a', status: 'connected',
  customer_answer_time: '2026-11-07T11:59:45+05:30', ...overrides });
const flatten = node => !node || typeof node !== 'object' ? [] :
  [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];

function fixture({ effects = [], session = null, activeCall = null, optimisticCall = null,
  duration = 0, savedPosition = null, storageFailure = false, assignedAgent = agent } = {}) {
  let now = Date.parse('2026-11-07T12:00:00+05:30'), nextTask = 0;
  const tasks = new Map(), requests = [], errors = [], refs = [], callbacks = [], registeredEffects = [];
  const state = { 0: false, 1: true, 3: 'online', 5: activeCall, 6: optimisticCall, 9: duration, 10: session, 13: assignedAgent };
  const storage = new Map(savedPosition === null ? [] : [['softphone_position', savedPosition]]);
  const localStorage = {
    getItem(key) { if (storageFailure) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (storageFailure) throw new Error('Storage unavailable'); storage.set(key, value); }
  };
  const schedule = (kind, fn, delay) => {
    const id = ++nextTask;
    tasks.set(id, { kind, fn, delay, at: now + delay });
    return id;
  };
  const cancel = id => tasks.delete(id);
  const window = { innerWidth: 1200, innerHeight: 900, localStorage,
    requestAnimationFrame: fn => schedule('frame', fn, 16), cancelAnimationFrame: cancel,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let stateAt = 0, refAt = 0, callbackAt = 0, effectAt = 0;
  const hooks = { ...React,
    useState(initial) {
      const at = stateAt++;
      if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial;
      return [state[at], value => { state[at] = typeof value === 'function' ? value(state[at]) : value; }];
    },
    useRef(initial) { return refs[refAt++] ||= { current: initial }; },
    useCallback(fn, deps) {
      const at = callbackAt++, previous = callbacks[at];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) callbacks[at] = { fn, deps };
      return callbacks[at].fn;
    },
    useEffect(fn, deps) {
      const at = effectAt++, previous = registeredEffects[at];
      const changed = !previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      registeredEffects[at] = { fn, deps, changed, cleanup: previous?.cleanup };
    }
  };
  const Draggable = () => null, ActiveCallPanel = () => null;
  const dependencies = {
    react: hooks, 'lucide-react': require('lucide-react'), 'react-draggable': Draggable,
    './ActiveCallPanel': ActiveCallPanel,
    './Softphone.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    './useSoftphoneContacts': { useSoftphoneContacts: () => () => ({ name: 'Test contact' }) },
    './useIncomingRingtone': { useIncomingRingtone: () => ({ enabled: true }) },
    '@/utils/supabase/client': { createClient: () => ({}) },
    '@/app/actions/team': { getRecentCalls: async () => ({ data: [] }) },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber: number => number },
    '@/app/api/plivo/outbound-intent': { incomingMatchesOutboundRoom: () => false, shouldAutoAnswerOutbound: () => false },
    '@/lib/softphoneIncomingCall': { createIncomingCallGuard, incomingCallUuid },
    '@/lib/softphoneConnectionRecovery': {}
  };
  const loaded = { exports: {} };
  vm.runInNewContext(widgetCode, {
    module: loaded, exports: loaded.exports, window, localStorage, Date: ClockDate,
    setTimeout: (fn, delay) => schedule('timeout', fn, delay), clearTimeout: cancel,
    setInterval: (fn, delay) => schedule('interval', fn, delay), clearInterval: cancel,
    fetch: async (url, init) => {
      assert.ok(url.startsWith('/api/plivo/session-status?'), 'The fixture must never call a live service');
      requests.push({ url, init, at: now });
      const result = { activeSession: state[slots.session] || null };
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => result };
    },
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; }
  });
  const effectPatterns = {
    position: /window\.requestAnimationFrame/,
    polling: /const initialRefresh/,
    duration: /let timerInterval/,
    ringing: /if \(hasActiveSession/
  };
  const selected = fn => /(?:activeSession|optimisticCall|agentData)Ref\.current =/.test(String(fn)) ||
    effects.some(name => effectPatterns[name].test(String(fn)));
  let tree = [];
  const h = { state, requests, errors, tasks, storage,
    render() {
      stateAt = refAt = callbackAt = effectAt = 0;
      tree = flatten(loaded.exports.default({ userId: 'user-a' }));
      for (const effect of registeredEffects) {
        if (!effect.changed || !selected(effect.fn)) continue;
        effect.cleanup?.(); effect.cleanup = effect.fn(); effect.changed = false;
      }
      return tree;
    },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const due = [...tasks.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, task] = due;
        now = task.at;
        if (task.kind === 'interval') task.at += task.delay;
        else tasks.delete(id);
        task.fn();
      }
      now = until;
    },
    pending(kind) { return [...tasks.values()].filter(task => task.kind === kind); },
    position() { return tree.find(node => node.type === Draggable).props.position; },
    durationLabel() { return tree.find(node => node.type === ActiveCallPanel)?.props.durationLabel; },
    button(title) { return tree.find(node => node.type === 'button' && node.props.title === title); },
    unmount() { for (const effect of registeredEffects) effect.cleanup?.(); }
  };
  h.render();
  return h;
}

test('restored outbound duration starts from the answer timestamp, ticks every second and stops on unmount', () => {
  const h = fixture({ effects: ['duration'], session: connectedSession() });
  h.advance(0); h.render();
  assert.equal(h.durationLabel(), '00:15');
  assert.deepEqual(h.pending('interval').map(task => task.delay), [1000]);
  h.advance(1000); h.render();
  assert.equal(h.durationLabel(), '00:16');
  h.unmount(); h.advance(5000);
  assert.equal(h.state[slots.duration], 16);
  assert.equal(h.tasks.size, 0);
});

test('an inbound call without a backend timestamp ticks and resets after the call ends', () => {
  const h = fixture({ effects: ['duration'], activeCall: { direction: 'inbound', remote: 'test-caller' } });
  h.advance(3000);
  assert.equal(h.state[slots.duration], 3);
  h.state[slots.activeCall] = null; h.render(); h.advance(0);
  assert.equal(h.state[slots.duration], 0);
  assert.equal(h.tasks.size, 0);
  h.advance(5000);
  assert.equal(h.state[slots.duration], 0);
  h.unmount();
});

test('a session metadata refresh does not restart the duration interval or reset its next tick', () => {
  const h = fixture({ effects: ['duration'], session: connectedSession() });
  h.advance(400);
  const interval = [...h.tasks.keys()];
  h.state[slots.session] = { ...h.state[slots.session], customer_member_id: 'member-b' }; h.render();
  assert.deepEqual([...h.tasks.keys()], interval);
  h.advance(600); h.render();
  assert.equal(h.durationLabel(), '00:16');
  h.unmount();
});

test('a rapid idle-to-connected transition cancels a queued stale duration reset', () => {
  const h = fixture({ effects: ['duration'], duration: 41 });
  h.state[slots.session] = connectedSession(); h.render(); h.advance(0); h.render();
  assert.equal(h.durationLabel(), '00:15');
  assert.equal(h.pending('interval').length, 1);
  h.unmount();
});

test('replaced answer timestamps resynchronize safely and never display a negative duration', () => {
  const h = fixture({ effects: ['duration'], session: connectedSession() });
  h.state[slots.session] = connectedSession({ customer_answer_time: '2026-11-07T12:00:05+05:30' });
  h.render(); h.advance(0); h.render();
  assert.equal(h.durationLabel(), '00:00');
  h.state[slots.session] = connectedSession({ customer_answer_time: '2026-11-07T11:59:30+05:30' });
  h.render(); h.advance(0); h.render();
  assert.equal(h.durationLabel(), '00:30');
  h.unmount();
});

test('unmount before clock initialization cancels the pending synchronization', () => {
  const h = fixture({ effects: ['duration'], session: connectedSession(), duration: 7 });
  h.unmount(); h.advance(1000);
  assert.equal(h.state[slots.duration], 7);
  assert.equal(h.tasks.size, 0);
});

test('session polling retains the 60-second idle and 2-second engaged intervals without duplicates', async () => {
  const h = fixture({ effects: ['polling'] });
  assert.equal(h.requests.length, 0);
  h.advance(0); await flush();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.pending('interval').map(task => task.delay), [60000]);
  h.advance(59999); assert.equal(h.requests.length, 1);
  h.advance(1); await flush(); assert.equal(h.requests.length, 2);
  h.state[slots.optimisticCall] = { roomName: 'new-room', startTime: Date.parse('2026-11-07T12:01:00+05:30') };
  h.render(); h.advance(0); await flush();
  assert.equal(h.requests.length, 3);
  assert.match(h.requests[2].url, /room=new-room/);
  assert.deepEqual(h.pending('interval').map(task => task.delay), [2000]);
  h.advance(1999); assert.equal(h.requests.length, 3);
  h.advance(1); await flush(); assert.equal(h.requests.length, 4);
  assert.ok(h.state[slots.optimisticCall], 'A fresh optimistic call must survive an empty server response');
  h.state[slots.optimisticCall] = null; h.render(); h.advance(0); await flush();
  assert.deepEqual(h.pending('interval').map(task => task.delay), [60000]);
  h.unmount(); const count = h.requests.length;
  h.advance(60000); await flush();
  assert.equal(h.requests.length, count);
  assert.equal(h.tasks.size, 0);
});

test('session status changes refresh immediately while metadata updates do not create more requests', async () => {
  const h = fixture({ effects: ['polling'], session: connectedSession({ status: 'ringing', customer_answer_time: null }) });
  h.advance(0); await flush(); h.render();
  assert.equal(h.requests.length, 1);
  h.state[slots.session] = connectedSession(); h.render(); h.advance(0); await flush();
  assert.equal(h.requests.length, 2);
  h.state[slots.session] = { ...h.state[slots.session], customer_member_id: 'updated-member' };
  h.render(); h.advance(0); await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.pending('interval').length, 1);
  h.unmount();
});

test('a new optimistic room refreshes immediately even when the poller is already engaged', async () => {
  const h = fixture({ effects: ['polling'], optimisticCall: {
    roomName: 'first-room', startTime: Date.parse('2026-11-07T12:00:00+05:30')
  } });
  h.advance(0); await flush();
  h.state[slots.optimisticCall] = { ...h.state[slots.optimisticCall], roomName: 'replacement-room' };
  h.render(); h.advance(0); await flush();
  assert.equal(h.requests.length, 2);
  assert.match(h.requests[1].url, /room=replacement-room/);
  assert.equal(h.pending('interval').length, 1);
  h.unmount();
});

test('unmount and agent replacement cancel queued initial session requests', async () => {
  const unmounted = fixture({ effects: ['polling'] });
  unmounted.unmount(); unmounted.advance(0); await flush();
  assert.equal(unmounted.requests.length, 0);
  assert.equal(unmounted.tasks.size, 0);
  const replaced = fixture({ effects: ['polling'] });
  replaced.state[slots.agent] = { ...agent, id: 'agent-b' }; replaced.render(); replaced.advance(0); await flush();
  assert.equal(replaced.requests.length, 1);
  assert.match(replaced.requests[0].url, /agent_id=agent-b/);
  replaced.unmount();
  const noAgent = fixture({ effects: ['polling'], assignedAgent: null });
  noAgent.advance(60000); await flush();
  assert.equal(noAgent.requests.length, 0);
  assert.equal(noAgent.tasks.size, 0);
  noAgent.unmount();
});

test('saved widget position stays within the existing expanded and minimized bounds', () => {
  const h = fixture({ effects: ['position'], savedPosition: JSON.stringify({ x: -9000, y: -9000 }) });
  h.advance(16); h.render();
  assert.equal(h.position().x, -792); assert.equal(h.position().y, -352);
  h.button('Minimize').props.onClick(); h.render(); h.advance(16); h.render();
  assert.equal(h.position().x, -892); assert.equal(h.position().y, -822);
  h.button('Expand').props.onClick(); h.render(); h.advance(16); h.render();
  assert.equal(h.position().x, -792); assert.equal(h.position().y, -352);
  h.unmount();
});

test('rapid minimize/expand and unmount cancel stale layout callbacks', () => {
  const h = fixture({ effects: ['position'], savedPosition: JSON.stringify({ x: -9000, y: -9000 }) });
  h.button('Minimize').props.onClick(); h.render();
  h.button('Expand').props.onClick(); h.render();
  assert.equal(h.pending('frame').length, 1);
  h.advance(16); h.render();
  assert.equal(h.position().x, -792); assert.equal(h.position().y, -352);
  h.button('Minimize').props.onClick(); h.render(); h.unmount();
  h.advance(16);
  assert.equal(h.tasks.size, 0);
});

test('invalid or unavailable saved position storage degrades without throwing', () => {
  for (const options of [{ savedPosition: '{invalid' }, { savedPosition: '{"x":"invalid","y":2}' }, { storageFailure: true }]) {
    const h = fixture({ effects: ['position'], ...options });
    assert.doesNotThrow(() => { h.advance(16); h.render(); });
    assert.equal(h.position().x, 0); assert.equal(h.position().y, 0);
    h.unmount();
  }
});
