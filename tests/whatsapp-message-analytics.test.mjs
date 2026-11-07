import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildWhatsappMessageAnalytics, filterWhatsappMessageLogs, getWhatsappMessageDay,
  normalizeWhatsappRecipient, summarizeWhatsappMessageLogs, getWhatsappMessageTrend
} from '../src/utils/whatsappMessageAnalytics.js';
import * as cache from '../src/utils/whatsappMessageLogsCache.js';
import { getSubItemPermissions } from '../src/utils/permissionUtils.js';
import * as logConfig from '../src/config/whatsappMessageLogsConfig.js';
import * as integrationConfig from '../src/config/integrationsConfig.js';
import { ROLE_PRESETS } from '../src/components/UserManagement/utils/rolePresets.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

const leadA = '11111111-1111-4111-8111-111111111111';
const leadB = '22222222-2222-4222-8222-222222222222';
const leadC = '33333333-3333-4333-8333-333333333333';
const firstTemplate = '44444444-4444-4444-8444-444444444444';
const secondTemplate = '55555555-5555-4555-8555-555555555555';
const branchA = 'TNT00002-B0002';
const branchB = 'TNT00002-B0003';

function row(id, changes = {}) {
  return {
    id, leadId: leadA, tenantCode: 'TNT00002', leadName: 'Customer A', customerCompany: 'Dealer A',
    templateId: firstTemplate, templateName: 'Welcome', campaignName: 'Welcome Campaign',
    recipient: '9876543210', branchCode: branchA, branchName: 'Raian',
    createdAt: '2026-11-06T10:00:00Z', status: 'sent', ...changes
  };
}

const rows = [
  row('a1'),
  row('a2', { recipient: '+91 98765 43210', createdAt: '2026-11-06T11:00:00Z' }),
  row('a3', { templateId: secondTemplate, templateName: 'Catalog', recipient: '919123456789', createdAt: '2026-11-06T12:00:00Z' }),
  row('a4', { status: 'failed', templateId: secondTemplate, templateName: 'Catalog' }),
  row('b1', { leadId: leadB, leadName: 'Customer B', customerCompany: 'Dealer B', branchCode: branchB, createdAt: '2026-11-06T18:31:00Z' }),
  row('c1', { leadId: leadC, leadName: 'Failed Customer', status: 'failed', recipient: '9000000000' })
];

test('one customer with three accepted messages counts once and retains every send', () => {
  const data = buildWhatsappMessageAnalytics(rows);
  assert.equal(data.summary.attempts, 6);
  assert.equal(data.summary.sent, 4);
  assert.equal(data.summary.failed, 2);
  assert.equal(data.summary.uniqueCustomers, 2);
  assert.equal(data.summary.repeatCustomers, 1);
  assert.equal(data.summary.averageMessagesPerCustomer, 2);
  assert.equal(data.summary.templatesUsed, 2);
  assert.equal(data.summary.uniqueNumbers, 2);
  assert.equal(data.customers.length, 3);
  const customer = data.customers.find(item => item.customerName === 'Customer A');
  assert.equal(customer.sent, 3);
  assert.equal(customer.failed, 1);
  assert.equal(customer.attempts, 4);
  assert.deepEqual(customer.recipientNumbers, ['919123456789', '919876543210']);
  assert.deepEqual(customer.sentTemplateNames, ['Catalog', 'Welcome']);
  assert.equal(customer.lastMessageAt, '2026-11-06T12:00:00Z');
});

test('failed and other attempts never count as a customer reached, repeat send, or sent template', () => {
  const data = buildWhatsappMessageAnalytics([row('f', { status: 'failed' }), row('o', { status: 'other' })]);
  assert.equal(data.summary.sent, 0);
  assert.equal(data.summary.failed, 1);
  assert.equal(data.summary.other, 1);
  assert.equal(data.summary.uniqueCustomers, 0);
  assert.equal(data.summary.repeatCustomers, 0);
  assert.equal(data.summary.templatesUsed, 0);
  assert.equal(data.summary.uniqueNumbers, 0);
  assert.equal(data.summary.averageMessagesPerCustomer, 0);
});

test('duplicate delta rows are counted once and the latest row wins before filtering', () => {
  const original = row('same');
  const correction = { ...original, status: 'failed' };
  assert.equal(buildWhatsappMessageAnalytics([original, original]).summary.sent, 1);
  assert.equal(buildWhatsappMessageAnalytics([original, correction]).summary.failed, 1);
  assert.equal(buildWhatsappMessageAnalytics([original, correction], { status: 'sent' }).summary.attempts, 0);
  const merged = cache.mergeWhatsappMessageLogs([original], [original, row('new')]);
  assert.equal(buildWhatsappMessageAnalytics(merged).summary.sent, 2);
  assert.equal(cache.mergeWhatsappMessageLogs(merged, []), merged);
});

test('same name/phone does not merge different CRM customers and IDs remain tenant scoped', () => {
  const data = buildWhatsappMessageAnalytics([
    row('a'), row('b', { leadId: leadB }), row('other-tenant', { tenantCode: 'TNT00003' })
  ]);
  assert.equal(data.summary.uniqueCustomers, 3);
  assert.equal(data.summary.uniqueNumbers, 1);
  assert.equal(data.summary.repeatCustomers, 0);
  assert.equal(data.customers.length, 3);
});

test('daily unique customer counts cannot be summed to obtain the period count', () => {
  const data = buildWhatsappMessageAnalytics(rows);
  assert.deepEqual(data.daily.map(item => [item.day, item.sent, item.failed, item.uniqueCustomers]), [
    ['2026-11-06', 3, 2, 1], ['2026-11-07', 1, 0, 1]
  ]);
  const sameCustomer = buildWhatsappMessageAnalytics([row('today'), row('tomorrow', { createdAt: '2026-11-07T10:00:00Z' })]);
  assert.equal(sameCustomer.daily.reduce((sum, item) => sum + item.uniqueCustomers, 0), 2);
  assert.equal(sameCustomer.summary.uniqueCustomers, 1);
  assert.equal(sameCustomer.summary.repeatCustomers, 1);
});

