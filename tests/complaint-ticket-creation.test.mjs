import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { normalizeReportingValue, resolveEmployeeReference } from '../src/utils/reportingHierarchy.js';
import * as complaintFilters from '../src/utils/complaintFilters.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const read = filename => fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
const migration = read('../migrations/20261030_complaint_ticket_fields.sql');
const addedColumns = [...migration.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map(match => match[1]);
const legacyTable = read('../migrations/36_order_followup_frequency_lifecycle_and_complaints.sql')
  .match(/CREATE TABLE IF NOT EXISTS party_complaints \(([\s\S]*?)\n\);/)[1];
const legacyColumns = [...legacyTable.matchAll(/^  (\w+) (?:uuid|text|integer|boolean|timestamp)/gm)].map(match => match[1]);
const tenant = '00000000-0000-0000-0000-000000000002';
const parties = [
  { id: '11111111-1111-4111-8111-111111111111', firm_name: 'Testing purpose', party_universal_code: 'PTY-NSMLR-100010', district_name: 'Ludhiana', state_name: 'Punjab' },
  { id: '22222222-2222-4222-8222-222222222222', firm_name: 'Another Dealer', party_universal_code: 'PTY-NSMLR-100011' }
];
const noop = () => null;
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const content = node => Array.isArray(node) ? node.map(content).join('') : node?.props ? content(node.props.children) : String(node ?? '');
const find = (tree, predicate) => {
  const node = nodes(tree).find(predicate);
  assert.ok(node, 'Expected UI element was not rendered');
  return node;
};

function compile(filename, mocks, globals = {}) {
  const code = swc.transformSync(read(filename), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: filename.endsWith('.jsx') }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  }).code;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, console: { error() {}, warn() {} }, Date, Intl,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : noop, ...globals });
  return sandboxModule.exports;
}

function component(filename, mocks = {}, globals = {}, { runEffects = false } = {}) {
  const cells = [];
  const effects = [];
  let cursor = 0;
  let dirty = true;
  let lastProps;
  const same = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  const hooks = { ...React,
    useEffect(callback, deps) {
      if (!runEffects) return;
      const index = cursor++;
      if (!same(cells[index]?.deps, deps)) { cells[index] = { deps }; effects.push(callback); }
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!same(cells[index]?.deps, deps)) cells[index] = { deps, value: callback() };
      return cells[index].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => { const next = typeof value === 'function' ? value(cells[index]) : value; if (!Object.is(next, cells[index])) { cells[index] = next; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial }; }
  };
  const exports = compile(filename, { react: hooks, 'lucide-react': new Proxy({}, { get: () => noop }),
    '@/utils/complaintFilters': complaintFilters,
    '@/utils/tableColumnResize': { useTableColumnResize: (_key, widths) => ({ columnWidths: widths }), ColumnResizer: noop }, ...mocks }, globals);
  return { type: exports.default,
    render(props = lastProps) { cursor = 0; dirty = false; lastProps = props; return exports.default(props); },
    async flush(props = lastProps) {
      let tree;
      for (let step = 0; step < 12; step++) {
        tree = this.render(props);
        effects.splice(0).forEach(callback => callback());
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty && !effects.length) return tree;
      }
      throw new Error('Component effects did not settle');
    }
  };
}

