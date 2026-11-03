import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import * as transfer from '../src/utils/endCustomerTransfer.js';
import { getSubItemPermissions } from '../src/utils/permissionUtils.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const parties = [
  { id: 'internal-party-id', firm_name: 'Sujit Agro', party_universal_code: 'PTY-NSMLR-100002', district_name: 'Amritsar', our_company: 'NSMLR' },
  { id: 'nstlp-party-id', firm_name: 'NSTLP Dealer', party_universal_code: 'PTY-NSTLP-200001', district_name: 'Ludhiana', our_company: 'NSTL' }
];
const products = [{ id: 'internal-product-id', name: 'Mini Rotavator', sku: '0000653', category: 'Implement' }, { id: 'leveller-id', name: 'Laser Land Leveller', sku: 'LASER-01', category: 'Land Leveller' }];
const lookups = { parties, products, districtsByState: { Punjab: ['Ludhiana', 'Amritsar'], Haryana: ['Karnal'] } };
const customer = (overrides = {}) => ({ full_name: 'Ramesh Singh', mobile_1: '9876543210', product_name: 'Mini Rotavator',
  state_name: 'Punjab', district_name: 'Ludhiana', linked_party_name: 'Sujit Agro [PTY-NSMLR-100002]', purchase_date: '2026-10-29', chassis_serial_number: 'CH-001', ...overrides });
const validate = (rows, options = {}) => transfer.validateEndCustomerRows(rows, { ...lookups, ...options });

test('master-backed mapping normalizes phones, preserves text codes and ignores supplied internal IDs', () => {
  const [row] = validate([customer({ mobile_1: '+91 98765 43210', product_sku: '0000653', linked_party_id: 'wrong-tenant', product_id: 'forged' })]);
  assert.equal(row.status, 'ready');
  assert.equal(row.data.mobile_1, '9876543210');
  assert.equal(row.data.linked_party_id, parties[0].id);
  assert.equal(row.data.product_id, products[0].id);
  assert.equal(row.data.product_sku, '0000653');
  assert.equal(row.data.warranty_months, 12);
  assert.equal(validate([customer({ product_name: 'Laser Land Leveller' })])[0].data.warranty_months, 24);
});

test('bad master references, inconsistent codes and cross-state districts fail preview', () => {
  for (const change of [{ linked_party_code: 'OTHER-TENANT' }, { linked_party_name: 'Invented Dealer' },
    { product_name: 'Wrong Model' }, { product_sku: 'WRONG' }, { district_name: 'Karnal' },
    { full_name: '' }, { mobile_1: '123' }, { email_1: 'invalid' }, { pin_code: '123' }, { warranty_months: '1.5' },
    { purchase_date: '2026-02-30' }]) {
    assert.equal(validate([customer(change)])[0].status, 'invalid', JSON.stringify(change));
  }
  assert.equal(validate([customer({ product_sku: '0000653' })], { products: [...products, { id: 'another', name: 'Mini Rotavator', sku: 'OTHER' }] })[0].status, 'ready');
  assert.equal(validate([customer()], { products: [...products, { id: 'another', name: 'Mini Rotavator', sku: 'OTHER' }] })[0].status, 'invalid');
});

test('duplicates are skipped without preventing the same owner from registering a different machine', () => {
  const results = validate([customer(), customer(), customer({ chassis_serial_number: 'CH-002' })]);
  assert.deepEqual(results.map(r => r.status), ['ready', 'duplicate', 'ready']);
  assert.equal(validate([customer()], { existingCustomers: [customer()] })[0].status, 'duplicate');
  assert.equal(validate([customer({ customer_code: 'CUST-OLD', chassis_serial_number: 'CH-NEW' })], { existingCustomers: [customer({ customer_code: 'CUST-OLD' })] })[0].status, 'duplicate');
});

test('IST dates cover the UTC day boundary, Indian dates, leap days and Excel serials', () => {
  assert.equal(transfer.getISTDate(new Date('2026-10-28T20:00:00Z')), '2026-10-29');
  assert.equal(transfer.normalizeImportDate('29-10-2026'), '2026-10-29');
  assert.equal(transfer.normalizeImportDate('29/02/2024'), '2024-02-29');
  assert.equal(transfer.normalizeImportDate('29/02/2025'), null);
  assert.equal(transfer.normalizeImportDate(25569), '1970-01-01');
  assert.equal(transfer.normalizeImportDate(''), '');
});

