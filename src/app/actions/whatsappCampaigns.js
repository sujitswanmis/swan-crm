'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getTenantBranches } from './tenantBranches';
import { dispatchWhatsappTemplateDirect } from './whatsapp';
import { logAuditAction } from './audit';

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

function sanitizePgPattern(val) {
  const s = String(val || '').trim().replace(/"/g, '');
  return /[(),]/.test(s) ? `"%${s}%"` : `%${s}%`;
}

function sanitizePgExact(val) {
  const s = String(val || '').trim().replace(/"/g, '');
  return /[(),]/.test(s) ? `"${s}"` : s;
}

function applyMultiSourceFieldFilter(query, cols = [], jsonKeys = [], values = [], condition = 'IN') {
  const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
  const isExact = condition === 'EQUALS';

  if (isNegated) {
    values.forEach(v => {
      const pat = isExact ? sanitizePgExact(v) : sanitizePgPattern(v);
      cols.forEach(col => {
        query = query.or(`${col}.is.null,${col}.not.ilike.${pat}`);
      });
      jsonKeys.forEach(jk => {
        query = query.or(`module_access->>${jk}.is.null,module_access->>${jk}.not.ilike.${pat}`);
      });
    });
    return query;
  }

  const clauses = [];
  values.forEach(v => {
    const valStr = isExact ? sanitizePgExact(v) : sanitizePgPattern(v);
    cols.forEach(col => clauses.push(`${col}.ilike.${valStr}`));
    jsonKeys.forEach(jk => clauses.push(`module_access->>${jk}.ilike.${valStr}`));
  });
  if (clauses.length > 0) {
    query = query.or(Array.from(new Set(clauses)).join(','));
  }
  return query;
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
        } else if (field === 'phone_status') {
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          let wantHas = values.some(v => String(v).toLowerCase().includes('has phone'));
          let wantMissing = values.some(v => String(v).toLowerCase().includes('no phone') || String(v).toLowerCase().includes('missing'));
          if (isNegated) {
            const origHas = wantHas;
            wantHas = wantMissing;
            wantMissing = origHas;
          }
          if (wantHas && !wantMissing) {
            query = query.or('and(business_contact_1.not.is.null,business_contact_1.neq.,business_contact_1.not.ilike.%N/A%),and(phone.not.is.null,phone.neq.,phone.not.ilike.%N/A%)');
          } else if (wantMissing && !wantHas) {
            query = query
              .or('business_contact_1.is.null,business_contact_1.eq.,business_contact_1.ilike.%N/A%')
              .or('phone.is.null,phone.eq.,phone.ilike.%N/A%');
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
        } else if (field === 'phone_status') {
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          let wantHas = values.some(v => String(v).toLowerCase().includes('has phone'));
          let wantMissing = values.some(v => String(v).toLowerCase().includes('no phone') || String(v).toLowerCase().includes('missing'));
          if (isNegated) {
            const origHas = wantHas;
            wantHas = wantMissing;
            wantMissing = origHas;
          }
          if (wantHas && !wantMissing) {
            query = query.not('primary_mobile', 'is', null).neq('primary_mobile', '').not('primary_mobile', 'ilike', '%N/A%');
          } else if (wantMissing && !wantHas) {
            query = query.or('primary_mobile.is.null,primary_mobile.eq.,primary_mobile.ilike.%N/A%');
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
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          const wantActive = values.some(v => String(v).toLowerCase().includes('active') && !String(v).toLowerCase().includes('inactive'));
          const wantInactive = values.some(v => String(v).toLowerCase().includes('inactive'));
          const wantResigned = values.some(v => String(v).toLowerCase().includes('resigned'));
          const statusClauses = [];
          if (wantActive) statusClauses.push('emp_status.eq.Active', 'status.eq.Active');
          if (wantInactive) statusClauses.push('emp_status.ilike.InActive', 'status.ilike.InActive');
          if (wantResigned) statusClauses.push('emp_status.ilike.Resigned', 'status.ilike.Resigned');

          if (statusClauses.length > 0) {
            if (isNegated) {
              if (wantActive) query = query.neq('emp_status', 'Active');
              if (wantInactive) query = query.not('emp_status', 'ilike', 'InActive');
              if (wantResigned) query = query.not('emp_status', 'ilike', 'Resigned');
            } else {
              query = query.or(Array.from(new Set(statusClauses)).join(','));
            }
          }
        } else if (field === 'sub_department') {
          query = applyMultiSourceFieldFilter(query, ['emp_sub_department'], ['emp_sub_department'], values, condition);
        } else if (field === 'designation') {
          query = applyMultiSourceFieldFilter(query, ['emp_designation'], [], values, condition);
        } else if (field === 'role') {
          query = applyMultiSourceFieldFilter(query, ['role'], ['role_preset_name'], values, condition);
        } else if (field === 'company') {
          query = applyMultiSourceFieldFilter(query, ['company', 'branch_name', 'company_name'], ['company_name', 'branch_name'], values, condition);
        } else if (field === 'work_location_type') {
          query = applyMultiSourceFieldFilter(query, ['work_location_type'], ['work_location_type'], values, condition);
        } else if (field === 'work_location_name') {
          query = applyMultiSourceFieldFilter(query, ['work_location_name'], ['work_location_name'], values, condition);
        } else if (field === 'hod_person') {
          query = applyMultiSourceFieldFilter(query, ['hod_person'], ['hod_person'], values, condition);
        } else if (field === 'reporting_manager') {
          query = applyMultiSourceFieldFilter(query, ['primary_reporting_person', 'secondary_reporting_person'], ['primary_reporting_person', 'secondary_reporting_person'], values, condition);
        } else if (field === 'tracking_policy') {
          query = applyMultiSourceFieldFilter(query, ['tracking_policy'], ['tracking_policy'], values, condition);
        } else if (field === 'approval_status') {
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          let wantApproved = values.some(v => String(v).toLowerCase().includes('approved'));
          let wantPending = values.some(v => String(v).toLowerCase().includes('pending'));
          if (isNegated) {
            const origA = wantApproved;
            wantApproved = wantPending;
            wantPending = origA;
          }
          if (wantApproved && !wantPending) {
            query = query.eq('is_approved', true);
          } else if (wantPending && !wantApproved) {
            query = query.or('is_approved.is.null,is_approved.eq.false');
          }
        } else if (field === 'employee') {
          query = applyMultiSourceFieldFilter(query, ['emp_name', 'name', 'emp_code'], [], values, condition);
        } else if (field === 'phone_status') {
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          const rawHasAny = values.some(v => String(v).toLowerCase().includes('has phone'));
          const rawMissingAll = values.some(v => String(v).toLowerCase().includes('no phone'));
          const rawMissingPrimary = values.some(v => String(v).toLowerCase().includes('missing primary'));

          if (!isNegated) {
            if (rawHasAny && rawMissingAll) {
              // Both selected -> no phone restriction
            } else if (rawHasAny) {
              query = query.or('and(emp_mobile.not.is.null,emp_mobile.neq.,emp_mobile.not.ilike.%N/A%),and(emp_alt_mobile.not.is.null,emp_alt_mobile.neq.,emp_alt_mobile.not.ilike.%N/A%),and(module_access->>emp_alt_mobile.not.is.null,module_access->>emp_alt_mobile.neq.)');
            } else if (rawMissingPrimary) {
              query = query.or('emp_mobile.is.null,emp_mobile.eq.,emp_mobile.ilike.%N/A%');
            } else if (rawMissingAll) {
              query = query
                .or('emp_mobile.is.null,emp_mobile.eq.,emp_mobile.ilike.%N/A%')
                .or('emp_alt_mobile.is.null,emp_alt_mobile.eq.,emp_alt_mobile.ilike.%N/A%')
                .or('module_access->>emp_alt_mobile.is.null,module_access->>emp_alt_mobile.eq.');
            }
          } else {
            if (rawMissingAll && !rawHasAny) {
              // Exclude missing all -> Has Any Phone
              query = query.or('and(emp_mobile.not.is.null,emp_mobile.neq.,emp_mobile.not.ilike.%N/A%),and(emp_alt_mobile.not.is.null,emp_alt_mobile.neq.,emp_alt_mobile.not.ilike.%N/A%),and(module_access->>emp_alt_mobile.not.is.null,module_access->>emp_alt_mobile.neq.)');
            } else if (rawHasAny && !rawMissingAll) {
              // Exclude has phone -> Missing All
              query = query
                .or('emp_mobile.is.null,emp_mobile.eq.,emp_mobile.ilike.%N/A%')
                .or('emp_alt_mobile.is.null,emp_alt_mobile.eq.,emp_alt_mobile.ilike.%N/A%')
                .or('module_access->>emp_alt_mobile.is.null,module_access->>emp_alt_mobile.eq.');
            } else if (rawMissingPrimary) {
              // Exclude missing primary -> Has Primary Mobile
              query = query.not('emp_mobile', 'is', null).neq('emp_mobile', '').not('emp_mobile', 'ilike', '%N/A%');
            }
          }
        }
      }

      // 4. END CUSTOMERS
      if (audienceType === 'end_customers') {
        if (field === 'phone_status') {
          const isNegated = condition === 'NOT_IN' || condition === 'NOT IN';
          let wantHas = values.some(v => String(v).toLowerCase().includes('has phone'));
          let wantMissing = values.some(v => String(v).toLowerCase().includes('no phone') || String(v).toLowerCase().includes('missing'));
          if (isNegated) {
            const origHas = wantHas;
            wantHas = wantMissing;
            wantMissing = origHas;
          }
          if (wantHas && !wantMissing) {
            query = query.or('and(mobile_1.not.is.null,mobile_1.neq.,mobile_1.not.ilike.%N/A%),and(mobile_2.not.is.null,mobile_2.neq.,mobile_2.not.ilike.%N/A%)');
          } else if (wantMissing && !wantHas) {
            query = query
              .or('mobile_1.is.null,mobile_1.eq.,mobile_1.ilike.%N/A%')
              .or('mobile_2.is.null,mobile_2.eq.,mobile_2.ilike.%N/A%');
          }
        } else if (field === 'state') {
          if (condition === 'NOT_IN' || condition === 'NOT IN') {
            values.forEach(v => { query = query.not('state', 'ilike', `%${v.trim()}%`); });
          } else {
            const clauses = values.map(v => `state.ilike.%${v.trim()}%`);
            query = query.or(clauses.join(','));
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
 * Fetch live synchronized filter dropdown options across all User Manage fields
 */
export async function getSyncedUserFilterOptions({ tenantId = null } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return {};
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

  try {
    let q = supabase
      .from('user_roles')
      .select('emp_name, name, emp_code, role, emp_designation, emp_status, status, is_approved, company, branch_name, department, emp_sub_department, work_location_type, work_location_name, hod_person, primary_reporting_person, tracking_policy, module_access');
    if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);

    const [{ data: users }, { data: deptRows }] = await Promise.all([
      q,
      supabase.from('departments').select('name').order('name', { ascending: true })
    ]);

    const uniq = (arr) => Array.from(new Set(
      arr
        .map(v => String(v || '').trim())
        .filter(v => v && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'all')
    )).sort((a, b) => a.localeCompare(b));

    const uList = users || [];
    const dbDepts = (deptRows || []).map(d => d.name);

    return {
      department: uniq([...dbDepts, ...uList.map(u => u.department)]),
      sub_department: uniq(uList.flatMap(u => [u.emp_sub_department, u.module_access?.emp_sub_department])),
      designation: uniq(uList.map(u => u.emp_designation)),
      role: uniq(uList.flatMap(u => [u.role, u.module_access?.role_preset_name]).filter(r => String(r || '').toLowerCase() !== 'customer')),
      company: uniq(uList.flatMap(u => [u.company, u.branch_name, u.module_access?.branch_name])),
      work_location_type: uniq(uList.flatMap(u => [u.work_location_type, u.module_access?.work_location_type])),
      work_location_name: uniq(uList.flatMap(u => [u.work_location_name, u.module_access?.work_location_name])),
      hod_person: uniq(uList.flatMap(u => [u.hod_person, u.module_access?.hod_person])),
      reporting_manager: uniq(uList.flatMap(u => [u.primary_reporting_person, u.module_access?.primary_reporting_person])),
      tracking_policy: uniq(uList.flatMap(u => [u.tracking_policy, u.module_access?.tracking_policy])),
      employee: uniq(uList.map(u => u.emp_name || u.name))
    };
  } catch (err) {
    console.error('getSyncedUserFilterOptions error:', err);
    return {};
  }
}

function extractPartyMeta(businessNature) {
  const str = String(businessNature || '');
  if (!str.includes('SWAN_PARTY_META:')) return {};
  try {
    return JSON.parse(str.replace(/^.*?SWAN_PARTY_META:/, '').trim());
  } catch (e) {
    return {};
  }
}

function isValidPhoneStr(val) {
  const s = String(val || '').trim();
  return Boolean(s && s.toUpperCase() !== 'N/A');
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
    if ((!audienceType || audienceType === 'end_customers') && normalizedFilter !== 'ALL') {
      custQuery = applyAudienceSubFilter(custQuery, 'end_customers', normalizedFilter);
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
        .select('id, firm_name, legal_name, primary_mobile, party_universal_code, business_nature')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`party_universal_code.ilike.%${branchTag}%,business_nature.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'party', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(p => {
        const meta = extractPartyMeta(p.business_nature);
        const primary = isValidPhoneStr(p.primary_mobile) ? p.primary_mobile.trim() : '';
        const bizPhone = isValidPhoneStr(meta.biz_contact_no_1) ? meta.biz_contact_no_1.trim() : '';
        const cpPhone = isValidPhoneStr(meta.contact_mobile_1_1) ? meta.contact_mobile_1_1.trim() : '';
        return {
          id: p.id,
          name: p.firm_name || p.legal_name || 'Party Partner',
          subName: meta.contact_person_name_1 || 'Primary Contact',
          phone: bizPhone || primary || cpPhone || 'N/A',
          altPhone: cpPhone && cpPhone !== (bizPhone || primary) ? cpPhone : '',
          tag: p.party_universal_code || 'Party'
        };
      });
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
      return (data || []).map(l => {
        const p1 = isValidPhoneStr(l.business_contact_1) ? l.business_contact_1.trim() : '';
        const p2 = isValidPhoneStr(l.phone) ? l.phone.trim() : '';
        return {
          id: l.id,
          name: l.company || l.name || 'Lead Client',
          subName: l.name || 'CP1',
          phone: p1 || p2 || 'N/A',
          isAltPhone: !p1 && Boolean(p2),
          altPhone: p1 && p2 && p1 !== p2 ? p2 : '',
          tag: l.our_company || 'Lead'
        };
      });
    }

    if (audienceType === 'end_customers') {
      let q = supabase.from('end_customers')
        .select('id, full_name, mobile_1, mobile_2, linked_party_name, product_name, our_company')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`our_company.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'end_customers', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(c => {
        const m1 = isValidPhoneStr(c.mobile_1) ? c.mobile_1.trim() : '';
        const m2 = isValidPhoneStr(c.mobile_2) ? c.mobile_2.trim() : '';
        return {
          id: c.id,
          name: c.full_name || 'End Customer',
          subName: c.linked_party_name ? `Via ${c.linked_party_name}` : (c.product_name || 'Equipment'),
          phone: m1 || m2 || 'N/A',
          isAltPhone: !m1 && Boolean(m2),
          altPhone: m1 && m2 && m1 !== m2 ? m2 : '',
          tag: c.product_name || 'Customer'
        };
      });
    }

    if (audienceType === 'users') {
      let q = supabase.from('user_roles')
        .select('id, emp_name, name, emp_mobile, emp_alt_mobile, module_access, role, emp_designation, company, branch_name, department')
        .order('created_at', { ascending: false });
      if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
      if (branchTag !== 'ALL') {
        q = q.or(`company.ilike.%${branchTag}%,branch_name.ilike.%${branchTag}%`);
      }
      q = applyAudienceSubFilter(q, 'users', normalizedFilter);
      const { data } = await q.limit(limit);
      return (data || []).map(u => {
        const primary = isValidPhoneStr(u.emp_mobile) ? u.emp_mobile.trim() : '';
        const altRaw = u.emp_alt_mobile || u.module_access?.emp_alt_mobile || '';
        const alt = isValidPhoneStr(altRaw) ? String(altRaw).trim() : '';
        return {
          id: u.id,
          name: u.emp_name || u.name || 'Employee',
          subName: u.emp_designation || u.department || 'Staff',
          phone: primary || alt || 'N/A',
          isAltPhone: !primary && Boolean(alt),
          altPhone: primary && alt && primary !== alt ? alt : '',
          tag: u.department || u.branch_name || 'Team'
        };
      });
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

function buildAudienceDispatchRecords(audienceType, rows, branchTag, recipientPriority = 'default') {
  if (audienceType === 'party') {
    return (rows || []).map(p => {
      const meta = extractPartyMeta(p.business_nature);
      let phones = [];
      if (recipientPriority === 'party_all') {
        phones = [meta.biz_contact_no_1, p.primary_mobile, meta.contact_mobile_1_1, meta.contact_mobile_2_1].filter(isValidPhoneStr);
      } else if (recipientPriority === 'party_cp1') {
        phones = [meta.contact_mobile_1_1 || meta.biz_contact_no_1 || p.primary_mobile].filter(isValidPhoneStr);
      } else if (recipientPriority === 'party_cp2') {
        phones = [meta.contact_mobile_2_1 || meta.contact_mobile_1_1 || meta.biz_contact_no_1].filter(isValidPhoneStr);
      } else {
        phones = [meta.biz_contact_no_1 || p.primary_mobile || meta.contact_mobile_1_1].filter(isValidPhoneStr);
      }
      const uniquePhones = Array.from(new Set(phones.map(s => String(s).trim())));
      const name = p.firm_name || p.legal_name || 'Channel Partner';
      const contactPerson = meta.contact_person_name_1 || name;
      const comp = branchTag !== 'ALL' ? branchTag : 'NSMLR';
      return {
        id: p.id,
        name,
        phones: uniquePhones,
        company: comp,
        params: [name, contactPerson, uniquePhones[0] || '', p.party_universal_code || comp, p.party_status || 'Active']
      };
    });
  }

  if (audienceType === 'leads') {
    return (rows || []).map(l => {
      let phones = [];
      if (recipientPriority === 'lead_all') {
        phones = [l.business_contact_1, l.phone, l.cp1_mobile_1, l.cp2_mobile_1, l.cp3_mobile_1].filter(isValidPhoneStr);
      } else if (recipientPriority === 'lead_cp1') {
        phones = [l.phone, l.cp1_mobile_1, l.cp1_mobile_2, l.business_contact_1].filter(isValidPhoneStr);
      } else if (recipientPriority === 'lead_cp2') {
        phones = [l.cp2_mobile_1, l.cp2_mobile_2].filter(isValidPhoneStr);
      } else if (recipientPriority === 'lead_cp3') {
        phones = [l.cp3_mobile_1, l.cp3_mobile_2].filter(isValidPhoneStr);
      } else {
        phones = [l.business_contact_1, l.phone, l.cp1_mobile_1].filter(isValidPhoneStr);
      }
      const uniquePhones = Array.from(new Set(phones.map(s => String(s).trim())));
      const name = l.company || l.name || 'Lead Client';
      const cp1 = l.cp1_name || l.name || name;
      const comp = l.our_company || 'NSMLR';
      return {
        id: l.id,
        name,
        phones: uniquePhones,
        company: comp,
        params: [name, uniquePhones[0] || '', cp1, l.cp2_name || cp1, l.cp3_name || cp1, l.requirement || 'Inquiry', l.cp1_mobile_1 || uniquePhones[0] || '']
      };
    });
  }

  if (audienceType === 'end_customers') {
    return (rows || []).map(c => {
      let phones = [];
      if (recipientPriority === 'end_customer_p2') {
        phones = [c.mobile_2, c.mobile_1].filter(isValidPhoneStr);
      } else if (recipientPriority === 'end_customer_all') {
        phones = [c.mobile_1, c.mobile_2].filter(isValidPhoneStr);
      } else {
        phones = [c.mobile_1 || c.mobile_2].filter(isValidPhoneStr);
      }
      const uniquePhones = Array.from(new Set(phones.map(s => String(s).trim())));
      const name = c.full_name || 'Customer';
      const comp = c.our_company || 'NSMLR';
      return {
        id: c.id,
        name,
        phones: uniquePhones,
        company: comp,
        params: [name, c.linked_party_name || name, uniquePhones[0] || '', comp, c.product_name || 'Equipment']
      };
    });
  }

  if (audienceType === 'users') {
    return (rows || []).map(u => {
      const alt = u.emp_alt_mobile || u.module_access?.emp_alt_mobile || '';
      const uniquePhones = Array.from(new Set([u.emp_mobile, alt].filter(isValidPhoneStr).map(s => String(s).trim())));
      const name = u.emp_name || u.name || 'Employee';
      const comp = u.company || 'NSMLR';
      return {
        id: u.id,
        name,
        phones: uniquePhones,
        company: comp,
        params: [name, u.emp_designation || 'Staff', uniquePhones[0] || '', u.branch_name || comp, u.department || 'Team']
      };
    });
  }

  return [];
}

async function queryAudienceRecordsForBroadcast({ supabase, tenantId, audienceType, branchFilter, subFilter, recipientPriority = 'default' }) {
  const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
  const branchTag = normalizeBranchTag(branchFilter);
  const normalizedFilter = normalizeSubFilterInput(subFilter);

  if (audienceType === 'party') {
    let q = supabase.from('party_master').select('*').order('created_at', { ascending: false });
    if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') q = q.or(`party_universal_code.ilike.%${branchTag}%,business_nature.ilike.%${branchTag}%`);
    q = applyAudienceSubFilter(q, 'party', normalizedFilter);
    const { data } = await q;
    return buildAudienceDispatchRecords('party', data, branchTag, recipientPriority);
  }

  if (audienceType === 'leads') {
    let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') q = q.ilike('our_company', `%${branchTag}%`);
    q = applyAudienceSubFilter(q, 'leads', normalizedFilter);
    const { data } = await q;
    return buildAudienceDispatchRecords('leads', data, branchTag, recipientPriority);
  }

  if (audienceType === 'end_customers') {
    let q = supabase.from('end_customers').select('*').order('created_at', { ascending: false });
    if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') q = q.or(`our_company.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
    q = applyAudienceSubFilter(q, 'end_customers', normalizedFilter);
    const { data } = await q;
    return buildAudienceDispatchRecords('end_customers', data, branchTag, recipientPriority);
  }

  if (audienceType === 'users') {
    let q = supabase.from('user_roles').select('*').order('created_at', { ascending: false });
    if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId);
    if (branchTag !== 'ALL') q = q.or(`company.ilike.%${branchTag}%,branch_name.ilike.%${branchTag}%,branch_code.ilike.%${branchTag}%`);
    q = applyAudienceSubFilter(q, 'users', normalizedFilter);
    const { data } = await q;
    return buildAudienceDispatchRecords('users', data, branchTag, recipientPriority);
  }

  return [];
}

function buildBroadcastLogTag(audienceType, rec) {
  if (audienceType === 'leads') return '';
  const safeComp = String(rec.company || 'NSMLR').replace(/[|\]]/g, '');
  const safeName = String(rec.name || 'Partner').replace(/[|\]]/g, '').slice(0, 80);
  return `[MOD:${audienceType}|REC:${rec.id || ''}|CO:${safeComp}|NAME:${safeName}] `;
}

async function executeAudienceBatchDispatch({
  supabase,
  campaignTitle,
  audienceType,
  audienceRecords,
  template,
  settings,
  throttleSpeed = 'safe'
}) {
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

  let throttleDelay = 1500;
  if (throttleSpeed === 'fast') throttleDelay = 300;
  else if (throttleSpeed === 'standard') throttleDelay = 800;

  for (const rec of audienceRecords) {
    for (const phone of rec.phones) {
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      if (!cleanPhone || cleanPhone.length < 10) continue;

      const { count: dailyMsgCount } = await supabase.from('whatsapp_message_logs')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', istStartUTC)
        .ilike('status', `%${cleanPhone}%`)
        .not('status', 'ilike', '%Failed%')
        .not('status', 'ilike', '[CAMPAIGN_SUMMARY]%');

      if (typeof dailyMsgCount === 'number' && dailyMsgCount >= 3) {
        skippedCappedCount++;
        continue;
      }

      if (throttleDelay > 0 && sentCount > 0) {
        await new Promise(resolve => setTimeout(resolve, throttleDelay));
      }

      const modTag = buildBroadcastLogTag(audienceType, rec);
      // Only attach lead_id for 'leads' audience because whatsapp_message_logs.lead_id is FK -> leads.id
      const safeLeadId = audienceType === 'leads' ? rec.id : null;

      try {
        const res = await dispatchWhatsappTemplateDirect({
          phone,
          template,
          settings,
          targetCompany: rec.company,
          templateParams: rec.params && rec.params.length > 0 ? rec.params : [rec.name],
          recipientName: rec.name
        });

        sentCount++;

        await supabase.from('whatsapp_message_logs').insert({
          lead_id: safeLeadId,
          template_id: template.id,
          sent_at: new Date().toISOString(),
          status: `[${campaignTitle}] ${modTag}sent to ${res.phone} (${rec.name})`
        });
      } catch (dispatchErr) {
        failedCount++;
        failures.push({ name: rec.name, phone, error: dispatchErr.message });
        console.error(`Failed to dispatch to ${phone}:`, dispatchErr.message);

        await supabase.from('whatsapp_message_logs').insert({
          lead_id: safeLeadId,
          template_id: template.id,
          sent_at: new Date().toISOString(),
          status: `[${campaignTitle}] [RETRY_PENDING_1] ${modTag}Failed send to ${phone} (${rec.name}) - Attempt 1/3 - Error: ${dispatchErr.message || 'Dispatch error'}`
        });
      }
    }
  }

  return { sentCount, failedCount, skippedCappedCount, failures };
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
    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const branchTag = normalizeBranchTag(branchFilter);

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
      await dispatchWhatsappTemplateDirect({
        phone: cleanTest,
        template,
        settings,
        targetCompany: branchTag !== 'ALL' ? branchTag : 'NSMLR',
        templateParams: [testName, 'Ramesh Kumar (CP1)', cleanTest, branchTag !== 'ALL' ? branchTag : 'New Swan Group', 'Active Partner'],
        recipientName: testName
      });

      return {
        success: true,
        isTest: true,
        sentCount: 1,
        message: `Test WhatsApp message sent successfully to +91 ${cleanTest} for "${campaignTitle}"!`
      };
    }

    // BROADCAST SEND MODE
    const audienceRecords = await queryAudienceRecordsForBroadcast({
      supabase,
      tenantId: effectiveTenantId,
      audienceType,
      branchFilter,
      subFilter,
      recipientPriority
    });

    if (audienceRecords.length === 0) {
      return { success: false, error: 'No recipients found for the selected branch, audience, and filter criteria.' };
    }

    // SCHEDULED CAMPAIGN HANDLING
    if (sendMode === 'scheduled' && scheduledAt) {
      const scheduleTimeStr = String(scheduledAt);

      await supabase.from('whatsapp_message_logs').insert({
        template_id: template.id,
        sent_at: new Date().toISOString(),
        status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
          tenantId: effectiveTenantId,
          campaignName: campaignTitle,
          audienceType,
          subFilters: Array.isArray(subFilter) ? subFilter : [subFilter],
          branchFilter,
          templateId: template.id,
          templateName: template.template_name,
          recipientPriority,
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

      try {
        await logAuditAction(
          'Schedule WhatsApp Campaign',
          `Scheduled campaign "${campaignTitle}" for ${scheduleTimeStr} IST (${audienceRecords.length} recipients)`
        );
      } catch (_) {}

      return {
        success: true,
        isScheduled: true,
        scheduledAt: scheduleTimeStr,
        totalTargeted: audienceRecords.length,
        message: `Campaign "${campaignTitle}" scheduled successfully for ${scheduleTimeStr} IST to ${audienceRecords.length} recipients.`
      };
    }

    // IMMEDIATE BROADCAST DISPATCH WITH THROTTLE LIMITS & ANTI-SPAM SAFEGUARDS
    const { sentCount, failedCount, skippedCappedCount, failures } = await executeAudienceBatchDispatch({
      supabase,
      campaignTitle,
      audienceType,
      audienceRecords,
      template,
      settings,
      throttleSpeed
    });

    // Insert Campaign Summary record so it displays in Campaigns History Table
    await supabase.from('whatsapp_message_logs').insert({
      template_id: template.id,
      sent_at: new Date().toISOString(),
      status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
        tenantId: effectiveTenantId,
        campaignName: campaignTitle,
        audienceType,
        subFilters: Array.isArray(subFilter) ? subFilter : [subFilter],
        branchFilter,
        templateId: template.id,
        templateName: template.template_name,
        recipientPriority,
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

    try {
      await logAuditAction(
        'Launch WhatsApp Campaign',
        `Launched campaign "${campaignTitle}" (${audienceType}, Sent: ${sentCount}/${audienceRecords.length}, Failed: ${failedCount})`
      );
    } catch (_) {}

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

function parseScheduledIstToUtcMs(scheduledAt) {
  const s = String(scheduledAt || '').trim();
  if (!s) return NaN;
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) return Date.parse(s);
  const normalized = s.length === 16 ? `${s}:00+05:30` : `${s}+05:30`;
  return Date.parse(normalized);
}

/**
 * Process Scheduled Broadcasts, Failed Auto-Retries (3 attempts / 3 days), and Recurring Automations
 */
export async function processScheduledWhatsappQueue({ maxPerRun = 40 } = {}) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Database connection failed' };

  const stats = {
    scheduledExecuted: 0,
    scheduledSent: 0,
    scheduledFailed: 0,
    retriesResolved: 0,
    retriesFailed: 0,
    recurringSent: 0,
    errors: []
  };

  try {
    const { data: settings } = await supabase.from('whatsapp_settings').select('*').limit(1).single();
    if (!settings) return { success: false, error: 'WhatsApp settings not configured', stats };

    const nowMs = Date.now();

    // ---------------------------------------------------------
    // 1. PROCESS DUE SCHEDULED BROADCAST CAMPAIGNS
    // ---------------------------------------------------------
    const { data: summaryRows } = await supabase
      .from('whatsapp_message_logs')
      .select('id, template_id, status')
      .ilike('status', '[CAMPAIGN_SUMMARY]%')
      .ilike('status', '%"status":"Scheduled"%')
      .order('sent_at', { ascending: true })
      .limit(10);

    for (const row of summaryRows || []) {
      try {
        const meta = JSON.parse(row.status.replace('[CAMPAIGN_SUMMARY]', '').trim());
        if (meta.status !== 'Scheduled') continue;
        const dueMs = parseScheduledIstToUtcMs(meta.scheduledAt);
        if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;

        const tplId = meta.templateId || row.template_id;
        const { data: template } = await supabase.from('whatsapp_templates').select('*').eq('id', tplId).single();
        if (!template) {
          await supabase.from('whatsapp_message_logs').update({
            status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({ ...meta, status: 'Failed', error: 'Template not found', executedAt: new Date().toISOString() })}`
          }).eq('id', row.id);
          continue;
        }

        const records = await queryAudienceRecordsForBroadcast({
          supabase,
          tenantId: meta.tenantId || DEFAULT_TENANT_ID,
          audienceType: meta.audienceType || 'leads',
          branchFilter: meta.branchFilter || 'All',
          subFilter: meta.subFilters || 'ALL',
          recipientPriority: meta.recipientPriority || 'default'
        });

        const { sentCount, failedCount, skippedCappedCount } = await executeAudienceBatchDispatch({
          supabase,
          campaignTitle: meta.campaignName || template.template_name,
          audienceType: meta.audienceType || 'leads',
          audienceRecords: records.slice(0, maxPerRun),
          template,
          settings,
          throttleSpeed: meta.throttleSpeed || 'safe'
        });

        await supabase.from('whatsapp_message_logs').update({
          sent_at: new Date().toISOString(),
          status: `[CAMPAIGN_SUMMARY] ${JSON.stringify({
            ...meta,
            sentCount,
            failedCount,
            skippedCappedCount,
            status: failedCount > 0 && sentCount === 0 ? 'Failed' : 'Completed',
            executedAt: new Date().toISOString()
          })}`
        }).eq('id', row.id);

        stats.scheduledExecuted++;
        stats.scheduledSent += sentCount;
        stats.scheduledFailed += failedCount;
      } catch (e) {
        stats.errors.push(`Scheduled error: ${e.message}`);
      }
    }

    // ---------------------------------------------------------
    // 2. PROCESS PENDING AUTO-RETRIES (UP TO 3 ATTEMPTS / 3 DAYS)
    // ---------------------------------------------------------
    const threeDaysAgoIso = new Date(nowMs - 3 * 86400000).toISOString();
    const { data: retryRows } = await supabase
      .from('whatsapp_message_logs')
      .select('id, lead_id, template_id, status, sent_at')
      .ilike('status', '%[RETRY_PENDING_%')
      .gte('sent_at', threeDaysAgoIso)
      .order('sent_at', { ascending: true })
      .limit(15);

    for (const rRow of retryRows || []) {
      try {
        // Enforce minimum 4 hour cooldown between retry attempts
        const lastAt = Date.parse(rRow.sent_at || '');
        if (Number.isFinite(lastAt) && nowMs - lastAt < 4 * 3600000) continue;

        const attemptMatch = rRow.status.match(/\[RETRY_PENDING_(\d+)\]/);
        const currentAttempt = attemptMatch ? parseInt(attemptMatch[1], 10) : 1;
        if (currentAttempt >= 3) continue;

        const phoneMatch = rRow.status.match(/Failed send to\s+(\+?[\d]+)/i);
        const modMatch = rRow.status.match(/\[MOD:([^|\]]+)\|REC:([^|\]]*)\|CO:([^|\]]*)\|NAME:([^\]]*)\]/i);
        const phone = phoneMatch?.[1];
        if (!phone || !rRow.template_id) continue;

        const { data: template } = await supabase.from('whatsapp_templates').select('*').eq('id', rRow.template_id).single();
        if (!template) continue;

        const recName = modMatch?.[4] || 'Partner';
        const company = modMatch?.[3] || 'NSMLR';
        const modTag = modMatch ? `${modMatch[0]} ` : '';

        try {
          const res = await dispatchWhatsappTemplateDirect({
            phone,
            template,
            settings,
            targetCompany: company,
            templateParams: [recName],
            recipientName: recName
          });

          await supabase.from('whatsapp_message_logs').update({
            sent_at: new Date().toISOString(),
            status: rRow.status.replace(/\[RETRY_PENDING_\d+\].*$/, `${modTag}sent to ${res.phone} (${recName}) [Retry #${currentAttempt + 1}]`)
          }).eq('id', rRow.id);
          stats.retriesResolved++;
        } catch (retryErr) {
          const nextAttempt = currentAttempt + 1;
          const nextTag = nextAttempt >= 3 ? '[RETRY_EXHAUSTED_3]' : `[RETRY_PENDING_${nextAttempt}]`;
          await supabase.from('whatsapp_message_logs').update({
            sent_at: new Date().toISOString(),
            status: rRow.status
              .replace(/\[RETRY_PENDING_\d+\]/, nextTag)
              .replace(/Attempt \d+\/3/, `Attempt ${nextAttempt}/3`) + ` | ${retryErr.message}`
          }).eq('id', rRow.id);
          stats.retriesFailed++;
        }
      } catch (e) {
        stats.errors.push(`Retry error: ${e.message}`);
      }
    }

    // ---------------------------------------------------------
    // 3. PROCESS RECURRING STAGE AUTOMATIONS (Daily/Weekly/Monthly/Quarterly)
    // ---------------------------------------------------------
    const FREQ_COOLDOWN_MS = {
      daily: 23 * 3600000,
      weekly: 6.9 * 86400000,
      monthly: 29.5 * 86400000,
      quarterly: 89.5 * 86400000
    };

    const { data: recurringRules } = await supabase
      .from('whatsapp_automations')
      .select('*')
      .eq('is_active', true)
      .in('frequency', ['Daily', 'Weekly', 'Monthly', 'Quarterly']);

    for (const rule of recurringRules || []) {
      if (stats.recurringSent >= maxPerRun) break;
      try {
        const freqKey = String(rule.frequency || '').toLowerCase();
        const cooldownMs = FREQ_COOLDOWN_MS[freqKey];
        if (!cooldownMs || !rule.template_id) continue;

        const matchPref = String(rule.stage_name || '').trim().match(/^\[([A-Z_]+)(?:\|([a-z0-9_]+))?\]\s*(.*)$/i);
        const modId = matchPref ? matchPref[1].toLowerCase() : 'leads';
        const stageLabel = matchPref ? matchPref[3].trim() : String(rule.stage_name || '').trim();
        if (modId !== 'leads' && modId !== 'party' && modId !== 'end_customers') continue;

        const { data: template } = await supabase.from('whatsapp_templates').select('*').eq('id', rule.template_id).single();
        if (!template) continue;

        const cutoffIso = new Date(nowMs - cooldownMs).toISOString();
        const { data: recentLogs } = await supabase
          .from('whatsapp_message_logs')
          .select('lead_id, status')
          .eq('template_id', rule.template_id)
          .gte('sent_at', cutoffIso)
          .not('status', 'ilike', '%Failed%')
          .limit(1000);

        const recentlySentLeads = new Set((recentLogs || []).map(l => l.lead_id).filter(Boolean));
        const recentlySentPhones = new Set(
          (recentLogs || [])
            .map(l => String(l.status || '').match(/sent\s+to\s+(\+?[\d]+)/i)?.[1]?.slice(-10))
            .filter(Boolean)
        );

        let targets = [];
        if (modId === 'leads') {
          let lq = supabase.from('leads').select('*').eq('status', stageLabel).limit(20);
          if (rule.company && rule.company !== 'All') lq = lq.eq('our_company', rule.company);
          const { data: lRows } = await lq;
          targets = buildAudienceDispatchRecords('leads', lRows, rule.company || 'ALL', matchPref?.[2] || 'lead_business')
            .filter(r => !recentlySentLeads.has(r.id));
        } else if (modId === 'party') {
          let pq = supabase.from('party_master').select('*').limit(20);
          if (rule.company && rule.company !== 'All') pq = pq.or(`party_universal_code.ilike.%${rule.company}%,business_nature.ilike.%${rule.company}%`);
          const { data: pRows } = await pq;
          targets = buildAudienceDispatchRecords('party', pRows, rule.company || 'ALL', matchPref?.[2] || 'party_business');
        } else if (modId === 'end_customers') {
          let eq = supabase.from('end_customers').select('*').limit(20);
          if (rule.company && rule.company !== 'All') eq = eq.or(`our_company.ilike.%${rule.company}%,branch_code.ilike.%${rule.company}%`);
          const { data: eRows } = await eq;
          targets = buildAudienceDispatchRecords('end_customers', eRows, rule.company || 'ALL', matchPref?.[2] || 'end_customer_p1');
        }

        for (const rec of targets) {
          if (stats.recurringSent >= maxPerRun) break;
          const phone = rec.phones?.[0];
          const clean10 = String(phone || '').replace(/\D/g, '').slice(-10);
          if (!clean10 || recentlySentPhones.has(clean10)) continue;

          try {
            const res = await dispatchWhatsappTemplateDirect({
              phone,
              template,
              settings,
              targetCompany: rec.company,
              templateParams: rec.params,
              recipientName: rec.name
            });

            const modTag = buildBroadcastLogTag(modId, rec);
            await supabase.from('whatsapp_message_logs').insert({
              lead_id: modId === 'leads' ? rec.id : null,
              template_id: template.id,
              sent_at: new Date().toISOString(),
              status: `[AUTO:${rule.frequency}] ${modTag}sent to ${res.phone}`
            });
            recentlySentPhones.add(clean10);
            stats.recurringSent++;
          } catch (recErr) {
            stats.errors.push(`Recurring (${rule.id}) failed for ${phone}: ${recErr.message}`);
          }
        }
      } catch (e) {
        stats.errors.push(`Recurring rule error: ${e.message}`);
      }
    }

    return { success: true, stats, executedAt: new Date().toISOString() };
  } catch (err) {
    console.error('processScheduledWhatsappQueue error:', err);
    return { success: false, error: err.message, stats };
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
    }).filter(item => !tenantId || !item.tenantId || item.tenantId === tenantId);
  } catch (err) {
    console.error('getBroadcastCampaignsList error:', err);
    return [];
  }
}
