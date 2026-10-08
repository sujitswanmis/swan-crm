import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel } from '@tanstack/react-table';
import { readTableView, writeTableView } from '../src/utils/tableViewPreferences.js';
import { getMobileLeadPage, createLeadRowReader, readLeadCacheInPages } from '../src/utils/leadPerformance.js';
import * as normalization from '../src/utils/dataSanitizer.js';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const source = fs.readFileSync(new URL('../src/components/common/MobileTableView.jsx', import.meta.url), 'utf8');
const compiled = swc.transformSync(source, { filename: 'MobileTableView.jsx',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
  module: { type: 'commonjs' } }).code;

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

function harness(mobile = true, localStorage = storage()) {
  const state = [];
  let cursor = 0;
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    }, useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Event: class Event {}, window: { localStorage, dispatchEvent() {} },
    require: name => name === 'react' ? hooks : name.includes('ErrorBoundary') ? ({ children }) => children
      : name === 'lucide-react' ? require(name)
      : name.includes('leadPerformance') ? { isMobileLeadDevice: () => mobile }
      : { readTableView, writeTableView } });
  return { ...exports, render(props) { cursor = 0; return exports.default(props); } };
}

function fixture(count, onClick = () => {}) {
  return React.createElement('table', { 'data-column-resize-managed': true },
    React.createElement('thead', null, React.createElement('tr', null,
      React.createElement('th', null, 'Name'), React.createElement('th', null, 'Action'))),
    React.createElement('tbody', null, Array.from({ length: count }, (_, id) =>
      React.createElement('tr', { key: id, onClick }, React.createElement('td', null, `Synthetic ${id}`),
        React.createElement('td', null, React.createElement('button', { onClick }, 'Open'))))));
}

function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  if (!React.isValidElement(tree)) return [];
  if (typeof tree.type === 'function' && ['TableViewToggle', 'TileFields'].includes(tree.type.name)) return nodes(tree.type(tree.props), type);
  return [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, type))];
}

test('mobile defaults to tiles, bounds mounted records, and keeps original action handlers', () => {
  const view = harness();
  const action = () => {};
  const table = fixture(120, action);
  const tree = view.render({ id: 'attendance-history', children: table });
  assert.equal(nodes(tree, 'article').length, 25);
  assert.equal(nodes(tree, 'table').length, 0, 'no hidden duplicate table DOM');
  assert.equal(nodes(tree, 'article')[0].props.onClick, action);
  assert.equal(nodes(tree, 'button').find(button => button.props.children === 'Open').props.onClick, action);
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes('Name') && html.includes('Synthetic 0'));
  assert.ok(!html.includes('Synthetic 25'));
  nodes(tree, 'button').find(button => button.props.children === 'Next tiles').props.onClick();
  const next = renderToStaticMarkup(view.render({ id: 'attendance-history', children: table }));
  assert.ok(next.includes('Synthetic 25') && !next.includes('Synthetic 0'));
});

test('desktop and mobile show the icon toggle and Table keeps original resizing/controls', () => {
  const table = fixture(3);
  for (const mobile of [false, true]) {
    const view = harness(mobile);
    const first = view.render({ id: 'users', children: table });
    const buttons = nodes(first, 'button').filter(button => ['Table View', 'Tiles View'].includes(button.props.title));
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].props['aria-pressed'], !mobile);
    assert.equal(buttons[1].props['aria-pressed'], mobile);
    const html = renderToStaticMarkup(first);
    assert.equal((html.match(/<svg/g) || []).length, 2);
    buttons[0].props.onClick();
    const changed = view.render({ id: 'users', children: table });
    assert.equal(nodes(changed, 'table')[0].props, table.props);
    assert.equal(nodes(changed, 'article').length, 0);
    assert.equal(table.props['data-column-resize-managed'], true);
  }
});

test('desktop Tiles works, preserves record actions, and restores its saved choice on remount', () => {
  const saved = storage();
  const action = () => {};
  const table = fixture(120, action);
  const view = harness(false, saved);
  const first = view.render({ id: 'users', children: table });
  nodes(first, 'button').find(button => button.props.title === 'Tiles View').props.onClick();
  const changed = view.render({ id: 'users', children: table });
  assert.equal(nodes(changed, 'article').length, 25);
  assert.equal(nodes(changed, 'table').length, 0);
  assert.equal(nodes(changed, 'article')[0].props.onClick, action);
  assert.equal(nodes(changed, 'button').find(button => button.props.children === 'Open').props.onClick, action);
  assert.equal(nodes(harness(false, saved).render({ id: 'users', children: table }), 'article').length, 25);
  assert.equal(nodes(harness(false, saved).render({ id: 'other-users', children: table }), 'table').length, 1);
  assert.equal(readTableView('users', true, saved), 'tiles', 'desktop choice does not overwrite the mobile default');
});

