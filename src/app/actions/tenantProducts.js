'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const PRODUCTS_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_products.json');

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

async function ensureConfigFile(filePath, defaultData = {}) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error(`Error ensuring product config file ${filePath}:`, err);
  }
}

async function readLocalProducts() {
  try {
    await ensureConfigFile(PRODUCTS_FILE_PATH, {});
    const content = await fs.readFile(PRODUCTS_FILE_PATH, 'utf-8');
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

async function writeLocalProducts(data) {
  try {
    await ensureConfigFile(PRODUCTS_FILE_PATH, {});
    await fs.writeFile(PRODUCTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local products file:', err);
  }
}

function resolveTenantKey(companyOrTenantId) {
  const rawKey = String(companyOrTenantId || 'Default').trim();
  let key = rawKey;

  const SWAN_ALIASES = [
    '00000000-0000-0000-0000-000000000001',
    'new_swan_group',
    'new swan',
    'new swan group',
    'nstl',
    'nstlp',
    'nsmlr',
    'swan agro',
    'tnt00002'
  ];

  const SUPUJA_ALIASES = [
    '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
    'supuja_creations',
    'supuja creations',
    'supuja creation',
    'tnt00001'
  ];

  const TESTING_ALIASES = [
    '922d3e72-6588-457f-a562-4f1bdbf10d98',
    'testing_new_swan_group',
    'testing new swan group',
    'tnt00003'
  ];

  const lower = rawKey.toLowerCase();
  if (SWAN_ALIASES.includes(lower)) {
    key = 'New Swan Group';
  } else if (SUPUJA_ALIASES.includes(lower)) {
    key = 'SuPuja Creations';
  } else if (TESTING_ALIASES.includes(lower)) {
    key = 'Testing New Swan Group';
  }

  return { key, rawKey };
}

/**
 * Get all products for a company/tenant, optionally filtered by branch
 */
export async function getTenantProducts(companyOrTenantId = 'Default', branchFilter = 'ALL') {
  try {
    const { key, rawKey } = resolveTenantKey(companyOrTenantId);

    let dbProducts = [];
    try {
      const admin = getAdminClient();
      if (admin) {
        let query = admin
          .from('tenant_products')
          .select('*')
          .or(`company.ilike.${key},tenant_id.eq.${rawKey}`)
          .order('created_at', { ascending: false });

        if (branchFilter && branchFilter !== 'ALL') {
          query = query.or(`branch_name.eq.${branchFilter},branch_name.eq.All Branches`);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          dbProducts = data;
        }
      }
    } catch (_dbErr) {
      // Supabase table tenant_products may not exist yet, fallback to JSON
    }

    const localMap = await readLocalProducts();
    let localProducts = Array.isArray(localMap[key]) ? localMap[key] : null;
    if (!localProducts) {
      const matchKey = Object.keys(localMap).find(
        k => k.toLowerCase() === key.toLowerCase() || k.toLowerCase() === rawKey.toLowerCase()
      );
      if (matchKey) {
        localProducts = localMap[matchKey];
      }
    }
    localProducts = localProducts || [];

    // Filter local products by branch if requested
    if (branchFilter && branchFilter !== 'ALL') {
      localProducts = localProducts.filter(
        p => !p.branch_name || p.branch_name === 'All Branches' || p.branch_name.toLowerCase() === branchFilter.toLowerCase()
      );
    }

    // Merge DB & Local products (ID deduplication)
    const mergedMap = new Map();
    dbProducts.forEach(p => mergedMap.set(p.id || p.sku || p.name, p));
    localProducts.forEach(p => mergedMap.set(p.id || p.sku || p.name, p));

    let finalProducts = Array.from(mergedMap.values());

    // If completely empty for New Swan Group, seed default products for ease of initial use
    if (finalProducts.length === 0 && (key === 'New Swan Group' || key === 'Swan Agro')) {
      const defaultProducts = [
        {
          id: `prod_seed_1`,
          company: key,
          branch_name: 'All Branches',
          name: 'Rotavator – Super Series',
          sku: 'SWAN-ROT-SUP-01',
          category: 'Implement',
          uom: 'Units',
          price: 115000,
          tax_rate: 12,
          hsn_code: '8432',
          stock_quantity: 45,
          min_order_qty: 1,
          description: 'Heavy duty super series rotavator with multi speed gearbox for soil pulverization.',
          is_active: true,
          created_at: getISTTimestamp(),
          updated_at: getISTTimestamp()
        },
        {
          id: `prod_seed_2`,
          company: key,
          branch_name: 'All Branches',
          name: 'Laser Land Leveller',
          sku: 'SWAN-LVL-LSR-02',
          category: 'Land Leveller',
          uom: 'Units',
          price: 325000,
          tax_rate: 12,
          hsn_code: '8432',
          stock_quantity: 18,
          min_order_qty: 1,
          description: 'Precision dual slope transmitter receiver laser levelling unit.',
          is_active: true,
          created_at: getISTTimestamp(),
          updated_at: getISTTimestamp()
        },
        {
          id: `prod_seed_3`,
          company: key,
          branch_name: 'All Branches',
          name: 'Super Seeder',
          sku: 'SWAN-SDR-SUP-03',
          category: 'Seeder',
          uom: 'Units',
          price: 245000,
          tax_rate: 12,
          hsn_code: '8432',
          stock_quantity: 22,
          min_order_qty: 1,
          description: 'Next generation super seeder for direct paddy stubble wheat sowing.',
          is_active: true,
          created_at: getISTTimestamp(),
          updated_at: getISTTimestamp()
        },
        {
          id: `prod_seed_4`,
          company: key,
          branch_name: 'All Branches',
          name: 'Genuine Swan Blades & Gearbox Spares',
          sku: 'SWAN-SPR-BLD-04',
          category: 'Spare Part',
          uom: 'Pcs',
          price: 850,
          tax_rate: 18,
          hsn_code: '843290',
          stock_quantity: 500,
          min_order_qty: 10,
          description: 'High tensile Boron steel genuine heat-treated replacement blades.',
          is_active: true,
          created_at: getISTTimestamp(),
          updated_at: getISTTimestamp()
        }
      ];

      localMap[key] = defaultProducts;
      await writeLocalProducts(localMap);
      finalProducts = defaultProducts;
    }

    return {
      success: true,
      products: finalProducts
    };
  } catch (err) {
    console.error('getTenantProducts error:', err);
    return { success: false, error: err.message, products: [] };
  }
}

/**
 * Save or update a product for a tenant & branch
 */
export async function saveTenantProduct({
  id = null,
  company = 'Default',
  tenantId = null,
  branchId = null,
  branchName = 'All Branches',
  name,
  sku = '',
  category = 'General',
  uom = 'Pcs',
  price = 0,
  taxRate = 18,
  hsnCode = '',
  stockQuantity = 0,
  minOrderQty = 1,
  description = '',
  isActive = true
}) {
  try {
    if (!name || !name.trim()) {
      return { success: false, error: 'Product Name is required.' };
    }

    const { key } = resolveTenantKey(company);
    const cleanName = name.trim();
    const cleanSku = (sku || `PRD-${cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
    const prodId = id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const istTime = getISTTimestamp();

    const productRecord = {
      id: prodId,
      company: key,
      tenant_id: tenantId || null,
      branch_id: branchId || null,
      branch_name: branchName || 'All Branches',
      name: cleanName,
      sku: cleanSku,
      category: (category || 'General').trim(),
      uom: (uom || 'Pcs').trim(),
      price: Number(price) >= 0 ? Number(price) : 0,
      tax_rate: Number(taxRate) >= 0 ? Number(taxRate) : 18,
      hsn_code: (hsnCode || '').trim().toUpperCase(),
      stock_quantity: Number(stockQuantity) >= 0 ? Number(stockQuantity) : 0,
      min_order_qty: Number(minOrderQty) >= 1 ? Number(minOrderQty) : 1,
      description: (description || '').trim(),
      is_active: isActive !== false,
      updated_at: istTime,
      created_at: id ? undefined : istTime
    };

    // 1. Try upserting to Supabase
    try {
      const admin = getAdminClient();
      if (admin) {
        await admin.from('tenant_products').upsert(productRecord, { onConflict: 'id' });
      }
    } catch (_dbErr) {
      // Table may not exist yet, fallback to JSON storage
    }

    // 2. Update local JSON storage
    const localMap = await readLocalProducts();
    if (!Array.isArray(localMap[key])) {
      localMap[key] = [];
    }

    const existingIdx = localMap[key].findIndex(p => p.id === prodId || (p.sku && p.sku === cleanSku));
    if (existingIdx >= 0) {
      localMap[key][existingIdx] = {
        ...localMap[key][existingIdx],
        ...productRecord,
        created_at: localMap[key][existingIdx].created_at || istTime
      };
    } else {
      localMap[key].unshift(productRecord);
    }

    await writeLocalProducts(localMap);

    // Audit log
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction(
        id ? 'Update Product' : 'Add Product',
        `Product "${cleanName}" (${cleanSku}) saved for ${key} [Branch: ${branchName}]`
      );
    } catch (_) {}

    return {
      success: true,
      message: `Product "${cleanName}" successfully saved!`,
      product: productRecord
    };
  } catch (err) {
    console.error('saveTenantProduct error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Toggle product active status
 */
export async function toggleTenantProductStatus(productId, company = 'Default', isActive = true) {
  try {
    if (!productId) return { success: false, error: 'Product ID is required.' };
    const { key } = resolveTenantKey(company);
    const istTime = getISTTimestamp();

    // 1. Try DB update
    try {
      const admin = getAdminClient();
      if (admin) {
        await admin.from('tenant_products').update({ is_active: isActive, updated_at: istTime }).eq('id', productId);
      }
    } catch (_) {}

    // 2. Update local JSON
    const localMap = await readLocalProducts();
    if (Array.isArray(localMap[key])) {
      const target = localMap[key].find(p => p.id === productId);
      if (target) {
        target.is_active = isActive;
        target.updated_at = istTime;
        await writeLocalProducts(localMap);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('toggleTenantProductStatus error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a product
 */
export async function deleteTenantProduct(productId, company = 'Default') {
  try {
    if (!productId) return { success: false, error: 'Product ID is required.' };
    const { key } = resolveTenantKey(company);

    // 1. Try Supabase delete
    try {
      const admin = getAdminClient();
      if (admin) {
        await admin.from('tenant_products').delete().eq('id', productId);
      }
    } catch (_) {}

    // 2. Remove from local JSON
    const localMap = await readLocalProducts();
    if (Array.isArray(localMap[key])) {
      localMap[key] = localMap[key].filter(p => p.id !== productId);
      await writeLocalProducts(localMap);
    }

    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Delete Product', `Product ${productId} removed from ${key}`);
    } catch (_) {}

    return {
      success: true,
      message: 'Product successfully removed.'
    };
  } catch (err) {
    console.error('deleteTenantProduct error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Bulk import products for a tenant
 */
export async function importTenantProducts(productsList = [], company = 'Default', targetBranch = 'All Branches') {
  try {
    if (!Array.isArray(productsList) || productsList.length === 0) {
      return { success: false, error: 'No products provided for import.' };
    }

    const { key } = resolveTenantKey(company);
    const istTime = getISTTimestamp();

    const prepared = productsList
      .filter(p => p && (p.name || p.product_name))
      .map((p, idx) => {
        const cleanName = (p.name || p.product_name).trim();
        const cleanSku = (p.sku || p.code || `PRD-${cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${(Date.now() + idx).toString().slice(-4)}`).trim().toUpperCase();
        return {
          id: p.id || `prod_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          company: key,
          branch_name: p.branch_name || targetBranch || 'All Branches',
          name: cleanName,
          sku: cleanSku,
          category: (p.category || 'General').trim(),
          uom: (p.uom || 'Pcs').trim(),
          price: Number(p.price) >= 0 ? Number(p.price) : 0,
          tax_rate: Number(p.tax_rate) >= 0 ? Number(p.tax_rate) : 18,
          hsn_code: (p.hsn_code || p.hsn || '').trim().toUpperCase(),
          stock_quantity: Number(p.stock_quantity || p.stock) >= 0 ? Number(p.stock_quantity || p.stock) : 0,
          min_order_qty: Number(p.min_order_qty || p.moq) >= 1 ? Number(p.min_order_qty || p.moq) : 1,
          description: (p.description || '').trim(),
          is_active: p.is_active !== false,
          created_at: istTime,
          updated_at: istTime
        };
      });

    if (prepared.length === 0) {
      return { success: false, error: 'No valid products could be parsed.' };
    }

    // 1. Try DB bulk upsert
    try {
      const admin = getAdminClient();
      if (admin) {
        await admin.from('tenant_products').upsert(prepared, { onConflict: 'id' });
      }
    } catch (_) {}

    // 2. Update local JSON
    const localMap = await readLocalProducts();
    if (!Array.isArray(localMap[key])) {
      localMap[key] = [];
    }

    // Merge by ID / SKU
    const existingMap = new Map();
    localMap[key].forEach(p => existingMap.set(p.sku || p.id, p));
    prepared.forEach(p => existingMap.set(p.sku || p.id, p));

    localMap[key] = Array.from(existingMap.values());
    await writeLocalProducts(localMap);

    return {
      success: true,
      count: prepared.length,
      message: `Successfully imported ${prepared.length} products.`
    };
  } catch (err) {
    console.error('importTenantProducts error:', err);
    return { success: false, error: err.message };
  }
}