test('IST midnight, year and leap-day boundaries are independent of the server timezone', () => {
  assert.equal(getWhatsappMessageDay(row('before', { createdAt: '2026-11-05T18:29:59Z' })), '2026-11-05');
  assert.equal(getWhatsappMessageDay(row('after', { createdAt: '2026-11-05T18:30:00Z' })), '2026-11-06');
  assert.equal(getWhatsappMessageDay(row('year', { createdAt: '2026-12-31T18:30:00Z' })), '2027-01-01');
  assert.equal(getWhatsappMessageDay(row('leap', { createdAt: '2024-02-28T18:30:00Z' })), '2024-02-29');
  assert.equal(getWhatsappMessageDay({ sentAt: '2026-11-05T18:30:00Z' }), '2026-11-06');
});

test('date, branch, status, search and configured-frequency filters use full matching records', () => {
  assert.equal(buildWhatsappMessageAnalytics(rows, { fromDate: '2026-11-06', toDate: '2026-11-06' }).summary.sent, 3);
  assert.equal(buildWhatsappMessageAnalytics(rows, { branchCode: branchB }).summary.uniqueCustomers, 1);
  assert.equal(buildWhatsappMessageAnalytics(rows, { status: 'failed' }).summary.uniqueCustomers, 0);
  assert.equal(buildWhatsappMessageAnalytics(rows, { search: ' CATALOG ' }).summary.sent, 1);
  assert.equal(filterWhatsappMessageLogs(rows, { search: 'weekly', frequencyFor: () => 'Weekly' }).length, 6);
  assert.equal(filterWhatsappMessageLogs(rows, { branchCode: branchB, status: 'failed' }).length, 0);
});

test('template totals retain distinct identities and date/template combinations', () => {
  const data = buildWhatsappMessageAnalytics(rows);
  const welcome = data.templates.find(item => item.templateName === 'Welcome');
  assert.equal(welcome.sent, 3);
  assert.equal(welcome.failed, 1);
  assert.equal(welcome.uniqueCustomers, 2);
  assert.equal(data.templateDaily.length, 3);
  assert.equal(data.templateDaily[0].day, '2026-11-07');
  const sameName = buildWhatsappMessageAnalytics([row('first'), row('second', { templateId: secondTemplate })]);
  assert.equal(sameName.templates.length, 2);
  assert.equal(sameName.summary.templatesUsed, 2);
});

test('missing identities, invalid dates and absent templates are explicit without invented reach', () => {
  const data = buildWhatsappMessageAnalytics([null, { leadName: 'No log ID' }, row('unlinked', { leadId: null, createdAt: 'bad-date', templateId: null })]);
  assert.equal(data.summary.attempts, 1);
  assert.equal(data.summary.sent, 1);
  assert.equal(data.summary.unattributedSent, 1);
  assert.equal(data.summary.undatedAttempts, 1);
  assert.equal(data.summary.uniqueCustomers, 0);
  assert.equal(data.summary.templatesUsed, 0);
  assert.equal(data.summary.averageMessagesPerCustomer, 0);
  assert.equal(data.customers[0].customerName, 'Unlinked customer');
  assert.equal(data.daily.length, 0);
  assert.equal(buildWhatsappMessageAnalytics(null).summary.attempts, 0);
});

test('recipient normalization only unifies number formatting and the existing Indian default', () => {
  assert.equal(normalizeWhatsappRecipient('98765 43210'), '919876543210');
  assert.equal(normalizeWhatsappRecipient('+91 98765 43210'), '919876543210');
  assert.equal(normalizeWhatsappRecipient(''), '');
  assert.equal(normalizeWhatsappRecipient('Invalid Number'), '');
});

test('small cached summaries agree with full breakdowns, including every filter combination', () => {
  for (const options of [{}, { status: 'failed' }, { branchCode: branchA }, { search: 'Catalog' }, { fromDate: '2026-11-07' }]) {
    assert.deepEqual(summarizeWhatsappMessageLogs(rows, options), buildWhatsappMessageAnalytics(rows, options).summary);
  }
});

const largePeriod = Array.from({ length: 600 }, (_, index) => row(`bulk-${index}`, { leadId: `customer-${index % 200}` }));

test('full-period counts include records beyond both the current page and the network batch', () => {
  const data = buildWhatsappMessageAnalytics(largePeriod);
  assert.equal(data.summary.sent, 600);
  assert.equal(data.summary.uniqueCustomers, 200);
  assert.equal(data.summary.repeatCustomers, 200);
  assert.equal(data.summary.averageMessagesPerCustomer, 3);
  assert.equal(data.customers.length, 200);
});

