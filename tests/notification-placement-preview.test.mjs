import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as presentationUtils from '../src/utils/notificationPresentation.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const previewSource = fs.readFileSync(new URL('../src/components/MasterAdmin/LivePlacementPreview.jsx', import.meta.url), 'utf8');
const cardSource = fs.readFileSync(new URL('../src/components/common/BroadcastNotificationReceiver.jsx', import.meta.url), 'utf8');
const layoutSource = fs.readFileSync(new URL('../src/components/common/NotificationPresentation.jsx', import.meta.url), 'utf8');

function compile(source, filename) {
  return swc.transformSync(source.replaceAll('<style jsx>', '<style>'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  }).code;
}
const cardCode = compile(cardSource, 'BroadcastNotificationReceiver.jsx');
const previewCode = compile(`${previewSource}\nexport { WorkspaceViewport };`, 'LivePlacementPreview.jsx');
const layoutCode = compile(layoutSource, 'NotificationPresentation.jsx');

function harness(code, imports = {}) {
  const state = [];
  let cursor = 0;
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef: initial => ({ current: initial }),
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: () => {}
  };
  const exports = {};
  vm.runInNewContext(code, { exports, console, setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === 'react') return hooks;
      if (name in imports) return imports[name];
      if (name === 'lucide-react') return require(name);
      if (name === '@/utils/notificationPresentation') return presentationUtils;
      if (name.endsWith('/NotificationPresentation') || name === './NotificationPresentation') return harness(layoutCode).exports;
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.includes('ErrorBoundary')) return { __esModule: true, default: ({ children }) => children };
      // Any attempt to construct a real client or submit a server action fails the test.
      if (name.includes('supabase/client')) return { createClient() { throw new Error('Preview must not create a database client'); } };
      if (name.includes('actions/broadcastNotifications')) return { acknowledgeBroadcast() { throw new Error('Preview must not acknowledge a real notification'); } };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  });
  return { exports, render(name, props) { cursor = 0; return exports[name](props); } };
}

function fixture(placement = 'top_right', extra = {}) {
  return { title: 'Team update', message: 'Please review the updated guidelines.', notification_type: placement === 'full_screen' ? 'critical' : 'information', duration_seconds: 15,
    audience: { preset_mode: 'acknowledgement', placement_style: placement, color_theme: 'indigo', allow_feedback: false, allow_reminder: true,
      action_buttons: [{ id: 'understand', label: 'Understood', variant: 'primary' }, { id: 'decline', label: 'Need help', variant: 'danger' }], ...extra } };
}

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => elements(child, predicate))];
}
const byClass = (tree, token) => elements(tree, el => typeof el.props.className === 'string' && el.props.className.split(' ').includes(token));
const textOf = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(textOf).join('') : React.isValidElement(tree) ? textOf(tree.props.children) : '';

for (const device of ['desktop', 'mobile']) {
  for (const { id: placement } of presentationUtils.NOTIFICATION_PLACEMENTS) {
    test(`${device}: ${placement} uses its own placement structure and the shared card`, () => {
      const cardHarness = harness(cardCode);
      const shared = harness(layoutCode);
      const h = harness(previewCode, { '@/components/common/BroadcastNotificationReceiver': cardHarness.exports, '@/components/common/NotificationPresentation': shared.exports });
      const notification = fixture(placement);
      const tree = h.render('WorkspaceViewport', { notification, device, visible: true, onDismiss() {}, revision: 0 });
      const presentation = elements(tree, node => node.type === shared.exports.default)[0];
      assert.ok(presentation, 'Preview must use the employee presentation component');
      const layout = shared.render('default', presentation.props);
      const layers = elements(layout, node => node.props['data-preview-placement']);
      assert.equal(layers.length, 1);
      assert.equal(layers[0].props['data-preview-placement'], placement);
      assert.equal(layers[0].props['data-mobile'], device === 'mobile');
      const blocking = ['center_modal', 'right_drawer', 'full_screen'].includes(placement);
      assert.equal(elements(layout, node => node.props['data-preview-backdrop'] !== undefined).length, blocking ? 1 : 0);
      assert.equal(elements(layout, node => ['dialog', 'alertdialog'].includes(node.props.role)).length, blocking ? 1 : 0);
      const cards = elements(tree, node => node.type === cardHarness.exports.BroadcastNotificationCard);
      assert.equal(cards.length, 1);
      assert.equal(cards[0].props.notification, notification);
      assert.equal(cards[0].props.preview, true);
      assert.equal(cards[0].props.workspacePreview, true);
      assert.equal(byClass(tree, 'phone').length, device === 'mobile' ? 1 : 0);
      assert.equal(byClass(tree, 'desktop').length, device === 'desktop' ? 1 : 0);
    });
  }
}

