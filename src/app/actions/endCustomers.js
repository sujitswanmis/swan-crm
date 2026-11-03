'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { calculateWarrantyStatus } from '@/utils/warrantyUtils';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { getSubItemPermissions } from '@/utils/permissionUtils';
import { getPartyList } from '@/app/actions/partyMaster';
import { getTenantProducts } from '@/app/actions/tenantProducts';
import { INDIAN_STATE_DISTRICTS } from '@/config/indianStateDistricts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import { validateEndCustomerRows, IMPORT_BATCH_SIZE, END_CUSTOMER_COMPANIES, normalizeEndCustomerCompany, endCustomerDealerCompany, partyCode } from '@/utils/endCustomerTransfer';
import { randomUUID } from 'crypto';

const CUSTOMERS_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'end_customers.json');

const getAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Formats timestamp strictly in Indian Standard Time (IST, UTC+5:30)
function getISTTimestamp() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffsetMs);
  return istTime.toISOString().replace('Z', '+05:30');
}

function normalizeTenantCode(tenantId) {
  if (!tenantId) return 'TNT00002';
  const str = String(tenantId).trim();
  const known = IMPORT_TENANTS.find(tenant => [tenant.id, tenant.code, tenant.name].some(alias => alias.toLowerCase() === str.toLowerCase()));
  if (known) return known.code;
  if (str.toLowerCase().includes('testing')) return 'TNT00003';
  if (str === 'TNT00001' || str.toLowerCase().includes('supuja')) return 'TNT00001';
  if (str === 'TNT00002' || str.toLowerCase().includes('swan')) return 'TNT00002';
  if (str.startsWith('TNT')) return str;
  return 'TNT00002';
}

// Serialize only this module's local read-modify-write operations.
let customerWriteQueue = Promise.resolve();
function withCustomerWrite(task) {
  const result = customerWriteQueue.then(task);
  customerWriteQueue = result.catch(() => {});
  return result;
}

const CUSTOMER_COUNTER_KEY = '_customer_code_counters';
const CUSTOMER_COUNTER_SETUP = 'Sequential Customer ID setup is required. Apply migrations/20261029_end_customer_code_counters.sql before saving.';

