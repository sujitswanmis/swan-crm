'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getTenantBranches } from './tenantBranches';

const getAdminClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Normalizes branch codes/tags to match records
 */
function normalizeBranchTag(branch) {
  if (!branch || branch === 'All' || branch.includes('Universal') || branch.includes('All Branches')) {
    return 'ALL';
  }
  const bLower = String(branch).toLowerCase().trim();
  if (bLower.includes('nsmlr') || bLower.includes('raian')) return 'NSMLR';
  if (bLower.includes('nstlp') || bLower.includes('paharuwal')) return 'NSTLP';
  if (bLower.includes('headquarters') || bLower.includes('nsg') || bLower.includes('main')) return 'NSG';
  if (bLower.includes('nse1') || bLower.includes('enterprises - 1')) return 'NSE1';
  if (bLower.includes('nse2') || bLower.includes('enterprises - 2')) return 'NSE2';
  if (bLower.includes('nse3') || bLower.includes('enterprises - 3')) return 'NSE3';
  if (bLower.includes('nse4') || bLower.includes('enterprises - 4')) return 'NSE4';
  if (bLower.includes('autocomp') || bLower.includes('nsacpl')) return 'NSACPL1';
  return branch.trim();
}

const STATE_NAMES = {
  STATE_UP: 'Uttar Pradesh',
  STATE_MP: 'Madhya Pradesh',
  STATE_BIHAR: 'Bihar',
  STATE_PB: 'Punjab',
  STATE_HR: 'Haryana',
  STATE_MH: 'Maharashtra',
  STATE_RJ: 'Rajasthan',
  STATE_GJ: 'Gujarat',
  STATE_DL: 'Delhi',
  STATE_OD: 'Odisha',
  STATE_WB: 'West Bengal',
  STATE_UK: 'Uttarakhand'
};

/**
 * Normalizes input subFilter into either structured rules array, string tags array, or 'ALL'
 */
function normalizeSubFilterInput(subFilter) {
  if (!subFilter) return 'ALL';
  if (Array.isArray(subFilter)) {
    if (subFilter.length > 0 && typeof subFilter[0] === 'object' && subFilter[0] !== null && 'field' in subFilter[0]) {
      const activeRules = subFilter.filter(r => r && r.field && Array.isArray(r.values) && r.values.length > 0);
      return activeRules.length > 0 ? activeRules : 'ALL';
    }
    return subFilter;
  }
  if (typeof subFilter === 'string') {
    const trimmed = subFilter.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null && 'field' in parsed[0]) {
          const activeRules = parsed.filter(r => r && r.field && Array.isArray(r.values) && r.values.length > 0);
          return activeRules.length > 0 ? activeRules : 'ALL';
        }
        return parsed;
      } catch (e) {}
    }
    return trimmed;
  }
  return subFilter;
}

/**
 * Helper to apply dynamic multi-field filter rules or legacy sub-filters on Supabase PostgREST query
 */