test('every configuration edit reaches the shared card immediately and resets stale interaction state', () => {
  const cardHarness = harness(cardCode);
  const h = harness(previewCode, { '@/components/common/BroadcastNotificationReceiver': cardHarness.exports });
  const initial = fixture();
  const next = { ...fixture('top_banner', { color_theme: 'rose', allow_reminder: false, action_buttons: [{ id: 'ok', label: 'Approve', variant: 'primary' }] }), title: 'Updated title', message: 'Updated body', notification_type: 'critical' };
  const render = notification => elements(h.render('WorkspaceViewport', { notification, device: 'desktop', visible: true, onDismiss() {}, revision: 0 }), el => el.type === cardHarness.exports.BroadcastNotificationCard)[0];
  const first = render(initial);
  const second = render(next);
  assert.equal(second.props.notification, next);
  assert.notEqual(first.key, second.key);
  assert.deepEqual(initial, fixture());
});

test('dismissal, replay, expansion and device selection keep the composer configuration intact', () => {
  const h = harness(previewCode, { '@/components/common/BroadcastNotificationReceiver': { BroadcastNotificationCard() {} } });
  const notification = fixture();
  const original = JSON.stringify(notification);
  let selected;
  const props = { notification, device: 'desktop', onDeviceChange: value => { selected = value; } };
  const render = () => h.render('default', props);
  const viewport = tree => elements(tree, node => node.type?.name === 'WorkspaceViewport')[0];
  viewport(render()).props.onDismiss();
  assert.equal(viewport(render()).props.visible, false);
  elements(render(), el => el.type === 'button' && textOf(el).includes('Replay'))[0].props.onClick();
  assert.equal(viewport(render()).props.visible, true);
  elements(render(), el => el.type === 'button' && textOf(el) === 'Mobile')[0].props.onClick();
  assert.equal(selected, 'mobile');
  elements(render(), el => el.props['aria-label'] === 'Expand preview')[0].props.onClick();
  assert.equal(elements(render(), el => el.type === 'dialog').length, 1);
  elements(render(), el => el.props['aria-label'] === 'Close expanded preview')[0].props.onClick();
  assert.equal(elements(render(), el => el.type === 'dialog').length, 0);
  assert.equal(JSON.stringify(notification), original);
});

test('preview action and snooze controls never invoke real response handlers', async () => {
  const h = harness(cardCode);
  let writes = 0;
  const props = { notification: fixture(), preview: true, workspacePreview: true, onRead: () => { writes++; }, onRemind: () => { writes++; }, onClose() {} };
  const render = () => h.render('BroadcastNotificationCard', props);
  for (const action of byClass(render(), 'btn-action')) await action.props.onClick();
  byClass(render(), 'btn-reminder-toggle')[0].props.onClick();
  await byClass(render(), 'snooze-pill-btn')[0].props.onClick();
  assert.equal(writes, 0);
  assert.match(textOf(render()), /Reminder set for 5 minutes/);
  assert.doesNotMatch(textOf(render()), /Preview: Reminder/);
});

test('feedback remains interactive without submitting a real response', async () => {
  const h = harness(cardCode);
  let writes = 0;
  const props = { notification: fixture('top_banner', { allow_feedback: true }), preview: true, workspacePreview: true, onRead: () => { writes++; }, onClose() {} };
  const render = () => h.render('BroadcastNotificationCard', props);
  await byClass(render(), 'btn-action')[1].props.onClick();
  assert.equal(byClass(render(), 'feedback-drawer').length, 1);
  await byClass(render(), 'btn-feedback-skip')[0].props.onClick();
  assert.equal(byClass(render(), 'feedback-drawer').length, 0);
  assert.equal(writes, 0);
});