test('a 100-row preview retains complete cached totals and partial deltas cannot overwrite them', async () => {
  const previousWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const scope = cache.createWhatsappMessageLogsScope({ userId: 'analytics-cache-test', tenantId: 'tenant-a', userRole: 'admin', fromDate: '2026-11-06', toDate: '2026-11-06' });
    const base = { rows: largePeriod, complete: true, snapshotComplete: true, syncedThrough: '2026-11-06T15:00:00Z' };
    await cache.upsertWhatsappMessageLogsLocally(scope, largePeriod, base);
    const raw = JSON.parse(storage.get(cache.whatsappMessageLogsStorageKey(scope)));
    assert.equal(raw.rows.length, 100);
    assert.equal(raw.complete, false);
    assert.equal(raw.dashboardSummary.sent, 600);
    assert.equal(raw.dashboardSummary.uniqueCustomers, 200);
    const reloaded = await import('../src/utils/whatsappMessageLogsCache.js?preview-test');
    const preview = reloaded.readFastWhatsappMessageLogs(scope);
    assert.equal(preview.complete, false);
    assert.equal(preview.dashboardSummary.sent, 600);
    await cache.upsertWhatsappMessageLogsLocally(scope, [row('delta')], {
      ...base, rows: [...largePeriod, row('delta')], snapshotComplete: false,
      dashboardSummary: raw.dashboardSummary, dashboardAsOf: raw.dashboardAsOf
    });
    const partial = cache.readFastWhatsappMessageLogs(scope);
    assert.equal(partial.rows.length, 601);
    assert.equal(partial.dashboardSummary.sent, 600);
    assert.equal(partial.dashboardAsOf, base.syncedThrough);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});


function compile(filename, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
  const result = swc.transformSync(source, {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' }
  });
  const loaded = { exports: {} };
  vm.runInNewContext(result.code, {
    module: loaded, exports: loaded.exports, console, setTimeout, clearTimeout, structuredClone,
    require: name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; }, ...globals
  });
  return loaded.exports;
}
const icon = () => null;
const mockResize = (key, defaults) => ({ colWidths: defaults, getTotalTableWidth: () => Object.values(defaults).reduce((sum, value) => sum + value, 0) });
const commonDependencies = {
  react: React, 'react-dom': { createPortal: content => content },
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/common/StandardTablePagination': { __esModule: true, default: () => null },
  '@/utils/tableColumnResize': { useTableColumnResize: mockResize, ColumnResizer: () => React.createElement('span', { className: 'column-resizer' }) },
  '@/utils/whatsappMessageAnalytics': { buildWhatsappMessageAnalytics, filterWhatsappMessageLogs, getWhatsappMessageTrend },
  '@/config/whatsappMessageLogsConfig': logConfig,
  '@/utils/permissionUtils': { getSubItemPermissions }
};
const filterModule = compile('src/components/WhatsappMessageLogsFilter.jsx', commonDependencies);
commonDependencies['@/components/WhatsappMessageLogsFilter'] = filterModule;
const tableModule = compile('src/components/WhatsappMessageLogsTable.jsx', commonDependencies);
const dashboardDependencies = { ...commonDependencies, '@/components/WhatsappMessageLogsTable': tableModule };
const dashboardProps = { rows, complete: true, filterKey: 'all', fromDate: '2026-11-06', toDate: '2026-11-07', allowedViews: logConfig.WHATSAPP_LOG_VIEW_IDS };
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
const content = node => Array.isArray(node) ? node.map(content).join('') : node?.props ? content(node.props.children) : String(node ?? '');

function hookHarness(filename, dependencies, initialProps, componentName = 'default', globals = {}, runEffects = false) {
  const cells = [], effects = [], pending = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn) { cursor++; return fn; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
    useId() { return `test-id-${cursor++}`; },
    useEffect(fn, deps = []) { const index = cursor++; if (!runEffects) return; if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) { effects[index]?.cleanup?.(); effects[index] = { deps }; pending.push(() => { effects[index].cleanup = fn(); }); } }
  };
  const loaded = compile(filename, { ...dependencies, react: hooks }, globals);
  let props = initialProps;
  return { render(next = props) { props = next; cursor = 0; const tree = loaded[componentName](props); while (pending.length) pending.shift()(); return tree; }, dispose() { effects.forEach(effect => effect?.cleanup?.()); } };
}

const statusOptions = [
  { value: 'all', label: 'All Statuses', tone: 'indigo' },
  { value: 'sent', label: 'Sent', tone: 'emerald' },
  { value: 'failed', label: 'Failed', tone: 'rose' },
  { value: 'other', label: 'Other', tone: 'amber' }
];
function filterHarness(props) {
  const docEvents = new Map(), windowEvents = new Map();
  let focusCount = 0;
  const rect = { left: 32, top: 160, bottom: 200, width: 200 };
  const globals = {
    document: { body: {}, addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) },
    window: { innerWidth: 1000, innerHeight: 800, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) }
  };
  const harness = hookHarness('src/components/WhatsappMessageLogsFilter.jsx', commonDependencies, props, 'default', globals, true);
  const first = harness.render();
  nodes(first).find(node => node.type === 'button').props.ref.current = { getBoundingClientRect: () => rect, contains: () => false, focus: () => { focusCount++; } };
  const key = (node, value) => node.props.onKeyDown({ key: value, preventDefault() {}, stopPropagation() {} });
  return { ...harness, globals, docEvents, windowEvents, rect, key, focused: () => focusCount };
}

test('status dropdown uses a floating styled listbox with selected check and original values', () => {
  let selected;
  const harness = filterHarness({ label: 'API Status', value: 'sent', options: statusOptions, onChange: value => { selected = value; } });
  let tree = harness.render();
  const button = () => nodes(tree).find(node => node.type === 'button');
  assert.equal(button().props['aria-expanded'], false);
  button().props.onClick(); tree = harness.render();
  assert.equal(button().props['aria-expanded'], true);
  const choices = nodes(tree).filter(node => node.props.role === 'option');
  assert.equal(choices.length, 4);
  assert.deepEqual(choices.map(node => node.props['aria-selected']), [false, true, false, false]);
  assert.equal(button().props['aria-activedescendant'], choices[1].props.id);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /wa-log-filter-menu/);
  assert.match(html, /wa:bg-emerald-500/);
  assert.match(html, /wa:bg-rose-500/);
  assert.ok(!html.includes('<select'));
  choices[2].props.onClick(); tree = harness.render();
  assert.equal(selected, 'failed');
  assert.equal(button().props['aria-expanded'], false);
  assert.equal(harness.focused(), 1);
  harness.dispose();
});

