'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * Server-side Text Normalizer:
 * Lowercases, trims, strips punctuation, and removes Dist/Distt/District prefixes/suffixes.
 */
export async function normalizeLocationText(rawText) {
  if (!rawText) return '';
  let norm = rawText.trim().toLowerCase();
  norm = norm.replace(/[^\w\s]/g, ' ');
  norm = norm.replace(/\b(distt|dist|district)\b/g, '');
  norm = norm.replace(/\s+/g, ' ');
  return norm.trim();
}

// 1. COUNTRIES
export async function getCountriesCentral() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_countries')
    .select('*')
    .eq('is_active', true)
    .order('country_name', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function createCountryCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.country_name);

  const { data, error } = await adminClient
    .from('location_countries')
    .insert([{
      country_code: payload.country_code.toUpperCase(),
      country_name: payload.country_name,
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 2. STATES
export async function getStatesCentral(countryId) {
  if (!countryId) return [];
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_states')
    .select('*')
    .eq('country_id', countryId)
    .eq('is_active', true)
    .order('state_name', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function createStateCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.state_name);

  const { data, error } = await adminClient
    .from('location_states')
    .insert([{
      country_id: payload.country_id,
      state_code: payload.state_code.toUpperCase(),
      state_name: payload.state_name,
      state_type: payload.state_type || 'STATE',
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 3. DISTRICTS
export async function getDistrictsCentral(stateId, countryId = null) {
  if (!stateId) return [];
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_districts')
    .select('*')
    .eq('state_id', stateId)
    .eq('is_active', true)
    .order('district_name', { ascending: true });

  if (countryId) {
    query = query.eq('country_id', countryId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function createDistrictCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.district_name);

  // Validate state belongs to country
  const { data: stateData } = await adminClient
    .from('location_states')
    .select('country_id')
    .eq('id', payload.state_id)
    .single();

  if (!stateData || stateData.country_id !== payload.country_id) {
    throw new Error('Validation Error: Selected District State does not belong to the selected Country!');
  }

  const { data, error } = await adminClient
    .from('location_districts')
    .insert([{
      country_id: payload.country_id,
      state_id: payload.state_id,
      district_code: payload.district_code.toUpperCase(),
      district_name: payload.district_name,
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 4. SUBDISTRICTS (TEHSILS / MANDALS)
export async function getSubdistrictsCentral(districtId) {
  if (!districtId) return [];
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_subdistricts')
    .select('*')
    .eq('district_id', districtId)
    .eq('is_active', true)
    .order('subdistrict_name', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function createSubdistrictCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.subdistrict_name);

  const { data, error } = await adminClient
    .from('location_subdistricts')
    .insert([{
      country_id: payload.country_id,
      state_id: payload.state_id,
      district_id: payload.district_id,
      subdistrict_code: payload.subdistrict_code.toUpperCase(),
      subdistrict_name: payload.subdistrict_name,
      subdistrict_type: payload.subdistrict_type || 'TEHSIL',
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 5. BLOCKS (DEVELOPMENT BLOCKS)
export async function getBlocksCentral(districtId) {
  if (!districtId) return [];
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_blocks')
    .select('*')
    .eq('district_id', districtId)
    .eq('is_active', true)
    .order('block_name', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function createBlockCentral(payload, userId = null) {
  const adminClient = getAdminClient();
  const nameNorm = await normalizeLocationText(payload.block_name);

  const { data, error } = await adminClient
    .from('location_blocks')
    .insert([{
      country_id: payload.country_id,
      state_id: payload.state_id,
      district_id: payload.district_id,
      subdistrict_id: payload.subdistrict_id || null, // Optional!
      block_code: payload.block_code.toUpperCase(),
      block_name: payload.block_name,
      official_code: payload.official_code || null,
      name_normalized: nameNorm,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 6. SETTLEMENTS (CITIES, TOWNS, VILLAGES)
export async function getSettlementsCentral(districtId, subdistrictId = null, blockId = null, search = '') {
  if (!districtId) return [];
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_settlements')
    .select('*')
    .eq('district_id', districtId)
    .eq('is_active', true)
    .order('settlement_name', { ascending: true });

  if (subdistrictId) {
    query = query.eq('subdistrict_id', subdistrictId);
  }
  if (blockId) {
    query = query.eq('block_id', blockId);
  }
  if (search && search.trim().length >= 2) {
    const norm = await normalizeLocationText(search);
    query = query.ilike('name_normalized', `%${norm}%`).limit(50);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

// 7. POST OFFICES & PIN CODES
export async function getPostOfficesCentral(pinCode, districtId = null) {
  if (!pinCode && !districtId) return [];
  const adminClient = getAdminClient();
  let query = adminClient
    .from('location_post_offices')
    .select('*, settlement:location_settlements(settlement_name)')
    .eq('is_active', true)
    .order('post_office_name', { ascending: true });

  if (pinCode) {
    query = query.eq('pin_code', pinCode.trim());
  }
  if (districtId) {
    query = query.eq('district_id', districtId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

// 8. LOCATION EXPLORER & SUMMARY STATS
export async function getLocationExplorer(filters = {}, page = 1, limit = 20) {
  const adminClient = getAdminClient();

  const [
    { count: totalStates },
    { count: totalDistricts },
    { count: totalSubdistricts },
    { count: totalBlocks },
    { count: totalSettlements },
    { count: totalPostOffices },
    { count: pendingRequests }
  ] = await Promise.all([
    adminClient.from('location_states').select('*', { count: 'exact', head: true }),
    adminClient.from('location_districts').select('*', { count: 'exact', head: true }),
    adminClient.from('location_subdistricts').select('*', { count: 'exact', head: true }),
    adminClient.from('location_blocks').select('*', { count: 'exact', head: true }),
    adminClient.from('location_settlements').select('*', { count: 'exact', head: true }),
    adminClient.from('location_post_offices').select('*', { count: 'exact', head: true }),
    adminClient.from('location_requests').select('*', { count: 'exact', head: true }).eq('request_status', 'PENDING')
  ]);

  // Paginated Explorer Table Query
  let query = adminClient
    .from('location_districts')
    .select('id, district_code, district_name, official_code, is_active, updated_at, state:location_states(state_name, country:location_countries(country_name))', { count: 'exact' });

  if (filters.state_id) {
    query = query.eq('state_id', filters.state_id);
  }
  if (filters.search) {
    const norm = await normalizeLocationText(filters.search);
    query = query.ilike('name_normalized', `%${norm}%`);
  }

  const fromIndex = (page - 1) * limit;
  const toIndex = fromIndex + limit - 1;

  const { data, count, error } = await query.range(fromIndex, toIndex).order('district_name', { ascending: true });

  return {
    summary: {
      totalStates: totalStates || 0,
      totalDistricts: totalDistricts || 0,
      totalSubdistricts: totalSubdistricts || 0,
      totalBlocks: totalBlocks || 0,
      totalSettlements: totalSettlements || 0,
      totalPostOffices: totalPostOffices || 0,
      pendingRequests: pendingRequests || 0
    },
    rows: data || [],
    totalCount: count || 0,
    page,
    limit
  };
}

// 9. LOCATION ALIAS RESOLVER & MATCHING
export async function resolveLocationAliasCentral(rawName, locationType = 'DISTRICT', parentId = null) {
  if (!rawName) return null;
  const adminClient = getAdminClient();
  const norm = await normalizeLocationText(rawName);

  // 1. Exact Alias Match
  const { data: alias } = await adminClient
    .from('location_aliases')
    .select('canonical_location_id')
    .eq('alias_normalized', norm)
    .eq('location_type', locationType)
    .eq('is_active', true)
    .single();

  if (alias) return { matchType: 'ALIAS_MATCH', id: alias.canonical_location_id };

  // 2. Canonical Name Match under parent
  let query = adminClient
    .from('location_districts')
    .select('id')
    .eq('name_normalized', norm)
    .eq('is_active', true);

  if (parentId) {
    query = query.eq('state_id', parentId);
  }

  const { data: canonical } = await query.single();
  if (canonical) return { matchType: 'EXACT_MATCH', id: canonical.id };

  return { matchType: 'NO_MATCH', id: null };
}

// 10. LOCATION REQUESTS & APPROVAL WORKFLOW
export async function submitLocationRequest(reqData, userId = null) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_requests')
    .insert([{
      ...reqData,
      request_status: 'PENDING',
      requested_by: userId,
      requested_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPendingLocationRequests() {
  const adminClient = getAdminClient();
  const { data } = await adminClient
    .from('location_requests')
    .select('*, state:location_states(state_name), district:location_districts(district_name)')
    .order('requested_at', { ascending: false });

  return data || [];
}

export async function processLocationRequest(requestId, status, matchedLocationId = null, reviewRemarks = '', userId = null) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_requests')
    .update({
      request_status: status,
      matched_location_id: matchedLocationId,
      review_remarks: reviewRemarks,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// 11. IMPORT STAGING & WIZARD
export async function createImportBatchCentral(sourceFileName, userId = null) {
  const adminClient = getAdminClient();
  const batchCode = `BATCH-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('location_import_batches')
    .insert([{
      batch_code: batchCode,
      source_file_name: sourceFileName,
      imported_by: userId,
      batch_status: 'UPLOADED'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function processImportStagingRows(batchId, rows = []) {
  const adminClient = getAdminClient();
  let validCount = 0;
  let errorCount = 0;

  const stagingPayloads = rows.map((r, idx) => {
    const isValid = r.state_name_raw && r.district_name_raw;
    if (isValid) validCount++; else errorCount++;

    return {
      import_batch_id: batchId,
      row_number: idx + 1,
      country_name_raw: r.country_name_raw || 'India',
      state_name_raw: r.state_name_raw,
      district_name_raw: r.district_name_raw,
      subdistrict_name_raw: r.subdistrict_name_raw,
      block_name_raw: r.block_name_raw,
      settlement_name_raw: r.settlement_name_raw,
      pin_code_raw: r.pin_code_raw,
      validation_status: isValid ? 'VALID' : 'INVALID',
      import_action: isValid ? 'CREATE' : 'REVIEW'
    };
  });

  await adminClient.from('location_import_staging').insert(stagingPayloads);

  await adminClient.from('location_import_batches').update({
    total_rows: rows.length,
    valid_rows: validCount,
    error_rows: errorCount,
    batch_status: 'VALIDATED'
  }).eq('id', batchId);

  return { batchId, total: rows.length, valid: validCount, invalid: errorCount };
}
