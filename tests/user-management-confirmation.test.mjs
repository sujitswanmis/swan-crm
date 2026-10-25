import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

async function compile(file) {
  const result = await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  return result.code;
}

const containerCode = await compile('src/components/UserManagement/UserManagementContainer.jsx');
const modalCode = await compile('src/components/UserManagement/modals/ConfirmActionModal.jsx');
const icons = new Proxy({}, { get: () => () => null });

function load(code, dependencies, globals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console, setTimeout: () => 0,
    window: { confirm: () => { throw new Error('Native confirmation must not be used'); } },
    ...globals
  });
  return loadedModule.exports.default;
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : '';
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const template = { id: 'template-1', name: 'Support Staff' };
const cases = [
  { name: 'employee status', handler: 'onChangeStatus', value: 'InActive', action: 'updateEmpStatus', field: 'emp_status', result: 'InActive', labels: ['Active', 'InActive'] },
  { name: 'approval status', handler: 'onToggleApproval', action: 'toggleUserApproval', field: 'is_approved', result: true, labels: ['Pending', 'Approved'] },
  { name: 'system role', handler: 'onChangeRole', value: 'Manager', action: 'updateUserRole', field: 'role', result: 'Manager', labels: ['agent', 'Manager'] },
  { name: 'custom role', handler: 'onAssignRole', value: template, action: 'assignRoleTemplate', field: 'module_access', labels: ['Support Staff', 'permissions will be replaced'] }
];

function containerHarness({ gate, fail = false, broadcastFails = false } = {}) {
  let cursor = 0;
  const slots = [];
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useEffect: () => {}
  };
  const initial = {
    user_id: 'employee-1', email: 'employee@example.invalid', emp_name: 'Example Employee',
    emp_status: 'Active', is_approved: false, role: 'agent', module_access: { leads: { view: true } }
  };
  let backend = structuredClone(initial);
  let failNext = fail;
  const writes = [];
  const broadcasts = [];
  async function write(action, userId, value) {
    writes.push({ action, userId, value });
    if (gate) await gate.promise;
    if (failNext) {
      failNext = false;
      if (action === 'assignRoleTemplate') return { success: false, error: 'Save rejected' };
      throw new Error('Save rejected');
    }
    if (action === 'assignRoleTemplate') {
      backend = { ...backend, module_access: { callcenter: { view: true }, role_template_id: value, role_template_name: template.name } };
      return { success: true, moduleAccess: backend.module_access };
    }
    const field = cases.find(item => item.action === action).field;
    backend = { ...backend, [field]: value };
    return action === 'updateEmpStatus' ? { success: true } : true;
  }
  const stubs = Object.fromEntries([
    'UserManageTab', 'RolesPermissionsTab', 'OrgHierarchyTab', 'ActiveSessionsTab', 'AuditLogsTab',
    'AddEditUserModal', 'PermissionMatrixModal', 'RoleTemplateModal', 'ResetPasswordModal',
    'SendResetEmailModal', 'ViewChatModal', 'ImpersonateModal', 'BulkImportExportModal', 'ConfirmActionModal'
  ].map(name => [name, () => null]));
  const dependencies = {
    react,
    'lucide-react': icons,
    '@/app/actions/team': {
      getTeamMembers: async () => [structuredClone(backend)],
      updateEmpStatus: (...args) => write('updateEmpStatus', ...args),
      toggleUserApproval: (...args) => write('toggleUserApproval', ...args),
      updateUserRole: (...args) => write('updateUserRole', ...args)
    },
    '@/app/actions/roleTemplates': { assignRoleTemplate: (...args) => write('assignRoleTemplate', ...args) },
    '@/utils/supabase/client': {
      createClient: () => ({ channel: channel => ({ send: async payload => {
        if (broadcastFails) throw new Error('Broadcast unavailable');
        broadcasts.push({ channel, ...payload });
      } }) })
    },
    '@/utils/saasEntitlements': { isFeatureEntitled: () => false },
    './utils/userManagementUtils': { DEFAULT_DEPARTMENTS: [] }
  };
  for (const [name, component] of Object.entries(stubs)) {
    dependencies[`./${name.endsWith('Tab') ? 'tabs' : 'modals'}/${name}`] = component;
  }
  const Container = load(containerCode, dependencies, { console: { ...console, warn: () => {} } });
  function render() {
    cursor = 0;
    const tree = Container({ initialUsers: [initial] });
    const all = nodes(tree);
    const tab = all.find(node => node.type === stubs.UserManageTab).props;
    const modal = all.find(node => node.type === stubs.ConfirmActionModal).props;
    return { tree, tab, modal, user: tab.users[0] };
  }
  return {
    initial, render, writes, broadcasts,
    request(item) {
      const { tab, user } = render();
      tab[item.handler](user, item.value);
      return render();
    }
  };
}