test('branch search matches code/name, reports empty results and resets on reopening', () => {
  let selected;
  const options = [
    { value: '', label: 'All Branches' },
    { value: branchA, label: branchA, description: 'New Swan MultiTech Limited Raian' },
    { value: branchB, label: branchB, description: 'New Swan Technologies Limited Pahlarwal' }
  ];
  const harness = filterHarness({ label: 'Branch / Plant', kind: 'branch', searchable: true, value: '', options, onChange: value => { selected = value; } });
  let tree = harness.render();
  const button = () => nodes(tree).find(node => node.type === 'button');
  const search = () => nodes(tree).find(node => node.type === 'input');
  button().props.onClick(); tree = harness.render();
  search().props.onChange({ target: { value: '  rAiAn  ' } }); tree = harness.render();
  assert.equal(nodes(tree).filter(node => node.props.role === 'option').length, 1);
  assert.match(content(tree), /MultiTech Limited Raian/);
  harness.key(search(), 'Enter'); tree = harness.render();
  assert.equal(selected, branchA);
  button().props.onClick(); tree = harness.render();
  assert.equal(search().props.value, '');
  search().props.onChange({ target: { value: 'B0003' } }); tree = harness.render();
  assert.equal(nodes(tree).filter(node => node.props.role === 'option').length, 1);
  assert.match(content(tree), /Pahlarwal/);
  search().props.onChange({ target: { value: 'no-such-branch' } }); tree = harness.render();
  assert.equal(nodes(tree).filter(node => node.props.role === 'option').length, 0);
  assert.match(content(tree), /No matches/);
  assert.equal(search().props['aria-activedescendant'], undefined);
  harness.key(search(), 'Enter'); tree = harness.render();
  assert.equal(selected, branchA);
  harness.key(search(), 'Escape'); tree = harness.render();
  assert.equal(button().props['aria-expanded'], false);
  harness.dispose();
});

test('dropdown supports arrow/Home/End/typeahead selection, Escape, Tab and outside dismissal', () => {
  let selected;
  const harness = filterHarness({ label: 'API Status', value: 'all', options: statusOptions, onChange: value => { selected = value; } });
  let tree = harness.render();
  const button = () => nodes(tree).find(node => node.type === 'button');
  const activeText = () => content(nodes(tree).find(node => node.props['data-active'] === 'true'));
  harness.key(button(), 'ArrowDown'); tree = harness.render();
  harness.key(button(), 'End'); tree = harness.render(); assert.equal(activeText(), 'Other');
  harness.key(button(), 'Home'); tree = harness.render(); assert.equal(activeText(), 'All Statuses');
  harness.key(button(), 'ArrowUp'); tree = harness.render(); assert.equal(activeText(), 'Other');
  harness.key(button(), 'f'); tree = harness.render(); assert.equal(activeText(), 'Failed');
  harness.key(button(), 'Enter'); tree = harness.render(); assert.equal(selected, 'failed');
  button().props.onClick(); tree = harness.render();
  harness.key(button(), 'Escape'); tree = harness.render(); assert.equal(button().props['aria-expanded'], false);
  button().props.onClick(); tree = harness.render();
  harness.key(button(), 'Tab'); tree = harness.render(); assert.equal(button().props['aria-expanded'], false);
  button().props.onClick(); tree = harness.render();
  const beforeOutside = harness.focused();
  harness.docEvents.get('pointerdown')({ target: {} }); tree = harness.render();
  assert.equal(button().props['aria-expanded'], false);
  assert.equal(harness.focused(), beforeOutside);
  harness.dispose();
  assert.equal(harness.docEvents.size, 0);
  assert.equal(harness.windowEvents.size, 0);
});

test('disabled company filter keeps tenant IDs private and cannot open or change selection', () => {
  let changes = 0;
  const props = { label: 'Company / Tenant', kind: 'company', searchable: true, value: leadA, disabled: true, options: [{ value: leadA, label: 'TNT00002', description: 'New Swan Group' }], onChange: () => { changes++; } };
  const harness = filterHarness(props);
  let tree = harness.render();
  const button = () => nodes(tree).find(node => node.type === 'button');
  assert.equal(button().props.disabled, true);
  button().props.onClick(); harness.key(button(), 'Enter'); tree = harness.render();
  assert.equal(button().props['aria-expanded'], false);
  assert.equal(changes, 0);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /TNT00002/);
  assert.match(html, /New Swan Group/);
  assert.ok(!html.includes(leadA));
  tree = harness.render({ ...props, disabled: false });
  button().props.onClick(); tree = harness.render(); assert.equal(button().props['aria-expanded'], true);
  tree = harness.render(props); assert.equal(button().props['aria-expanded'], false);
  harness.dispose();
});

test('floating filter flips above and stays within narrow viewports on resize', () => {
  const harness = filterHarness({ label: 'Branch / Plant', kind: 'branch', value: '', options: [{ value: '', label: 'All Branches' }] });
  harness.rect.left = 900; harness.rect.top = 700; harness.rect.bottom = 740;
  let tree = harness.render();
  nodes(tree).find(node => node.type === 'button').props.onClick(); tree = harness.render();
  const popup = () => nodes(tree).find(node => node.props.className?.includes('wa-log-filter-menu'));
  assert.equal(popup().props.style.bottom, 108);
  assert.equal(popup().props.style.left, 620);
  assert.equal(popup().props.style.width, 368);
  harness.globals.window.innerWidth = 320; harness.globals.window.innerHeight = 460;
  harness.rect.left = 250; harness.rect.top = 400; harness.rect.bottom = 440;
  harness.windowEvents.get('resize')({ target: harness.globals.window }); tree = harness.render();
  assert.equal(popup().props.style.left, 12);
  assert.equal(popup().props.style.width, 296);
  assert.equal(popup().props.style.bottom, 68);
  assert.ok(popup().props.style.maxHeight <= 380);
  harness.dispose();
});