test('complaint partner search shows the selected name/code, supports Change/clear, and submits the selected ID', async () => {
  const saved = [];
  const alerts = [];
  const picker = component('../src/components/common/SearchablePartySelect.jsx');
  const app = component('../src/components/Orders/ComplaintManagementModule.jsx', {
    '../common/SearchablePartySelect': picker.type,
    '@/app/actions/orderFulfillment': { createComplaintTicketDirect: async data => { saved.push({ ...data }); return { success: true }; }, getComplaintsTickets: async () => [] }
  }, { alert: message => alerts.push(message) });
  const props = { tenantId: 'TNT00002', parties };
  let tree = app.render(props);
  find(tree, node => node.type === 'button' && content(node).includes('+ Log Complaint Ticket')).props.onClick();
  const renderPicker = () => { tree = app.render(props); return picker.render(find(tree, node => node.type === picker.type).props); };
  let search = renderPicker();
  assert.equal(nodes(search).filter(node => node.type === 'label').length, 1);
  find(search, node => node.type === 'input').props.onChange({ target: { value: 'test' } });
  search = renderPicker();
  find(search, node => node.type === 'div' && node.props.onClick && content(node).includes('Testing purpose')).props.onClick();
  search = renderPicker();
  assert.match(content(search), /Partner Selected/);
  assert.match(content(search), /Testing purpose/);
  assert.match(content(search), /PTY-NSMLR-100010/);
  assert.equal(nodes(search).some(node => node.type === 'input'), false);
  assert.equal(content(search).includes(parties[0].id), false);

  find(search, node => node.type === 'button' && content(node).trim() === 'Change').props.onClick();
  search = renderPicker();
  find(search, node => node.type === 'div' && node.props.onClick && content(node).includes('Another Dealer')).props.onClick();
  search = renderPicker();
  assert.match(content(search), /Another Dealer/);
  find(search, node => node.props.title === 'Clear selection').props.onClick({ stopPropagation() {} });
  search = renderPicker();
  assert.doesNotMatch(content(search), /Partner Selected/);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 0);
  assert.match(alerts[0], /Please select a Channel Partner/);

  find(search, node => node.type === 'input').props.onFocus();
  search = renderPicker();
  find(search, node => node.type === 'div' && node.props.onClick && content(node).includes('Testing purpose')).props.onClick();
  renderPicker();
  find(tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Gearbox inspection required' } });
  tree = app.render(props);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].party_id, parties[0].id);
  assert.equal(saved[0].complaint_type, 'CHANNEL_PARTNER');
  assert.equal(saved[0].issue_description, 'Gearbox inspection required');
});

function actionHarness(columns) {
  let payload;
  const query = {
    insert(rows) { payload = rows[0]; return this; },
    select() { return this; },
    async single() {
      const missing = Object.keys(payload).find(key => !columns.has(key));
      return missing ? { error: { message: `Could not find the '${missing}' column of 'party_complaints' in the schema cache` } }
        : { data: { id: 'test-ticket', ...payload } };
    }
  };
  const actions = compile('../src/app/actions/orderFulfillment.js', {
    '@/utils/supabase/adminClient': { getAdminClient: () => ({ from: table => { assert.equal(table, 'party_complaints'); return query; } }) },
    '@/utils/orderFrequency': {}, './partyMaster': { resolveDbTenantUuid: async value => { assert.equal(value, 'TNT00002'); return tenant; } }
  });
  return { actions, payload: () => payload };
}

test('the additive schema fixes the reported error and covers every direct ticket payload field', async () => {
  const data = { party_id: parties[0].id, issue_description: 'Complaint test', category: 'MANUFACTURING_DEFECT' };
  const legacy = actionHarness(new Set(legacyColumns));
  assert.match((await legacy.actions.createComplaintTicketDirect(data, 'TNT00002')).error, /'complaint_type'.*schema cache/);
  const upgraded = actionHarness(new Set([...legacyColumns, ...addedColumns]));
  for (const category of ['MANUFACTURING_DEFECT', 'TRANSIT_DAMAGE', 'SHORTAGE_PRODUCT_SPAREPART', 'DELIVERY_DELAY', 'BILLING_ISSUES', 'ORDER_RELATED_ISSUES', 'SERVICE_ISSUES', 'WARRANTY_CLAIM']) {
    const result = await upgraded.actions.createComplaintTicketDirect({ ...data, category }, 'TNT00002');
    assert.equal(result.success, true, result.error);
    assert.equal(result.ticket.tenant_id, tenant);
    assert.equal(result.ticket.party_id, parties[0].id);
    assert.equal(result.ticket.stage_id, 'C01');
    assert.equal(result.ticket.stage_history[0].stage_id, 'C01');
    assert.ok(new Date(result.ticket.sla_deadline).getTime() > Date.now());
  }
  const result = await upgraded.actions.createComplaintTicketDirect({ ...data, complaint_type: 'END_CUSTOMER', customer_id: 'local-customer-id', customer_name: 'Example Customer', customer_phone: '9876543210' }, 'TNT00002');
  assert.equal(result.success, true);
  assert.equal(result.ticket.customer_id, 'local-customer-id');
  assert.equal(result.ticket.customer_name, 'Example Customer');
  assert.equal(result.ticket.customer_phone, '9876543210');
});