for (const item of cases) {
  test(`${item.name}: opening and cancelling confirmation never writes or changes the row`, () => {
    const harness = containerHarness();
    const { modal, user } = harness.request(item);
    assert.equal(modal.isOpen, true);
    assert.ok(modal.message.includes(harness.initial.emp_name));
    for (const label of item.labels) assert.ok(modal.message.includes(label));
    assert.deepEqual(user, harness.initial);
    assert.equal(harness.writes.length, 0);
    modal.onClose();
    assert.equal(harness.render().modal.isOpen, false);
    assert.deepEqual(harness.render().user, harness.initial);
    assert.equal(harness.writes.length, 0);
  });

  test(`${item.name}: confirm writes once, waits for success, and blocks duplicate clicks and closing while saving`, async () => {
    const gate = deferred();
    const harness = containerHarness({ gate });
    const { modal } = harness.request(item);
    const saving = modal.onConfirm();
    await modal.onConfirm();
    const pending = harness.render();
    assert.equal(pending.modal.loading, true);
    assert.equal(harness.writes.length, 1);
    assert.deepEqual(pending.user, harness.initial);
    pending.modal.onClose();
    assert.equal(harness.render().modal.isOpen, true);
    gate.resolve();
    await saving;
    const saved = harness.render();
    assert.equal(saved.modal.isOpen, false);
    assert.equal(saved.modal.loading, false);
    assert.equal(harness.writes[0].action, item.action);
    assert.equal(harness.writes[0].userId, harness.initial.user_id);
    assert.equal(harness.writes[0].value, item.action === 'assignRoleTemplate' ? template.id : item.result);
    if (item.action === 'assignRoleTemplate') {
      assert.equal(saved.user.module_access.role_template_id, template.id);
      assert.equal(harness.broadcasts.length, 1);
      assert.equal(harness.broadcasts[0].event, 'permission_updated');
      assert.equal(harness.broadcasts[0].payload.userId, harness.initial.user_id);
    } else {
      assert.equal(saved.user[item.field], item.result);
    }
  });

  test(`${item.name}: failure preserves the row and allows an explicit retry`, async () => {
    const harness = containerHarness({ fail: true });
    await harness.request(item).modal.onConfirm();
    const failed = harness.render();
    assert.equal(failed.modal.isOpen, true);
    assert.equal(failed.modal.loading, false);
    assert.deepEqual(failed.user, harness.initial);
    assert.match(text(failed.tree), /Save rejected/);
    assert.equal(harness.broadcasts.length, 0);
    await failed.modal.onConfirm();
    assert.equal(harness.render().modal.isOpen, false);
    assert.equal(harness.writes.length, 2);
  });
}

test('unchanged status and role do not open a confirmation or write', () => {
  const harness = containerHarness();
  const { tab, user } = harness.render();
  tab.onChangeStatus(user, user.emp_status);
  tab.onChangeRole(user, user.role);
  assert.equal(harness.render().modal.isOpen, false);
  assert.equal(harness.writes.length, 0);
});

test('a permission broadcast failure does not undo a successful custom role assignment', async () => {
  const harness = containerHarness({ broadcastFails: true });
  await harness.request(cases[3]).modal.onConfirm();
  assert.equal(harness.render().modal.isOpen, false);
  assert.equal(harness.render().user.module_access.role_template_id, template.id);
  assert.equal(harness.writes.length, 1);
});

function modalHarness(document) {
  const portals = [];
  const Modal = load(modalCode, {
    react: { ...React, useId: () => 'confirmation-title' },
    'react-dom': { createPortal: (content, target) => { portals.push({ content, target }); return content; } },
    'lucide-react': icons
  }, { document });
  return { Modal, portals };
}

test('confirmation portal targets document.body and centers the dialog independently of parent layout', () => {
  const body = {};
  const { Modal, portals } = modalHarness({ body });
  const tree = Modal({ isOpen: true, title: 'Change Employee Status?' });
  assert.equal(portals[0].target, body);
  assert.equal(tree.props.style.position, 'fixed');
  assert.equal(tree.props.style.top, 0);
  assert.equal(tree.props.style.bottom, 0);
  assert.equal(tree.props.style.alignItems, 'center');
  assert.equal(tree.props.style.justifyContent, 'center');
  const dialog = nodes(tree).find(node => node.props?.role === 'dialog');
  assert.equal(dialog.props['aria-modal'], 'true');
  const title = nodes(dialog).find(node => node.type === 'h3');
  assert.equal(dialog.props['aria-labelledby'], title.props.id);
});

test('confirmation buttons are disabled while saving and preserve their callbacks otherwise', () => {
  const { Modal } = modalHarness({ body: {} });
  let cancelled = 0;
  let confirmed = 0;
  const props = { isOpen: true, onClose: () => cancelled++, onConfirm: () => confirmed++ };
  const busy = nodes(Modal({ ...props, loading: true })).filter(node => node.type === 'button');
  assert.ok(busy.every(button => button.props.disabled));
  const idle = nodes(Modal(props)).filter(node => node.type === 'button');
  idle[0].props.onClick();
  idle[1].props.onClick();
  assert.equal(cancelled, 1);
  assert.equal(confirmed, 1);
});

test('closed and server-rendered confirmations do not create portals', () => {
  const client = modalHarness({ body: {} });
  assert.equal(client.Modal({ isOpen: false }), null);
  assert.equal(client.portals.length, 0);
  const server = modalHarness(undefined);
  assert.equal(server.Modal({ isOpen: true }), null);
  assert.equal(server.portals.length, 0);
});