test('compact tiles show six summary fields and lazily expand the rest without losing controls', () => {
  const selectAll = () => {}, selectRow = () => {}, filter = () => {}, edit = () => {};
  const keys = ['id', 'created_at', 'source', 'entry_by', 'status', 'phone', 'company', 'notes', 'city'];
  const table = React.createElement('table', null,
    React.createElement('thead', null, React.createElement('tr', null,
      React.createElement('th', null, React.createElement('input', { type: 'checkbox', onChange: selectAll })),
      React.createElement('th', null, 'Actions'),
      ...keys.map(key => React.createElement('th', { key },
        React.createElement('span', null, key), React.createElement('button', { onClick: filter, title: `Filter ${key}` }, 'Filter'),
        React.createElement('div', { style: { cursor: 'col-resize' }, 'data-column-resize-handle': true }))))),
    React.createElement('tbody', null, React.createElement('tr', { key: 'lead-1' },
      React.createElement('td', null, React.createElement('input', { type: 'checkbox', onChange: selectRow })),
      React.createElement('td', null, React.createElement('button', { onClick: edit }, 'Edit')),
      ...keys.map(key => React.createElement('td', { key }, `value-${key}`)))));
  const view = harness();
  const props = { id: 'compact', children: table, summaryKeys: ['company', 'id', 'phone', 'status', 'source', 'city'] };
  let tree = view.render(props);
  const card = nodes(tree, 'article')[0];
  assert.equal(nodes(card, 'div').filter(node => 'data-tile-field' in node.props).length, 6);
  assert.ok(renderToStaticMarkup(card).includes('value-company'));
  assert.ok(!renderToStaticMarkup(card).includes('value-notes'));
  assert.equal(nodes(card, 'input').length, 1, 'select-all checkbox does not repeat in each tile');
  assert.equal(nodes(card, 'input')[0].props.onChange, selectRow);
  assert.equal(nodes(card, 'button').find(button => button.props.children === 'Edit').props.onClick, edit);
  assert.ok(!nodes(card, 'button').some(button => button.props.title?.startsWith('Filter')));
  assert.equal(nodes(tree, 'input').find(node => node.props.onChange === selectAll).props.onChange, selectAll);
  assert.equal(nodes(tree, 'button').find(node => node.props.title === 'Filter company').props.onClick, filter);
  assert.ok(!renderToStaticMarkup(tree).includes('data-column-resize-handle'));
  const expand = nodes(card, 'button').find(button => button.props['aria-expanded'] === false);
  expand.props.onClick({ stopPropagation() {} });
  tree = view.render(props);
  const expanded = nodes(tree, 'article')[0];
  assert.equal(nodes(expanded, 'div').filter(node => 'data-tile-field' in node.props).length, 9);
  assert.ok(renderToStaticMarkup(expanded).includes('value-notes'));
  nodes(expanded, 'button').find(button => button.props['aria-expanded'] === true).props.onClick({ stopPropagation() {} });
  assert.ok(!renderToStaticMarkup(nodes(view.render(props), 'article')[0]).includes('value-notes'));
});

test('a toolbar-controlled view hides the duplicate toggle and follows both modes', () => {
  const view = harness(false);
  const children = fixture(1);
  const tiles = view.render({ id: 'report', children, view: 'tiles', hideToggle: true });
  assert.equal(nodes(tiles, 'article').length, 1);
  assert.equal(nodes(tiles, 'div').filter(node => node.props['aria-label'] === 'Data view').length, 0);
  const table = view.render({ id: 'report', children, view: 'table', hideToggle: true });
  assert.equal(nodes(table, 'table')[0].props, children.props);
  assert.equal(nodes(table, 'article').length, 0);
});