test('migration covers existing pipeline writes and contains no destructive SQL or record updates', () => {
  const actionSource = read('../src/app/actions/orderFulfillment.js');
  const stageWrites = [...actionSource.matchAll(/updateFields\.(\w+)\s*=/g)].map(match => match[1]);
  const columns = new Set([...legacyColumns, ...addedColumns]);
  for (const name of stageWrites) assert.ok(columns.has(name), `Missing stage column: ${name}`);
  assert.match(migration, /NOTIFY pgrst, 'reload schema'/);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  const sql = migration.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER COLUMN)\b/i);
  assert.equal(addedColumns.length, new Set(addedColumns).size);
});

function engineerUI(teamMembers, globals = {}) {
  const saved = [];
  const picker = component('../src/components/common/SearchableEmployeeSelect.jsx', {
    '@/utils/reportingHierarchy': { normalizeReportingValue, resolveEmployeeReference }
  });
  const modal = component('../src/components/Orders/modals/ComplaintStageActionModal.jsx', {
    '@/components/common/SearchableEmployeeSelect': picker.type
  }, globals);
  const props = { isOpen: true, ticket: { id: 'complaint-1', ticket_number: 'CMP-EXAMPLE' },
    targetStage: { id: 'C03', name: 'Service Engineer Deputed & Scheduled' }, teamMembers,
    userName: 'Operations', onClose() {}, onSuccess: async payload => { saved.push(payload); } };
  let tree;
  return { saved, props, render() { tree = modal.render(props); return tree; },
    pickerProps() { return find(tree, node => node.type === picker.type).props; },
    search() { tree = modal.render(props); return picker.render(this.pickerProps()); } };
}

test('C03 searches engineers by name/code and retains the correct user ID, name and employee mobile after selection', async () => {
  const team = [
    { id: 'role-row-1', user_id: 'engineer-user-1', emp_name: 'First Engineer', emp_id: 'EMP-501', email: 'first@example.test', emp_mobile: '9876543210', emp_department: 'Service', emp_status: 'Active' },
    { id: 'legacy-employee-row', name: 'Legacy Engineer', emp_code: 'EMP-502', email: 'legacy@example.test', phone: '9876543211', emp_status: 'Active' }
  ];
  const ui = engineerUI(team);
  let search = ui.search();
  const open = () => {
    find(search, node => node.type === 'div' && node.props.onClick && node.props.style?.minHeight === '40px').props.onClick();
    search = ui.search();
  };
  open();
  find(search, node => node.type === 'input').props.onChange({ target: { value: 'EMP-501' } });
  search = ui.search();
  assert.match(content(search), /First Engineer/);
  assert.doesNotMatch(content(search), /Legacy Engineer/);
  find(search, node => node.type === 'div' && node.props.onClick && content(node).includes('First Engineer')).props.onClick();
  search = ui.search();
  let tree = ui.render();
  assert.match(content(tree), /Engineer Selected/);
  assert.match(content(tree), /EMP-501/);
  assert.match(content(search), /First Engineer/);
  assert.equal(nodes(search).some(node => node.type === 'input'), false);
  assert.equal(content(search).includes('engineer-user-1'), false);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].formState.technician_id, 'engineer-user-1');
  assert.equal(ui.saved[0].formState.technician_name, 'First Engineer');
  assert.equal(ui.saved[0].formState.technician_phone, '9876543210');

  find(ui.render(), node => node.props['aria-label'] === 'Change Service Engineer').props.onClick();
  search = ui.search();
  assert.equal(ui.pickerProps().selectedEmail, '');
  assert.doesNotMatch(content(ui.render()), /Engineer Selected/);
  open();
  find(search, node => node.type === 'input').props.onChange({ target: { value: 'Legacy Engineer' } });
  search = ui.search();
  find(search, node => node.type === 'div' && node.props.onClick && content(node).includes('Legacy Engineer')).props.onClick();
  search = ui.search();
  await find(ui.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved[1].formState.technician_id, 'legacy-employee-row');
  assert.equal(ui.saved[1].formState.technician_name, 'Legacy Engineer');
  assert.equal(ui.saved[1].formState.technician_phone, '9876543211');
  find(search, node => node.props.title === 'Clear selection').props.onClick({ stopPropagation() {} });
  tree = ui.render();
  assert.equal(ui.pickerProps().selectedEmail, '');
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved.length, 2);
  assert.match(content(ui.render()), /Please select a Service Engineer/);
});

