import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as hierarchy from '../src/utils/reportingHierarchy.js';
import { getModulePermissions, getSubItemPermissions } from '../src/utils/permissionUtils.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const manager = { user_id: 'manager-id', email: 'manager@example.com', emp_name: 'Team Manager', tenant_id: 'tenant-a' };
const agent = { user_id: 'agent-id', email: 'agent@example.com', emp_name: 'Agent', tenant_id: 'tenant-a' };
const viewer = { user_id: manager.user_id, email: manager.email, emp_name: manager.emp_name };

async function loadModule(file, mocks) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const result = await swc.transform(source, {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(result.code, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      if (name === '@/utils/reportingHierarchy') return hierarchy;
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency in test: ${name}`);
    }, console, process, global: {}, setTimeout, clearTimeout
  }, { filename: file });
  return loadedModule.exports;
}

for (const field of ['primary_reporting_person', 'secondary_reporting_person', 'hod_person']) {
  test(`${field} resolves JSON fallback, email, legacy name and selector object`, () => {
    for (const reference of [manager.email, ' MANAGER@EXAMPLE.COM ', manager.emp_name, manager.user_id, manager]) {
      const member = { ...agent, module_access: { [field]: reference } };
      assert.deepEqual(hierarchy.getReportingTeam([manager, member], viewer), [member]);
    }
  });
}

test('normalization handles clearing, malformed values and direct-column precedence', () => {
  for (const value of [null, undefined, false, 12, [], {}, { email: 15 }, 'None', 'null', 'undefined']) {
    assert.equal(hierarchy.normalizeReportingValue(value), '');
  }
  assert.equal(hierarchy.getReportingEmail(manager, [manager]), manager.email);
  assert.equal(hierarchy.getReportingEmail(manager.emp_name, [manager]), manager.email);
  assert.equal(hierarchy.getReportingEmail(null), '');
  assert.equal(hierarchy.getReportingFields({ primary_reporting_person: ' New Manager ',
    module_access: { primary_reporting_person: 'Old Manager' } }).primary_reporting_person, 'New Manager');
});

test('exact matching excludes partial names, unrelated users, inactive users, self and other tenants', () => {
  const employees = [manager,
    { ...agent, primary_reporting_person: 'manager' },
    { ...agent, user_id: 'unrelated', primary_reporting_person: 'someone@example.com' },
    { ...agent, user_id: 'inactive', primary_reporting_person: manager.email, module_access: { emp_status: 'InActive' } },
    { ...agent, user_id: 'customer', role: 'customer', primary_reporting_person: manager.email },
    { ...agent, user_id: 'foreign', tenant_id: 'tenant-b', primary_reporting_person: manager.email }
  ];
  assert.deepEqual(hierarchy.getReportingTeam(employees, viewer), []);
  assert.deepEqual(hierarchy.getReportingTeam([{ ...manager, primary_reporting_person: manager.email }], viewer), []);
  assert.deepEqual(hierarchy.getReportingTeam(employees, {}), []);
});

test('duplicate names cannot grant access to the wrong manager; exact email still works', () => {
  const otherManager = { ...manager, user_id: 'other-manager', email: 'other@example.com' };
  const member = { ...agent, primary_reporting_person: manager.emp_name };
  assert.deepEqual(hierarchy.getReportingTeam([manager, otherManager, member], viewer), []);
  member.primary_reporting_person = manager.email;
  assert.deepEqual(hierarchy.getReportingTeam([manager, otherManager, member], viewer), [member]);
});

test('official-email aliases of one employee preserve legacy name matching', () => {
  const alias = { ...manager, email: 'official@example.com' };
  const member = { ...agent, hod_person: manager.emp_name };
  assert.deepEqual(hierarchy.getReportingTeam([manager, alias, member], viewer), [member]);
});

test('legacy Name - Employee Code HOD mappings resolve in both user and employee stores', () => {
  for (const codeField of ['emp_id', 'emp_code']) {
    const legacyManager = { ...manager, [codeField]: '80024' };
    const member = { ...agent, module_access: { hod_person: 'Team Manager - 80024' } };
    assert.equal(hierarchy.getReportingEmail(member.module_access.hod_person, [legacyManager]), manager.email);
    assert.deepEqual(hierarchy.getReportingTeam([legacyManager, member], viewer), [member]);
    member.module_access.hod_person = 'Team Manager - 80025';
    assert.deepEqual(hierarchy.getReportingTeam([legacyManager, member], viewer), []);
  }
});

test('legacy label with an old spelling resolves only through a unique exact employee code', () => {
  const legacyManager = { ...manager, emp_id: '80024' };
  const member = { ...agent, hod_person: 'Old Manager Name - 80024' };
  assert.deepEqual(hierarchy.getReportingTeam([legacyManager, member], viewer), [member]);
  const duplicateCode = { ...legacyManager, user_id: 'other-manager', email: 'other@example.com', emp_name: 'Other Manager' };
  assert.deepEqual(hierarchy.getReportingTeam([legacyManager, duplicateCode, member], viewer), []);
});

test('HOD team contains only direct HOD mappings, not primary or secondary reports', () => {
  const hodReport = { ...agent, hod_person: manager.email };
  const primaryReport = { ...agent, user_id: 'primary-id', email: 'primary@example.com', primary_reporting_person: manager.email };
  const secondaryReport = { ...agent, user_id: 'secondary-id', email: 'secondary@example.com', secondary_reporting_person: manager.email };
  assert.deepEqual(hierarchy.getHodTeam([manager, hodReport, primaryReport, secondaryReport], viewer), [hodReport]);
});

test('Org Hierarchy starts with collapsed HOD teams and manager chains', async () => {
  const OrgHierarchyTab = (await loadModule('src/components/UserManagement/tabs/OrgHierarchyTab.jsx', {
    react: React,
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '../utils/userManagementUtils': { isMasterAdmin: () => false },
    '@/utils/reportingHierarchy': hierarchy
  })).default;
  const html = renderToStaticMarkup(React.createElement(OrgHierarchyTab, {
    users: [manager, { ...agent, primary_reporting_person: manager.emp_name, hod_person: manager.email }]
  }));
  assert.match(html, /HOD Teams \(1\)/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /1 Reports/);
  assert.match(html, /Reporting Chains by Manager \(1\)/);
  assert.doesNotMatch(html, /Agent|Edit Mapping/);
});

test('HOD daily and monthly reports return only authenticated mapped employees', async () => {
  const hod = { ...manager, role: 'hod', is_approved: true, company: 'Acme' };
  const mapped = { ...agent, is_approved: true, company: 'Acme', hod_person: hod.email };
  const other = { ...agent, user_id: 'other-id', email: 'other@example.com', is_approved: true, company: 'Acme', primary_reporting_person: hod.email };
  const users = [hod, mapped, other];
  let signedIn = true;
  const db = { from(table) {
    const query = {
      select() { return this; },
      eq() { return this; },
      gte() { return this; },
      lte() { return this; },
      maybeSingle() { return Promise.resolve({ data: hod, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: table === 'user_roles' ? users : [], error: null }).then(resolve, reject); }
    };
    return query;
  } };
  const actions = await loadModule('src/app/actions/attendance.js', {
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: hod.user_id, email: hod.email } : null }, error: null }) } }) },
    '@/utils/reportingHierarchy': hierarchy,
    '@/utils/attendanceUtils': { getTodayDateString: () => '2026-10-17', formatMinutesToHours: () => '0h 0m' },
    './audit': { logAuditAction() {} },
    'fs/promises': { readFile: async () => { throw new Error('No fallback file'); } },
    path: require('node:path'),
    crypto: require('node:crypto')
  });
  const access = await actions.getHodTeamReportAccess();
  assert.equal(access.success, true);
  assert.equal(access.hasTeam, true);
  const daily = await actions.getHodTeamAttendanceMaster({ date: '2026-10-17', company: 'Acme' });
  assert.equal(daily.success, true);
  assert.deepEqual(Array.from(daily.records, record => record.email), [mapped.email]);
  assert.equal(daily.summary.totalEmployees, 1);
  assert.equal(daily.summary.totalAbsent, 1);
  const monthly = await actions.getHodTeamMonthlyMatrix({ year: 2027, month: 1, company: 'Acme' });
  assert.equal(monthly.success, true);
  assert.deepEqual(Array.from(monthly.rows, row => row.email), [mapped.email]);
  assert.equal(monthly.summary.totalEmployees, 1);
  signedIn = false;
  assert.equal((await actions.getHodTeamAttendanceMaster({ date: '2026-10-17' })).success, false);
});

test('lead scope adds direct reporting-team IDs and names while retaining own/open leads', () => {
  const member = { ...agent, primary_reporting_person: manager.email };
  const team = hierarchy.getReportingTeam([manager, member], viewer);
  const assignees = new Set(hierarchy.getLeadAssignees(team, viewer));
  for (const assigned_to of [manager.user_id, manager.emp_name, agent.user_id, agent.emp_name, null, undefined]) {
    assert.equal(hierarchy.isLeadInAssignmentScope({ assigned_to }, assignees), true);
  }
  assert.equal(hierarchy.isLeadInAssignmentScope({ assigned_to: 'unrelated' }, assignees), false);
  const removedScope = new Set(hierarchy.getLeadAssignees([], viewer));
  assert.equal(hierarchy.isLeadInAssignmentScope({ assigned_to: agent.user_id }, removedScope), false);
  assert.equal(hierarchy.isLeadInAssignmentScope({ assigned_to: manager.user_id }, removedScope), true);
});

test('team membership never overrides module/stage write restrictions or admin permissions', () => {
  const access = { leads: { view: true, edit: false, sub_items: { stage: { view: true, edit: false } } } };
  assert.equal(getModulePermissions(access, 'agent', 'leads').edit, false);
  assert.equal(getSubItemPermissions(access, 'agent', 'leads', 'stage').edit, false);
  assert.equal(getSubItemPermissions(access, 'agent', 'leads', 'unassigned-stage').view, false);
  assert.equal(getModulePermissions({}, 'admin', 'leads').edit, true);
  assert.equal(getModulePermissions({ leads: { view: false } }, 'agent', 'leads').view, false);
});

const icons = new Proxy({}, { get: () => () => null });
const Selector = (await loadModule('src/components/common/SearchableEmployeeSelect.jsx', {
  react: React, 'lucide-react': icons
})).default;

test('real employee selector renders object, legacy name, cleared and ALL values without a crash', () => {
  for (const selectedEmail of [manager, manager.email, manager.emp_name]) {
    const html = renderToStaticMarkup(React.createElement(Selector, { employees: [manager], selectedEmail }));
    assert.match(html, /Team Manager/);
  }
  for (const selectedEmail of [null, {}, 45]) {
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(Selector, { employees: [manager], selectedEmail })));
  }
  assert.match(renderToStaticMarkup(React.createElement(Selector, {
    employees: [manager], selectedEmail: { email: 'ALL' }, allowAllStaff: true
  })), /All Staff/);
});

test('selector multi-select remains compatible with object and email-array inputs', () => {
  const html = renderToStaticMarkup(React.createElement(Selector, {
    employees: [manager], isMulti: true, selectedEmails: [manager]
  }));
  assert.match(html, /1 Assigned/);
  assert.match(html, /Team Manager/);
});

function hookRuntime() {
  let cursor = 0;
  const slots = [];
  const pendingEffects = [];
  return {
    begin() { cursor = 0; },
    flush() { pendingEffects.splice(0).forEach(effect => effect()); },
    react: { ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useEffect(effect, dependencies) {
        const index = cursor++;
        if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) pendingEffects.push(effect);
        slots[index] = dependencies;
      }
    }
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

test('real User Management modal stores strings for all three selections, clears, saves and reopens', async () => {
  const hooks = hookRuntime();
  function EmployeeSelector() { return null; }
  const Modal = (await loadModule('src/components/UserManagement/modals/AddEditUserModal.jsx', {
    react: hooks.react, 'lucide-react': icons,
    '@/components/common/SearchableEmployeeSelect': { default: EmployeeSelector, __esModule: true },
    '../utils/userManagementUtils': { DEFAULT_DEPARTMENTS: ['Sales'], DESIGNATIONS: [], WORK_LOCATION_TYPES: [], EMP_STATUS_OPTIONS: ['Active'] }
  })).default;
  const saved = [];
  const props = { isOpen: true, user: { ...agent, module_access: { primary_reporting_person: manager } },
    allEmployees: [manager, agent], onSave: payload => saved.push(payload), departments: ['Sales'] };
  const render = () => { hooks.begin(); return Modal(props); };
  render(); hooks.flush();
  let tree = render();
  nodes(tree).find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('3. Reporting & HOD')).props.onClick();
  tree = render();
  const selects = nodes(tree).filter(node => node.type === EmployeeSelector);
  assert.equal(selects.length, 3);
  assert.equal(selects[0].props.selectedEmail, manager.email);
  selects.forEach(select => select.props.onSelect(manager));
  tree = render();
  nodes(tree).filter(node => node.type === EmployeeSelector).forEach(select => {
    assert.equal(select.props.selectedEmail, manager.email);
  });
  nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  for (const value of Object.values(hierarchy.getReportingFields(saved[0]))) assert.equal(value, manager.email);
  nodes(tree).find(node => node.type === EmployeeSelector).props.onSelect(null);
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === EmployeeSelector).props.selectedEmail, '');
  props.user = { ...agent, ...saved[0] };
  render(); hooks.flush();
  tree = render();
  nodes(tree).find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('3. Reporting & HOD')).props.onClick();
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === EmployeeSelector).props.selectedEmail, manager.email);
});

test('real employee loader exposes reporting stored only in module_access', async () => {
  const member = { ...agent, module_access: { primary_reporting_person: manager.email, hod_person: manager.emp_name } };
  const client = { from(table) {
    const result = { data: table === 'user_roles' ? [manager, member] : [], error: null };
    return { select() { return this; }, eq() { return this; }, order() { return Promise.resolve(result); } };
  } };
  const actions = await loadModule('src/app/actions/employee.js', { '@supabase/supabase-js': { createClient: () => client } });
  const employees = await actions.getEmployeesMaster();
  const loaded = employees.find(employee => employee.email === agent.email);
  assert.equal(loaded.primary_reporting_person, manager.email);
  assert.equal(loaded.hod_person, manager.emp_name);
  assert.equal(hierarchy.getReportingTeam(employees, viewer).length, 1);
});

test('real server save stores email strings through missing-column fallback and preserves permissions', async () => {
  const updates = [];
  const existingAccess = { leads: { view: true, edit: false }, attendance: { view: true }, unrelatedFlag: true };
  const client = { from() {
    let payload;
    return {
      select() { return this; },
      update(value) { payload = { ...value }; return this; },
      eq() {
        if (!payload) return this;
        updates.push(payload);
        return Promise.resolve({ error: updates.length === 1 ? { message: 'Reporting columns do not exist' } : null });
      },
      single() { return Promise.resolve({ data: { module_access: existingAccess }, error: null }); }
    };
  } };
  const actions = await loadModule('src/app/actions/team.js', {
    '@supabase/supabase-js': { createClient: () => client },
    '@/utils/supabase/server': { createClient: () => client },
    './adminMessageConfig': { sendAdminAccountEmailOtp() {} }, './audit': { logAuditAction() {} },
    '@/lib/impersonateStore': { saveImpersonateToken() {} }
  });
  const result = await actions.updateEmployeeDetailsAdmin(agent.user_id, {
    emp_name: agent.emp_name, primary_reporting_person: manager, secondary_reporting_person: manager, hod_person: manager
  });
  assert.equal(result.success, true);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].primary_reporting_person, manager.email);
  for (const field of ['primary_reporting_person', 'secondary_reporting_person', 'hod_person']) {
    assert.equal(updates[1].module_access[field], manager.email);
  }
  assert.equal(updates[1].module_access.leads, existingAccess.leads);
  assert.equal(updates[1].module_access.attendance, existingAccess.attendance);
  assert.equal(updates[1].module_access.unrelatedFlag, true);
});

const crmSource = fs.readFileSync(new URL('../src/components/CRMContainer.jsx', import.meta.url), 'utf8');
const crmAst = require('@babel/parser').parse(crmSource, { sourceType: 'module', plugins: ['jsx'] });
const crmBody = crmAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body;
const visibilityEffect = crmBody.find(node => node.type === 'ExpressionStatement' &&
  crmSource.slice(node.start, node.end).includes('let preFilteredLeads = rawLeads')).expression.arguments[0];

test('real CRM visibility filter keeps own/open/team leads and enforces stage, company and manager scope', () => {
  const rows = [
    { id: 'own', assigned_to: manager.user_id, our_company: 'Company A', status: 'allowed' },
    { id: 'open', assigned_to: null, our_company: 'Company A', status: 'allowed' },
    { id: 'team', assigned_to: agent.user_id, our_company: 'Company A', status: 'allowed' },
    { id: 'team-other-company', assigned_to: agent.user_id, our_company: 'Company B', status: 'allowed' },
    { id: 'team-denied-stage', assigned_to: agent.user_id, our_company: 'Company A', status: 'denied' },
    { id: 'unrelated', assigned_to: 'unrelated-id', our_company: 'Company A', status: 'allowed' },
    { id: 'other-company', assigned_to: null, our_company: 'Company B', status: 'allowed' }
  ];
  let visible;
  const context = {
    rawLeads: rows, loadingLeads: false, isLocalLeadsUpdateRef: { current: false },
    userRole: 'agent', userCompany: 'Company A', userId: manager.user_id, userName: manager.emp_name,
    moduleAccess: { leads: { view: true, assigned_steps: ['allowed'] } }, globalRolePermissions: {},
    adminCompanyFilter: 'All', leadAssigneeScope: new Set(hierarchy.getLeadAssignees([agent], viewer)),
    getStageFromStatus: status => status, isLeadInAssignmentScope: hierarchy.isLeadInAssignmentScope,
    getLeadStageKey: hierarchy.getLeadStageKey,
    updateLeadsIfChanged: rows => { visible = Array.from(rows, row => row.id); }
  };
  const filter = vm.runInNewContext(`(${crmSource.slice(visibilityEffect.start, visibilityEffect.end)})`, context);
  filter();
  assert.deepEqual(visible, ['own', 'open', 'team', 'team-other-company']);
  context.leadAssigneeScope = new Set(hierarchy.getLeadAssignees([], viewer));
  filter();
  assert.deepEqual(visible, ['own', 'open']);
  context.moduleAccess.leads.is_manager = true;
  filter();
  assert.deepEqual(visible, ['own', 'open', 'team', 'team-denied-stage', 'unrelated']);
  context.userRole = 'Admin';
  filter();
  assert.equal(visible.length, rows.length);
});

test('real CRM download query includes team assignments and retrieves explicit cross-company assignments', async () => {
  let loadNode;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'loadLeads') loadNode = node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(crmAst);
  const rows = [
    { id: 1, assigned_to: manager.user_id, our_company: 'Company A' },
    { id: 2, assigned_to: agent.user_id, our_company: 'Company A' },
    { id: 3, assigned_to: agent.user_id, our_company: 'Company B' },
    { id: 4, assigned_to: 'unrelated-id', our_company: 'Company A' }
  ].map(row => ({ ...row, created_at: '2026-10-12T10:00:00+05:30' }));
  const queries = [];
  const errors = [];
  const cache = new Map();
  const context = {
    effectActive: true, userId: manager.user_id, userName: manager.emp_name, userCompany: 'Company A', userRole: 'agent',
    moduleAccess: { leads: { view: true } }, globalRolePermissions: {},
    leadAssigneeScopeKey: JSON.stringify(hierarchy.getLeadAssignees([agent], viewer)),
    removedDuringSync: new Set(), changedDuringSync: new Set(), rawLeadsRef: { current: [] },
    leadSyncInFlightRef: { current: false }, pendingLeadSyncRef: { current: null }, loadLeadsRef: { current: null },
    recentLocalUpdatesRef: { current: new Map() },
    localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) },
    getLocalLeads: async () => [], matchesLeadCacheContext: () => false, isCompleteLeadCache: () => false,
    mergeLeadCacheForDisplay: (rows, current) => [...new Map([...rows, ...current].map(row => [row.id, row])).values()],
    setRawLeads: rows => { context.rawLeadsRef.current = rows; },
    setLeadCacheScope() {}, setIsSyncing() {}, setSyncLoadedCount() {}, setSyncTotalCount() {}, setLoadingLeads() {},
    markLeadStartupTiming() {}, refreshStagePreview() {}, saveFastLeadsSnapshot() {},
    saveLocalLeadsPreview: async () => true, saveLeadsLocally: async () => true, upsertLeadsLocally: async () => true,
    sortLeadsByDateDesc: (a, b) => b.id - a.id, console: { warn: (...args) => errors.push(args) },
    queueMicrotask, setTimeout, clearTimeout,
    createClient: () => ({ from(table) {
      let filtered = table === 'leads' ? rows : [];
      let countOnly = false;
      let from = 0, to = 999;
      const query = {
        select(_fields, options) { countOnly = Boolean(options?.head); return query; },
        eq(field, value) { filtered = filtered.filter(row => row[field] === value); return query; },
        in(field, values) { queries.push({ field, values: Array.from(values) }); filtered = filtered.filter(row => values.includes(row[field])); return query; },
        or(value) {
          queries.push({ or: value });
          const assignments = [...value.matchAll(/assigned_to\.eq\."([^"]+)"/g)].map(match => match[1]);
          filtered = filtered.filter(row => row.assigned_to == null || assignments.includes(row.assigned_to));
          return query;
        },
        order() { return query; },
        range(start, end) { from = start; to = end; return query; },
        then(resolve, reject) { return Promise.resolve({ data: filtered.slice(from, to + 1), count: countOnly ? filtered.length : null, error: null }).then(resolve, reject); }
      };
      return query;
    } })
  };
  const load = vm.runInNewContext(`(${crmSource.slice(loadNode.start, loadNode.end)})`, context);
  await load();
  assert.deepEqual(errors, []);
  assert.deepEqual(context.rawLeadsRef.current.map(row => row.id).sort(), [1, 2, 3]);
  assert.ok(queries.some(query => query.or?.includes('agent-id')));
  assert.ok(queries.some(query => query.field === 'assigned_to' && query.values.includes(agent.user_id)));
});

function stageScenario() {
  const primary = { ...manager, role: 'agent', can_write: true, module_access: {
    leads: { view: true, edit: true, write: true, assigned_steps: ['S04', 'S05', 'S06', 'S07', 'S08'] }
  } };
  const worker = { ...agent, role: 'agent', module_access: {
    primary_reporting_person: manager.email,
    leads: { view: true, edit: true, assigned_steps: ['S01', 'S02', 'S03'] }
  } };
  return { primary, worker, employees: [primary, worker], lead: {
    id: 'lead-id', assigned_to: worker.user_id, status: '3; Qualification', tenant_id: 'tenant-a', lead_notes: []
  } };
}

test('S01-S03 agent hands off to S04-S08 primary, preserving ownership until claim', () => {
  const { primary, worker, employees, lead } = stageScenario();
  const handoff = hierarchy.getPrimaryLeadHandoff(lead, '4; Follow Up', employees);
  assert.equal(handoff, primary);
  const moved = { ...lead, status: '4; Follow Up' };
  assert.equal(hierarchy.getLeadStageAccess(worker, moved.status).view, false);
  assert.equal(hierarchy.getLeadStageAccess(primary, moved.status).view, true);
  const primaryAssignees = new Set(hierarchy.getLeadAssignees(hierarchy.getReportingTeam(employees, primary,
    { fields: ['primary_reporting_person'] })));
  assert.equal(hierarchy.canClaimPrimaryTeamLead(moved, primary, primaryAssignees), true);
  assert.equal(hierarchy.canClaimPrimaryTeamLead({ ...moved, assigned_to: primary.user_id }, primary, primaryAssignees), false);
  for (const status of ['S05', '06 - Conversion Stage', '7; Converted', '08 - Transfer to Party']) {
    assert.equal(hierarchy.getLeadStageAccess(primary, status).view, true);
  }
});

test('primary claim excludes early stages, read-only users, secondary/HOD-only relations and unrelated leads', () => {
  const { primary, worker, employees, lead } = stageScenario();
  const assignees = new Set([worker.user_id]);
  assert.equal(hierarchy.canClaimPrimaryTeamLead(lead, primary, assignees), false);
  const moved = { ...lead, status: 'S04' };
  assert.equal(hierarchy.canClaimPrimaryTeamLead(moved, { ...primary, can_write: false }, assignees), false);
  assert.equal(hierarchy.canClaimPrimaryTeamLead({ ...moved, is_offline_pending: true }, primary, assignees), false);
  assert.equal(hierarchy.canClaimPrimaryTeamLead({ ...moved, assigned_to: 'unrelated' }, primary, assignees), false);
  worker.module_access = { ...worker.module_access, primary_reporting_person: '',
    secondary_reporting_person: primary.email, hod_person: primary.email };
  assert.equal(hierarchy.getReportingTeam(employees, primary).length, 1);
  assert.equal(hierarchy.getReportingTeam(employees, primary, { fields: ['primary_reporting_person'] }).length, 0);
  assert.equal(hierarchy.getPrimaryLeadHandoff(lead, 'S04', employees), null);
});

test('lead stage permissions support labels, explicit restrictions and S08 without treating dashboard as S01', () => {
  const { primary } = stageScenario();
  primary.module_access.leads.assigned_steps = ['04 - Follow Up Stage'];
  assert.equal(hierarchy.getLeadStageAccess(primary, '4; Follow Up').edit, true);
  primary.module_access.leads.sub_items = { '04 - Follow Up Stage': { view: true, edit: false } };
  assert.equal(hierarchy.getLeadStageAccess(primary, 'S04').edit, false);
  primary.module_access.leads.sub_items['04 - Follow Up Stage'].view = false;
  assert.equal(hierarchy.getLeadStageAccess(primary, 'S04').view, false);
  primary.module_access.leads.assigned_steps = ['lead_dashboard', 'hourly_work'];
  assert.equal(hierarchy.getLeadStageAccess(primary, 'New').view, false);
  assert.equal(hierarchy.getLeadStageKey('S08'), '08 - Transfer to Party');
});

async function claimHarness({ changeBeforeWrite, authId = manager.user_id, configure = () => {}, noteError = false } = {}) {
  const scenario = stageScenario();
  const live = { ...scenario.lead, status: '4; Follow Up' };
  configure(scenario, live);
  const writes = [], notes = [];
  const admin = { from(table) {
    const filters = [];
    let payload, inserted;
    const query = {
      select() { return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      is(field, value) { filters.push([field, value]); return query; },
      update(value) { payload = value; return query; },
      insert(value) { inserted = value; return query; },
      maybeSingle() { return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); }
    };
    const run = () => {
      if (table === 'user_roles') return { data: scenario.employees, error: null };
      if (table === 'lead_notes') {
        if (noteError) return { data: null, error: { message: 'Notes unavailable' } };
        notes.push(...inserted);
        return { data: { id: 'note-id', ...inserted[0] }, error: null };
      }
      if (!payload) return { data: { ...live }, error: null };
      changeBeforeWrite?.(live);
      writes.push({ payload: { ...payload }, filters });
      if (!filters.every(([field, value]) => live[field] === value)) return { data: null, error: null };
      Object.assign(live, payload);
      return { data: { ...live }, error: null };
    };
    return query;
  } };
  const actions = await loadModule('src/app/actions/reportingLeadClaims.js', {
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({
      data: { user: authId ? { id: authId, email: manager.email } : null }, error: null
    }) } }) },
    '@/utils/supabase/adminClient': { getAdminClient: () => admin }, './audit': { logAuditAction: async () => {} }
  });
  return { action: actions.claimPrimaryReportingLead, ...scenario, live, writes, notes };
}

test('real claim action verifies primary/stage permission, transfers ownership and writes an IST note', async () => {
  const harness = await claimHarness();
  const result = await harness.action(harness.lead.id, harness.worker.user_id);
  assert.equal(result.success, true);
  assert.equal(result.lead.assigned_to, harness.primary.user_id);
  assert.equal(harness.writes.length, 1);
  assert.ok(harness.writes[0].filters.some(([field, value]) => field === 'assigned_to' && value === harness.worker.user_id));
  assert.ok(harness.writes[0].filters.some(([field, value]) => field === 'status' && value === '4; Follow Up'));
  assert.match(harness.notes[0].created_at, /\+05:30$/);
});

test('real claim action denies unauthenticated, unrelated, inactive and read-only callers without writes', async () => {
  const cases = [
    { authId: null }, { authId: 'unrelated-user' },
    { configure: scenario => { scenario.primary.can_write = false; } },
    { configure: scenario => { scenario.primary.module_access.emp_status = 'InActive'; } },
    { configure: scenario => { scenario.primary.is_approved = false; } },
    { configure: scenario => { scenario.worker.module_access.primary_reporting_person = 'someone@example.com'; } },
    { configure: (_scenario, lead) => { lead.status = '3; Qualification'; } }
  ];
  for (const options of cases) {
    const harness = await claimHarness(options);
    const result = await harness.action(harness.lead.id, harness.worker.user_id);
    assert.equal(result.success, false);
    assert.equal(harness.writes.length, 0);
  }
});

test('real claim action never overwrites concurrent assignment or stage changes', async () => {
  for (const change of [lead => { lead.assigned_to = 'another-owner'; }, lead => { lead.status = '5; Sales Process'; }]) {
    const harness = await claimHarness({ changeBeforeWrite: change });
    const result = await harness.action(harness.lead.id, harness.worker.user_id);
    assert.equal(result.success, false);
    assert.equal(result.conflict, true);
    assert.equal(harness.notes.length, 0);
  }
});

test('claim succeeds once, and a note failure cannot undo a successful assignment', async () => {
  const harness = await claimHarness({ noteError: true });
  const first = await harness.action(harness.lead.id, harness.worker.user_id);
  assert.equal(first.success, true);
  const second = await harness.action(harness.lead.id, harness.worker.user_id);
  assert.equal(second.success, false);
  assert.equal(second.conflict, true);
  assert.equal(harness.writes.length, 1);
});

test('ambiguous legacy assignee names never permit claiming an unrelated employee lead', async () => {
  const harness = await claimHarness({ configure: (scenario, lead) => {
    scenario.employees.push({ ...scenario.worker, user_id: 'different-agent', email: 'different@example.com',
      module_access: { primary_reporting_person: 'someone@example.com' } });
    lead.assigned_to = scenario.worker.emp_name;
  } });
  const claims = hierarchy.getPrimaryClaimAssignees(harness.employees, harness.primary);
  assert.equal(claims.has(harness.worker.user_id), true);
  assert.equal(claims.has(harness.worker.emp_name), false);
  const result = await harness.action(harness.lead.id, harness.worker.emp_name);
  assert.equal(result.success, false);
  assert.equal(harness.writes.length, 0);
});

const tableSource = fs.readFileSync(new URL('../src/components/LeadTable.jsx', import.meta.url), 'utf8');
const tableAst = require('@babel/parser').parse(tableSource, { sourceType: 'module', plugins: ['jsx'] });
const declaration = (body, name) => body.flatMap(node => node.declarations || []).find(node => node.id.name === name);
const statusCell = declaration(tableAst.program.body, 'LeadStatusCell').init.arguments[0];
const desktopStatus = declaration(statusCell.body.body, 'updateStatus').init;
const tableBody = tableAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body;
const mobileStatus = declaration(tableBody, 'handleDirectStatusChange').init;

for (const [label, statusNode] of [['desktop', desktopStatus], ['mobile', mobileStatus]]) {
  for (const online of [true, false]) {
    test(`real ${label} S03 to S04 handoff preserves team ownership ${online ? 'online' : 'offline'}`, async () => {
      const { worker, primary, employees, lead } = stageScenario();
      let published;
      const mutations = [], queue = [];
      const updateLeadInState = updated => { published = updated; };
      const context = {
        lead, status: lead.status, teamMembers: employees, userRole: worker.role, userName: worker.emp_name,
        moduleAccess: worker.module_access, navigator: { onLine: online },
        info: { table: { options: { meta: { userRole: worker.role, userName: worker.emp_name,
          userId: worker.user_id, moduleAccess: worker.module_access, updateLeadInState } } } },
        getLeadStageAccess: hierarchy.getLeadStageAccess, getPrimaryLeadHandoff: hierarchy.getPrimaryLeadHandoff,
        createClient: () => ({ from(table) { return {
          update(payload) { mutations.push(payload); return this; },
          eq() { return Promise.resolve({ error: null }); },
          insert() { return this; }, select() { return this; },
          single() { return Promise.resolve({ data: null, error: null }); }
        }; } }),
        processLeads: rows => rows, updateLeadInState, canPerformOfflineAction: () => ({ allowed: true }),
        enqueueOfflineAction: async (_action, _table, payload) => { queue.push(payload); },
        showSyncToast() {}, logAuditAction: async () => {},
        triggerWhatsappAutomationForStage: async () => ({ success: true }), console
      };
      const change = vm.runInNewContext(`(${tableSource.slice(statusNode.start, statusNode.end)})`, context);
      if (label === 'desktop') await change('4; Follow Up');
      else await change(lead, '4; Follow Up');
      const payload = online ? mutations[0] : queue[0];
      assert.ok(payload);
      assert.equal(Object.hasOwn(payload, 'assigned_to'), false);
      assert.equal(published.assigned_to, worker.user_id);
      assert.equal(published.status, '4; Follow Up');
      assert.match(published.latest_remark, /Handed off to Primary Reporting Person/);
      assert.equal(hierarchy.getPrimaryLeadHandoff(published, published.status, employees), primary);
      // Unmapped employees still use the original open-pool handoff.
      worker.module_access.primary_reporting_person = '';
      if (label === 'desktop') await change('4; Follow Up');
      else await change(lead, '4; Follow Up');
      assert.equal(published.assigned_to, null);
    });
  }
}

test('real local CRM update removes S04 from S01-S03 agent immediately while retaining the cached team link', () => {
  const scenario = stageScenario();
  const old = { ...scenario.lead, our_company: 'Company A' };
  const updated = { ...old, status: '4; Follow Up' };
  const handler = declaration(crmBody, 'handleLeadsChange').init.arguments[0];
  const state = { raw: [old], visible: [old] };
  const context = {
    recentLocalUpdatesRef: { current: new Map() }, isLocalLeadsUpdateRef: { current: false }, prevLeadsSigRef: { current: '' },
    setRawLeads: updater => { state.raw = updater(state.raw); }, setLeads: updater => { state.visible = updater(state.visible); },
    upsertLeadsLocally() {}, userRole: 'agent', userCompany: 'Company A', adminCompanyFilter: 'All',
    moduleAccess: scenario.worker.module_access, globalRolePermissions: {},
    leadAssigneeScope: new Set(hierarchy.getLeadAssignees([], scenario.worker)),
    getLeadStageAccess: hierarchy.getLeadStageAccess, isLeadInAssignmentScope: hierarchy.isLeadInAssignmentScope
  };
  const update = vm.runInNewContext(`(${crmSource.slice(handler.start, handler.end)})`, context);
  update(updated);
  assert.equal(state.visible.length, 0);
  assert.equal(state.raw[0].assigned_to, scenario.worker.user_id);
  assert.equal(state.raw[0].status, '4; Follow Up');
});

test('real primary CRM visibility shows handed-off S04 lead with S04-S08 permissions', () => {
  const { primary, worker, lead } = stageScenario();
  let visible;
  const context = {
    rawLeads: [{ ...lead, status: '4; Follow Up', our_company: 'Company A' }], loadingLeads: false,
    isLocalLeadsUpdateRef: { current: false }, userRole: primary.role, userCompany: 'Company A',
    userId: primary.user_id, userName: primary.emp_name, moduleAccess: primary.module_access,
    globalRolePermissions: {}, adminCompanyFilter: 'All',
    leadAssigneeScope: new Set(hierarchy.getLeadAssignees([worker], primary)),
    getStageFromStatus: hierarchy.getLeadStageKey, getLeadStageKey: hierarchy.getLeadStageKey,
    isLeadInAssignmentScope: hierarchy.isLeadInAssignmentScope,
    updateLeadsIfChanged: rows => { visible = rows; }
  };
  vm.runInNewContext(`(${crmSource.slice(visibilityEffect.start, visibilityEffect.end)})()`, context);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, lead.id);
});

test('real assignee cell exposes Primary Claim Lead and transfers assignment after server confirmation', async () => {
  const { primary, worker, lead } = stageScenario();
  lead.status = '4; Follow Up';
  let published;
  const calls = [], pending = [];
  const runtime = hookRuntime();
  const cellNode = declaration(tableAst.program.body, 'LeadAssigneeCell').init.arguments[0];
  const cellCode = await swc.transform(`(${tableSource.slice(cellNode.start, cellNode.end)})`, {
    filename: 'assignee-cell.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'classic' } } }
  });
  const cell = vm.runInNewContext(cellCode.code, {
    React: { ...React, startTransition: task => { pending.push(Promise.resolve(task())); } },
    useState: runtime.react.useState, canClaimPrimaryTeamLead: hierarchy.canClaimPrimaryTeamLead,
    navigator: { onLine: true }, processLeads: rows => rows, showSyncToast() {},
    claimPrimaryReportingLead: async (id, owner) => { calls.push([id, owner]); return {
      success: true, lead: { ...lead, assigned_to: primary.user_id }, note: null
    }; }
  });
  const info = { getValue: () => lead.assigned_to, row: { original: lead }, table: { options: { meta: {
    teamMembers: [primary, worker], userRole: primary.role, userName: primary.emp_name, userId: primary.user_id,
    moduleAccess: primary.module_access, canWrite: true, primaryLeadAssignees: new Set([worker.user_id]),
    updateLeadInState: updated => { published = updated; }
  } } } };
  runtime.begin();
  const tree = cell({ info });
  const claim = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Claim Lead');
  assert.ok(claim);
  claim.props.onClick();
  await Promise.all(pending);
  assert.deepEqual(calls, [[lead.id, worker.user_id]]);
  assert.equal(published.assigned_to, primary.user_id);
  info.table.options.meta.canWrite = false;
  runtime.begin();
  assert.equal(nodes(cell({ info })).some(node => node.type === 'button'), false);
});