test('custom toolbar filters retain branch/status filtering and clear branch on tenant changes', () => {
  const Dashboard = () => null;
  const entry = { rows, complete: true, tenantCode: 'TNT00002', branches: [{ code: branchA, name: 'Raian' }, { code: branchB, name: 'Pahlarwal' }], frequencyRules: [], tenants: [{ id: leadA, code: 'TNT00002', name: 'New Swan Group' }, { id: leadB, code: 'TNT00003', name: 'Testing NSG' }] };
  const harness = hookHarness('src/components/WhatsappOfficialMessageLogs.jsx', {
    ...commonDependencies,
    '@/components/common/DateRangePicker': { __esModule: true, default: () => null },
    '@/components/ErrorBoundary': { __esModule: true, default: () => null },
    '@/components/WhatsappMessageLogsDashboard': { __esModule: true, default: Dashboard },
    '@/app/actions/whatsappMessageLogs': {}, './WhatsappMessageLogs.css': {},
    '@/utils/whatsappMessageLogsCache': { ...cache, readFastWhatsappMessageLogs: () => entry }
  }, { userId: 'actor', tenantId: leadA, userRole: 'master_admin', moduleAccess: {}, isMasterAdmin: true, isActive: false });
  let tree = harness.render();
  const filter = label => nodes(tree).find(node => node.type === filterModule.default && node.props.label === label).props;
  const dashboard = () => nodes(tree).find(node => node.type === Dashboard).props;
  filter('Branch / Plant').onChange(branchB); tree = harness.render(); assert.equal(dashboard().rows.length, 1);
  filter('API Status').onChange('failed'); tree = harness.render(); assert.equal(dashboard().rows.length, 0);
  filter('Company / Tenant').onChange(leadB); tree = harness.render();
  assert.equal(filter('Branch / Plant').value, '');
  assert.equal(filter('Company / Tenant').value, leadB);
  assert.equal(dashboard().rows.length, 2);
  assert.equal(filter('API Status').value, 'failed');
  const html = renderToStaticMarkup(tree);
  assert.ok(!html.includes('<select'));
  assert.ok(!html.includes(leadA));
  assert.ok(!html.includes(leadB));
});

test('premium screen has exactly five KPIs, three registered views and only the default raw table', () => {
  const Dashboard = compile('src/components/WhatsappMessageLogsDashboard.jsx', dashboardDependencies).default;
  const html = renderToStaticMarkup(React.createElement(Dashboard, dashboardProps));
  assert.equal((html.match(/wa:group wa:rounded-xl/g) || []).length, 5);
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 1);
  assert.match(html, /Detailed Raw Logs/);
  assert.match(html, /Copy 9876543210/);
  assert.match(html, /column-resizer/);
  assert.match(html, /wa:sticky wa:top-0/);
  assert.ok(!html.includes(leadA));
  assert.ok(!html.includes(firstTemplate));
  assert.ok(!html.includes('<details'));
});

test('customer-only view shows repeat badges, compact template tags and successful last-send time', () => {
  const Dashboard = compile('src/components/WhatsappMessageLogsDashboard.jsx', dashboardDependencies).default;
  const html = renderToStaticMarkup(React.createElement(Dashboard, { ...dashboardProps, allowedViews: ['sent_logs_customers'] }));
  assert.match(html, /3x Sent/);
  assert.match(html, /\+1 more/);
  assert.match(html, /Last Sent Time/);
  assert.equal((html.match(/<table /g) || []).length, 1);
  const data = buildWhatsappMessageAnalytics([row('sent'), row('failed-later', { status: 'failed', createdAt: '2026-11-06T11:00:00Z' })]);
  assert.equal(data.customers[0].lastSentAt, '2026-11-06T10:00:00Z');
  assert.equal(data.customers[0].lastMessageAt, '2026-11-06T11:00:00Z');
});

test('breakdown view has template/daily tables and customer-based single/repeat distribution', () => {
  const Dashboard = compile('src/components/WhatsappMessageLogsDashboard.jsx', dashboardDependencies).default;
  const html = renderToStaticMarkup(React.createElement(Dashboard, { ...dashboardProps, allowedViews: ['sent_logs_breakdown'] }));
  assert.match(html, /Template Performance/);
  assert.match(html, /Daily Summary/);
  assert.match(html, /1 customers with one send; 1 customers with two or more sends/);
  assert.match(html, /50%/);
  assert.equal((html.match(/<table /g) || []).length, 2);
  assert.ok(!html.includes('Copy 9876543210'));
});

test('incomplete data shows shimmer and does not publish preview counts as period totals', () => {
  const Dashboard = compile('src/components/WhatsappMessageLogsDashboard.jsx', dashboardDependencies).default;
  const html = renderToStaticMarkup(React.createElement(Dashboard, { ...dashboardProps, rows: largePeriod.slice(0, 100), complete: false }));
  assert.match(html, /preview rows are not final totals/);
  assert.match(html, /wa-loading-shimmer/);
  const snapshot = renderToStaticMarkup(React.createElement(Dashboard, { ...dashboardProps, rows: [], complete: false, snapshotSummary: summarizeWhatsappMessageLogs(largePeriod), snapshotAsOf: '2026-11-06T15:00:00Z' }));
  assert.match(snapshot, /600/);
  assert.match(snapshot, /last complete cached totals/);
});