test('C03 excludes customers, inactive/unapproved/unnamed staff and rejects selections no longer in the active team', async () => {
  const active = { id: 'role-row', user_id: 'active-user', emp_name: 'Active Engineer', email: 'active@example.test', emp_id: 'EMP-503' };
  const ui = engineerUI([active,
    { id: 'customer', emp_name: 'Customer', role: 'Customer' },
    { id: 'inactive', emp_name: 'Inactive Engineer', emp_status: 'In_Active' },
    { id: 'unapproved', emp_name: 'Unapproved Engineer', is_approved: false },
    { id: 'terminated', emp_name: 'Terminated Engineer', module_access: { emp_status: 'Terminated' } },
    { id: 'unnamed', role: 'agent', email: 'unnamed@example.test' }
  ]);
  ui.render();
  assert.equal(ui.pickerProps().employees.length, 1);
  ui.pickerProps().onSelect(ui.pickerProps().employees[0]);
  assert.match(content(ui.render()), /Engineer Selected/);
  ui.props.teamMembers = [{ ...active, emp_status: 'Inactive' }];
  let tree = ui.render();
  assert.equal(ui.pickerProps().selectedEmail, '');
  assert.match(content(tree), /No active team members available/);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved.length, 0);
  assert.match(content(ui.render()), /Please select a Service Engineer/);

  ui.props.teamMembers = [active];
  ui.render();
  ui.pickerProps().onSelect(ui.pickerProps().employees[0]);
  tree = ui.render();
  find(tree, node => node.type === 'label' && content(node).includes('Authorized Third-Party')).props.children[0].props.onChange();
  tree = ui.render();
  assert.equal(find(tree, node => node.props.placeholder === 'e.g. Jaswinder Singh').props.value, '');
  assert.equal(find(tree, node => node.props.placeholder === '10-digit mobile').props.value, '');
  find(tree, node => node.props.placeholder === 'e.g. Jaswinder Singh').props.onChange({ target: { value: 'External Technician' } });
  tree = ui.render();
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved[0].formState.technician_id, '');
  assert.equal(ui.saved[0].formState.technician_name, 'External Technician');
  find(ui.render(), node => node.type === 'label' && content(node).includes('In-House Service Engineer')).props.children[0].props.onChange();
  tree = ui.render();
  assert.equal(ui.pickerProps().selectedEmail, '');
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.saved.length, 1);
});

test('C03 visit date defaults to the IST day at the UTC date boundary', () => {
  class BoundaryDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-30T19:30:00.000Z'])); }
  }
  const ui = engineerUI([], { Date: BoundaryDate });
  assert.equal(find(ui.render(), node => node.type === 'input' && node.props.type === 'date').props.value, '2026-10-31');
});

