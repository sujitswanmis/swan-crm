'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { calculateWarrantyStatus } from '@/utils/warrantyUtils';

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
  if (str === 'TNT00001' || str.toLowerCase().includes('supuja')) return 'TNT00001';
  if (str === 'TNT00002' || str.toLowerCase().includes('swan')) return 'TNT00002';
  if (str === 'TNT00003' || str.toLowerCase().includes('testing')) return 'TNT00003';
  if (str.startsWith('TNT')) return str;
  if (str === '00000000-0000-0000-0000-000000000001') return 'TNT00001';
  return 'TNT00002';
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
  const tenantKey = normalizeTenantCode(tenantId);
  const adminClient = getAdminClient();

  const code = `CUST-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  const timestamp = getISTTimestamp();

  const payload = {
    id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tenant_id: tenantKey,
    customer_code: code,
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
    linked_party_code: customerData.linked_party_code || '',
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

  // Try Supabase first
  let savedToDb = false;
  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from('end_customers')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        savedToDb = true;
      }
    } catch (_) {
      // Fall through to local JSON
    }
  }

  // Always write to local JSON for dual persistence and offline stability
  const allData = await readLocalCustomers();
  if (!allData[tenantKey]) allData[tenantKey] = [];
  allData[tenantKey].unshift(payload);
  await writeLocalCustomers(allData);

  return {
    success: true,
    customer: {
      ...payload,
      warranty_info: calculateWarrantyStatus(payload.purchase_date, payload.warranty_months)
    }
  };
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
}
