import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const templateId = '33333333-3333-4333-8333-333333333333';
const tenantId = '44444444-4444-4444-8444-444444444444';

async function loadModuleCatalog() {
  const source = fs.readFileSync(new URL('../src/config/modulesConfig.jsx', import.meta.url), 'utf8');
  const result = await swc.transform(source, {
    filename: 'modulesConfig.jsx',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  const loaded = { exports: {} };
  const Icon = () => null;
  vm.runInNewContext(result.code, {
    module: loaded,
    exports: loaded.exports,
    require: name => {
      if (name === 'react') return { createElement: () => null };
      if (name === 'lucide-react') return new Proxy({}, { get: () => Icon });
      throw new Error(`Unexpected catalog dependency: ${name}`);
    }
  }, { filename: 'modulesConfig.jsx' });
  return loaded.exports.MODULES_CONFIG;
}

async function actionsFor(overrides = {}) {
  const state = {
    actor: { user_id: actorId, email: 'admin@example.com', role: 'admin', company: 'Acme', tenant_id: tenantId, module_access: {} },
    target: { user_id: targetId, email: 'staff@example.com', role: 'agent', company: 'Acme', tenant_id: tenantId, module_access: { leads: { view: true }, can_delete_leads: true, emp_status: 'Active', profile_note: 'keep' } },
    template: { id: templateId, name: 'Support Agent', permissions: { callcenter: { view: true, read: true, write: true } } },
    missingTable: false,
    writes: [],
    ...overrides
  };

  const db = {
    from(table) {
      let operation = 'read';
      let payload;
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        insert(value) { operation = 'insert'; payload = value; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        order() {
          if (state.missingTable) return Promise.resolve({ data: null, error: { code: '42P01' } });
          return Promise.resolve({ data: state.template ? [state.template] : [], error: null });
        },
        single() {
          if (operation !== 'insert') throw new Error('Unexpected single()');
          state.writes.push({ table, operation, payload });
          return Promise.resolve({ data: { id: templateId, ...payload }, error: null });
        },
        maybeSingle() {
          if (operation === 'update') {
            state.writes.push({ table, operation, payload, filters });
            if (state.target?.user_id === filters.user_id && state.target.role === filters.role) {
              return Promise.resolve({ data: { user_id: filters.user_id }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }
          if (table === 'crm_role_templates') {
            const found = state.template?.id === filters.id && filters.workspace_key === 'company:acme';
            return Promise.resolve({ data: found ? state.template : null, error: null });
          }
          const row = filters.user_id === actorId ? state.actor : filters.user_id === targetId ? state.target : null;
          return Promise.resolve({ data: row, error: null });
        }
      };
      return query;
    }
  };

  const source = fs.readFileSync(new URL('../src/app/actions/roleTemplates.js', import.meta.url), 'utf8');
  const result = await swc.transform(source, {
    filename: 'roleTemplates.js',
    jsc: { parser: { syntax: 'ecmascript' }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  const loaded = { exports: {} };
  vm.runInNewContext(result.code, {
    module: loaded,
    exports: loaded.exports,
    require: name => {
      if (name === '@/utils/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: actorId, email: state.actor.email } }, error: null }) } }) };
      if (name === '@/utils/supabase/adminClient') return { getAdminClient: () => db };
      if (name === '@/config/modulesConfig') return { MODULES_CONFIG: [
        { id: 'leads', subItems: [{ id: 'lead_dashboard' }, { id: '01 - New Stage' }] },
        { id: 'callcenter', subItems: [] },
        { id: 'attendance', subItems: [] },
        { id: 'calladmin', label: 'Call Admin', subItems: [{ id: 'telephony' }] },
        { id: 'email_config', roleDisplayTabs: [{ id: 'smtp' }] },
        { id: 'workplace', label: 'Workflow Builder', roleAssignable: false, subItems: [{ id: 'active' }] },
        { id: 'public_users', label: 'Public User Management', roleAssignable: false }
      ] };
      if (name === '@/components/UserManagement/utils/rolePresets') return { ROLE_PRESETS: [{ name: 'Master Admin', presetData: { is_master_admin: true, can_delete_leads: true, leads: { view: true } } }] };
      if (name === './audit') return { logAuditAction: async () => {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console
  }, { filename: 'roleTemplates.js' });
  return { actions: loaded.exports, state };
}

test('Add Role saves a scoped template without changing employees', async () => {
  const { actions, state } = await actionsFor();
  const result = await actions.createRoleTemplate({
    name: '  Support   Agent  ',
    description: 'Handles calls',
    permissions: { callcenter: { view: true, read: true, write: true } }
  });
  assert.equal(result.success, true);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].table, 'crm_role_templates');
  assert.equal(state.writes[0].payload.workspace_key, 'company:acme');
  assert.equal(state.writes[0].payload.name, 'Support Agent');
});

test('Add Role rejects privileged and unknown permission keys', async () => {
  const { actions, state } = await actionsFor();
  for (const permissions of [
    { is_master_admin: true },
    { callcenter: { view: true, secret: true } },
    { leads: { view: true, read: true } },
    { leads: { view: true, sub_items: { unknown: { view: true } } } }
  ]) {
    const result = await actions.createRoleTemplate({ name: 'Unsafe Role', permissions });
    assert.equal(result.success, false);
  }
  assert.equal(state.writes.length, 0);
});

test('Add Role accepts a live Call Admin tab and rejects locked or display-only tabs', async () => {
  const { actions, state } = await actionsFor();
  const allowed = await actions.createRoleTemplate({
    name: 'Call Supervisor',
    permissions: { calladmin: { view: true, sub_items: { telephony: { view: true } } } }
  });
  assert.equal(allowed.success, true);
  assert.equal(state.writes[0].payload.permissions.calladmin.sub_items.telephony.view, true);

  for (const permissions of [
    { workplace: { view: true, sub_items: { active: { view: true } } } },
    { public_users: { view: true } },
    { email_config: { view: true, sub_items: { smtp: { view: true } } } }
  ]) {
    const result = await actions.createRoleTemplate({ name: 'Invalid Access', permissions });
    assert.equal(result.success, false);
  }
  assert.equal(state.writes.length, 1);
});

test('Add Role catalog lists live tabs and marks restricted pages', async () => {
  const modules = await loadModuleCatalog();
  const byId = Object.fromEntries(modules.map(module => [module.id, module]));
  const ids = module => new Set([...(module.subItems || []), ...(module.roleDisplayTabs || [])].map(tab => tab.id));

  for (const [moduleId, expected] of [
    ['analytics', ['overview', 'scorecard', 'lead-data', 'delegation', 'checklist', 'attendance', 'recruiter']],
    ['leads', ['all_leads', 'lead_dashboard', 'hourly_work']],
    ['recruiter', ['dashboard', 'all_stages', 'S00', 'S09']],
    ['calladmin', ['agents', 'endpoints', 'telephony', 'calllogs', 'monitor', 'settings']],
    ['whatsapp_official', ['templates', 'automations', 'catalog', 'allocations', 'settings']],
    ['email_config', ['smtp', 'templates', 'automations', 'test', 'logs']],
    ['settings', ['business', 'crm', 'fields', 'notifications', 'departments', 'targets', 'data', 'media']]
  ]) {
    for (const tabId of expected) assert.equal(ids(byId[moduleId]).has(tabId), true, `${moduleId} is missing ${tabId}`);
  }
  for (const moduleId of ['workplace', 'public_users', 'admin_message_config']) {
    assert.equal(byId[moduleId].roleAssignable, false);
  }
});

test('Assign Role replaces only selected staff permissions and preserves profile data', async () => {
  const { actions, state } = await actionsFor();
  const result = await actions.assignRoleTemplate(targetId, templateId);
  assert.equal(result.success, true);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].table, 'user_roles');
  assert.equal(state.writes[0].filters.user_id, targetId);
  assert.equal(state.writes[0].payload.module_access.leads, undefined);
  assert.equal(state.writes[0].payload.module_access.can_delete_leads, undefined);
  assert.equal(state.writes[0].payload.module_access.profile_note, 'keep');
  assert.equal(state.writes[0].payload.module_access.callcenter.view, true);
  assert.equal(state.writes[0].payload.module_access.callcenter.add, true);
  assert.equal(state.writes[0].payload.module_access.role_template_id, templateId);
  assert.equal(state.writes[0].payload.role, undefined);
});

test('Assignment rejects a different tenant even when company names match', async () => {
  const stateOverride = { target: { user_id: targetId, role: 'agent', company: 'Acme', tenant_id: '55555555-5555-4555-8555-555555555555', module_access: {} } };
  const { actions, state } = await actionsFor(stateOverride);
  const result = await actions.assignRoleTemplate(targetId, templateId);
  assert.equal(result.success, false);
  assert.equal(state.writes.length, 0);
});

test('Assignment never changes a Master Admin account', async () => {
  const target = { user_id: targetId, email: 'supujacreations@gmail.com', role: 'agent', company: 'Acme', tenant_id: tenantId, module_access: {} };
  const { actions, state } = await actionsFor({ target });
  const result = await actions.assignRoleTemplate(targetId, templateId);
  assert.equal(result.success, false);
  assert.equal(state.writes.length, 0);
});

test('Role creation requires admin; missing setup reports a clear error', async () => {
  const staff = { user_id: actorId, email: 'staff@example.com', role: 'agent', company: 'Acme', module_access: { user_management_new: { view: true } } };
  const unauthorized = await actionsFor({ actor: staff });
  assert.equal((await unauthorized.actions.createRoleTemplate({ name: 'Support', permissions: { callcenter: { view: true } } })).success, false);
  assert.equal(unauthorized.state.writes.length, 0);

  const missing = await actionsFor({ missingTable: true });
  const result = await missing.actions.getRoleTemplates();
  assert.equal(result.success, false);
  assert.equal(result.canManageRoles, true);
  assert.match(result.error, /29_user_management_role_templates/);
});