function applyAudienceSubFilter(query, audienceType, subFilter) {
  if (!subFilter) return query;
  const normalized = normalizeSubFilterInput(subFilter);
  if (normalized === 'ALL') return query;

  // CASE 1: DYNAMIC RULE BUILDER RULES [{ field, condition, values }]
  if (Array.isArray(normalized) && normalized.length > 0 && typeof normalized[0] === 'object' && 'field' in normalized[0]) {
    for (const rule of normalized) {
      const field = String(rule.field || '').toLowerCase().trim();
      const condition = String(rule.condition || 'IN').toUpperCase().trim();
      const values = Array.isArray(rule.values) ? rule.values.filter(Boolean) : [rule.values].filter(Boolean);
      if (values.length === 0) continue;

      // 1. LEADS
      if (audienceType === 'leads') {
        if (field === 'status' || field === 'stage') {
          const stageClauses = [];
          values.forEach(v => {
            const vStr = String(v).toLowerCase();
            if (vStr.includes('01') || vStr.includes('new')) {
              stageClauses.push('status.ilike.1;%', 'status.ilike.%New Stage%', 'status.eq.None', 'status.is.null', 'status.eq.');
            } else if (vStr.includes('02') || vStr.includes('contact')) {
              stageClauses.push('status.ilike.2;%', 'status.ilike.%Contact Stage%');
            } else if (vStr.includes('03') || vStr.includes('qualification')) {
              stageClauses.push('status.ilike.3;%', 'status.ilike.%Qualification Stage%');
            } else if (vStr.includes('04') || vStr.includes('follow up') || vStr.includes('followup')) {
              stageClauses.push('status.ilike.4;%', 'status.ilike.%Follow Up Stage%');
            } else if (vStr.includes('05') || vStr.includes('sales process')) {
              stageClauses.push('status.ilike.5;%', 'status.ilike.%Sales Process Stage%');
            } else if (vStr.includes('06') || vStr.includes('conversion')) {
              stageClauses.push('status.ilike.6;%', 'status.ilike.%Conversion Stage%');
            } else if (vStr.includes('07') || vStr.includes('final')) {
              stageClauses.push('status.ilike.7;%', 'status.ilike.%Final Stage%');
            } else if (vStr.includes('08') || vStr.includes('transfer')) {
              stageClauses.push('status.ilike.8;%', 'status.ilike.%Transfer to Party%');
            } else {
              stageClauses.push(`status.ilike.%${v}%`);
            }
          });
          if (stageClauses.length > 0) {
            if (condition === 'NOT_IN' || condition === 'NOT IN') {
              values.forEach(v => {
                const num = (String(v).match(/\d+/) || [])[0];
                if (num) query = query.not('status', 'ilike', `${parseInt(num, 10)};%`);
              });
            } else {
              query = query.or(Array.from(new Set(stageClauses)).join(','));
            }
          }
        } else if (field === 'state') {
          if (condition === 'NOT_IN' || condition === 'NOT IN') {
            values.forEach(v => { query = query.not('state_name', 'ilike', `%${v.trim()}%`); });
          } else {
            const clauses = values.map(v => `state_name.ilike.%${v.trim()}%`);
            query = query.or(clauses.join(','));
          }
        } else if (field === 'priority') {
          const prioClauses = [];
          values.forEach(v => {
            const vStr = String(v).toLowerCase();
            if (vStr.includes('high') || vStr.includes('hot')) {
              prioClauses.push('priority.ilike.%High%', 'priority.ilike.%Hot%');
            } else if (vStr.includes('medium') || vStr.includes('warm')) {
              prioClauses.push('priority.ilike.%Medium%', 'priority.ilike.%Warm%');
            } else if (vStr.includes('low') || vStr.includes('normal')) {
              prioClauses.push('priority.ilike.%Low%', 'priority.ilike.%Normal%');
            }
          });
          if (prioClauses.length > 0) {
            query = query.or(Array.from(new Set(prioClauses)).join(','));
          }
        }
      }

      // 2. PARTY
      if (audienceType === 'party') {
        if (field === 'state') {
          if (condition === 'NOT_IN' || condition === 'NOT IN') {
            values.forEach(v => { query = query.not('business_nature', 'ilike', `%${v.trim()}%`); });
          } else {
            const clauses = values.flatMap(v => [
              `business_nature.ilike.%${v.trim()}%`,
              `party_universal_code.ilike.%${v.trim()}%`
            ]);
            query = query.or(Array.from(new Set(clauses)).join(','));
          }
        } else if (field === 'nature' || field === 'type') {
          const natureClauses = [];
          values.forEach(v => {
            const vStr = String(v).toLowerCase();
            if (vStr.includes('exclusive')) natureClauses.push('business_nature.ilike.%EXCLUSIVE_SWAN%');
            if (vStr.includes('dealer')) natureClauses.push('business_nature.ilike.%"party_type":"Dealer"%', 'business_nature.ilike.%Dealer%');
            if (vStr.includes('distributor')) natureClauses.push('business_nature.ilike.%"party_type":"Distributor"%', 'business_nature.ilike.%Distributor%');
            if (vStr.includes('direct')) natureClauses.push('business_nature.ilike.%Direct%');
          });
          if (natureClauses.length > 0) {
            query = query.or(Array.from(new Set(natureClauses)).join(','));
          }
        } else if (field === 'status') {
          const statusClauses = [];
          values.forEach(v => {
            const vStr = String(v).toLowerCase();
            if (vStr.includes('active')) statusClauses.push('party_status.eq.Active', 'business_nature.ilike.%"activation_status":"Active"%');
            if (vStr.includes('hold')) statusClauses.push('party_status.ilike.%Hold%', 'business_nature.ilike.%"activation_status":"Hold"%');
            if (vStr.includes('draft')) statusClauses.push('party_status.ilike.%Draft%');
          });
          if (statusClauses.length > 0) {
            query = query.or(Array.from(new Set(statusClauses)).join(','));
          }
        }
      }

      // 3. USERS
      if (audienceType === 'users') {
        if (field === 'department') {
          const deptClauses = [];
          values.forEach(v => {
            const vStr = String(v).toLowerCase().trim();
            if (vStr === 'sales & marketing' || vStr === 'sales and marketing') {
              deptClauses.push('department.ilike.%Sales%', 'department.ilike.%Marketing%');
            } else if (vStr === 'human resource & administration' || vStr === 'hr & administration') {
              deptClauses.push('department.ilike.%Human Resource%', 'department.ilike.%Administration%');
            } else if (vStr === 'production planning and control' || vStr === 'ppc') {
              deptClauses.push('department.ilike.%Production Planning%', 'department.ilike.%PPC%');
            } else if (vStr === 'electrical & maintenance') {
              deptClauses.push('department.ilike.%Electrical%', 'department.ilike.%Maintenance%');
            } else if (vStr === 'research & development' || vStr === 'r&d') {
              deptClauses.push('department.ilike.%Research%', 'department.ilike.%Development%', 'department.ilike.%R&D%');
            } else if (vStr === 'corporate strategy and planning') {
              deptClauses.push('department.ilike.%Corporate Strategy%', 'department.ilike.%Planning%');
            } else if (vStr === 'training and development') {
              deptClauses.push('department.ilike.%Training%');
            } else if (vStr === 'manufacturing engineering') {
              deptClauses.push('department.ilike.%Manufacturing%');
            } else if (vStr === 'vendor development') {
              deptClauses.push('department.ilike.%Vendor%');
            } else {
              deptClauses.push(`department.ilike.%${v.trim()}%`);
            }
          });
          if (deptClauses.length > 0) {
            if (condition === 'NOT_IN' || condition === 'NOT IN') {
              values.forEach(v => { query = query.not('department', 'ilike', `%${v.trim()}%`); });
            } else {
              query = query.or(Array.from(new Set(deptClauses)).join(','));
            }
          }
        } else if (field === 'status') {
          const hasActive = values.some(v => String(v).toLowerCase().includes('active') && !String(v).toLowerCase().includes('inactive'));
          const hasInactive = values.some(v => String(v).toLowerCase().includes('inactive') || String(v).toLowerCase().includes('resigned'));
          if (hasActive && !hasInactive) {
            query = query.or('emp_status.eq.Active,status.eq.Active');
          } else if (hasInactive && !hasActive) {
            query = query.neq('emp_status', 'Active');
          }
        } else if (field === 'role') {
          const roleClauses = values.map(v => `role.ilike.%${v}%`);
          if (roleClauses.length > 0) {
            query = query.or(Array.from(new Set(roleClauses)).join(','));
          }
        }
      }
    }
    return query;
  }

  // CASE 2: LEGACY TAG KEYS (e.g. ['STAGE_01', 'STATE_UP'])
  const rawList = Array.isArray(normalized) ? normalized : String(normalized).split(',');
  const filterKeys = rawList.map(s => String(s).trim().toUpperCase()).filter(Boolean);

  if (filterKeys.length === 0 || filterKeys.includes('ALL')) return query;

  // 1. USER MANAGE FILTERS
  if (audienceType === 'users') {
    // Employment Status (Active vs Inactive)
    const hasActive = filterKeys.includes('STATUS_ACTIVE');
    const hasInactive = filterKeys.includes('STATUS_INACTIVE');

    if (hasActive && !hasInactive) {
      query = query.or('emp_status.eq.Active,status.eq.Active');
    } else if (hasInactive && !hasActive) {
      query = query.neq('emp_status', 'Active');
    }

    // Departments (Multi-Select Union)
    const deptKeys = filterKeys.filter(k => k.startsWith('DEPT_'));
    if (deptKeys.length > 0) {
      const deptClauses = [];
      deptKeys.forEach(k => {
        switch (k) {
          case 'DEPT_SALES':
            deptClauses.push('department.ilike.%Sales%', 'department.ilike.%Marketing%');
            break;
          case 'DEPT_HR':
            deptClauses.push('department.ilike.%Human Resource%', 'department.ilike.%Administration%');
            break;
          case 'DEPT_PRODUCTION':
            deptClauses.push('department.ilike.%Production%', 'department.ilike.%Tool Room%');
            break;
          case 'DEPT_QA':
            deptClauses.push('department.ilike.%Quality Assurance%');
            break;
          case 'DEPT_SERVICE':
            deptClauses.push('department.ilike.%Service%');
            break;
          case 'DEPT_PURCHASE':
            deptClauses.push('department.ilike.%Purchase%');
            break;
          case 'DEPT_ACCOUNTS':
            deptClauses.push('department.ilike.%Accounts%', 'department.ilike.%Finance%');
            break;
          case 'DEPT_IT':
            deptClauses.push('department.ilike.%Information Technology%', 'department.ilike.%IT%');
            break;
          case 'DEPT_LOGISTICS':
            deptClauses.push('department.ilike.%Logistics%', 'department.ilike.%Dispatch%');
            break;
          case 'DEPT_STORE':
            deptClauses.push('department.ilike.%Store%');
            break;
          default:
            deptClauses.push(`department.ilike.%${k.replace('DEPT_', '')}%`);
        }
      });
      if (deptClauses.length > 0) {
        query = query.or(Array.from(new Set(deptClauses)).join(','));
      }
    }
    return query;
  }

  // 2. PARTY MASTER FILTERS
  if (audienceType === 'party') {
    // States (Multi-Select Union: UP, MP, Bihar, Punjab, etc.)
    const stateKeys = filterKeys.filter(k => k.startsWith('STATE_'));
    if (stateKeys.length > 0) {
      const stateClauses = [];
      stateKeys.forEach(k => {
        const stateName = STATE_NAMES[k] || k.replace('STATE_', '');
        stateClauses.push(`business_nature.ilike.%${stateName}%`, `party_universal_code.ilike.%${stateName}%`);
      });
      if (stateClauses.length > 0) {
        query = query.or(Array.from(new Set(stateClauses)).join(','));
      }
    }

    // Partner Nature / Type
    const natureKeys = filterKeys.filter(k => k.startsWith('NATURE_') || ['EXCLUSIVE', 'DEALER', 'DISTRIBUTOR', 'DIRECT'].includes(k));
    if (natureKeys.length > 0) {
      const natureClauses = [];
      natureKeys.forEach(k => {
        if (k.includes('EXCLUSIVE')) natureClauses.push('business_nature.ilike.%EXCLUSIVE_SWAN%');
        if (k.includes('DEALER')) natureClauses.push('business_nature.ilike.%"party_type":"Dealer"%', 'business_nature.ilike.%Dealer%');
        if (k.includes('DISTRIBUTOR')) natureClauses.push('business_nature.ilike.%"party_type":"Distributor"%', 'business_nature.ilike.%Distributor%');
        if (k.includes('DIRECT')) natureClauses.push('business_nature.ilike.%Direct%');
      });
      if (natureClauses.length > 0) {
        query = query.or(Array.from(new Set(natureClauses)).join(','));
      }
    }

    // Activation & Status
    const statusKeys = filterKeys.filter(k => k.startsWith('PARTY_STATUS_') || ['ACTIVE', 'HOLD', 'DRAFT'].includes(k));
    if (statusKeys.length > 0) {
      const statusClauses = [];
      statusKeys.forEach(k => {
        if (k.includes('ACTIVE')) statusClauses.push('party_status.eq.Active', 'business_nature.ilike.%"activation_status":"Active"%');
        if (k.includes('HOLD')) statusClauses.push('party_status.ilike.%Hold%', 'business_nature.ilike.%"activation_status":"Hold"%');
        if (k.includes('DRAFT')) statusClauses.push('party_status.ilike.%Draft%');
      });
      if (statusClauses.length > 0) {
        query = query.or(Array.from(new Set(statusClauses)).join(','));
      }
    }
    return query;
  }

  // 3. LEAD MANAGEMENT FILTERS
  if (audienceType === 'leads') {
    // Pipeline Stages (Multi-Select Union)
    const stageKeys = filterKeys.filter(k => k.startsWith('STAGE_'));
    if (stageKeys.length > 0) {
      const stageClauses = [];
      stageKeys.forEach(k => {
        switch (k) {
          case 'STAGE_01': stageClauses.push('status.ilike.1;%', 'status.ilike.%New Stage%', 'status.eq.None', 'status.is.null', 'status.eq.'); break;
          case 'STAGE_02': stageClauses.push('status.ilike.2;%', 'status.ilike.%Contact Stage%'); break;
          case 'STAGE_03': stageClauses.push('status.ilike.3;%', 'status.ilike.%Qualification Stage%'); break;
          case 'STAGE_04': stageClauses.push('status.ilike.4;%', 'status.ilike.%Follow Up Stage%'); break;
          case 'STAGE_05': stageClauses.push('status.ilike.5;%', 'status.ilike.%Sales Process Stage%'); break;
          case 'STAGE_06': stageClauses.push('status.ilike.6;%', 'status.ilike.%Conversion Stage%'); break;
          case 'STAGE_07': stageClauses.push('status.ilike.7;%', 'status.ilike.%Final Stage%'); break;
          case 'STAGE_08': stageClauses.push('status.ilike.8;%', 'status.ilike.%Transfer to Party%'); break;
        }
      });
      if (stageClauses.length > 0) {
        query = query.or(Array.from(new Set(stageClauses)).join(','));
      }
    }

    // States (Multi-Select Union)
    const stateKeys = filterKeys.filter(k => k.startsWith('STATE_'));
    if (stateKeys.length > 0) {
      const stateClauses = [];
      stateKeys.forEach(k => {
        const stateName = STATE_NAMES[k] || k.replace('STATE_', '');
        stateClauses.push(`state_name.ilike.%${stateName}%`);
      });
      if (stateClauses.length > 0) {
        query = query.or(Array.from(new Set(stateClauses)).join(','));
      }
    }

    // Priority
    const priorityKeys = filterKeys.filter(k => k.startsWith('PRIORITY_'));
    if (priorityKeys.length > 0) {
      const prioClauses = [];
      priorityKeys.forEach(k => {
        if (k.includes('HOT')) prioClauses.push('priority.ilike.%High%', 'priority.ilike.%Hot%');
        if (k.includes('WARM')) prioClauses.push('priority.ilike.%Medium%', 'priority.ilike.%Warm%');
      });
      if (prioClauses.length > 0) {
        query = query.or(Array.from(new Set(prioClauses)).join(','));
      }
    }
    return query;
  }

  return query;
}