test('segmented tabs support click, arrow/Home/End keys and respect the permitted views', () => {
  const harness = hookHarness('src/components/WhatsappMessageLogsDashboard.jsx', dashboardDependencies, dashboardProps);
  let tree = harness.render();
  const tabs = () => nodes(tree).filter(node => node.props.role === 'tab');
  assert.equal(tabs()[0].props['aria-selected'], true);
  tabs()[0].props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  tree = harness.render();
  assert.equal(tabs()[1].props['aria-selected'], true);
  assert.equal(nodes(tree).find(node => node.type === tableModule.default).props.id, 'customers');
  tabs()[1].props.onKeyDown({ key: 'End', preventDefault() {} });
  tree = harness.render();
  assert.equal(tabs()[2].props['aria-selected'], true);
  tabs()[2].props.onKeyDown({ key: 'Home', preventDefault() {} });
  tree = harness.render();
  assert.equal(tabs()[0].props['aria-selected'], true);
  tree = harness.render({ ...dashboardProps, allowedViews: ['sent_logs_customers'] });
  assert.equal(tabs().length, 1);
  assert.equal(tabs()[0].props['aria-selected'], true);
  tree = harness.render({ ...dashboardProps, allowedViews: [] });
  assert.equal(tabs().length, 0);
  assert.match(content(tree), /do not have permission/);
});

test('copy-to-clipboard provides success and graceful rejection feedback', async () => {
  let copied;
  const globals = { navigator: { clipboard: { writeText: async value => { copied = value; } } }, setTimeout: () => 1, clearTimeout() {} };
  const harness = hookHarness('src/components/WhatsappMessageLogsTable.jsx', commonDependencies, { number: '919876543210' }, 'CopyNumber', globals);
  let tree = harness.render();
  await nodes(tree).find(node => node.type === 'button').props.onClick();
  tree = harness.render();
  assert.equal(copied, '919876543210');
  assert.equal(nodes(tree).find(node => node.type === 'button').props.title, 'Copied!');
  globals.navigator.clipboard.writeText = async () => { throw new Error('blocked'); };
  await nodes(tree).find(node => node.type === 'button').props.onClick();
  tree = harness.render();
  assert.match(nodes(tree).find(node => node.props.role === 'status').props.children, /unavailable/);
});

test('template +N popover opens on click, lists all tags, and closes with Escape', () => {
  const listeners = new Map();
  const doc = { body: {}, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const globals = { document: doc, window: { innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {} }, setTimeout: () => 1, clearTimeout() {} };
  const harness = hookHarness('src/components/WhatsappMessageLogsTable.jsx', commonDependencies, { values: ['First', 'Second', 'Third'] }, 'TemplateTags', globals, true);
  let tree = harness.render();
  assert.ok(!content(tree).includes('Second'));
  const trigger = nodes(tree).find(node => node.type === 'button');
  trigger.props.ref.current = { getBoundingClientRect: () => ({ left: 300, top: 300, bottom: 330 }), contains: () => false, focus() {} };
  trigger.props.onClick();
  tree = harness.render();
  assert.match(content(tree), /Second/);
  assert.match(content(tree), /Third/);
  assert.ok(nodes(tree).some(node => node.props.role === 'dialog'));
  listeners.get('keydown')({ key: 'Escape' });
  tree = harness.render();
  assert.ok(!nodes(tree).some(node => node.props.role === 'dialog'));
  harness.dispose();
});

test('logs pass all filtered period rows to the dashboard, preserve toolbar order and suppress mismatched snapshots', () => {
  const Dashboard = () => null;
  const entry = { rows: largePeriod, complete: true, snapshotComplete: true, tenants: [], tenantCode: 'TNT00002', branches: [], frequencyRules: [], dashboardSummary: summarizeWhatsappMessageLogs(largePeriod) };
  const harness = hookHarness('src/components/WhatsappOfficialMessageLogs.jsx', {
    ...commonDependencies,
    '@/components/common/DateRangePicker': { __esModule: true, default: () => null },
    '@/components/ErrorBoundary': { __esModule: true, default: () => null },
    '@/components/WhatsappMessageLogsDashboard': { __esModule: true, default: Dashboard },
    '@/app/actions/whatsappMessageLogs': {}, './WhatsappMessageLogs.css': {},
    '@/utils/whatsappMessageLogsCache': { ...cache, readFastWhatsappMessageLogs: () => entry }
  }, { userId: 'actor', tenantId: 'tenant-a', userRole: 'admin', moduleAccess: {}, isActive: false });
  let tree = harness.render();
  const dashboard = () => nodes(tree).find(node => node.type === Dashboard).props;
  assert.equal(dashboard().rows.length, 600);
  assert.equal(dashboard().allowedViews.length, 3);
  assert.ok(content(tree).indexOf('Search Messages') < content(tree).indexOf('Quick Date Presets'));
  entry.complete = false;
  tree = harness.render();
  assert.equal(dashboard().snapshotSummary.sent, 600);
  nodes(tree).find(node => node.props['aria-label'] === 'Search API message logs').props.onChange({ target: { value: 'Welcome' } });
  tree = harness.render();
  assert.equal(dashboard().snapshotSummary, null);
  assert.equal(dashboard().complete, false);
  entry.complete = true; entry.snapshotComplete = false;
  tree = harness.render();
  assert.equal(dashboard().complete, false);
});

test('quick dates retain all eight options and resolve weeks/months at IST calendar boundaries', () => {
  let instant = '2026-11-06T10:00:00Z';
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return Date.parse(instant); }
  }
  const Picker = () => null;
  const harness = hookHarness('src/components/WhatsappOfficialMessageLogs.jsx', {
    ...commonDependencies,
    '@/components/common/DateRangePicker': { __esModule: true, default: Picker },
    '@/components/ErrorBoundary': { __esModule: true, default: () => null },
    '@/components/WhatsappMessageLogsDashboard': { __esModule: true, default: () => null },
    '@/app/actions/whatsappMessageLogs': {}, './WhatsappMessageLogs.css': {},
    '@/utils/whatsappMessageLogsCache': { ...cache, readFastWhatsappMessageLogs: () => null }
  }, { userId: 'actor', tenantId: 'tenant-a', userRole: 'admin', moduleAccess: {}, isActive: false }, 'default', { Date: FixedDate });
  const picker = () => nodes(harness.render()).find(node => node.type === Picker).props;
  assert.deepEqual(Array.from(picker().presetOptions, option => option.label), [
    'Today', 'Yesterday', 'This Week', 'Last Week', 'Last 7 Days', 'This Month', 'Last Month', 'Custom Date Range'
  ]);
  for (const [now, preset, from, to] of [
    ['2026-11-06T10:00:00Z', 'thisWeek', '2026-11-02', '2026-11-06'],
    ['2026-11-06T10:00:00Z', 'lastWeek', '2026-10-26', '2026-11-01'],
    ['2026-11-08T18:29:59Z', 'thisWeek', '2026-11-02', '2026-11-08'],
    ['2026-11-08T18:30:00Z', 'thisWeek', '2026-11-09', '2026-11-09'],
    ['2026-11-08T18:30:00Z', 'lastWeek', '2026-11-02', '2026-11-08'],
    ['2026-12-31T18:30:00Z', 'thisWeek', '2026-12-28', '2027-01-01'],
    ['2026-12-31T18:30:00Z', 'lastWeek', '2026-12-21', '2026-12-27'],
    ['2026-12-31T18:30:00Z', 'lastMonth', '2026-12-01', '2026-12-31'],
    ['2024-02-29T18:30:00Z', 'lastMonth', '2024-02-01', '2024-02-29'],
    ['2026-11-06T18:30:00Z', 'thisMonth', '2026-11-01', '2026-11-07'],
    ['2026-11-06T18:30:00Z', 'last7', '2026-11-01', '2026-11-07']
  ]) {
    instant = now;
    const range = picker().rangeResolver(preset);
    assert.equal(range.startDate, from, `${preset} start at ${now}`);
    assert.equal(range.endDate, to, `${preset} end at ${now}`);
    picker().onChange({ preset, startDate: range.startDate, endDate: range.endDate });
    assert.equal(picker().preset, preset);
    assert.equal(picker().startDate, from);
    assert.equal(picker().endDate, to);
  }
  const custom = picker().rangeResolver('custom', '2026-10-01', '2026-10-20');
  assert.equal(custom.startDate, '2026-10-01');
  assert.equal(custom.endDate, '2026-10-20');
});