function customerCodeFloor(local, tenantKey, year, existing = []) {
  if (local[tenantKey] != null && !Array.isArray(local[tenantKey])) throw new Error('Customer backup format is invalid. Save stopped.');
  const counters = local[CUSTOMER_COUNTER_KEY];
  if (counters != null && (typeof counters !== 'object' || Array.isArray(counters))) throw new Error('Customer ID counter is invalid. Save stopped.');
  const tenantCounters = counters?.[tenantKey];
  if (tenantCounters != null && (typeof tenantCounters !== 'object' || Array.isArray(tenantCounters))) throw new Error('Customer ID counter is invalid. Save stopped.');
  let maximum = tenantCounters?.[year] ?? 0;
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error('Customer ID counter is invalid. Save stopped.');
  const pattern = new RegExp(`^CUST-${year}-([0-9]{1,15})$`);
  for (const customer of [...(local[tenantKey] || []), ...existing]) {
    const match = String(customer.customer_code || '').match(pattern);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return maximum;
}

function customerCodes(year, first, count) {
  return Array.from({ length: count }, (_, index) => `CUST-${year}-${String(first + index).padStart(5, '0')}`);
}

async function reserveCustomerCodes(db, tenantKey, count, { localOnly = null, existing = [] } = {}) {
  if (!count) return [];
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()));
  const local = await readImportLocalCustomers();
  const minimum = customerCodeFloor(local, tenantKey, year, existing);
  if (db) {
    let reservation;
    try {
      reservation = await db.rpc('reserve_end_customer_codes', { p_tenant_id: tenantKey, p_year: year, p_count: count, p_minimum: minimum });
    } catch {
      throw new Error('Customer ID counter could not be reached. Please retry.');
    }
    if (!reservation.error) {
      const range = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data;
      const first = Number(range?.first_value);
      const last = Number(range?.last_value);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first <= minimum || last !== first + count - 1) throw new Error('Customer ID counter returned an invalid range. Save stopped.');
      return customerCodes(year, first, count);
    }
    if (!['PGRST202', '42883'].includes(reservation.error.code)) throw new Error('Customer ID counter could not be reserved. Please retry.');
    if (localOnly === null) {
      const probe = await db.from('end_customers').select('id').limit(1);
      localOnly = missingCustomerTable(probe.error);
    }
    // Local storage is allowed only when this installation has no database customer table.
    // Never substitute a process-local counter for a database-backed installation.
    if (!localOnly) throw new Error(CUSTOMER_COUNTER_SETUP);
  }
  return withCustomerWrite(async () => {
    const latest = await readImportLocalCustomers();
    const first = customerCodeFloor(latest, tenantKey, year, existing) + 1;
    const last = first + count - 1;
    if (!Number.isSafeInteger(last)) throw new Error('Customer ID counter limit reached. Save stopped.');
    latest[CUSTOMER_COUNTER_KEY] = { ...(latest[CUSTOMER_COUNTER_KEY] || {}), [tenantKey]: { ...(latest[CUSTOMER_COUNTER_KEY]?.[tenantKey] || {}), [year]: last } };
    // Persist the reservation before returning it so a restart cannot reuse an allocated ID.
    await fs.mkdir(path.dirname(CUSTOMERS_FILE_PATH), { recursive: true });
    await fs.writeFile(CUSTOMERS_FILE_PATH, JSON.stringify(latest, null, 2), 'utf-8');
    return customerCodes(year, first, count);
  });
}