test('preferences are independent by table/device and blocked storage still permits switching', () => {
  const saved = storage();
  writeTableView('users', true, 'table', saved);
  assert.equal(readTableView('users', true, saved), 'table');
  assert.equal(readTableView('users', false, saved), 'table');
  assert.equal(readTableView('leads', true, saved), 'tiles');
  writeTableView('users', false, 'tiles', saved);
  assert.equal(readTableView('users', true, saved), 'table');
  const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } };
  const view = harness(true, blocked);
  const tree = view.render({ id: 'users', children: fixture(1) });
  nodes(tree, 'button').find(button => button.props.title === 'Table View').props.onClick();
  assert.equal(nodes(view.render({ id: 'users', children: fixture(1) }), 'table').length, 1);
});

test('fragments, empty states, nested tables, and Markdown table nodes keep the correct cells', () => {
  const view = harness();
  const nested = fixture(1);
  const table = React.createElement('table', null, React.createElement('tbody', null,
    React.createElement(React.Fragment, null, React.createElement('tr', null,
      React.createElement('td', { colSpan: 2 }, nested)))));
  const tiles = view.getTileRows(table);
  assert.equal(tiles.length, 1, 'nested table rows are not duplicated as parent tiles');
  assert.equal(tiles[0].cells[0].props.children, nested);
  const Tag = props => React.createElement(props.node.tagName, null, props.children);
  const markdown = React.createElement('table', null, React.createElement(Tag, { node: { tagName: 'tbody' } },
    React.createElement(Tag, { node: { tagName: 'tr' } }, React.createElement(Tag, { node: { tagName: 'td' } }, 'Content'))));
  assert.equal(view.getTileRows(markdown)[0].cells[0].props.children, 'Content');
  const custom = () => null;
  assert.equal(view.getTileRows(React.createElement('table', null, React.createElement('tbody', null, React.createElement(custom)))), null);
});

const leadSource = fs.readFileSync(new URL('../src/components/LeadTable.jsx', import.meta.url), 'utf8');
const leadAst = parser.parse(leadSource, { sourceType: 'module', plugins: ['jsx'] });
const leadBody = leadAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body;
const declaration = name => leadBody.flatMap(node => node.declarations || []).find(node => node.id.name === name);
const context = { ...normalization, filterNormalizedSetMap: new WeakMap(), teamMembers: [{ user_id: 'agent', emp_name: 'Test Agent' }],
  teamMemberMap: new Map([['agent', 'Test Agent']]) };
const setNode = leadAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'getNormalizedFilterSet');
context.getNormalizedFilterSet = vm.runInNewContext(`(${leadSource.slice(setNode.start, setNode.end)})`, context);
for (const name of ['customGlobalFilterFn', 'multiSelectFilter']) {
  const init = declaration(name).init;
  const node = init.type === 'CallExpression' ? init.arguments[0] : init;
  context[name] = vm.runInNewContext(`(${leadSource.slice(node.start, node.end)})`, context);
}
const mobileFilterNode = declaration('mobileFilteredData').init.arguments[0];
const filterRows = vm.runInNewContext(`(${leadSource.slice(mobileFilterNode.start, mobileFilterNode.end)})`, context);

test('mobile filters match the real desktop table for search, phones, status, assignment and locations', () => {
  // TanStack detects functions with instanceof Function; wrap VM functions in
  // this realm so the real desktop engine does not silently ignore them.
  const columns = ['id', 'name', 'status', 'assigned_to', 'state_name'].map(accessorKey => ({ accessorKey,
    filterFn: (...args) => context.multiSelectFilter(...args) }));
  const data = [
    { id: 1, name: 'Alpha', status: 'New', state_name: 'Delhi', assigned_to: 'agent', _searchText: 'alpha test agent', _searchDigits: '919876543210' },
    { id: 2, name: 'Beta', status: '2; Contact', state_name: 'Gujarat', assigned_to: null, _searchText: 'beta contact', _searchDigits: '918888777766' }
  ];
  for (const scenario of [
    { query: '', filters: [] }, { query: '9876-5432', filters: [] }, { query: 'alpha', filters: [] },
    { query: '', filters: [{ id: 'status', value: '1;' }] },
    { query: '', filters: [{ id: 'assigned_to', value: ['Test Agent'] }] },
    { query: '', filters: [{ id: 'state_name', value: ['Delhi'] }] },
    { query: 'missing', filters: [] }, { query: 'beta', filters: [{ id: 'status', value: '2;' }] }
  ]) {
    Object.assign(context, { leadProfile: { mobile: true }, stageFilteredData: data, finalColumns: columns,
      readLeadRow: createLeadRowReader(columns), globalFilter: scenario.query, columnFilters: scenario.filters });
    const actual = Array.from(filterRows(), row => row.id);
    const desktop = createTable({ data, columns, state: { globalFilter: scenario.query, columnFilters: scenario.filters },
      onStateChange() {}, renderFallbackValue: null, globalFilterFn: (...args) => context.customGlobalFilterFn(...args),
      getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel() });
    assert.deepEqual(actual, desktop.getFilteredRowModel().rows.map(row => row.original.id), JSON.stringify(scenario));
  }
});