/**
 * Fetch all available departments synchronized with Settings ➔ Manage Departments (departments table)
 */
export async function getSyncedDepartmentsList() {
  const supabase = getAdminClient();
  if (!supabase) return [];
  try {
    const { data: deptRows, error: dErr } = await supabase
      .from('departments')
      .select('name')
      .order('name', { ascending: true });

    const dbDepts = (deptRows || [])
      .map(d => (d.name || '').trim())
      .filter(d => d && d.toLowerCase() !== 'all');

    // Also get distinct departments from user_roles table
    const { data: userRows } = await supabase
      .from('user_roles')
      .select('department')
      .not('department', 'is', null);

    const userDepts = (userRows || [])
      .map(u => (u.department || '').trim())
      .filter(Boolean);

    // Merge and deduplicate
    const combined = Array.from(new Set([...dbDepts, ...userDepts]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return combined;
  } catch (err) {
    console.error('getSyncedDepartmentsList error:', err);
    return [];
  }
}

/**
 * Get realtime audience counts across all 4 modules filtered by branch and sub-filter
 */
export async function getCampaignAudienceStats({ tenantId = null, branchFilter = 'All', audienceType = null, subFilter = 'ALL' } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return { partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 };

  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const branchTag = normalizeBranchTag(branchFilter);
  const normalizedFilter = normalizeSubFilterInput(subFilter);

  try {
    // 1. Party Master Count (Exact Head Query)
    let partyQuery = supabase.from('party_master').select('*', { count: 'exact', head: true });
    if (effectiveTenantId) partyQuery = partyQuery.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') {
      partyQuery = partyQuery.or(`party_universal_code.ilike.%${branchTag}%,business_nature.ilike.%${branchTag}%`);
    }
    if ((!audienceType || audienceType === 'party') && normalizedFilter !== 'ALL') {
      partyQuery = applyAudienceSubFilter(partyQuery, 'party', normalizedFilter);
    }
    const { count: partyCount, error: pErr } = await partyQuery;

    // 2. Leads Count (Exact Head Query - Uncapped by 1000 row PostgREST limit)
    let leadQuery = supabase.from('leads').select('*', { count: 'exact', head: true });
    if (effectiveTenantId) leadQuery = leadQuery.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') {
      leadQuery = leadQuery.ilike('our_company', `%${branchTag}%`);
    }
    if ((!audienceType || audienceType === 'leads') && normalizedFilter !== 'ALL') {
      leadQuery = applyAudienceSubFilter(leadQuery, 'leads', normalizedFilter);
    }
    const { count: leadCount, error: lErr } = await leadQuery;

    // 3. End Customers Count (Exact Head Query)
    let custQuery = supabase.from('end_customers').select('*', { count: 'exact', head: true });
    if (effectiveTenantId) custQuery = custQuery.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') {
      custQuery = custQuery.or(`our_company.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
    }
    const { count: customerCount, error: cErr } = await custQuery;

    // 4. User Manage Count (Exact Head Query)
    let userQuery = supabase.from('user_roles').select('*', { count: 'exact', head: true });
    if (effectiveTenantId) userQuery = userQuery.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') {
      userQuery = userQuery.or(`company.ilike.%${branchTag}%,branch_name.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
    }
    if ((!audienceType || audienceType === 'users') && normalizedFilter !== 'ALL') {
      userQuery = applyAudienceSubFilter(userQuery, 'users', normalizedFilter);
    }
    const { count: userCount, error: uErr } = await userQuery;

    return {
      partyCount: typeof partyCount === 'number' ? partyCount : 0,
      leadCount: typeof leadCount === 'number' ? leadCount : 0,
      customerCount: typeof customerCount === 'number' ? customerCount : 0,
      userCount: typeof userCount === 'number' ? userCount : 0
    };
  } catch (err) {
    console.error('getCampaignAudienceStats error:', err);
    return { partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 };
  }
}