test('complaint date presets use inclusive IST calendar days across weeks, months, leap years and year changes', () => {
  const range = (preset, now = '2026-10-30T20:00:00Z') => complaintFilters.getComplaintDateRange(preset, '', '', new Date(now));
  const expected = {
    all: ['', ''], today: ['2026-10-31', '2026-10-31'], yesterday: ['2026-10-30', '2026-10-30'],
    this_week: ['2026-10-26', '2026-10-31'], last_week: ['2026-10-19', '2026-10-25'],
    last_7_days: ['2026-10-25', '2026-10-31'], last_30_days: ['2026-10-02', '2026-10-31'],
    this_month: ['2026-10-01', '2026-10-31'], last_month: ['2026-09-01', '2026-09-30']
  };
  for (const [preset, [startDate, endDate]] of Object.entries(expected)) assert.deepEqual(range(preset), { startDate, endDate, error: '' });
  assert.equal(range('this_week', '2026-11-01T20:00:00Z').startDate, '2026-11-02');
  assert.deepEqual(range('last_month', '2026-01-01T00:00:00+05:30'), { startDate: '2025-12-01', endDate: '2025-12-31', error: '' });
  assert.equal(range('last_month', '2024-03-01T00:00:00+05:30').endDate, '2024-02-29');
  for (const [from, to] of [['', '2026-10-30'], ['2026-10-31', '2026-10-30'], ['2026-02-30', '2026-03-01']]) {
    assert.ok(complaintFilters.getComplaintDateRange('custom', from, to).error);
  }
});

test('complaint filtering combines status, category, search and inclusive dates without timezone or terminal-SLA errors', () => {
  const rows = [
    { id: 'before', created_at: '2026-10-29T18:29:59Z', category: 'TRANSIT_DAMAGE', ticket_status: 'OPEN', stage_id: 'C01', party: { firm_name: 'Dealer A' } },
    { id: 'start', created_at: '2026-10-29T18:30:00Z', category: 'TRANSIT_DAMAGE', ticket_status: 'ACTION_TAKEN', stage_id: 'C04', party: { firm_name: 'Dealer A' }, isSlaBreached: true },
    { id: 'end', created_at: '2026-10-30T18:29:59Z', category: 'TRANSIT_DAMAGE', ticket_status: 'RESOLVED_CLOSED', stage_id: 'C01', party: { firm_name: 'Dealer A' }, isSlaBreached: true },
    { id: 'after', created_at: '2026-10-30T18:30:00Z', category: 'BILLING_ISSUES', ticket_status: 'REJECTED', stage_id: 'C06', isSlaBreached: true },
    { id: 'invalid', created_at: 'invalid' }
  ];
  const range = complaintFilters.getComplaintDateRange('custom', '2026-10-30', '2026-10-30');
  const ids = options => complaintFilters.filterComplaintTickets(rows, options).map(row => row.id);
  assert.deepEqual(ids({ range }), ['start', 'end']);
  assert.deepEqual(ids({ range, status: 'PENDING', category: 'TRANSIT_DAMAGE', search: ' dealer a ' }), ['start']);
  assert.deepEqual(ids({ range, status: 'COMPLETED' }), ['end']);
  assert.equal(complaintFilters.getComplaintStatus(rows[3]), 'REJECTED');
  assert.equal(complaintFilters.isComplaintSlaBreached(rows[2]), false);
  assert.equal(complaintFilters.isComplaintSlaBreached(rows[3]), false);
  assert.equal(complaintFilters.isComplaintSlaBreached(rows[1]), true);
  assert.equal(complaintFilters.getComplaintISTDay('2026-10-30T00:01:00'), '2026-10-30');
  assert.equal(ids({}).length, 5);
  assert.deepEqual(ids({ range: complaintFilters.getComplaintDateRange('custom', '', '') }), []);
});

const filterFixtures = [
  ...Array.from({ length: 35 }, (_, index) => ({ id: `pending-${index}`, ticket_number: `CMP-PENDING-${index}`, ticket_status: 'OPEN', stage_id: 'C01', category: 'TRANSIT_DAMAGE',
    created_at: index < 30 ? '2026-10-30T03:00:00Z' : '2026-10-29T03:00:00Z', party: { firm_name: `Dealer ${index}` }, isSlaBreached: index === 0 })),
  { id: 'closed-today', ticket_number: 'CMP-CLOSED-TODAY', ticket_status: 'RESOLVED_CLOSED', stage_id: 'C01', category: 'BILLING_ISSUES', created_at: '2026-10-30T03:00:00Z', isSlaBreached: true },
  { id: 'closed-yesterday', ticket_number: 'CMP-CLOSED-YESTERDAY', ticket_status: 'OPEN', stage_id: 'C06', category: 'BILLING_ISSUES', created_at: '2026-10-29T03:00:00Z' },
  { id: 'rejected', ticket_number: 'CMP-REJECTED', ticket_status: 'REJECTED', stage_id: 'C02', category: 'TRANSIT_DAMAGE', created_at: '2026-10-30T03:00:00Z', isSlaBreached: true }
];