async function ensureConfigFile() {
  try {
    const dir = path.dirname(CUSTOMERS_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(CUSTOMERS_FILE_PATH);
    } catch {
      await fs.writeFile(CUSTOMERS_FILE_PATH, JSON.stringify({}, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error ensuring customers config file:', err);
  }
}

async function readLocalCustomers() {
  try {
    await ensureConfigFile();
    const content = await fs.readFile(CUSTOMERS_FILE_PATH, 'utf-8');
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

async function writeLocalCustomers(data) {
  try {
    await ensureConfigFile();
    await fs.writeFile(CUSTOMERS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local customers file:', err);
  }
}

/**
 * 1. GET ALL END CUSTOMERS (Tenant Wise)
 */
export async function getEndCustomers(tenantId = 'TNT00002', filters = {}) {
  const tenantKey = normalizeTenantCode(tenantId);
  const adminClient = getAdminClient();

  // Try Supabase first
  if (adminClient) {
    try {
      let query = adminClient
        .from('end_customers')
        .select('*')
        .eq('tenant_id', tenantKey)
        .order('created_at', { ascending: false });

      if (filters.party_id) {
        query = query.eq('linked_party_id', filters.party_id);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return (data || []).map(cust => ({
          ...cust,
          warranty_info: calculateWarrantyStatus(cust.purchase_date, cust.warranty_months || 12)
        }));
      }
    } catch (_) {
      // Fall through to local JSON fallback
    }
  }

  // Local JSON fallback
  const allData = await readLocalCustomers();
  const list = allData[tenantKey] || [];

  return list.map(cust => ({
    ...cust,
    warranty_info: calculateWarrantyStatus(cust.purchase_date, cust.warranty_months || 12)
  }));
}

/**
 * 2. SEARCH END CUSTOMERS
 */
export async function searchEndCustomers(tenantId = 'TNT00002', query = '') {
  const customers = await getEndCustomers(tenantId);
  if (!query || !query.trim()) return customers;

  const q = query.toLowerCase().trim();
  return customers.filter(c => {
    const code = (c.customer_code || '').toLowerCase();
    const name = (c.full_name || '').toLowerCase();
    const m1 = (c.mobile_1 || '').toLowerCase();
    const m2 = (c.mobile_2 || '').toLowerCase();
    const am1 = (c.alternate_mobile_1 || '').toLowerCase();
    const am2 = (c.alternate_mobile_2 || '').toLowerCase();
    const serial = (c.chassis_serial_number || '').toLowerCase();
    const dealer = (c.linked_party_name || '').toLowerCase();

    return code.includes(q) || name.includes(q) || m1.includes(q) || m2.includes(q) || am1.includes(q) || am2.includes(q) || serial.includes(q) || dealer.includes(q);
  });
}

/**
 * 3. CREATE END CUSTOMER
 */
export async function createEndCustomer(customerData, tenantId = 'TNT00002') {
  try {
    const tenantKey = normalizeTenantCode(tenantId);
    const adminClient = getAdminClient();

    const company = await resolveRegistrationCompany(customerData, tenantKey);
    const [code] = await reserveCustomerCodes(adminClient, tenantKey, 1);
    const timestamp = getISTTimestamp();

    const payload = {
      id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantKey,
      customer_code: code,
      our_company: company,
      full_name: customerData.full_name || '',
      mobile_1: customerData.mobile_1 || '',
      mobile_2: customerData.mobile_2 || '',
      alternate_mobile_1: customerData.alternate_mobile_1 || '',
      alternate_mobile_2: customerData.alternate_mobile_2 || '',
      email_1: customerData.email_1 || '',
      alternate_email_1: customerData.alternate_email_1 || '',
      state_name: customerData.state_name || '',
      district_name: customerData.district_name || '',
      pin_code: customerData.pin_code || '',
      landmark: customerData.landmark || '',
      block_area_name: customerData.block_area_name || '',
      full_address: customerData.full_address || '',
      linked_party_id: customerData.linked_party_id || null,
      linked_party_code: customerData.linked_party_code === customerData.linked_party_id ? '' : (customerData.linked_party_code || ''),
      linked_party_name: customerData.linked_party_name || '',
      dealer_city_district: customerData.dealer_city_district || '',
      purchase_invoice_no: customerData.purchase_invoice_no || '',
      purchase_date: customerData.purchase_date || '',
      invoice_document_url: customerData.invoice_document_url || '',
      product_id: customerData.product_id || '',
      product_name: customerData.product_name || '',
      chassis_serial_number: customerData.chassis_serial_number || '',
      chassis_plate_photo_url: customerData.chassis_plate_photo_url || '',
      warranty_months: Number(customerData.warranty_months) || 12,
      created_at: timestamp,
      updated_at: timestamp
    };

    let savedToDb = false;
    if (adminClient) {
      const { data, error } = await adminClient
        .from('end_customers')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        savedToDb = true;
      } else if (!missingCustomerTable(error)) throw new Error('Customer could not be saved. Please retry.');
    }

    let warning = '';
    try {
      await withCustomerWrite(async () => {
        const allData = await readImportLocalCustomers();
        if (!allData[tenantKey]) allData[tenantKey] = [];
        allData[tenantKey].unshift(payload);
        await fs.mkdir(path.dirname(CUSTOMERS_FILE_PATH), { recursive: true });
        await fs.writeFile(CUSTOMERS_FILE_PATH, JSON.stringify(allData, null, 2), 'utf-8');
      });
    } catch {
      if (!savedToDb) throw new Error('Customer could not be saved to local storage. Please retry.');
      warning = 'Customer was saved to the database, but the local backup could not be updated.';
    }

    return {
      success: true,
      customer: {
        ...payload,
        warranty_info: calculateWarrantyStatus(payload.purchase_date, payload.warranty_months)
      },
      ...(warning ? { warning } : {})
    };
  } catch (error) {
    return { success: false, error: error.message || 'Customer could not be saved. Please retry.' };
  }
}

/**
 * 4. UPDATE END CUSTOMER
 */
export async function updateEndCustomer(customerId, updateData, tenantId = 'TNT00002') {
  const tenantKey = normalizeTenantCode(tenantId);
  const adminClient = getAdminClient();
  const timestamp = getISTTimestamp();

  if (adminClient) {
    try {
      await adminClient
        .from('end_customers')
        .update({ ...updateData, updated_at: timestamp })
        .eq('id', customerId)
        .eq('tenant_id', tenantKey);
    } catch (_) {
      // Ignore
    }
  }

  return withCustomerWrite(async () => {
    const allData = await readLocalCustomers();
    const list = allData[tenantKey] || [];
    const idx = list.findIndex(c => c.id === customerId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updateData, updated_at: timestamp };
      allData[tenantKey] = list;
      await writeLocalCustomers(allData);
      return {
        success: true,
        customer: {
          ...list[idx],
          warranty_info: calculateWarrantyStatus(list[idx].purchase_date, list[idx].warranty_months)
        }
      };
    }
    return { success: false, error: 'Customer not found' };
  });
}

// Import is additive; the existing register/update/read APIs retain their contracts.
const IMPORT_TENANTS = [
  { code: 'TNT00001', id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', name: 'SuPuja Creations' },
  { code: 'TNT00002', id: '00000000-0000-0000-0000-000000000001', name: 'New Swan Group' },
  { code: 'TNT00003', id: '922d3e72-6588-457f-a562-4f1bdbf10d98', name: 'Testing New Swan Group' }
];
let importQueue = Promise.resolve();

async function resolveRegistrationCompany(customerData, tenantKey) {
  const requested = normalizeEndCustomerCompany(customerData.our_company);
  if (requested && !END_CUSTOMER_COMPANIES.includes(requested)) throw new Error('Company Name must be NSMLR or NSTLP.');
  let dealerCompany = '';
  if (customerData.linked_party_id || customerData.linked_party_code) {
    const tenant = IMPORT_TENANTS.find(item => item.code === tenantKey);
    const result = await getPartyList(tenant?.id || tenantKey, { throwOnError: true });
    const parties = Array.isArray(result) ? result : result?.data;
    if (!Array.isArray(parties) || result?.error) throw new Error('Dealer company could not be verified. Please retry.');
    const party = parties.find(item => customerData.linked_party_id ? item.id === customerData.linked_party_id : partyCode(item) === String(customerData.linked_party_code).trim());
    if (!party) throw new Error('Linked Dealer was not found in this workspace.');
    if (customerData.linked_party_code && partyCode(party) !== String(customerData.linked_party_code).trim() && customerData.linked_party_code !== party.id) throw new Error('Linked Dealer code does not match the selected dealer.');
    dealerCompany = endCustomerDealerCompany(party);
    if (requested && requested !== dealerCompany) throw new Error('Selected Dealer does not belong to Company Name.');
  }
  // Preserve earlier callers/templates that had no operating-company field.
  const company = requested || dealerCompany || 'NSMLR';
  if (!END_CUSTOMER_COMPANIES.includes(company)) throw new Error('Dealer Company is not supported; check Party Master.');
  return company;
}

async function requireEndCustomerTransferAccess(tenantId, operation = 'view') {
  const db = getAdminClient();
  if (!db) throw new Error('Workspace connection is unavailable. Please retry.');
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) throw new Error('Please sign in again.');
  const { data: role, error } = await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !role || role.is_approved === false) throw new Error('Could not verify your workspace access.');
  const permissions = ['channel_ops', 'party'].map(moduleId => getSubItemPermissions(role.module_access, role.role, moduleId, 'end_customers'));
  if (!permissions.some(p => p.view && (operation === 'view' || p.add))) throw new Error('You do not have permission to import end customers.');
  const resolve = async value => {
    const raw = String(value || '').trim();
    const known = IMPORT_TENANTS.find(t => [t.code, t.id, t.name].some(alias => alias.toLowerCase() === raw.toLowerCase()));
    if (known) return known;
    const field = /^TNT\d{5,}$/i.test(raw) ? 'tenant_code' : /^[0-9a-f-]{36}$/i.test(raw) ? 'id' : null;
    if (!field) throw new Error('Select a valid workspace before importing.');
    const { data, error: tenantError } = await db.from('tenants').select('id,tenant_code,name').eq(field, raw).maybeSingle();
    if (tenantError || !data || !/^TNT\d{5,}$/i.test(data.tenant_code || '')) throw new Error('Workspace could not be verified.');
    return { id: data.id, code: data.tenant_code, name: data.name };
  };
  const tenant = await resolve(tenantId);
  const master = ['masteradmin', 'master_admin'].includes(String(role.role || '').toLowerCase()) || role.module_access?.is_master_admin === true;
  if (!master) {
    const ownTenant = await resolve(role.tenant_id || role.module_access?._tenantId || role.company);
    if (ownTenant.code !== tenant.code) throw new Error('Workspace access denied.');
  }
  return { db, tenant, canImport: permissions.some(p => p.view && p.add) };
}

async function loadEndCustomerTransferLookups({ db, tenant }) {
  const [partyResult, productResult, statesResult, districtsResult] = await Promise.all([
    getPartyList(tenant.id, { throwOnError: true }), getTenantProducts(tenant.name || tenant.code),
    db.from('location_states').select('id,name'), db.from('location_districts').select('state_id,name')
  ]);
  const parties = Array.isArray(partyResult) ? partyResult : partyResult?.data;
  if (!Array.isArray(parties) || partyResult?.error) throw new Error('Party Master could not be loaded. Please retry.');
  const products = Array.isArray(productResult) ? productResult : productResult?.products;
  if (productResult?.success === false) throw new Error('Product Master could not be loaded. Please retry.');
  const districtsByState = Object.fromEntries(Object.entries(INDIAN_STATE_DISTRICTS).map(([state, districts]) => [state, [...districts]]));
  const states = new Map((statesResult.data || []).map(s => [s.id, s.name]));
  for (const district of districtsResult.data || []) {
    const state = states.get(district.state_id);
    if (state && district.name) districtsByState[state] = [...new Set([...(districtsByState[state] || []), district.name])];
  }
  for (const state of states.values()) if (state && !districtsByState[state]) districtsByState[state] = [];
  return {
    parties: parties.map(p => ({ id: p.id, firm_name: p.firm_name || p.legal_name, party_universal_code: p.party_universal_code,
      our_company: endCustomerDealerCompany(p),
      distributor_code: p.distributor_code, dealer_code: p.dealer_code, sub_dealer_code: p.sub_dealer_code,
      external_sap_code: p.external_sap_code, city_name: p.city_name, district_name: p.district_name })),
    products: (products?.length ? products : PRODUCT_GROUPS).filter(p => p.is_active !== false).map(p => ({ id: p.id, name: p.name, sku: p.sku || '', category: p.category || '' })),
    districtsByState,
    companies: END_CUSTOMER_COMPANIES
  };
}

export async function getEndCustomerTransferContext(tenantId) {
  try {
    const context = await requireEndCustomerTransferAccess(tenantId);
    return { success: true, tenantId: context.tenant.code, canImport: context.canImport, ...await loadEndCustomerTransferLookups(context) };
  } catch (error) {
    return { success: false, error: error.message || 'Import options could not be loaded.' };
  }
}

async function readImportLocalCustomers() {
  try {
    const data = JSON.parse(await fs.readFile(CUSTOMERS_FILE_PATH, 'utf-8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid customer backup');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Customer backup could not be read safely. Import stopped; existing data was preserved.');
  }
}

const missingCustomerTable = error => ['42P01', 'PGRST205'].includes(error?.code);

async function importEndCustomerBatch(rows, tenantId) {
  const context = await requireEndCustomerTransferAccess(tenantId, 'add');
  const lookups = await loadEndCustomerTransferLookups(context);
  const local = await readImportLocalCustomers();
  const tenantKey = context.tenant.code;
  if (local[tenantKey] != null && !Array.isArray(local[tenantKey])) throw new Error('Customer backup format is invalid. Import stopped.');
  const existing = [...(local[tenantKey] || [])];
  let localOnly = false;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await context.db.from('end_customers')
      .select('customer_code,full_name,mobile_1,product_name,chassis_serial_number,purchase_invoice_no,purchase_date')
      .eq('tenant_id', tenantKey).order('id').range(offset, offset + 999);
    if (error) {
      if (missingCustomerTable(error)) { localOnly = true; break; }
      throw new Error('Existing customers could not be checked. Please retry; no records were imported.');
    }
    existing.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const results = validateEndCustomerRows(rows, { ...lookups, existingCustomers: existing });
  const valid = results.filter(row => row.status === 'ready');
  const timestamp = getISTTimestamp();
  const codes = await reserveCustomerCodes(context.db, tenantKey, valid.length, { localOnly, existing });
  const fields = ['our_company', 'full_name', 'mobile_1', 'mobile_2', 'alternate_mobile_1', 'alternate_mobile_2', 'email_1', 'alternate_email_1',
    'state_name', 'district_name', 'pin_code', 'landmark', 'block_area_name', 'full_address', 'linked_party_id', 'linked_party_code',
    'linked_party_name', 'dealer_city_district', 'purchase_invoice_no', 'purchase_date', 'product_id', 'product_name', 'chassis_serial_number', 'warranty_months'];
  const payloads = valid.map((row, index) => ({ ...Object.fromEntries(fields.map(key => [key, row.data[key] ?? (key === 'linked_party_id' ? null : '')])),
    id: `cust_${randomUUID()}`, customer_code: codes[index],
    tenant_id: tenantKey, created_at: timestamp, updated_at: timestamp, invoice_document_url: '', chassis_plate_photo_url: '' }));
  let warning = '';
  if (payloads.length) {
    if (!localOnly) {
      const { error } = await context.db.from('end_customers').insert(payloads);
      if (error) throw new Error('Customers could not be saved. No existing records were changed. Please retry.');
    }
    try {
      // Read immediately before writing so unrelated tenants and recently added records are retained.
      await withCustomerWrite(async () => {
        const latest = await readImportLocalCustomers();
        if (latest[tenantKey] != null && !Array.isArray(latest[tenantKey])) throw new Error('Invalid customer backup');
        latest[tenantKey] = [...payloads, ...(latest[tenantKey] || [])];
        await fs.mkdir(path.dirname(CUSTOMERS_FILE_PATH), { recursive: true });
        await fs.writeFile(CUSTOMERS_FILE_PATH, JSON.stringify(latest, null, 2), 'utf-8');
      });
    } catch (error) {
      if (localOnly) throw error;
      warning = 'Customers were saved to the database, but the local backup could not be updated.';
    }
  }
  if (localOnly && payloads.length) warning = 'Saved in the existing local customer storage; the database customer table is not available.';
  return { success: true, imported: payloads.length, warning, results: results.map(row => ({ rowNumber: row.rowNumber,
    status: row.status === 'ready' ? 'imported' : row.status, messages: row.messages })) };
}

export async function bulkImportEndCustomers(rows, tenantId) {
  if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_BATCH_SIZE) return { success: false, error: `Send between 1 and ${IMPORT_BATCH_SIZE} rows per batch.` };
  const task = importQueue.then(() => importEndCustomerBatch(rows, tenantId));
  importQueue = task.catch(() => {});
  try { return await task; }
  catch (error) { return { success: false, error: error.message || 'Import failed. Please retry.' }; }
}
