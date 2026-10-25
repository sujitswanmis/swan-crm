'use server';

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const BRANCHES_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_branches.json');

const getAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
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
 * Internal resolver for tenant code and standard aliases (SuPuja = TNT00001, New Swan Group = TNT00002, Testing = TNT00003)
 */
function resolveKnownTenantInternal(companyOrTenantId = 'Default') {
  const rawKey = String(companyOrTenantId || 'Default').trim();
  const lower = rawKey.toLowerCase();

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
    'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4',
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

  if (SUPUJA_ALIASES.includes(lower)) {
    return {
      tenantCode: 'TNT00001',
      companyName: 'SuPuja Creations',
      tenantId: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af'
    };
  }

  if (SWAN_ALIASES.includes(lower)) {
    return {
      tenantCode: 'TNT00002',
      companyName: 'New Swan Group',
      tenantId: '00000000-0000-0000-0000-000000000001'
    };
  }

  if (TESTING_ALIASES.includes(lower)) {
    return {
      tenantCode: 'TNT00003',
      companyName: 'Testing New Swan Group',
      tenantId: '922d3e72-6588-457f-a562-4f1bdbf10d98'
    };
  }

  const matchTnt = rawKey.match(/^TNT(\d+)$/i);
  if (matchTnt) {
    return {
      tenantCode: rawKey.toUpperCase(),
      companyName: rawKey,
      tenantId: null
    };
  }

  return {
    tenantCode: null,
    companyName: rawKey,
    tenantId: null
  };
}

export async function resolveKnownTenant(companyOrTenantId = 'Default') {
  return resolveKnownTenantInternal(companyOrTenantId);
}

/**
 * Generate next sequential branch code for a tenant: [TENANT_CODE]-B[0001..9999]
 */