test('process audit and rating callbacks supplied by the workspace are safe simulations', async () => {
  const h = harness(previewCode, { '@/components/common/BroadcastNotificationReceiver': { BroadcastNotificationCard() {} } });
  for (const preset of ['process', 'spc_feedback_rating']) {
    const tree = h.render('WorkspaceViewport', { notification: fixture('top_banner', { preset_mode: preset }), device: 'mobile', visible: true, onDismiss() {}, revision: 0 });
    const card = elements(tree, el => el.type?.name === 'BroadcastNotificationCard')[0];
    assert.equal((await card.props.onRead({ preset_mode: preset })).preview, true);
    assert.equal((await card.props.onRemind(15)).preview, true);
  }
});

test('workspace presentation requires both preview flags and does not change employee card output', () => {
  const render = flags => renderToStaticMarkup(harness(cardCode).render('BroadcastNotificationCard', { notification: fixture(), onClose() {}, onRead() {}, ...flags }));
  assert.equal(render({}), render({ workspacePreview: true }));
  const oldPreview = render({ preview: true });
  const workspace = render({ preview: true, workspacePreview: true });
  assert.match(oldPreview, /Preview · Announcement/);
  assert.match(oldPreview, /paused in preview/);
  assert.doesNotMatch(workspace, /Preview · Announcement|Time shown in IST|paused in preview/);
  assert.match(workspace, /Team update/);
  assert.match(workspace, /Please review the updated guidelines/);
  assert.match(workspace, /Understood/);
});

test('snooze and priority follow their current configuration', () => {
  const h = harness(cardCode);
  const notification = { ...fixture('top_banner', { allow_reminder: false, color_theme: 'emerald' }), notification_type: 'critical' };
  const tree = h.render('BroadcastNotificationCard', { notification, preview: true, workspacePreview: true, onClose() {} });
  assert.equal(byClass(tree, 'btn-reminder-toggle').length, 0);
  assert.match(textOf(tree), /Critical/);
  assert.equal(byClass(tree, 'theme-emerald').length, 1);
});

test('the final review uses compact preview presentation and existing external device controls', () => {
  const h = harness(previewCode, { '@/components/common/BroadcastNotificationReceiver': { BroadcastNotificationCard() {} } });
  const tree = h.render('default', { notification: fixture(), device: 'desktop', compact: true, showDeviceToggle: false });
  assert.equal(byClass(tree, 'compact').length, 1);
  assert.match(textOf(tree), /Final Notification Preview/);
  assert.equal(elements(tree, el => el.props['aria-label'] === 'Preview device').length, 0);
  assert.equal(elements(tree, el => el.props['aria-label'] === 'Expand preview').length, 1);
});

for (const [handler, action, draft, testOnly] of [
  ['handleSaveDraft', 'saveBroadcastDraft', true, false],
  ['handleSendTest', 'sendTestBroadcast', false, true]
]) {
  test(`${handler} sends valid content with a fresh notification ID`, async () => {
    const source = fs.readFileSync(new URL('../src/components/MasterAdmin/BroadcastNotificationPanel.jsx', import.meta.url), 'utf8');
    const callback = source.match(new RegExp(`  async function ${handler}\\(\\) \\{[\\s\\S]*?\\n  \\}`))?.[0];
    assert.ok(callback, `Could not find ${handler}`);
    const requests = [];
    const errors = [];
    const content = { title: 'Notification Placement on Screen:', message: 'Notification Placement on Screen:Notification Placement on Screen:' };
    const original = JSON.stringify(content);
    const invoke = vm.runInNewContext(`(${callback})`, {
      crypto: webcrypto,
      buildPayload: extra => ({ ...content, ...extra }),
      [action]: async payload => {
        requests.push(payload);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id || '')) {
          return { success: false, error: 'Enter a title (150 max) and message (4000 max).' };
        }
        return { success: true, id: payload.id };
      },
      setBusy() {}, setError: error => { if (error) errors.push(error); }, setNotice() {},
      loadReport: async () => {}, selectNotification() {}
    });
    await invoke();
    await invoke();
    assert.equal(requests.length, 2);
    assert.deepEqual(errors, []);
    assert.notEqual(requests[0].id, requests[1].id);
    for (const payload of requests) {
      assert.equal(payload.title, content.title);
      assert.equal(payload.message, content.message);
      assert.equal(payload.is_draft, draft);
      assert.equal(!!payload.is_test, testOnly);
    }
    assert.equal(JSON.stringify(content), original);
  });
}