async function complaintListUI() {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-30T06:00:00+05:30'])); } }
  const resized = [];
  const reset = [];
  const Resizer = () => null;
  const app = component('../src/components/Orders/ComplaintManagementModule.jsx', {
    '@/app/actions/orderFulfillment': { getComplaintsTickets: async () => filterFixtures },
    '@/app/actions/complaintPipelineConfig': { getComplaintPipelineConfig: async () => ({ success: false }) },
    '@/app/actions/endCustomers': { getEndCustomers: async () => [] }, '@/app/actions/team': { getTeamMembers: async () => [] },
    '@/utils/tableColumnResize': { ColumnResizer: Resizer, useTableColumnResize: (storageKey, widths, minimums) => {
      assert.equal(storageKey, 'complaints_table_v2'); assert.equal(minimums.actions, 250);
      return { columnWidths: { ...widths, actions: 95 }, handleResizeStart: (_event, key) => resized.push(key), resetColWidth: key => reset.push(key), resizingCol: 'actions' };
    } }
  }, { Date: FixedDate }, { runEffects: true });
  let tree = await app.flush({ tenantId: 'TNT00002' });
  find(tree, node => node.type === 'button' && content(node).trim() === 'Table').props.onClick();
  tree = app.render();
  return { app, Resizer, resized, reset, tree, render: () => app.render() };
}

test('complaint list filters both views, resets pages, and shows correct record ranges and terminal actions', async () => {
  const ui = await complaintListUI();
  let tree = ui.tree;
  const pagination = () => find(tree, node => node.props['aria-label'] === 'Complaint pagination');
  const change = (id, value) => { find(tree, node => node.props.id === id).props.onChange({ target: { value } }); tree = ui.render(); };
  assert.match(content(pagination()), /Showing 1 to 25 of 38 records/);
  find(tree, node => node.props['aria-label'] === 'Last complaint page').props.onClick(); tree = ui.render();
  assert.match(content(pagination()), /Showing 26 to 38 of 38 records/);
  const closed = find(tree, node => node.type === 'tr' && node.key === 'closed-today');
  assert.match(content(closed), /Completed/);
  assert.doesNotMatch(content(closed), /Advance|SLA Breached|On Time/);
  const rejected = find(tree, node => node.type === 'tr' && node.key === 'rejected');
  assert.match(content(rejected), /Rejected/);
  assert.doesNotMatch(content(rejected), /Advance|SLA Breached/);
  find(closed, node => node.props['aria-label'] === 'View history for CMP-CLOSED-TODAY').props.onClick(); tree = ui.render();
  assert.ok(find(tree, node => node.props.isOpen && node.props.ticket?.id === 'closed-today'));
  change('complaint-status-filter', 'COMPLETED');
  assert.match(content(pagination()), /Showing 1 to 2 of 2 records/);
  assert.equal(find(tree, node => node.props['aria-label'] === 'First complaint page').props.disabled, true);
  find(tree, node => node.props.title === 'Filter Complaints by Date (IST)').props.onChange({ preset: 'today', startDate: '2026-10-30', endDate: '2026-10-30' }); tree = ui.render();
  assert.match(content(pagination()), /Showing 1 to 1 of 1 records/);
  find(tree, node => node.props.title === 'Filter Complaints by Date (IST)').props.onChange({ preset: 'custom', startDate: '2026-10-29', endDate: '2026-10-30' }); tree = ui.render();
  assert.match(content(pagination()), /Showing 1 to 2 of 2 records/);
  find(tree, node => node.type === 'button' && content(node) === 'Reset Filters').props.onClick(); tree = ui.render();
  assert.match(content(pagination()), /Showing 1 to 25 of 38 records/);
  change('complaint-status-filter', 'PENDING');
  assert.match(content(pagination()), /of 35 records/);
  const pending = find(tree, node => node.type === 'tr' && node.key === 'pending-0');
  const advance = find(pending, node => node.props['aria-label'] === 'Advance CMP-PENDING-0 to C02');
  assert.equal(advance.props.style.whiteSpace, 'nowrap');
  advance.props.onClick(); tree = ui.render();
  assert.ok(find(tree, node => node.props.isOpen && node.props.targetStage?.id === 'C02' && node.props.ticket?.id === 'pending-0'));
  find(tree, node => node.type === 'button' && content(node).trim() === 'Pipeline').props.onClick(); tree = ui.render();
  assert.equal(nodes(tree).some(node => node.type === 'button' && node.props['aria-label'] === 'View history for CMP-CLOSED-TODAY'), false);
  assert.ok(find(tree, node => node.type === 'button' && node.props['aria-label'] === 'Advance CMP-PENDING-0 to C02'));
});

