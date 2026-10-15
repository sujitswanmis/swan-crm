'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const BRANCHES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_branches.json');

const getAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

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
    console.error(`Error ensuring branch config file ${filePath}:`, err);
  }
}

async function readLocalBranches() {
  try {
    await ensureConfigFile(BRANCHES_FILE_PATH, {});
    const content = await fs.readFile(BRANCHES_FILE_PATH, 'utf-8');
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

async function writeLocalBranches(data) {
  try {
    await ensureConfigFile(BRANCHES_FILE_PATH, {});
    await fs.writeFile(BRANCHES_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local branches file:', err);
  }
}

/**
 * Get all branches for a given company or tenant
 */
export async function getTenantBranches(companyOrTenantId = 'Default') {
  try {
    const key = String(companyOrTenantId || 'Default').trim();
    const admin = getAdminClient();

    let dbBranches = [];
    try {
      const { data, error } = await admin
        .from('tenant_branches')
        .select('*')
        .or(`company.ilike.${key},tenant_id.eq.${key}`)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        dbBranches = data;
      }
    } catch (e) {
      // Table may not exist yet in Supabase, graceful fallback to file storage
    }

    const localMap = await readLocalBranches();
    const localBranches = Array.isArray(localMap[key]) ? localMap[key] : [];

    // Merge DB & Local branches (Local ID takes priority)
    const mergedMap = new Map();
    dbBranches.forEach(b => mergedMap.set(b.id || b.branch_code, b));
    localBranches.forEach(b => mergedMap.set(b.id || b.branch_code, b));

    const finalBranches = Array.from(mergedMap.values());

    // If completely empty, generate a default "Headquarters" branch for this workspace
    if (finalBranches.length === 0) {
      const defaultHQ = {
        id: `br_hq_${Date.now()}`,
        company: key,
        branch_code: 'HQ-MAIN-01',
        branch_name: 'Headquarters (Main Office)',
        location_type: 'Headquarters',
        address: 'Main Office Complex',
        city: 'Headquarters City',
        state: 'Punjab',
        pincode: '',
        gstin: '',
        phone: '',
        email: '',
        incharge_name: 'Director / Branch Head',
        is_active: true,
        created_at: new Date().toISOString()
      };
      finalBranches.push(defaultHQ);
      localMap[key] = finalBranches;
      await writeLocalBranches(localMap);
    }

    return {
      success: true,
      branches: finalBranches
    };
  } catch (err) {
    console.error('getTenantBranches error:', err);
    return { success: false, error: err.message, branches: [] };
  }
}

/**
 * Get all branches across all companies and tenants
 */
export async function getAllTenantBranches() {
  try {
    const admin = getAdminClient();
    let dbBranches = [];
    try {
      const { data, error } = await admin
        .from('tenant_branches')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        dbBranches = data;
      }
    } catch (e) {
      // Table may not exist yet in Supabase
    }

    const localMap = await readLocalBranches();
    const allLocal = [];
    Object.values(localMap).forEach(arr => {
      if (Array.isArray(arr)) allLocal.push(...arr);
    });

    const mergedMap = new Map();
    dbBranches.forEach(b => mergedMap.set(b.id || b.branch_code, b));
    allLocal.forEach(b => mergedMap.set(b.id || b.branch_code, b));

    return {
      success: true,
      branches: Array.from(mergedMap.values())
    };
  } catch (err) {
    console.error('getAllTenantBranches error:', err);
    return { success: false, error: err.message, branches: [] };
  }
}

/**
 * Create or update a branch
 */
export async function saveTenantBranch({
  id = null,
  company = 'Default',
  tenantId = null,
  branchName,
  branchCode,
  locationType = 'Branch Office',
  address = '',
  city = '',
  state = '',
  pincode = '',
  gstin = '',
  phone = '',
  email = '',
  inchargeName = '',
  inchargeId = '',
  latitude = null,
  longitude = null,
  radiusMeters = 200,
  isActive = true
}) {
  try {
    if (!branchName || !branchName.trim()) {
      return { success: false, error: 'Branch Name is required.' };
    }

    const companyKey = String(company || 'Default').trim();
    const cleanCode = (branchCode || `BR-${branchName.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`).trim().toUpperCase();
    const branchId = id || `br_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const branchRecord = {
      id: branchId,
      company: companyKey,
      tenant_id: tenantId,
      branch_code: cleanCode,
      branch_name: branchName.trim(),
      location_type: locationType || 'Branch Office',
      address: (address || '').trim(),
      city: (city || '').trim(),
      state: (state || '').trim(),
      pincode: (pincode || '').trim(),
      gstin: (gstin || '').trim().toUpperCase(),
      phone: (phone || '').trim(),
      email: (email || '').trim().toLowerCase(),
      incharge_name: (inchargeName || '').trim(),
      incharge_id: inchargeId || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      radius_meters: parseInt(radiusMeters, 10) || 200,
      is_active: isActive !== false,
      updated_at: nowIso,
      created_at: nowIso
    };

    // 1. Try upserting to Supabase
    try {
      const admin = getAdminClient();
      await admin.from('tenant_branches').upsert(branchRecord, { onConflict: 'id' });
    } catch (dbErr) {
      // Table may not exist yet, local fallback handles persistence
    }

    // 2. Update local file storage
    const localMap = await readLocalBranches();
    if (!Array.isArray(localMap[companyKey])) {
      localMap[companyKey] = [];
    }

    const existingIdx = localMap[companyKey].findIndex(b => b.id === branchId || b.branch_code === cleanCode);
    if (existingIdx >= 0) {
      localMap[companyKey][existingIdx] = { ...localMap[companyKey][existingIdx], ...branchRecord };
    } else {
      localMap[companyKey].push(branchRecord);
    }

    await writeLocalBranches(localMap);

    // Audit log
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Save Branch', `Branch ${branchName} (${cleanCode}) saved for ${companyKey}`);
    } catch (_) {}

    return {
      success: true,
      message: `Branch "${branchName}" successfully saved!`,
      branch: branchRecord
    };
  } catch (err) {
    console.error('saveTenantBranch error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete / Deactivate a branch
 */
export async function deleteTenantBranch(branchId, company = 'Default') {
  try {
    if (!branchId) return { success: false, error: 'Branch ID is required.' };

    const companyKey = String(company || 'Default').trim();

    // 1. Try deleting from Supabase
    try {
      const admin = getAdminClient();
      await admin.from('tenant_branches').delete().eq('id', branchId);
    } catch (_) {}

    // 2. Remove from local file storage
    const localMap = await readLocalBranches();
    if (Array.isArray(localMap[companyKey])) {
      localMap[companyKey] = localMap[companyKey].filter(b => b.id !== branchId);
      await writeLocalBranches(localMap);
    }

    return {
      success: true,
      message: 'Branch successfully removed.'
    };
  } catch (err) {
    console.error('deleteTenantBranch error:', err);
    return { success: false, error: err.message };
  }
}