test('45,000 mobile leads create only current-page TanStack rows, with accurate full counts', () => {
  const data = Array.from({ length: 45000 }, (_, id) => ({ id }));
  const page = getMobileLeadPage(data, { pageIndex: 2, pageSize: 15 });
  // Evaluate the real component's data/pagination configuration so a future
  // accidental return to passing the full list fails this memory regression.
  const componentOptions = declaration('table').init.arguments[0];
  const keys = ['data', 'manualFiltering', 'manualPagination', 'rowCount', 'getRowId', 'state', 'onPaginationChange'];
  const optionText = componentOptions.properties.filter(property => keys.includes(property.key.name))
    .map(property => leadSource.slice(property.start, property.end)).join(',');
  let nextPagination;
  const options = vm.runInNewContext(`({${optionText}})`, {
    leadProfile: { mobile: true }, mobilePage: page, stageFilteredData: data, mobileFilteredData: data,
    pagination: page.pagination, globalFilter: '', columnFilters: [], columnVisibility: {}, columnOrder: [], columnSizing: {},
    setPagination: updater => { nextPagination = updater(page.pagination); }
  });
  const table = createTable({ ...options, columns: [{ accessorKey: 'id' }],
    onStateChange() {}, renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() });
  assert.equal(table.getCoreRowModel().rows.length, 15);
  assert.equal(table.getRowModel().rows[0].original.id, 30);
  assert.equal(table.getPageCount(), 3000);
  assert.equal(table.getCanNextPage(), true);
  table.nextPage();
  assert.equal(nextPagination.pageIndex, 3);
  assert.equal(getMobileLeadPage(data, { pageIndex: 0, pageSize: 100000 }).rows.length, 100);
  assert.equal(getMobileLeadPage([], { pageIndex: 500, pageSize: 100000 }).pagination.pageIndex, 0);
});

test('mobile IndexedDB pages preserve all scoped rows, yield between pages, and reject incomplete reads', async () => {
  const data = Array.from({ length: 1201 }, (_, id) => ({ id: id + 1, __cacheScope: id % 2 ? 'other' : 'user', __cacheGeneration: 'g1' }));
  let largestRequest = 0, yields = 0, preview;
  const db = { transaction() { return { objectStore() { return { getAll(range, count) {
    largestRequest = Math.max(largestRequest, count);
    const request = {};
    queueMicrotask(() => { request.result = data.filter(row => !range || row.id > range.after).slice(0, count); request.onsuccess(); });
    return request;
  } }; } }; } };
  const rows = await readLeadCacheInPages(db, 'leads', { scope: 'user', generation: 'g1',
    keyRange: { lowerBound: after => ({ after }) }, onPreview: value => { preview = value; },
    yieldTask: async () => { yields++; } });
  assert.equal(rows.length, 601);
  assert.equal(largestRequest, 250);
  assert.equal(yields, 4);
  assert.equal(preview.length, 100);
  assert.ok(rows.every(row => row.__cacheScope === 'user'));
  await assert.rejects(readLeadCacheInPages({ transaction() { throw new Error('Unavailable'); } }, 'leads',
    { scope: 'user', generation: 'g1', keyRange: {} }), /Unavailable/);
});

test('every standard CRM table has a stable explicit mobile view boundary', () => {
  let count = 0;
  const visitFile = file => {
    const text = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(text, { sourceType: 'module', plugins: ['jsx'] });
    function visit(node, wrapped = false) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'JSXElement') {
        if (node.openingElement.name.name === 'MobileTableView') wrapped = true;
        if (node.openingElement.name.name === 'table') {
          count++;
          assert.ok(wrapped, `Unwrapped standard table: ${file}`);
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => visit(child, wrapped));
        else if (value && typeof value === 'object') visit(value, wrapped);
      }
    }
    visit(ast.program);
  };
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) scan(file);
      else if (/\.jsx?$/.test(entry.name) && entry.name !== 'LeadTable.jsx') visitFile(file);
    }
  }
  scan(fileURLToPath(new URL('../src/components', import.meta.url)));
  assert.ok(count >= 71);
});