/**
 * Fetch records for Live Preview (Uncapped to display up to 200 matching contacts)
 */
export async function getCampaignAudiencePreview({ tenantId = null, audienceType = 'party', branchFilter = 'All', subFilter = 'ALL', limit = 200 } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const branchTag = normalizeBranchTag(branchFilter);
  const normalizedFilter = normalizeSubFilterInput(subFilter);

  try {
    if (audienceType === 'party') {
      let q = supabase.from('party_master')
        .select('id, firm_name, legal_name, biz_contact_no_1, primary_mobile, contact_person_name_1, contact_mobile_1_1, party_universal_code, business_nature')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`party_universal_code.ilike.%${branchTag}%,business_nature.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'party', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(p => ({
        id: p.id,
        name: p.firm_name || p.legal_name || 'Party Partner',
        subName: p.contact_person_name_1 || 'Primary Contact',
        phone: p.biz_contact_no_1 || p.primary_mobile || p.contact_mobile_1_1 || 'N/A',
        altPhone: p.contact_mobile_1_1 || '',
        tag: p.party_universal_code || 'Party'
      }));
    }

    if (audienceType === 'leads') {
      let q = supabase.from('leads')
        .select('id, company, name, phone, business_contact_1, cp2_name, cp2_mobile_1, our_company, status, state_name')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.ilike('our_company', `%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'leads', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(l => ({
        id: l.id,
        name: l.company || l.name || 'Lead Client',
        subName: l.name || 'CP1',
        phone: l.business_contact_1 || l.phone || 'N/A',
        altPhone: l.phone || '',
        tag: l.our_company || 'Lead'
      }));
    }

    if (audienceType === 'end_customers') {
      let q = supabase.from('end_customers')
        .select('id, full_name, mobile_1, mobile_2, linked_party_name, product_name, our_company')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`our_company.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
      }
      const { data } = await q.limit(limit);
      return (data || []).map(c => ({
        id: c.id,
        name: c.full_name || 'End Customer',
        subName: c.linked_party_name ? `Via ${c.linked_party_name}` : (c.product_name || 'Equipment'),
        phone: c.mobile_1 || 'N/A',
        altPhone: c.mobile_2 || '',
        tag: c.product_name || 'Customer'
      }));
    }

    if (audienceType === 'users') {
      let q = supabase.from('user_roles')
        .select('id, emp_name, name, emp_mobile, emp_alt_mobile, role, emp_designation, company, branch_name, department')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`company.ilike.%${branchTag}%,branch_name.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'users', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(u => ({
        id: u.id,
        name: u.emp_name || u.name || 'Employee',
        subName: u.emp_designation || u.department || 'Staff',
        phone: u.emp_mobile || 'N/A',
        altPhone: u.emp_alt_mobile || '',
        tag: u.department || u.branch_name || 'Team'
      }));
    }

    return [];
  } catch (err) {
    console.error('getCampaignAudiencePreview error:', err);
    return [];
  }
}

