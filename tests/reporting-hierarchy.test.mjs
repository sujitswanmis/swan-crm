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
    }, console, process, setTimeout, clearTimeout
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
  for (const value of [null, undefined, false, 12, [], {}, { email: 15 }]) {
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