test('complaint pagination and six resizers keep their controls, safe widths, reset and action wiring', async () => {
  const ui = await complaintListUI();
  let tree = ui.tree;
  const select = find(tree, node => node.props['aria-label'] === 'Complaint rows per page');
  assert.deepEqual(Array.from(select.props.children, node => node.props.value), [10, 25, 50, 100]);
  select.props.onChange({ target: { value: '10' } }); tree = ui.render();
  find(tree, node => node.props['aria-label'] === 'Last complaint page').props.onClick(); tree = ui.render();
  assert.match(content(tree), /Showing 31 to 38 of 38 records/);
  assert.equal(find(tree, node => node.props['aria-label'] === 'Next complaint page').props.disabled, true);
  find(tree, node => node.type === 'input' && node.props.placeholder?.startsWith('Search Ticket')).props.onChange({ target: { value: 'no matching ticket' } }); tree = ui.render();
  assert.match(content(tree), /Showing 0 to 0 of 0 records/);
  assert.match(content(tree), /Page 1 of 1/);
  const handles = nodes(tree).filter(node => node.type === ui.Resizer);
  assert.equal(handles.length, 6);
  for (const handle of handles) { handle.props.onResizeStart({}, handle.props.columnKey); handle.props.onReset(handle.props.columnKey); }
  assert.equal(ui.resized.length, 6); assert.equal(ui.reset.length, 6);
  assert.equal(handles.find(node => node.props.columnKey === 'actions').props.isResizing, true);
  const actionsColumn = find(tree, node => node.type === 'col' && node.key === 'actions');
  assert.equal(actionsColumn.props.style.width, 250);
  assert.equal(find(tree, node => node.type === 'thead').props.style.position, 'sticky');
});

function datePickerUI() {
  const alerts = [];
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-30T06:00:00+05:30'])); } }
  const picker = component('../src/components/common/DateRangePicker.jsx', {}, {
    Date: FixedDate, document: { addEventListener() {}, removeEventListener() {} }, alert: message => alerts.push(message)
  }, { runEffects: true });
  return { picker, alerts };
}