/**
 * Save campaign configuration as a Draft
 */
export async function saveWhatsappCampaignDraft({
  tenantId = null,
  campaignName = '',
  audienceType = 'leads',
  branchFilter = 'All',
  subFilter = ['ALL'],
  templateId = null,
  recipientPriority = null,
  sendMode = 'immediate',
  scheduledAt = null,
  throttleSpeed = 'safe'
} = {}) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Database client unavailable' };

  try {
    const campaignTitle = (campaignName || '').trim() || `Draft Campaign ${new Date().toLocaleDateString('en-IN')}`;

    let templateName = 'Not Selected';
    if (templateId) {
      const { data: tpl } = await supabase.from('whatsapp_templates').select('template_name').eq('id', templateId).single();
      if (tpl?.template_name) templateName = tpl.template_name;
    }

    const { data, error } = await supabase.from('whatsapp_message_logs').insert({
      template_id: templateId || null,
      sent_at: new Date().toISOString(),
      status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
        campaignName: campaignTitle,
        audienceType,
        subFilters: Array.isArray(subFilter) ? subFilter : [subFilter],
        branchFilter,
        templateId: templateId || null,
        templateName,
        recipientPriority,
        sendMode,
        scheduledAt,
        throttleSpeed,
        status: 'Draft',
        createdAt: new Date().toISOString()
      })}`
    }).select('id');

    if (error) throw error;

    return {
      success: true,
      id: data?.[0]?.id,
      campaignName: campaignTitle,
      message: `Campaign "${campaignTitle}" saved as Draft successfully!`
    };
  } catch (err) {
    console.error('saveWhatsappCampaignDraft error:', err);
    return { success: false, error: err.message || 'Failed to save draft' };
  }
}

/**
 * Dispatch single message through active WhatsApp BSP Gateway
 */
async function dispatchSingleWhatsapp({ phone, text, template, settings, targetCompany = 'NSMLR' }) {
  let phoneStr = String(phone).replace(/\D/g, '');
  if (phoneStr.length === 10) phoneStr = '91' + phoneStr;

  let parsedProviderConfig = null;
  if (settings.api_key && typeof settings.api_key === 'string' && settings.api_key.trim().startsWith('{')) {
    try { parsedProviderConfig = JSON.parse(settings.api_key); } catch (_) {}
  }

  const customBsps = Array.isArray(parsedProviderConfig?.custom_bsps) ? parsedProviderConfig.custom_bsps : [];
  let activeProvider = null;

  const tplTarget = String(template.provider || template.company || '').trim().toLowerCase();
  if (tplTarget.includes('aisensy')) activeProvider = 'aisensy';
  else if (tplTarget.includes('interakt')) activeProvider = 'interakt';
  else if (tplTarget.includes('meta')) activeProvider = 'meta';
  else if (tplTarget.includes('wati')) activeProvider = 'wati';
  else if (tplTarget.includes('nextel')) activeProvider = 'nextel';
  else {
    const matchedCustom = customBsps.find(b => 
      tplTarget.includes(b.id?.toLowerCase()) || 
      (b.name && tplTarget.includes(b.name.toLowerCase()))
    );
    if (matchedCustom) activeProvider = matchedCustom.id;
  }

  if (!activeProvider) {
    const clientAlloc = parsedProviderConfig?.client_allocations?.[targetCompany] || 
                        parsedProviderConfig?.client_allocations?.[targetCompany.toLowerCase()] ||
                        parsedProviderConfig?.client_allocations?.[targetCompany.toUpperCase()];
    if (clientAlloc?.default_bsp) {
      activeProvider = clientAlloc.default_bsp;
    } else if (targetCompany === 'NSTLP' || tplTarget === 'nstlp') {
      activeProvider = 'nextel';
    } else {
      activeProvider = 'aisensy';
    }
  }

  const clientCreds = parsedProviderConfig?.client_allocations?.[targetCompany]?.credentials || {};

  // 1. Meta Direct Cloud API
  if (activeProvider === 'meta') {
    const meta = clientCreds?.meta || parsedProviderConfig?.meta || {};
    if (!meta.phone_number_id || !meta.access_token) {
      throw new Error("Meta Cloud API Phone ID or Access Token is missing in WhatsApp Settings");
    }
    const version = meta.api_version || 'v21.0';
    const endpoint = `https://graph.facebook.com/${version}/${meta.phone_number_id}/messages`;

    const components = [];
    if (template.image_url) {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { link: template.image_url } }]
      });
    }
    components.push({
      type: "body",
      parameters: [{ type: "text", text }]
    });

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneStr,
      type: "template",
      template: {
        name: template.campaign_name || template.template_name,
        language: { code: "en" },
        components
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${meta.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const resData = await res.json();
    if (!res.ok || resData.error) {
      throw new Error(resData.error?.message || "Failed to send Meta WhatsApp message");
    }
    return { success: true, provider: 'meta' };
  }

  // 2. AiSensy / Default Gateway
  const endpointUrl = parsedProviderConfig?.aisensy?.endpoint_url || 'https://backend.aisensy.com/campaign/t1/api/v2';
  const apiKey = parsedProviderConfig?.aisensy?.api_key || settings.api_key;

  const payload = {
    apiKey: apiKey || '',
    campaignName: template.campaign_name || template.template_name,
    destination: phoneStr,
    userName: text || 'Partner',
    templateParams: [text || 'Partner'],
    media: template.image_url ? { url: template.image_url, filename: 'image.jpg' } : undefined
  };

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const resText = await response.text();
  let resJson = null;
  try { resJson = JSON.parse(resText); } catch (_) {}

  if (!response.ok || (resJson && resJson.success === false)) {
    throw new Error(resJson?.message || resJson?.error || `HTTP ${response.status}: Failed to send WhatsApp message`);
  }

  return { success: true, provider: activeProvider };
}

