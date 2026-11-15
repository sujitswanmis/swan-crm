import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import * as presentation from '../src/utils/notificationPresentation.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const serverSource = fs.readFileSync(new URL('../src/app/actions/broadcastNotifications.js', import.meta.url), 'utf8');
const composer = fs.readFileSync(new URL('../src/components/MasterAdmin/BroadcastNotificationPanel.jsx', import.meta.url), 'utf8');
const serverCode = swc.transformSync(serverSource, {
  filename: 'broadcastNotifications.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
}).code;

function serverHarness(master = true) {
  const user = { id: '10000000-0000-4000-8000-000000000001', email: master ? 'supujacreations@gmail.com' : 'employee@example.test' };
  const actor = { user_id: user.id, emp_name: 'Test operator', emp_status: 'active', role: master ? 'masteradmin' : 'executive' };
  const writes = [];
  const records = new Map();
  const db = {
    from(table) {
      let id;
      return {
        select() { return this; }, eq(key, value) { if (key === 'id') id = value; return this; },
        async maybeSingle() { return { data: table === 'user_roles' ? actor : records.get(id) || null, error: null }; },
        async upsert(payload) { writes.push({ table, payload }); return { data: payload, error: null }; },
        update(payload) { writes.push({ table, payload }); return this; },
        then(resolve) { resolve({ data: null, error: null }); }
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'crm_send_broadcast');
      writes.push({ rpc: name, args });
      records.set(args.p_message.id, { ...args.p_message, recipient_count: args.p_recipients.length });
      return { data: args.p_message.id, error: null };
    }
  };
  const exports = {};
  vm.runInNewContext(serverCode, { exports, console, process: { cwd: () => 'isolated-test' },
    require(name) {
      if (name === '@/utils/notificationPresentation') return presentation;
      if (name === '@/utils/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) };
      if (name === '@/utils/supabase/adminClient') return { getAdminClient: () => db };
      if (name === 'node:crypto' || name === 'node:path') return require(name);
      if (name === 'node:fs/promises') return { readFile: async () => { throw new Error('Unexpected directory read in isolated test'); } };
      throw new Error(`Unexpected import: ${name}`);
    }
  });
  return { ...exports, writes };
}

function input(placement = 'top_right', overrides = {}) {
  return {
    id: webcrypto.randomUUID(), title: 'Operational notice', message: 'Please review this update.',
    notification_type: placement === 'full_screen' ? 'critical' : 'information',
    duration_seconds: 15, validity_hours: 24, close_behaviour: 'auto_unread',
    placement_style: placement, notification_size: 'large', entry_animation: 'fade_in', animation_duration: 400,
    audience: { scope: 'workspace', workspace: 'test-workspace' },
    action_buttons: [{ id: 'ok', label: 'Understood', variant: 'primary' }],
    allow_feedback: true, allow_reminder: true, preset_mode: 'acknowledgement', ...overrides
  };
}

test('legacy uppercase placements retain their position and receive safe optional defaults', () => {
  for (const old of ['TOP_RIGHT', 'CENTER_MODAL', 'TOP_BANNER']) {
    const normalized = presentation.getNotificationPresentation({ audience: { placement_style: old } });
    assert.equal(normalized.placement_style, old.toLowerCase());
    assert.equal(normalized.notification_size, 'auto');
    assert.equal(normalized.animation_duration, 250);
    assert.notEqual(normalized.entry_animation, undefined);
  }
});

test('all size, animation and duration options round-trip without narrowing the placement', () => {
  for (const p of presentation.NOTIFICATION_PLACEMENTS) {
    for (const size of presentation.NOTIFICATION_SIZES) {
      for (const [animation] of presentation.NOTIFICATION_ANIMATIONS) {
        for (const [duration] of presentation.NOTIFICATION_ANIMATION_SPEEDS) {
          const value = presentation.validateNotificationPresentation({ placement_style: p.id, notification_type: 'critical', notification_size: size, entry_animation: animation, animation_duration: duration });
          assert.deepEqual(value, { placement_style: p.id, notification_size: size, entry_animation: animation, animation_duration: duration });
        }
      }
    }
  }
});

test('Auto accounts for message length, action count and interactive content without mutating content', () => {
  const notification = { message: 'Short notice', audience: { notification_size: 'auto', action_buttons: [{ id: 'ok' }] } };
  const original = JSON.stringify(notification);
  assert.equal(presentation.resolveNotificationSize(notification), 'compact');
  assert.equal(presentation.resolveNotificationSize({ ...notification, message: 'x'.repeat(500) }), 'standard');
  assert.equal(presentation.resolveNotificationSize({ ...notification, message: 'x'.repeat(4000) }), 'large');
  assert.equal(presentation.resolveNotificationSize({ ...notification, audience: { action_buttons: [1, 2, 3, 4] } }), 'large');
  assert.equal(presentation.resolveNotificationSize({ ...notification, audience: { preset_mode: 'process' } }), 'large');
  assert.equal(JSON.stringify(notification), original);
});

test('invalid presentation values fall back safely and non-critical historical full-screen data cannot block employees', () => {
  const value = presentation.getNotificationPresentation({ audience: { placement_style: 'full_screen', notification_type: 'information', notification_size: 'huge', entry_animation: 'unknown', animation_duration: -1 } });
  assert.equal(value.placement_style, 'top_right');
  assert.equal(value.notification_size, 'auto');
  assert.equal(value.animation_duration, 250);
  assert.throws(() => presentation.validateNotificationPresentation({ placement_style: 'FULL_SCREEN', notification_type: 'information' }), /only for Critical/);
});

test('queue keeps every unique broadcast, prioritizes critical notices and preserves FIFO ties', () => {
  const rows = [
    { broadcast_id: 'a', crm_broadcasts: { audience: { notification_type: 'information' } } },
    { broadcast_id: 'b', crm_broadcasts: { audience: { notification_type: 'critical' } } },
    { broadcast_id: 'c', crm_broadcasts: { audience: { notification_type: 'information' } } },
    { broadcast_id: 'd', crm_broadcasts: { notification_type: 'urgent' } }
  ];
  const original = JSON.stringify(rows);
  const result = presentation.prioritizeNotificationQueue([...rows, rows[0], null]);
  assert.deepEqual(result.map(row => row.broadcast_id), ['b', 'd', 'a', 'c']);
  assert.equal(JSON.stringify(rows), original);
});

test('both historical and current acknowledgement-required values are respected', () => {
  for (const close_behaviour of ['required', 'acknowledgement_required']) assert.equal(presentation.requiresNotificationResponse({ audience: { close_behaviour } }), true);
  assert.equal(presentation.requiresNotificationResponse({ close_behaviour: 'manual_close' }), false);
});

for (const { id: placement } of presentation.NOTIFICATION_PLACEMENTS) {
  for (const mode of ['draft', 'test']) {
    test(`${mode}: ${placement} persists presentation and existing response settings in audience JSON`, async () => {
      const h = serverHarness();
      const payload = input(placement, { is_draft: mode === 'draft', is_test: mode === 'test' });
      const original = JSON.stringify(payload);
      const result = await h.sendBroadcastNotification(payload);
      assert.equal(result.success, true, result.error);
      const saved = mode === 'draft' ? h.writes.find(w => w.table === 'crm_broadcasts').payload : h.writes.find(w => w.rpc).args.p_message;
      for (const [key, value] of Object.entries(presentation.normalizeNotificationPresentation(payload))) assert.equal(saved.audience[key], value);
      assert.equal(saved.audience.scope, 'workspace');
      assert.equal(saved.audience.allow_feedback, true);
      assert.equal(saved.audience.allow_reminder, true);
      assert.equal(saved.audience.action_buttons[0].label, 'Understood');
      assert.equal(saved.audience.close_behaviour, 'auto_keep_unread');
      assert.equal(JSON.stringify(payload), original);
    });
  }
}

test('server refuses non-critical full-screen broadcasts before any notification write', async () => {
  const h = serverHarness();
  const result = await h.sendBroadcastNotification(input('full_screen', { notification_type: 'information', is_test: true }));
  assert.equal(result.success, false);
  assert.match(result.error, /only for Critical/);
  assert.equal(h.writes.length, 0);
});

test('existing Master Admin authorization remains required for every placement', async () => {
  const h = serverHarness(false);
  const result = await h.sendBroadcastNotification(input('full_screen', { is_test: true }));
  assert.equal(result.success, false);
  assert.match(result.error, /Only Master Admin/);
  assert.equal(h.writes.length, 0);
});

test('send retries retain existing idempotency without duplicate recipient dispatch', async () => {
  const h = serverHarness();
  const payload = input('right_drawer', { is_test: true });
  assert.equal((await h.sendBroadcastNotification(payload)).success, true);
  assert.equal((await h.sendBroadcastNotification(payload)).success, true);
  assert.equal(h.writes.filter(w => w.rpc).length, 1);
});

test('priority changes preserve manually selected placement, typed content and configured response buttons', () => {
  const callback = composer.match(/  function handleSelectNotificationType\(typeId\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(callback);
  let priority;
  const forbidden = () => { throw new Error('Priority must not reset manual placement or response configuration'); };
  const invoke = vm.runInNewContext(`(${callback})`, { setNotificationType: value => { priority = value; }, setCloseBehaviour() {}, setDuration() {}, setAllowReminder() {}, setPlacementStyle: forbidden, setActionButtons: forbidden, setAdvancePreset: forbidden, setTitle: forbidden, setMessage: forbidden });
  for (const type of Object.keys(presentation.RECOMMENDED_NOTIFICATION_PLACEMENTS)) { invoke(type); assert.equal(priority, type); }
});

test('the shared composer payload always publishes the latest Step 3 / Step 4 presentation selection', () => {
  const callback = composer.match(/  function buildPayload\(extra = \{\}\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(callback);
  const context = { title: 'Updated notice', message: 'Same content across steps', notificationType: 'critical', closeBehaviour: 'required', duration: 15, validity: 24, audience: { scope: 'all' }, advancePreset: 'approval', colorTheme: 'rose', actionButtons: [{ id: 'approve', label: 'Approve' }], processList: [], ratingPrompt: '', allowFeedback: true, allowReminder: false, requireCommentOnNegative: false, approvedAudience: { fingerprint: 'verified' }, presentationSettings: null };
  const invoke = vm.runInNewContext(`(${callback})`, context);
  for (const p of presentation.NOTIFICATION_PLACEMENTS) {
    context.presentationSettings = presentation.normalizeNotificationPresentation({ placement_style: p.id, notification_size: 'large', entry_animation: 'slide_right', animation_duration: 150 });
    const payload = invoke();
    assert.equal(payload.placement_style, p.id);
    assert.equal(payload.notification_size, 'large');
    assert.equal(payload.entry_animation, 'slide_right');
    assert.equal(payload.animation_duration, 150);
    assert.equal(payload.action_buttons, context.actionButtons);
    assert.equal(payload.fingerprint, 'verified');
  }
});