test('shared date picker retains its default preset choices, styling, callback format and custom apply/cancel behavior', async () => {
  const { picker, alerts } = datePickerUI();
  const changes = [];
  let props = { preset: 'all', allowAllTime: true, onChange: value => changes.push(value) };
  let tree = await picker.flush(props);
  const trigger = () => find(tree, node => node.props.title === 'Click to choose a date range');
  assert.equal(content(trigger()), 'All Time');
  assert.equal(trigger().props.style.backgroundColor, 'var(--bg-surface, #ffffff)');
  trigger().props.onClick(); tree = await picker.flush(props);
  assert.equal(find(tree, node => node.props.style?.width === '260px').props.style.maxHeight, undefined);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'button' && node.key !== null).map(node => node.key), ['all', 'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month']);
  assert.doesNotMatch(content(tree), /Last 7 Days|Last 30 Days/);
  find(tree, node => node.type === 'button' && node.key === 'today').props.onClick(); tree = await picker.flush(props);
  assert.equal(changes[0].preset, 'today'); assert.equal(changes[0].startDate, '2026-10-30');
  assert.equal(changes[0].endDate, '2026-10-30'); assert.equal(changes[0].label, 'Today');
  props = { ...props, ...changes[0], variant: 'glass' };
  tree = await picker.flush(props);
  assert.equal(trigger().props.style.backgroundColor, 'rgba(255, 255, 255, 0.18)');
  trigger().props.onClick(); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node).includes('Custom Date Range...')).props.onClick(); tree = await picker.flush(props);
  assert.equal(nodes(tree).filter(node => node.type === 'input' && node.props.type === 'date').length, 2);
  find(tree, node => node.type === 'button' && content(node) === 'Cancel').props.onClick(); tree = await picker.flush(props);
  assert.equal(changes.length, 1);
  trigger().props.onClick(); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node).includes('Custom Date Range...')).props.onClick(); tree = await picker.flush(props);
  let dates = nodes(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2026-10-31' } }); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node) === 'Apply Date Range').props.onClick(); tree = await picker.flush(props);
  assert.match(alerts[0], /cannot be after/); assert.equal(changes.length, 1);
  dates = nodes(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2026-10-29' } }); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node) === 'Apply Date Range').props.onClick(); await picker.flush(props);
  assert.equal(changes[1].preset, 'custom'); assert.equal(changes[1].startDate, '2026-10-29'); assert.equal(changes[1].endDate, '2026-10-30');
});

test('complaint uses the common picker menu and purple custom popup while retaining all presets and filter state on cancel', async () => {
  const ui = await complaintListUI();
  const { picker } = datePickerUI();
  const pickerProps = () => find(ui.render(), node => node.props.title === 'Filter Complaints by Date (IST)').props;
  let props = pickerProps();
  let tree = await picker.flush(props);
  assert.equal(props.allowAllTime, true);
  assert.equal(nodes(ui.render()).some(node => node.type === 'select' && node.props.id === 'complaint-date-preset'), false);
  for (const [preset, label] of [['last_7_days', 'Last 7 Days'], ['last_30_days', 'Last 30 Days']]) {
    find(tree, node => node.props.title === 'Click to choose a date range').props.onClick(); tree = await picker.flush(props);
    assert.match(content(tree), /Quick Date Presets/);
    assert.equal(find(tree, node => node.props.style?.width === '260px').props.style.overflowY, 'auto');
    const button = find(tree, node => node.type === 'button' && node.key === preset);
    assert.match(content(button), new RegExp(label));
    button.props.onClick(); props = pickerProps(); tree = await picker.flush(props);
    assert.equal(props.preset, preset);
    assert.match(content(find(tree, node => node.props.title === 'Click to choose a date range')), new RegExp(label));
    assert.match(content(ui.render()), /Showing 1 to 25 of 38 records/);
  }
  find(tree, node => node.props.title === 'Click to choose a date range').props.onClick(); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node).includes('Custom Date Range...')).props.onClick(); tree = await picker.flush(props);
  assert.ok(find(tree, node => node.props.style?.background === 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)'));
  const dates = nodes(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2026-10-29' } }); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node) === 'Cancel').props.onClick(); tree = await picker.flush(props);
  assert.equal(pickerProps().preset, 'last_30_days');
  find(tree, node => node.props.title === 'Click to choose a date range').props.onClick(); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node).includes('Custom Date Range...')).props.onClick(); tree = await picker.flush(props);
  const customDates = nodes(tree).filter(node => node.type === 'input' && node.props.type === 'date');
  customDates[0].props.onChange({ target: { value: '2026-10-29' } });
  customDates[1].props.onChange({ target: { value: '2026-10-30' } }); tree = await picker.flush(props);
  find(tree, node => node.type === 'button' && content(node) === 'Apply Date Range').props.onClick();
  props = pickerProps(); await picker.flush(props);
  assert.equal(props.preset, 'custom'); assert.equal(props.startDate, '2026-10-29'); assert.equal(props.endDate, '2026-10-30');
  assert.match(content(ui.render()), /Showing 1 to 25 of 38 records/);
});