/**
 * Launch WhatsApp Broadcast Campaign
 */
export async function launchWhatsappBroadcastCampaign({
  tenantId = null,
  campaignName = '',
  audienceType = 'party',
  branchFilter = 'All',
  subFilter = 'ALL',
  templateId,
  recipientPriority = 'default',
  sendMode = 'immediate',
  scheduledAt = null,
  throttleSpeed = 'safe',
  testPhone = null
}) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Database connection failed' };

  try {
    // 1. Get Template
    const { data: template, error: tplErr } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tplErr || !template) return { success: false, error: 'WhatsApp Template not found' };

    const campaignTitle = (campaignName || '').trim() || template.campaign_name || template.template_name || 'Broadcast Campaign';

    // 2. Get Settings
    const { data: settings, error: setErr } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .limit(1)
      .single();

    if (setErr || !settings) return { success: false, error: 'WhatsApp Settings / API Keys not configured' };

    // TEST SEND MODE
    if (testPhone && String(testPhone).trim()) {
      const cleanTest = String(testPhone).replace(/\D/g, '');
      if (cleanTest.length < 10) return { success: false, error: 'Invalid 10-digit test phone number' };
      
      const testName = 'Test Partner (Shiva Auto Parts)';
      await dispatchSingleWhatsapp({
        phone: cleanTest,
        text: testName,
        template,
        settings,
        targetCompany: 'NSMLR'
      });

      return {
        success: true,
        isTest: true,
        sentCount: 1,
        message: `Test WhatsApp message sent successfully to +91 ${cleanTest} for "${campaignTitle}"!`
      };
    }

    // BROADCAST SEND MODE
    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const branchTag = normalizeBranchTag(branchFilter);
    const normalizedFilter = normalizeSubFilterInput(subFilter);

    let audienceRecords = [];

    if (audienceType === 'party') {
      let q = supabase.from('party_master')
        .select('*')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`party_universal_code.ilike.%${branchTag}%,business_nature.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'party', normalizedFilter);
      const { data } = await q;
      let list = data || [];
      audienceRecords = list.map(p => {
        let phones = [];
        if (recipientPriority === 'party_all') {
          phones = [p.biz_contact_no_1, p.primary_mobile, p.contact_mobile_1_1, p.contact_mobile_2_1].filter(Boolean);
        } else if (recipientPriority === 'party_cp1') {
          phones = [p.contact_mobile_1_1 || p.biz_contact_no_1 || p.primary_mobile].filter(Boolean);
        } else {
          // 1st Priority Business Contact with Fallback to CP1
          phones = [p.biz_contact_no_1 || p.primary_mobile || p.contact_mobile_1_1].filter(Boolean);
        }
        return {
          id: p.id,
          name: p.firm_name || p.legal_name || 'Channel Partner',
          phones: Array.from(new Set(phones)),
          company: branchTag !== 'ALL' ? branchTag : 'NSMLR'
        };
      });
    } else if (audienceType === 'leads') {
      let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.ilike('our_company', `%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'leads', normalizedFilter);
      const { data } = await q;
      let list = data || [];
      audienceRecords = list.map(l => {
        let phones = [];
        if (recipientPriority === 'lead_all') {
          phones = [l.business_contact_1, l.phone, l.cp2_mobile_1].filter(Boolean);
        } else if (recipientPriority === 'lead_cp1') {
          phones = [l.phone || l.business_contact_1].filter(Boolean);
        } else {
          phones = [l.business_contact_1 || l.phone].filter(Boolean);
        }
        return {
          id: l.id,
          name: l.company || l.name || 'Lead Client',
          phones: Array.from(new Set(phones)),
          company: l.our_company || 'NSMLR'
        };
      });
    } else if (audienceType === 'end_customers') {
      let q = supabase.from('end_customers').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`our_company.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
      }
      const { data } = await q;
      let list = data || [];
      audienceRecords = list.map(c => ({
        id: c.id,
        name: c.full_name || 'Customer',
        phones: [c.mobile_1, c.mobile_2].filter(Boolean),
        company: c.our_company || 'NSMLR'
      }));
    } else if (audienceType === 'users') {
      let q = supabase.from('user_roles').select('*').order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`company.ilike.%${branchTag}%,branch_name.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'users', normalizedFilter);
      const { data } = await q;
      let list = data || [];
      audienceRecords = list.map(u => ({
        id: u.id,
        name: u.emp_name || u.name || 'Employee',
        phones: [u.emp_mobile, u.emp_alt_mobile].filter(Boolean),
        company: u.company || 'NSMLR'
      }));
    }

    if (audienceRecords.length === 0) {
      return { success: false, error: 'No recipients found for the selected branch, audience, and filter criteria.' };
    }

    // SCHEDULED CAMPAIGN HANDLING
    if (sendMode === 'scheduled' && scheduledAt) {
      const scheduleTimeStr = String(scheduledAt);
      
      // 1. Structured campaign summary for Campaigns List table
      await supabase.from('whatsapp_message_logs').insert({
        template_id: template.id,
        sent_at: new Date().toISOString(),
        status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
          campaignName: campaignTitle,
          audienceType,
          subFilters: Array.isArray(subFilter) ? subFilter : [subFilter],
          branchFilter,
          templateName: template.template_name,
          totalTargeted: audienceRecords.length,
          sentCount: 0,
          failedCount: 0,
          skippedCappedCount: 0,
          scheduledAt: scheduleTimeStr,
          sendMode: 'scheduled',
          throttleSpeed,
          dailyLimit: 3,
          retryPolicy: '3 attempts / 3 days',
          status: 'Scheduled',
          createdAt: new Date().toISOString()
        })}`
      });

      return {
        success: true,
        isScheduled: true,
        scheduledAt: scheduleTimeStr,
        totalTargeted: audienceRecords.length,
        message: `Campaign "${campaignTitle}" scheduled successfully for ${scheduleTimeStr} IST to ${audienceRecords.length} recipients.`
      };
    }

    // IMMEDIATE BROADCAST DISPATCH WITH THROTTLE LIMITS & ANTI-SPAM SAFEGUARDS
    let sentCount = 0;
    let failedCount = 0;
    let skippedCappedCount = 0;
    const failures = [];

    // Daily Recipient Cap (IST): Max 3 messages per recipient phone per day
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const istStart = new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate(), 0, 0, 0));
    const istStartUTC = new Date(istStart.getTime() - istOffset).toISOString();

    // Throttle speed interval in ms
    let throttleDelay = 1500; // default safe: ~40 msgs/min
    if (throttleSpeed === 'fast') throttleDelay = 300; // ~150 msgs/min
    else if (throttleSpeed === 'standard') throttleDelay = 800; // ~75 msgs/min

    // Dispatch in sequential throttled batches to prevent API rate limits
    for (const rec of audienceRecords) {
      for (const phone of rec.phones) {
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        if (!cleanPhone || cleanPhone.length < 10) continue;

        // Anti-Spam Frequency Cap: check if recipient has already received 3 messages today (IST)
        const { count: dailyMsgCount } = await supabase.from('whatsapp_message_logs')
          .select('id', { count: 'exact', head: true })
          .gte('sent_at', istStartUTC)
          .ilike('status', `%sent to %${cleanPhone}%`);

        if (typeof dailyMsgCount === 'number' && dailyMsgCount >= 3) {
          skippedCappedCount++;
          continue;
        }

        if (throttleDelay > 0 && sentCount > 0) {
          await new Promise(resolve => setTimeout(resolve, throttleDelay));
        }

        try {
          await dispatchSingleWhatsapp({
            phone,
            text: rec.name,
            template,
            settings,
            targetCompany: rec.company
          });

          sentCount++;

          // Insert into logs with campaign title
          await supabase.from('whatsapp_message_logs').insert({
            lead_id: rec.id,
            template_id: template.id,
            sent_at: new Date().toISOString(),
            status: `[${campaignTitle}] sent to ${phone} (${rec.name})`
          });
        } catch (dispatchErr) {
          failedCount++;
          failures.push({ name: rec.name, phone, error: dispatchErr.message });
          console.error(`Failed to dispatch to ${phone}:`, dispatchErr.message);

          // Auto-Retry Tracking: Log with [RETRY_PENDING_1] for up to 3 attempts over 3 days
          await supabase.from('whatsapp_message_logs').insert({
            lead_id: rec.id,
            template_id: template.id,
            sent_at: new Date().toISOString(),
            status: `[${campaignTitle}] [RETRY_PENDING_1] Failed send to ${phone} (${rec.name}) - Attempt 1/3 - Error: ${dispatchErr.message || 'Dispatch error'}`
          });
        }
      }
    }

    // Insert Campaign Summary record so it displays in Campaigns History Table
    await supabase.from('whatsapp_message_logs').insert({
      template_id: template.id,
      sent_at: new Date().toISOString(),
      status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
        campaignName: campaignTitle,
        audienceType,
        subFilters: Array.isArray(subFilter) ? subFilter : [subFilter],
        branchFilter,
        templateName: template.template_name,
        totalTargeted: audienceRecords.length,
        sentCount,
        failedCount,
        skippedCappedCount,
        sendMode: 'immediate',
        throttleSpeed,
        dailyLimit: 3,
        retryPolicy: '3 attempts / 3 days',
        status: failedCount > 0 && sentCount === 0 ? 'Failed' : 'Completed',
        createdAt: new Date().toISOString()
      })}`
    });

    let resultMsg = `Broadcast "${campaignTitle}" finished! Successfully sent ${sentCount} messages.`;
    if (skippedCappedCount > 0) {
      resultMsg += ` (${skippedCappedCount} skipped due to 3-message daily limit).`;
    }
    if (failedCount > 0) {
      resultMsg += ` (${failedCount} failed, queued for 3-day auto-retry).`;
    }

    return {
      success: true,
      campaignName: campaignTitle,
      totalTargeted: audienceRecords.length,
      sentCount,
      failedCount,
      skippedCappedCount,
      failures: failures.slice(0, 10),
      message: resultMsg
    };

  } catch (err) {
    console.error('launchWhatsappBroadcastCampaign error:', err);
    return { success: false, error: err.message || 'Failed to execute campaign broadcast' };
  }
}

/**
 * Get persistent list of Broadcast Campaigns from database summary logs
 */
export async function getBroadcastCampaignsList({ tenantId = null } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('whatsapp_message_logs')
      .select('id, template_id, sent_at, status, created_at')
      .ilike('status', '[CAMPAIGN_SUMMARY]%')
      .order('sent_at', { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data.map(row => {
      try {
        const jsonStr = row.status.replace('[CAMPAIGN_SUMMARY]', '').trim();
        const parsed = JSON.parse(jsonStr);
        return {
          id: row.id,
          ...parsed,
          logId: row.id,
          sentAt: row.sent_at || row.created_at
        };
      } catch (e) {
        return {
          id: row.id,
          campaignName: 'Broadcast Campaign',
          rawStatus: row.status,
          sentAt: row.sent_at || row.created_at
        };
      }
    });
  } catch (err) {
    console.error('getBroadcastCampaignsList error:', err);
    return [];
  }
}