test('table pagination resets on changed filters and sizes while retaining full record counts', () => {
  const Pagination = () => null;
  const customerRows = buildWhatsappMessageAnalytics(largePeriod).customers;
  const props = { id: 'customer-test', title: 'Customers', rows: customerRows, columns: [{ id: 'customerName', label: 'Customer', width: 200 }], filterKey: 'first' };
  const harness = hookHarness('src/components/WhatsappMessageLogsTable.jsx', { ...commonDependencies, '@/components/common/StandardTablePagination': { __esModule: true, default: Pagination } }, props);
  let tree = harness.render();
  const pagination = () => nodes(tree).find(node => node.type === Pagination).props;
  assert.equal(pagination().totalRecords, 200);
  pagination().onPageChange(3); tree = harness.render();
  assert.equal(pagination().currentPage, 3);
  tree = harness.render({ ...props, filterKey: 'second' });
  assert.equal(pagination().currentPage, 1);
  pagination().onPageSizeChange(5); tree = harness.render();
  assert.equal(pagination().pageSize, 5);
  assert.equal(pagination().currentPage, 1);
  assert.equal(pagination().totalRecords, 200);
});

test('new views default deny, managers cannot inherit them, and explicit legacy raw grants remain compatible', () => {
  for (const role of ['telecaller', 'manager', 'hod', 'sales_executive', 'read_only_viewer']) {
    const access = { whatsapp_official: { view: true, is_manager: true, sub_items: { sent_logs: { view: true } } } };
    assert.equal(getSubItemPermissions(access, role, 'whatsapp_official', 'sent_logs_raw').view, true);
    for (const id of ['sent_logs_customers', 'sent_logs_breakdown']) assert.equal(getSubItemPermissions(access, role, 'whatsapp_official', id).view, false);
    access.whatsapp_official.sub_items.sent_logs_raw = { view: false };
    assert.equal(getSubItemPermissions(access, role, 'whatsapp_official', 'sent_logs').view, false);
    access.whatsapp_official.sub_items.sent_logs_customers = { view: true };
    assert.equal(getSubItemPermissions(access, role, 'whatsapp_official', 'sent_logs').view, true);
  }
  for (const preset of ROLE_PRESETS) for (const id of logConfig.WHATSAPP_LOG_VIEW_IDS) {
    assert.equal(preset.presetData.whatsapp_official.sub_items[id].view, ['master_admin', 'admin'].includes(preset.key));
  }
});

const catalog = compile('src/config/modulesConfig.jsx', { react: React, 'lucide-react': new Proxy({}, { get: () => icon }), './integrationsConfig': integrationConfig, './whatsappMessageLogsConfig.js': logConfig }).MODULES_CONFIG;
const whatsappModule = catalog.find(module => module.id === 'whatsapp_official');