test('CSV round-trip preserves quotes, multiline Hindi text and number-like strings', async () => {
  const original = customer({ full_name: 'राम "Singh", Kumar', full_address: 'Village #1\nNear Water Tank', product_sku: '0000653', purchase_invoice_no: '000012' });
  const csv = await transfer.createEndCustomerCSV([original]);
  const rows = await transfer.parseEndCustomerFile({ name: 'customers.csv', size: Buffer.byteLength(csv), text: async () => csv }, 'csv');
  assert.equal(rows[0].full_name, original.full_name);
  assert.equal(rows[0].full_address, original.full_address);
  assert.equal(rows[0].mobile_1, '9876543210');
  assert.equal(rows[0].product_sku, '0000653');
  assert.equal(rows[0].purchase_invoice_no, '000012');
  assert.equal(validate(rows)[0].status, 'ready');
  const unsafe = await transfer.createEndCustomerCSV([customer({ full_name: '=HYPERLINK("bad")' })]);
  assert.match(unsafe, /'=HYPERLINK/);
  const exported = transfer.exportEndCustomerRows([{ ...original, warranty_info: { status: 'ACTIVE', expiryDate: '2027-10-29' } }], () => 3);
  assert.equal(exported[0].warranty_expiry_date, '2027-10-29');
  assert.equal(exported[0].complaints_count, 3);
});

test('templates share headers and XLSX contains working master lists, dependent district validation and frozen headers', async () => {
  const template = await transfer.createEndCustomerWorkbook([], { template: true, ...lookups });
  const buffer = await template.xlsx.writeBuffer();
  const ExcelJS = (await import('exceljs')).default;
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  const sheet = restored.getWorksheet('End Customers');
  assert.deepEqual(sheet.getRow(1).values.slice(1), transfer.END_CUSTOMER_COLUMNS.map(c => c.label));
  assert.equal(sheet.views[0].state, 'frozen');
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(restored.getWorksheet('Lookups').state, 'veryHidden');
  for (const address of ['I2', 'O2', 'P2', 'Q2', 'R2', 'Q1001', 'Z2', 'Z1001']) assert.equal(sheet.getCell(address).dataValidation.type, 'list');
  assert.deepEqual(sheet.getCell('Z2').dataValidation.formulae, ['EC_Companies']);
  assert.match(sheet.getCell('J2').dataValidation.formulae[0], /VLOOKUP\(\$I2,EC_StateDistrictMap/);
  assert.match(sheet.getCell('J1001').dataValidation.formulae[0], /\$I1001/);
  assert.ok(restored.definedNames.getRanges('EC_Products').ranges.length);
  assert.equal(sheet.getCell('C2').numFmt, '@');
  const lookupValues = [];
  restored.getWorksheet('Lookups').eachRow(row => row.eachCell(cell => lookupValues.push(String(cell.value))));
  assert.ok(lookupValues.includes('Sujit Agro [PTY-NSMLR-100002]'));
  assert.ok(!lookupValues.includes('internal-party-id'));
  await assert.rejects(transfer.parseEndCustomerFile({ name: 'blank.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer }, 'xlsx'), /No customer rows/);
});

test('Excel export round-trip keeps text formatting and rejects formulas or oversized/mismatched files', async () => {
  const workbook = await transfer.createEndCustomerWorkbook([customer({ product_sku: '0000653', purchase_invoice_no: '000012' })]);
  let buffer = await workbook.xlsx.writeBuffer();
  const file = () => ({ name: 'customers.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer });
  const parsed = await transfer.parseEndCustomerFile(file(), 'xlsx');
  assert.equal(parsed[0].product_sku, '0000653');
  assert.equal(validate(parsed)[0].status, 'ready');
  workbook.getWorksheet('End Customers').getCell('B2').value = { formula: '1+1', result: 2 };
  buffer = await workbook.xlsx.writeBuffer();
  await assert.rejects(transfer.parseEndCustomerFile(file(), 'xlsx'), /Formula found/);
  await assert.rejects(transfer.parseEndCustomerFile({ name: 'x.xls', size: 100 }, 'xlsx'), /Select a .xlsx/);
  await assert.rejects(transfer.parseEndCustomerFile({ name: 'x.csv', size: 6 * 1024 * 1024 }, 'csv'), /5 MB/);
  assert.throws(() => transfer.recordsFromMatrix([['Full Name', 'Mobile 1']]), /Missing required column/);
  assert.throws(() => transfer.recordsFromMatrix([['Full Name', 'Mobile 1', 'Product Model', 'full_name']]), /Duplicate column/);
  assert.throws(() => transfer.recordsFromMatrix([['Full Name', 'Mobile 1', 'Product Model'], ...Array.from({ length: 1001 }, () => ['x', '9876543210', 'Mini Rotavator'])]), /1000 records/);
});

// Server actions are exercised with an in-memory filesystem and database. No live records are written.
const serverCode = (await swc.transform(fs.readFileSync(new URL('../src/app/actions/endCustomers.js', import.meta.url), 'utf8'), {
  filename: 'endCustomers.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
})).code;

function server({ user = { id: 'user-1' }, role = { role: 'admin', tenant_id: '00000000-0000-0000-0000-000000000001' }, initial = {}, existing = [], readError = null, insertError = null, corruptLocal = false, failWrite = false,
  rpcError = null, counterState = {}, now = null } = {}) {
  let local = structuredClone(initial);
  let writes = 0;
  const inserted = [];
  const reads = [];
  const reservations = [];
  const db = {
    async rpc(name, args) {
      assert.equal(name, 'reserve_end_customer_codes');
      reservations.push(args);
      if (rpcError) return { error: rpcError };
      const key = `${args.p_tenant_id}:${args.p_year}`;
      const pattern = new RegExp(`^CUST-${args.p_year}-([0-9]{1,15})$`);
      let maximum = Math.max(counterState[key] || 0, args.p_minimum);
      for (const row of [...existing, ...inserted]) {
        if (row.tenant_id && row.tenant_id !== args.p_tenant_id) continue;
        const match = String(row.customer_code || '').match(pattern);
        if (match) maximum = Math.max(maximum, Number(match[1]));
      }
      counterState[key] = maximum + args.p_count;
      return { data: [{ first_value: maximum + 1, last_value: counterState[key] }] };
    },
    from(table) {
    const query = { select() { return this; }, eq(key, value) { this[key] = value; return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() { return { data: table === 'user_roles' ? role : null }; },
      async range(start, end) { reads.push({ table, tenant: this.tenant_id }); return { data: [...existing, ...inserted].filter(row => !row.tenant_id || row.tenant_id === this.tenant_id).slice(start, end + 1), error: readError }; },
      insert(payloads) { this.payloads = structuredClone(payloads); return this; },
      finishInsert() { if (!insertError && !readError && !this.saved) { inserted.push(...this.payloads); this.saved = true; } return { data: this.payloads, error: insertError || readError }; },
      async single() { const result = this.finishInsert(); return { ...result, data: result.error ? null : result.data[0] }; },
      then(resolve) {
        if (this.payloads) return Promise.resolve(this.finishInsert()).then(resolve);
        if (table === 'end_customers') { reads.push({ table, tenant: this.tenant_id }); return Promise.resolve({ data: [...existing, ...inserted].filter(row => !row.tenant_id || row.tenant_id === this.tenant_id), error: readError }).then(resolve); }
        return Promise.resolve({ data: table === 'location_states' ? [{ id: 'pb', name: 'Punjab' }] : [{ state_id: 'pb', name: 'Ludhiana' }] }).then(resolve);
      }
    };
    return query;
  } };
  const sandboxModule = { exports: {} };
  const mocks = {
    '@supabase/supabase-js': { createClient: () => db },
    'fs/promises': { access: async () => {}, readFile: async () => corruptLocal ? '{bad json' : JSON.stringify(local), mkdir: async () => {}, writeFile: async (_path, value) => { if (failWrite) throw new Error('disk error'); writes++; local = JSON.parse(value); } },
    '@/utils/warrantyUtils': { calculateWarrantyStatus: () => ({ status: 'ACTIVE' }) },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/utils/permissionUtils': { getSubItemPermissions },
    '@/app/actions/partyMaster': { getPartyList: async tenant => { assert.equal(tenant, '00000000-0000-0000-0000-000000000001'); return { data: parties }; } },
    '@/app/actions/tenantProducts': { getTenantProducts: async () => ({ success: true, products }) },
    '@/config/indianStateDistricts': { INDIAN_STATE_DISTRICTS: lookups.districtsByState },
    '@/config/productCatalog': { PRODUCT_GROUPS: products },
    '@/utils/endCustomerTransfer': transfer
  };
  const Clock = now ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  } : Date;
  vm.runInNewContext(serverCode, { module: sandboxModule, exports: sandboxModule.exports, require: name => mocks[name] || require(name), Date: Clock,
    process: { cwd: () => 'E:/mock-workspace', env: { NEXT_PUBLIC_SUPABASE_URL: 'https://mock.invalid', SUPABASE_SERVICE_ROLE_KEY: 'mock-only' } }, console, Buffer, URL, setTimeout });
  return { actions: sandboxModule.exports, inserted, reads, reservations, counterState, get local() { return local; }, get writes() { return writes; } };
}

test('import revalidates and persists only new valid rows for the authenticated tenant', async () => {
  const app = server({ initial: { TNT00003: [{ id: 'other-tenant' }] }, existing: [customer({ chassis_serial_number: 'OLD' })] });
  const result = await app.actions.bulkImportEndCustomers([customer({ tenant_id: 'TNT00003', id: 'forged', linked_party_id: 'forged' }), customer({ chassis_serial_number: 'OLD' }), customer({ mobile_1: 'bad' })], 'TNT00002');
  assert.equal(result.success, true);
  assert.equal(result.imported, 1);
  assert.deepEqual(Array.from(result.results, r => r.status), ['imported', 'duplicate', 'invalid']);
  assert.equal(app.inserted[0].tenant_id, 'TNT00002');
  assert.equal(app.inserted[0].linked_party_id, parties[0].id);
  assert.notEqual(app.inserted[0].id, 'forged');
  assert.equal(app.local.TNT00003[0].id, 'other-tenant');
  assert.equal(app.local.TNT00002.length, 1);
  assert.ok(app.reads.every(read => read.tenant === 'TNT00002'));
});

test('sign-in, add permission, tenant boundary and batch size are enforced before writes', async () => {
  const noUser = server({ user: null });
  assert.equal((await noUser.actions.bulkImportEndCustomers([customer()], 'TNT00002')).success, false);
  const restricted = server({ role: { role: 'executive', company: 'New Swan Group', module_access: { channel_ops: { view: true, add: false, sub_items: { end_customers: { view: true } } } } } });
  assert.equal((await restricted.actions.bulkImportEndCustomers([customer()], 'TNT00002')).success, false);
  const otherTenant = server();
  assert.match((await otherTenant.actions.bulkImportEndCustomers([customer()], 'TNT00003')).error, /Workspace access denied/);
  assert.equal((await otherTenant.actions.bulkImportEndCustomers(Array(26).fill(customer()), 'TNT00002')).success, false);
  for (const app of [noUser, restricted, otherTenant]) { assert.equal(app.inserted.length, 0); assert.equal(app.writes, 0); }
});

test('database errors do not claim success or overwrite local data; corrupt backups stop safely', async () => {
  for (const options of [{ readError: { code: 'network' } }, { insertError: { code: '23505' } }, { corruptLocal: true }]) {
    const app = server({ ...options, initial: { TNT00002: [{ id: 'keep' }] } });
    assert.equal((await app.actions.bulkImportEndCustomers([customer()], 'TNT00002')).success, false);
    assert.equal(app.writes, 0);
    assert.equal(app.local.TNT00002[0].id, 'keep');
  }
  const backupFailure = server({ failWrite: true });
  const result = await backupFailure.actions.bulkImportEndCustomers([customer()], 'TNT00002');
  assert.equal(result.success, true);
  assert.equal(result.imported, 1);
  assert.match(result.warning, /backup could not be updated/);
});

test('missing-table local fallback is explicit and retries/concurrent batches skip saved chassis', async () => {
  const localApp = server({ readError: { code: '42P01' }, initial: { TNT00003: [{ id: 'keep' }] } });
  const saved = await localApp.actions.bulkImportEndCustomers([customer()], 'TNT00002');
  assert.equal(saved.imported, 1);
  assert.match(saved.warning, /local customer storage/);
  assert.equal(localApp.inserted.length, 0);
  assert.equal((await localApp.actions.bulkImportEndCustomers([customer()], 'TNT00002')).imported, 0);
  const app = server();
  const results = await Promise.all([app.actions.bulkImportEndCustomers([customer()], 'TNT00002'), app.actions.bulkImportEndCustomers([customer()], 'TNT00002')]);
  assert.equal(results.reduce((sum, result) => sum + result.imported, 0), 1);
  assert.equal(app.local.TNT00002.length, 1);
});

test('legacy UUID reads use the same tenant code as import and preserve independent tenants', async () => {
  const app = server({ initial: { TNT00001: [{ full_name: 'HQ customer' }], TNT00002: [{ full_name: 'Swan customer' }], TNT00003: [{ full_name: 'Test customer' }] } });
  for (const [id, name] of [['00000000-0000-0000-0000-000000000001', 'Swan customer'], ['0a37b8e8-1c28-4e19-8891-951fc3f8f8af', 'HQ customer'], ['922d3e72-6588-457f-a562-4f1bdbf10d98', 'Test customer']]) {
    assert.equal((await app.actions.getEndCustomers(id))[0].full_name, name);
  }
  assert.equal(app.writes, 0);
});

test('manual registration during an import retains both local records and the existing API response', async () => {
  const app = server({ initial: { TNT00003: [{ id: 'keep' }] } });
  const [imported, manual] = await Promise.all([
    app.actions.bulkImportEndCustomers([customer()], 'TNT00002'),
    app.actions.createEndCustomer(customer({ full_name: 'Manual customer', chassis_serial_number: 'MANUAL-001' }), '00000000-0000-0000-0000-000000000001')
  ]);
  assert.equal(imported.imported, 1);
  assert.equal(manual.success, true);
  assert.equal(manual.customer.tenant_id, 'TNT00002');
  assert.equal(app.local.TNT00002.length, 2);
  assert.equal(app.local.TNT00003[0].id, 'keep');
});

test('manual and bulk registrations share one increasing sequence and retain previous IDs', async () => {
  const app = server({ now: '2026-10-29T00:00:00Z', existing: [customer({ customer_code: 'CUST-2026-00012' }), customer({ customer_code: 'CUST-2026-DEADBEEF' })],
    initial: { TNT00002: [customer({ customer_code: 'CUST-2026-00017' })] } });
  const manual = await app.actions.createEndCustomer(customer(), 'TNT00002');
  assert.equal(manual.customer.customer_code, 'CUST-2026-00018');
  const imported = await app.actions.bulkImportEndCustomers([customer({ chassis_serial_number: 'NEW-2' }), customer({ chassis_serial_number: 'NEW-3' })], 'TNT00002');
  assert.equal(imported.imported, 2);
  assert.deepEqual(app.inserted.map(row => row.customer_code), ['CUST-2026-00018', 'CUST-2026-00019', 'CUST-2026-00020']);
  assert.ok(app.local.TNT00002.some(row => row.customer_code === 'CUST-2026-00017'));
});

test('local-only sequence persists across restarts, crosses 99999 and keeps tenant/year counters independent', async () => {
  const options = { now: '2026-10-29T00:00:00Z', rpcError: { code: 'PGRST202' }, readError: { code: '42P01' } };
  const first = server({ ...options, initial: { TNT00002: [customer({ customer_code: 'CUST-2026-99999' })], TNT00003: [{ customer_code: 'CUST-2026-999999' }] } });
  const manual = await first.actions.createEndCustomer(customer(), 'TNT00002');
  assert.equal(manual.customer.customer_code, 'CUST-2026-100000');
  assert.equal(first.local._customer_code_counters.TNT00002['2026'], 100000);
  const restarted = server({ ...options, initial: first.local });
  const next = await restarted.actions.createEndCustomer(customer({ chassis_serial_number: 'SECOND' }), 'TNT00002');
  assert.equal(next.customer.customer_code, 'CUST-2026-100001');
  const anotherTenant = await restarted.actions.createEndCustomer(customer(), 'TNT00001');
  assert.equal(anotherTenant.customer.customer_code, 'CUST-2026-00001');
  const nextYear = server({ ...options, now: '2026-12-31T20:00:00Z', initial: restarted.local });
  assert.equal((await nextYear.actions.createEndCustomer(customer(), 'TNT00002')).customer.customer_code, 'CUST-2027-00001');
});

test('overlapping process instances use disjoint database reservations', async () => {
  const counterState = {};
  const options = { now: '2026-10-29T00:00:00Z', counterState };
  const processes = [server(options), server(options), server(options)];
  const responses = await Promise.all(Array.from({ length: 24 }, (_, index) => processes[index % 3].actions.createEndCustomer(customer(), 'TNT00002')));
  assert.ok(responses.every(response => response.success));
  const numbers = responses.map(response => Number(response.customer.customer_code.split('-').at(-1))).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 24 }, (_, index) => index + 1));
  assert.equal(counterState['TNT00002:2026'], 24);
  const restarted = server({ ...options, counterState });
  assert.equal((await restarted.actions.createEndCustomer(customer(), 'TNT00002')).customer.customer_code, 'CUST-2026-00025');
});

test('counter failures never fall back to random IDs or an unsafe database-local sequence', async () => {
  for (const options of [{ rpcError: { code: 'PGRST202' } }, { rpcError: { code: 'network' } },
    { rpcError: { code: 'PGRST202' }, readError: { code: '42P01' }, failWrite: true },
    { rpcError: { code: 'PGRST202' }, readError: { code: '42P01' }, initial: { _customer_code_counters: 'corrupt' } }]) {
    const app = server(options);
    const result = await app.actions.createEndCustomer(customer(), 'TNT00002');
    assert.equal(result.success, false);
    assert.equal(app.inserted.length, 0);
    assert.equal(app.writes, 0);
  }
});

test('invalid and duplicate imports do not consume numbers; a failed save never reuses its reserved number', async () => {
  const counterState = {};
  const options = { now: '2026-10-29T00:00:00Z', counterState };
  const skipped = server({ ...options, existing: [customer()] });
  assert.equal((await skipped.actions.bulkImportEndCustomers([customer(), customer({ mobile_1: 'bad' })], 'TNT00002')).imported, 0);
  assert.equal(skipped.reservations.length, 0);
  const failed = server({ ...options, insertError: { code: 'network' } });
  assert.equal((await failed.actions.createEndCustomer(customer(), 'TNT00002')).success, false);
  const retried = server(options);
  assert.equal((await retried.actions.createEndCustomer(customer(), 'TNT00002')).customer.customer_code, 'CUST-2026-00002');
});

test('company selection filters dealers and rejects cross-company imports while older files remain compatible', () => {
  assert.equal(transfer.filterEndCustomerDealers(parties, '').length, 0);
  assert.deepEqual(transfer.filterEndCustomerDealers(parties, 'NSMLR').map(p => p.id), ['internal-party-id']);
  assert.deepEqual(transfer.filterEndCustomerDealers(parties, 'NSTLP').map(p => p.id), ['nstlp-party-id']);
  assert.equal(validate([customer({ our_company: 'NSTLP' })])[0].status, 'invalid');
  assert.equal(validate([customer({ our_company: 'UNRECOGNIZED' })])[0].status, 'invalid');
  const nstlp = customer({ linked_party_name: 'NSTLP Dealer [PTY-NSTLP-200001]' });
  assert.equal(validate([nstlp])[0].data.our_company, 'NSTLP');
  assert.equal(validate([customer()])[0].data.our_company, 'NSMLR');
  assert.equal(validate([customer({ linked_party_name: '' })])[0].data.our_company, 'NSMLR');
  assert.equal(validate([{ ...nstlp, our_company: 'NSTL' }])[0].status, 'ready');
  const oldFile = transfer.recordsFromMatrix([['Full Name', 'Mobile 1', 'Product Model'], ['Legacy Customer', '9876543210', 'Mini Rotavator']]);
  assert.equal(validate(oldFile)[0].status, 'ready');
  assert.equal(validate(oldFile)[0].data.our_company, 'NSMLR');
});

test('registration and imports persist company, validate the master dealer and retain the shared ID sequence', async () => {
  const app = server({ now: '2026-10-30T00:00:00Z' });
  const wrong = await app.actions.createEndCustomer(customer({ our_company: 'NSTLP', linked_party_id: parties[0].id }), 'TNT00002');
  assert.equal(wrong.success, false);
  assert.match(wrong.error, /does not belong/);
  const invalid = await app.actions.createEndCustomer(customer({ our_company: 'UNKNOWN' }), 'TNT00002');
  assert.equal(invalid.success, false);
  assert.equal(app.reservations.length, 0);
  const manual = await app.actions.createEndCustomer(customer({ our_company: 'NSTL', linked_party_id: parties[1].id, linked_party_code: parties[1].party_universal_code, linked_party_name: parties[1].firm_name }), 'TNT00002');
  assert.equal(manual.customer.our_company, 'NSTLP');
  assert.equal(manual.customer.customer_code, 'CUST-2026-00001');
  const imported = await app.actions.bulkImportEndCustomers([customer({ our_company: 'NSMLR', chassis_serial_number: 'COMPANY-NEW' })], 'TNT00002');
  assert.equal(imported.imported, 1);
  assert.equal(app.inserted[1].our_company, 'NSMLR');
  assert.equal(app.inserted[1].customer_code, 'CUST-2026-00002');
  assert.equal(app.local.TNT00002[0].our_company, 'NSMLR');
  const legacy = await app.actions.createEndCustomer(customer({ linked_party_id: parties[1].id }), 'TNT00002');
  assert.equal(legacy.customer.our_company, 'NSTLP');
  const oldIdFallback = await app.actions.createEndCustomer(customer({ linked_party_id: parties[0].id, linked_party_code: parties[0].id }), 'TNT00002');
  assert.equal(oldIdFallback.success, true);
  assert.equal(oldIdFallback.customer.our_company, 'NSMLR');
  assert.equal(oldIdFallback.customer.linked_party_id, parties[0].id);
  assert.equal(oldIdFallback.customer.linked_party_code, '');
});

test('CSV and Excel preserve Company Name and accept the Operating Company header alias', async () => {
  const original = customer({ our_company: 'NSTLP', linked_party_name: 'NSTLP Dealer [PTY-NSTLP-200001]' });
  const csv = await transfer.createEndCustomerCSV([original]);
  const csvRows = await transfer.parseEndCustomerFile({ name: 'company.csv', size: Buffer.byteLength(csv), text: async () => csv }, 'csv');
  assert.equal(csvRows[0].our_company, 'NSTLP');
  assert.equal(validate(csvRows)[0].status, 'ready');
  const workbook = await transfer.createEndCustomerWorkbook([original]);
  const buffer = await workbook.xlsx.writeBuffer();
  const xlsxRows = await transfer.parseEndCustomerFile({ name: 'company.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer }, 'xlsx');
  assert.equal(xlsxRows[0].our_company, 'NSTLP');
  const alias = transfer.recordsFromMatrix([['Full Name', 'Mobile 1', 'Product Model', 'Operating Company'], ['Example', '9876543210', 'Mini Rotavator', 'NSMLR']]);
  assert.equal(alias[0].our_company, 'NSMLR');
});

test('registration UI requires Company Name, clears the previous dealer on company change and submits the selected company', async () => {
  const source = fs.readFileSync(new URL('../src/components/Orders/modals/RegisterEndCustomerModal.jsx', import.meta.url), 'utf8');
  const code = (await swc.transform(source, { filename: 'RegisterEndCustomerModal.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' } })).code;
  const slots = [];
  let slot = 0;
  const saved = [];
  const mockReact = { ...React, useEffect() {}, useMemo: callback => callback(),
    useState(initial) { const index = slot++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = slot++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; }
  };
  const sandboxModule = { exports: {} };
  const mocks = { react: mockReact, 'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/config/indianStateDistricts': { INDIAN_STATE_DISTRICTS: lookups.districtsByState }, '@/config/productCatalog': { PRODUCT_GROUPS: products },
    '@/app/actions/tenantProducts': {}, '@/app/actions/centralLocationMaster': {}, '@/app/actions/partyMaster': {},
    '@/components/common/SearchableProductSelect': () => null,
    '@/app/actions/endCustomers': { createEndCustomer: async data => { saved.push({ ...data }); return { success: true, customer: data }; } },
    '@/utils/warrantyUtils': { calculateWarrantyStatus: () => ({ status: 'ACTIVE', daysRemaining: 365 }) }, '@/utils/endCustomerTransfer': transfer };
  vm.runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, require: name => mocks[name] || require(name), console });
  const props = { isOpen: true, onClose() {}, parties: [...parties, { id: 'private-database-id', firm_name: 'Dealer without code', our_company: 'NSMLR' }] };
  const render = () => { slot = 0; return sandboxModule.exports.default(props); };
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' && node.props ? [node, ...nodes(node.props.children)] : [];
  const find = (tree, predicate) => nodes(tree).find(predicate);
  const content = node => Array.isArray(node) ? node.map(content).join('') : node?.props ? content(node.props.children) : String(node ?? '');
  let tree = render();
  let company = find(tree, node => node.props.id === 'end-customer-company');
  assert.equal(company.props.required, true);
  assert.equal(find(tree, node => node.props.id === 'linked-dealer-input').props.disabled, true);
  company.props.onChange({ target: { value: 'NSMLR' } });
  tree = render();
  find(tree, node => node.props.id === 'linked-dealer-input').props.onFocus();
  tree = render();
  assert.ok(find(tree, node => node.type === 'strong' && content(node) === 'Sujit Agro'));
  assert.ok(!find(tree, node => node.type === 'strong' && content(node) === 'NSTLP Dealer'));
  find(tree, node => node.type === 'div' && node.props.onClick && content(node).startsWith('Sujit Agro')).props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.props.id === 'linked-dealer-input').props.readOnly, true);
  find(tree, node => node.props.id === 'end-customer-company').props.onChange({ target: { value: 'NSTLP' } });
  tree = render();
  const dealer = find(tree, node => node.props.id === 'linked-dealer-input');
  assert.equal(dealer.props.value, '');
  assert.equal(dealer.props.readOnly, false);
  dealer.props.onFocus();
  tree = render();
  assert.ok(!find(tree, node => node.type === 'strong' && content(node) === 'Sujit Agro'));
  find(tree, node => node.type === 'div' && node.props.onClick && content(node).startsWith('NSTLP Dealer')).props.onClick();
  tree = render();
  find(tree, node => node.props.placeholder === 'e.g. Ramesh Singh').props.onChange({ target: { value: 'UI Example' } });
  tree = render();
  find(tree, node => node.props.placeholder === '10-digit mobile number').props.onChange({ target: { value: '9876543210' } });
  tree = render();
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].our_company, 'NSTLP');
  assert.equal(saved[0].linked_party_id, parties[1].id);
  find(tree, node => node.props.id === 'end-customer-company').props.onChange({ target: { value: 'NSMLR' } });
  tree = render();
  find(tree, node => node.props.id === 'linked-dealer-input').props.onFocus();
  tree = render();
  find(tree, node => node.type === 'div' && node.props.onClick && content(node).startsWith('Dealer without code')).props.onClick();
  tree = render();
  assert.equal(find(tree, node => node.props.id === 'linked-dealer-input').props.value, 'Dealer without code');
  assert.ok(!content(tree).includes('private-database-id'));
});