function getNextBranchCodeInternal(tenantCode = 'TNT00001', existingBranches = []) {
  const cleanTenantCode = String(tenantCode || 'TNT00001').toUpperCase().trim();
  const prefix = `${cleanTenantCode}-B`;
  let maxSeq = 0;

  if (Array.isArray(existingBranches)) {
    for (const b of existingBranches) {
      const candidates = [b?.id, b?.branch_code, b?.legacy_id, b?.legacy_code].filter(Boolean);
      for (const val of candidates) {
        const match = String(val).match(new RegExp(`^${cleanTenantCode}-B(\\d+)$`, 'i'));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

export async function getNextBranchCode(tenantCode = 'TNT00001', existingBranches = []) {
  return getNextBranchCodeInternal(tenantCode, existingBranches);
}

/**
 * Get all branches for a given company or tenant
 */
export async function getTenantBranches(companyOrTenantId = 'Default') {
  try {
    const rawKey = String(companyOrTenantId || 'Default').trim();
    const known = resolveKnownTenantInternal(rawKey);
    let key = known.companyName;
    let resolvedTenantCode = known.tenantCode;
    let resolvedTenantId = known.tenantId;

    let dbBranches = [];
    try {
      const admin = getAdminClient();
      if (admin) {
        // If key is a UUID that wasn't hardcoded above, look up tenant details from DB
        if (!resolvedTenantCode && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey)) {
          try {
            const { data: tData } = await admin.from('tenants').select('id, name, tenant_code').eq('id', rawKey).maybeSingle();
            if (tData) {
              key = tData.name || key;
              resolvedTenantCode = tData.tenant_code || resolvedTenantCode;
              resolvedTenantId = tData.id || resolvedTenantId;
            }
          } catch (e) {}
        }

        const { data, error } = await admin
          .from('tenant_branches')
          .select('*')
          .or(`company.ilike.${key},tenant_id.eq.${resolvedTenantId || rawKey}`)
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          dbBranches = data;
        }
      }
    } catch (e) {
      // Table may not exist yet in Supabase, graceful fallback to file storage
    }

    const localMap = await readLocalBranches();
    let localBranches = Array.isArray(localMap[key]) ? localMap[key] : null;
    if (!localBranches) {
      const matchKey = Object.keys(localMap).find(k => {
        const kKnown = resolveKnownTenantInternal(k);
        return (
          k.toLowerCase() === key.toLowerCase() ||
          k.toLowerCase() === rawKey.toLowerCase() ||
          (resolvedTenantCode && kKnown.tenantCode === resolvedTenantCode)
        );
      });
      if (matchKey) {
        localBranches = localMap[matchKey];
      }
    }
    localBranches = localBranches || [];

    // Merge DB & Local branches (Local ID takes priority)
    const mergedMap = new Map();
    dbBranches.forEach(b => mergedMap.set(b.id || b.branch_code, b));
    localBranches.forEach(b => mergedMap.set(b.id || b.branch_code, b));

    const finalBranches = Array.from(mergedMap.values());

    // If completely empty, generate a standardized default "Headquarters" branch
    if (finalBranches.length === 0) {
      const tenantCode = resolvedTenantCode || 'TNT00001';
      const defaultHQCode = `${tenantCode}-B0001`;
      const defaultHQ = {
        id: defaultHQCode,
        company: key,
        tenant_id: resolvedTenantId,
        tenant_code: tenantCode,
        branch_code: defaultHQCode,
        branch_name: `${key} (Headquarters)`,
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

    const rawCompany = String(company || 'Default').trim();
    const known = resolveKnownTenant(tenantId || rawCompany);
    const companyKey = known.companyName || rawCompany;
    let resolvedTenantCode = known.tenantCode;
    let resolvedTenantId = known.tenantId || tenantId;

    const admin = getAdminClient();
    if (!resolvedTenantCode && admin) {
      try {
        const { data: tRow } = await admin
          .from('tenants')
          .select('id, name, tenant_code')
          .or(`id.eq.${tenantId || '00000000-0000-0000-0000-000000000000'},tenant_code.eq.${rawCompany},name.ilike.${rawCompany}`)
          .maybeSingle();
        if (tRow) {
          resolvedTenantCode = tRow.tenant_code;
          resolvedTenantId = resolvedTenantId || tRow.id;
        }
      } catch (_) {}
    }

    if (!resolvedTenantCode) {
      resolvedTenantCode = 'TNT00001';
    }

    const localMap = await readLocalBranches();
    const existingList = [
      ...(localMap[companyKey] || []),
      ...(localMap[rawCompany] || [])
    ];

    let branchId = id;
    let cleanCode = branchCode ? String(branchCode).trim().toUpperCase() : null;

    if (!branchId) {
      // Auto-assign new sequential branch ID and Code: [TENANT_CODE]-B[0001..9999]
      const nextCode = getNextBranchCodeInternal(resolvedTenantCode, existingList);
      branchId = nextCode;
      if (!cleanCode) {
        cleanCode = nextCode;
      }
    } else {
      if (!cleanCode) {
        cleanCode = branchId.startsWith('TNT') ? branchId : getNextBranchCodeInternal(resolvedTenantCode, existingList);
      }
    }

    const nowIso = new Date().toISOString();

    const branchRecord = {
      id: branchId,
      company: companyKey,
      tenant_id: resolvedTenantId,
      tenant_code: resolvedTenantCode,
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
    const freshLocalMap = await readLocalBranches();
    if (!Array.isArray(freshLocalMap[companyKey])) {
      freshLocalMap[companyKey] = [];
    }

    const existingIdx = freshLocalMap[companyKey].findIndex(b => b.id === branchId || b.branch_code === cleanCode);
    if (existingIdx >= 0) {
      freshLocalMap[companyKey][existingIdx] = { ...freshLocalMap[companyKey][existingIdx], ...branchRecord };
    } else {
      freshLocalMap[companyKey].push(branchRecord);
    }

    await writeLocalBranches(freshLocalMap);

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