test('all three views appear in the source registry and both permission editors with matching defaults', () => {
  assert.deepEqual(Array.from(whatsappModule.subItems.filter(item => item.pageId === 'sent_logs'), item => item.id), logConfig.WHATSAPP_LOG_VIEW_IDS);
  assert.equal(whatsappModule.subItemGroups[0].subItems.length, 3);
  const access = { whatsapp_official: { view: true, is_manager: true, sub_items: { sent_logs: { view: true } } } };
  const dependencies = { ...commonDependencies, '@/config/modulesConfig': { MODULES_CONFIG: [whatsappModule] }, '../utils/rolePresets': { ROLE_PRESETS }, '@/config/integrationsConfig': integrationConfig };
  const harness = hookHarness('src/components/UserManagement/modals/PermissionMatrixModal.jsx', dependencies,
    { isOpen: true, user: { user_id: 'actor', role: 'manager', module_access: access }, onClose() {}, onSave() {} }, 'default', {}, true);
  let tree = harness.render(); tree = harness.render();
  const search = nodes(tree).find(node => node.type === 'input' && /search/i.test(node.props.placeholder || ''));
  assert.ok(search); search.props.onChange({ target: { value: 'API Message Sent Logs' } }); tree = harness.render();
  for (const [index, tab] of logConfig.WHATSAPP_LOG_TABS.entries()) {
    const tableRow = nodes(tree).find(node => node.type === 'tr' && content(node).includes(tab.label));
    assert.ok(tableRow, tab.label);
    const view = nodes(tableRow).find(node => node.type === 'input' && node.props.type === 'checkbox');
    assert.equal(view.props.checked, index === 0);
  }
  harness.dispose();
  const roleHarness = hookHarness('src/components/UserManagement/modals/RoleTemplateModal.jsx', dependencies,
    { initialRole: { name: 'Legacy manager', permissions: access }, onClose() {}, onSave() {} });
  tree = roleHarness.render();
  const roleSearch = nodes(tree).find(node => node.type === 'input' && /search/i.test(node.props.placeholder || ''));
  assert.ok(roleSearch); roleSearch.props.onChange({ target: { value: 'API Message Sent Logs' } }); tree = roleHarness.render();
  for (const [index, tab] of logConfig.WHATSAPP_LOG_TABS.entries()) {
    const tableRow = nodes(tree).find(node => node.type === 'tr' && content(node).includes(tab.label));
    assert.ok(tableRow, tab.label);
    assert.equal(nodes(tableRow).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, index === 0);
  }
});

test('server access remains tenant scoped and strips raw errors/contact fields from restricted views', async () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const role = { user_id: 'actor', role: 'admin', tenant_id: tenantId, is_approved: true, module_access: {} };
  const queries = [];
  const db = { from(table) { const filters = []; const query = {
    select(value) { filters.push(['select', value]); return query; }, eq(key, value) { filters.push(['eq', key, value]); return query; },
    gte() { return query; }, lt() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; }, or() { return query; },
    maybeSingle() { return Promise.resolve({ data: role }); }, then(resolve, reject) { queries.push({ table, filters });
      const data = table === 'tenants' ? [{ id: tenantId, name: 'New Swan Group', tenant_code: 'TNT00002', status: 'ACTIVE' }]
        : table === 'whatsapp_message_logs' ? [{ id: 'log', lead_id: leadA, template_id: firstTemplate, created_at: '2026-11-06T10:00:00Z', status: 'failed for 919876543210: Provider rejected', lead: { name: 'Customer A', tenant_id: tenantId, our_company: 'NSMLR' } }] : [];
      return Promise.resolve({ data }).then(resolve, reject); }
  }; return query; } };
  const actions = compile('src/app/actions/whatsappMessageLogs.js', {
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'admin@example.com' } } }) } }) },
    '@/utils/supabase/adminClient': { getAdminClient: () => db }, '@/utils/permissionUtils': { getSubItemPermissions },
    '@/app/actions/tenantBranches': { resolveKnownTenant: async () => ({ tenantId }) }, '@/config/whatsappMessageLogsConfig': logConfig
  });
  const input = { tenantId, fromDate: '2026-11-06', toDate: '2026-11-06' };
  let result = await actions.getWhatsappMessageLogs(input);
  assert.equal(result.success, true); assert.equal(result.data[0].leadId, leadA); assert.equal(result.allowedViews.length, 3);
  assert.ok(queries.find(query => query.table === 'whatsapp_message_logs').filters.some(filter => filter[0] === 'eq' && filter[1] === 'lead.tenant_id' && filter[2] === tenantId));
  role.role = 'manager'; role.module_access = { whatsapp_official: { view: true, is_manager: true } }; queries.length = 0;
  assert.equal((await actions.getWhatsappMessageLogs(input)).denied, true); assert.equal(queries.length, 0);
  role.module_access.whatsapp_official.sub_items = { sent_logs_customers: { view: true } };
  result = await actions.getWhatsappMessageLogs(input);
  assert.equal(result.data[0].error, ''); assert.equal(result.data[0].recipient, '919876543210');
  role.module_access.whatsapp_official.sub_items = { sent_logs_breakdown: { view: true } };
  result = await actions.getWhatsappMessageLogs(input);
  assert.equal(result.data[0].recipient, ''); assert.equal(result.data[0].leadName, 'Customer'); assert.equal(result.data[0].error, '');
  assert.equal((await actions.getWhatsappMessageLogs({ ...input, tenantId: '00000000-0000-0000-0000-000000000009' })).denied, true);
});

test('trend indicators use real selected IST-hour activity and never count failures or duplicates', () => {
  const trend = getWhatsappMessageTrend([row('a'), row('a'), row('b'), row('later', { createdAt: '2026-11-06T11:00:00Z' }), row('fail', { status: 'failed' })]);
  assert.deepEqual(trend.points.map(point => point.count), [2, 1]);
  assert.equal(trend.latestHourCount, 1);
  assert.equal(getWhatsappMessageTrend([]).latestHourCount, 0);
});
