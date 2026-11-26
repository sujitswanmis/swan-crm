'use server';

import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { resolveKnownTenant } from '@/app/actions/tenantBranches';
import { tenantDirectory } from '@/lib/integrations/access';
import { checkIsAdminRole, checkIsMasterAdmin, getModulePermissions, getSubItemPermissions } from '@/utils/permissionUtils';
import { CLIENT_PLATFORM_COOKIE, resolvePlatformFromRequest } from '@/utils/platformDetection';
import { expandCompanyAliases, formatBranchStandard, getUserBranchAccess, matchesCompanyToken } from '@/utils/branchAccess';
import { COMPLAINT_DATE_PRESETS, getComplaintDateRange, getComplaintISTDay, getComplaintStatus } from '@/utils/complaintFilters';

const REPORTS = {
  order_followup: {
    table: 'party_order_followups',
    columns: 'id,created_at,party_id,call_status,is_order_placed,assigned_caller_id,assigned_caller_name,rescheduled_time,generated_order_no',
    owner: 'assigned_caller_id',
  },
  order_pipeline: { table: 'sales_orders', columns: 'id,created_at,party_id,order_number,order_status,delivery_status,total_amount' },
  complaints: { table: 'party_complaints', columns: 'id,created_at,party_id,customer_id,category,assigned_department,ticket_number,ticket_status,stage_id,sla_deadline,assigned_employee_id', owner: 'assigned_employee_id' },
  party_master: {
    table: 'party_master',
    columns: 'id,created_at,party_status,onboarding_stage,business_nature,source_lead_id,created_by,party_roles(role_type,status)',
    owner: 'created_by',
    moduleId: 'party',
    moduleTab: 'dashboard',
  },
};
const PRESETS = new Set(COMPLAINT_DATE_PRESETS.map(([id]) => id));
const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const PAGE_SIZE = 500;
const LOOKUP_SIZE = 100;
const DAY_MS = 86_400_000;
const MAX_DENSE_TREND_DAYS = 90;
const STAGES = {
  S01: 'Order Confirmation', S02: 'PI Generation', S03: 'PI Shared', S04: 'Advance Requested',
  S05: 'Advance Received', S06: 'Stock & Production', S07: 'Product Readiness', S08: 'Quality Check',
  S09: 'Balance Requested', S10: 'Balance Received', S11: 'Ready for Dispatch', S12: 'Dispatched',
  S13: 'Delivered', CANCELLED: 'Cancelled', OTHER: 'Other Stage',
};
const LEGACY_STAGES = { PUNCHED: 'S01', CONFIRMED: 'S02', PROCESSING: 'S06', DISPATCHED: 'S12', DELIVERED: 'S13' };
const OUTCOMES = { ORDER_PLACED: 'Order placed', NO_ORDER: 'No order', RESCHEDULED: 'Callback', UNREACHABLE: 'Unreachable', OTHER: 'Other outcome' };
const CALLBACK_BUCKETS = { overdue: 'Overdue', today: 'Due Today', upcoming: 'Upcoming' };
const PARTY_TIERS = { distributor: 'Distributor', dealer: 'Dealer', 'sub-dealer': 'Sub-dealer' };
const PARTY_ROLE_TIERS = { DISTRIBUTOR: 'Distributor', DEALER: 'Dealer', DIRECT_CUSTOMER: 'Sub-dealer' };
const CATEGORIES = {
  MANUFACTURING_DEFECT: 'Manufacturing Defect', TRANSIT_DAMAGE: 'Transit Damage', SHORTAGE_PRODUCT_SPAREPART: 'Product or Parts Shortage',
  SHORTAGE_MISSING_PARTS: 'Product or Parts Shortage', DELIVERY_DELAY: 'Delivery Delay', BILLING_ISSUES: 'Billing Issues',
  ORDER_RELATED_ISSUES: 'Order Issues', SERVICE_ISSUES: 'Service Issues', SERVICE_WARRANTY: 'Service Issues', WARRANTY_CLAIM: 'Warranty Claim',
};
const DEPARTMENTS = {
  QUALITY_ASSURANCE: 'Quality Assurance', LOGISTICS_DISPATCH: 'Logistics & Dispatch', ACCOUNTS_FINANCE: 'Accounts & Finance',
  SALES_DESK: 'Sales Desk', SERVICE_ENGINEERING: 'Service Engineering',
};

function checked({ data, error }) {
  if (error) throw error;
  return data;
}

function denied() {
  return { success: false, error: 'You do not have access to this report or branch.' };
}

function canReadWorkspace(role, isAdmin) {
  if (!role || role.can_read === false || (!isAdmin && !role.is_approved)) return false;
  const status = String(role.emp_status || role.module_access?.emp_status || '').trim().toLowerCase();
  return !['inactive', 'terminated', 'suspended'].includes(status);
}

async function resolveRoleTenant(db, role) {
  const key = String(role.tenant_id || role.module_access?._tenantId || role.company || '').trim();
  const known = await resolveKnownTenant(key);
  if (known.tenantId || UUID.test(key)) return known.tenantId || key;
  if (!/^TNT\d{5,}$/i.test(key)) return null;
  const row = checked(await db.from('tenants').select('id').eq('tenant_code', key.toUpperCase()).maybeSingle());
  return row?.id || null;
}

async function authorizeReport(db, user, page, tenantId, viewerId, branchFilter) {
  const actor = checked(await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle());
  const actorMaster = checkIsMasterAdmin(actor?.module_access, actor?.role, user.email);
  if (!actor && !actorMaster) return null;
  const actorAdmin = actorMaster || checkIsAdminRole(actor?.role);
  if (actor && !canReadWorkspace(actor, actorAdmin)) return null;
  const preview = Boolean(viewerId && viewerId !== user.id);
  if (preview && !actorMaster && (await resolveRoleTenant(db, actor) !== tenantId)) return null;
  const role = preview
    ? (actorAdmin
      ? checked(await db.from('user_roles').select('*').eq('user_id', viewerId).maybeSingle())
      : null)
    : actor || { role: 'Admin', is_approved: true, company: 'SuPuja Creations' };
  if (!role) return null;

  const master = preview ? checkIsMasterAdmin(role.module_access, role.role) : actorMaster;
  const userRole = master ? 'Admin' : role.role;
  const moduleAccess = role.module_access || {};
  const admin = master || checkIsAdminRole(userRole);
  const { moduleId = 'channel_ops', moduleTab = page } = REPORTS[page];
  const workspaceGrants = moduleId === 'party' ? ['party', 'team'] : ['channel_ops', 'party', 'team'];
  if (!canReadWorkspace(role, admin)) return null;
  if (!admin && (moduleAccess.analytics?.view !== true ||
      !workspaceGrants.some(section => moduleAccess[section]?.view === true))) return null;
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  const { platform } = resolvePlatformFromRequest({
    userAgent: requestHeaders.get('user-agent'),
    xRequestedWith: requestHeaders.get('x-requested-with'),
    cookiePlatform: requestCookies.get(CLIENT_PLATFORM_COOKIE)?.value,
  });
  if (!getModulePermissions(moduleAccess, userRole, 'analytics', platform).view ||
      !getSubItemPermissions(moduleAccess, userRole, moduleId, moduleTab, platform).view) return null;

  const verifiedTenantId = await resolveRoleTenant(db, role);
  if (!verifiedTenantId || verifiedTenantId !== tenantId) return null;

  const [directory] = await tenantDirectory(db, { tenantId: verifiedTenantId });
  if (!directory || ['SUSPENDED', 'ARCHIVED', 'DRAFT'].includes(String(directory.status).toUpperCase())) return null;
  const access = getUserBranchAccess({ userCompany: role.company, userBranchName: role.branch_name, userRole, moduleAccess }, verifiedTenantId);
  const explicitCodes = access.allowedBranchCodes.filter(code => code !== 'ALL');
  const assigned = explicitCodes.length ? explicitCodes : [...access.allowedBranchNames, ...access.allowedCompanies];
  const branches = directory.branches.map(branch => ({
    ...branch,
    aliases: [...new Set([branch.code, branch.name, branch.operatingCompany].flatMap(expandCompanyAliases))],
  }));
  const allowedBranches = access.isAllBranches ? branches : branches.filter(branch =>
    explicitCodes.length ? matchesCompanyToken(branch.code, assigned) : branch.aliases.some(alias => matchesCompanyToken(alias, assigned))
  );
  const requested = String(branchFilter || '').trim();
  const all = !requested || ['all', 'all branches', 'all companies'].includes(requested.toLowerCase());
  const selected = all ? allowedBranches : allowedBranches.filter(branch => matchesCompanyToken(requested, branch.aliases));
  if (!selected.length && !(all && access.isAllBranches)) return null;

  return {
    tenant: directory,
    viewerId: role.user_id || user.id,
    viewerEmployeeCode: String(role.emp_id || '').trim(),
    unrestricted: all && access.isAllBranches,
    branches: selected,
    branchAliases: selected.flatMap(branch => branch.aliases),
    branchLabel: selected.length === 1 && !(all && access.isAllBranches)
      ? formatBranchStandard(selected[0]) : access.isAllBranches ? 'All Branches' : 'Assigned Branches',
  };
}

async function lookup(db, table, fields, ids, tenantIds, key = 'id') {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += LOOKUP_SIZE) {
    const batch = ids.slice(offset, offset + LOOKUP_SIZE);
    let query = db.from(table).select(fields).in(key, batch);
    if (tenantIds) query = query.in('tenant_id', tenantIds);
    const data = checked(await query);
    rows.push(...(data || []));
  }
  return rows;
}

function orderKey(partyId, number) {
  return partyId + ':' + number;
}

function recordOwner(owners, key, id) {
  if (!UUID.test(id || '')) return;
  // Conflicting assignments leave the record without an attributable owner.
  if (!owners.has(key)) owners.set(key, id);
  else if (owners.get(key) !== id) owners.set(key, null);
}

async function getOrderOwners(db, rows, tenantId) {
  const numbers = [...new Set(rows.map(row => String(row.order_number || '').replace(/-B$/, '')).filter(Boolean))];
  const owners = new Map();
  for (let offset = 0; offset < numbers.length; offset += LOOKUP_SIZE) {
    const keys = numbers.slice(offset, offset + LOOKUP_SIZE);
    for (let start = 0; ; start += PAGE_SIZE) {
      const links = checked(await db.from('party_order_followups')
        .select('id,party_id,generated_order_no,assigned_caller_id')
        .eq('tenant_id', tenantId).eq('is_order_placed', true).in('generated_order_no', keys)
        .order('id').range(start, start + PAGE_SIZE - 1));
      for (const link of links) {
        recordOwner(owners, orderKey(link.party_id, link.generated_order_no), link.assigned_caller_id);
      }
      if (links.length < PAGE_SIZE) break;
    }
  }
  return rows.map(row => owners.get(orderKey(row.party_id, String(row.order_number || '').replace(/-B$/, ''))));
}

async function getComplaintTaskOwners(db, rows, tenantId) {
  const tasksByType = new Map(rows
    .filter(row => !row.assigned_employee_id && row.ticket_number)
    .map(row => ['Complaint & Service (' + row.ticket_number + ')', row.id]));
  const tasks = await lookup(db, 'field_tasks', 'task_type,form_details,assigned_to_user_id', [...tasksByType.keys()], [tenantId], 'task_type');
  const owners = new Map();
  for (const task of tasks) {
    const ticketId = tasksByType.get(task.task_type);
    if (ticketId && ticketId === task.form_details?.ticket_id) recordOwner(owners, ticketId, task.assigned_to_user_id);
  }
  return owners;
}

async function getReportOwners(db, page, rows, scope) {
  const ownerIds = page === 'order_pipeline'
    ? await getOrderOwners(db, rows, scope.tenant.id)
    : rows.map(row => row[REPORTS[page].owner]);
  const ids = [...new Set(ownerIds.filter(id => UUID.test(id || '')))];
  const taskOwners = page === 'complaints' ? await getComplaintTaskOwners(db, rows, scope.tenant.id) : new Map();
  const userIds = page === 'party_master' ? ids : [...new Set([...taskOwners.values()].filter(Boolean))];
  const directory = new Map();
  const userDirectory = new Map();

  if (userIds.length) {
    const roles = await lookup(db, 'user_roles', 'user_id,emp_id,emp_name,tenant_id,module_access,company', userIds, null, 'user_id');
    const resolved = await Promise.all(roles.map(async role => ({
      role, tenantId: await resolveRoleTenant(db, role),
    })));
    for (const { role, tenantId } of resolved) {
      if (tenantId === scope.tenant.id) userDirectory.set(role.user_id, { id: role.user_id, name: role.emp_name, code: role.emp_id });
    }
  }
  if (page !== 'party_master') {
    const employees = await lookup(db, 'employees', 'id,user_id,emp_name,emp_code', ids, [scope.tenant.id]);
    for (const employee of employees) {
      const code = String(employee.emp_code || '').trim();
      const isViewer = !employee.user_id && scope.viewerEmployeeCode && code === scope.viewerEmployeeCode;
      const id = employee.user_id || (isViewer ? scope.viewerId : employee.id);
      directory.set(employee.id, { id, name: employee.emp_name, code });
    }
  }

  const owners = ownerIds.map((id, index) => {
    if (page !== 'party_master' && id) return directory.get(id)?.id || null;
    const userId = page === 'party_master' ? id : taskOwners.get(rows[index].id);
    return userDirectory.get(userId)?.id || (userId === scope.viewerId ? userId : null);
  });
  const employees = [...new Map([...directory.values(), ...userDirectory.values()]
    .filter(employee => employee.name?.trim() && !UUID.test(employee.name.trim()))
    .map(employee => [employee.id, {
      id: employee.id,
      name: employee.name.trim(),
      code: UUID.test(employee.code || '') ? '' : String(employee.code || ''),
    }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  return { owners, employees };
}

function partyMetadata(party) {
  const value = party.business_nature;
  const prefix = 'SWAN_PARTY_META:';
  if (typeof value !== 'string' || !value.startsWith(prefix)) return {};
  try {
    return JSON.parse(value.slice(prefix.length)) || {};
  } catch {
    return {};
  }
}

function partyCompany(party) {
  const meta = partyMetadata(party);
  return meta.branch_code || meta.our_company || '';
}

async function filterToBranch(db, page, rows, scope) {
  if (scope.unrestricted || !rows.length) return rows;
  const tenantIds = [scope.tenant.id];
  const customerIds = page === 'complaints' ? [...new Set(rows.filter(row => !row.party_id).map(row => row.customer_id).filter(Boolean))] : [];
  const customers = await lookup(db, 'end_customers', 'id,linked_party_id,our_company', customerIds, [scope.tenant.code, ...tenantIds]);
  const customerMap = new Map(customers.map(customer => [customer.id, customer]));
  const partyIds = [...new Set(rows.map(row => row.party_id || customerMap.get(row.customer_id)?.linked_party_id).filter(id => UUID.test(id || '')))];
  const parties = page === 'party_master' ? rows : await lookup(db, 'party_master', 'id,business_nature,source_lead_id', partyIds, tenantIds);
  const leadIds = [...new Set(parties.filter(party => !partyCompany(party)).map(party => party.source_lead_id).filter(id => UUID.test(id || '')))];
  const leads = await lookup(db, 'leads', 'id,our_company', leadIds, tenantIds);
  const leadCompanies = new Map(leads.map(lead => [lead.id, lead.our_company]));
  const partyCompanies = new Map(parties.map(party => [party.id, partyCompany(party) || leadCompanies.get(party.source_lead_id)]));
  return rows.filter(row => {
    if (page === 'party_master') {
      const company = partyCompanies.get(row.id);
      return company && matchesCompanyToken(company, scope.branchAliases);
    }
    const customer = !row.party_id ? customerMap.get(row.customer_id) : null;
    const company = row.party_id ? partyCompanies.get(row.party_id) : customer?.our_company || partyCompanies.get(customer?.linked_party_id);
    return company && matchesCompanyToken(company, scope.branchAliases);
  });
}

function addCount(counts, label) {
  counts.set(label, (counts.get(label) || 0) + 1);
}

function callOutcome(row) {
  const status = String(row.call_status || '').trim().toUpperCase();
  if (!status || status === 'PENDING') return '';
  if (row.is_order_placed) return 'ORDER_PLACED';
  return Object.hasOwn(OUTCOMES, status) ? status : 'OTHER';
}

function shiftDay(day, offset) {
  return getComplaintISTDay(new Date(Date.parse(day + 'T00:00:00+05:30') + offset * DAY_MS));
}

function previousCallPeriod(preset, range) {
  if (!range.startDate) return null;
  if (preset === 'this_month' || preset === 'last_month') {
    const monthEnd = shiftDay(range.startDate, -1);
    const month = monthEnd.slice(0, 7);
    const endDay = preset === 'last_month' ? monthEnd.slice(-2)
      : String(Math.min(Number(range.endDate.slice(-2)), Number(monthEnd.slice(-2)))).padStart(2, '0');
    return { startDate: month + '-01', endDate: month + '-' + endDay };
  }
  const offset = ['this_week', 'last_week'].includes(preset)
    ? 7 : (Date.parse(range.endDate + 'T00:00:00+05:30') - Date.parse(range.startDate + 'T00:00:00+05:30')) / DAY_MS + 1;
  const startDate = shiftDay(range.startDate, -offset);
  const endDate = shiftDay(range.endDate, -offset);
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate <= endDate && endDate < range.startDate ? { startDate, endDate } : null;
}

async function readReportRows(db, page, tenantId, range, filterBatch) {
  const { table, columns } = REPORTS[page];
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = db.from(table).select(columns).eq('tenant_id', tenantId);
    if (range.startDate && range.endDate) {
      query = query.gte('created_at', range.startDate + 'T00:00:00+05:30')
        .lte('created_at', range.endDate + 'T23:59:59.999999+05:30');
    }
    const batch = checked(await query.order('created_at').order('id').range(offset, offset + PAGE_SIZE - 1));
    rows.push(...(filterBatch ? await filterBatch(batch) : batch));
    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function readOpenCallbacks(db, tenantId, now) {
  const schedules = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = checked(await db.from('party_order_schedules')
      .select('id,party_id,assigned_caller_id,next_due_date,is_active')
      .eq('tenant_id', tenantId).not('last_followup_at', 'is', null)
      .order('id').range(offset, offset + PAGE_SIZE - 1));
    schedules.push(...batch.filter(row => row.is_active !== false && row.party_id));
    if (batch.length < PAGE_SIZE) break;
  }

  const latest = new Map();
  const { table, columns } = REPORTS.order_followup;
  for (let offset = 0; offset < schedules.length; offset += LOOKUP_SIZE) {
    const ids = schedules.slice(offset, offset + LOOKUP_SIZE).map(row => row.party_id);
    for (let start = 0; ; start += PAGE_SIZE) {
      const batch = checked(await db.from(table).select(columns)
        .eq('tenant_id', tenantId).in('party_id', ids)
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false }).range(start, start + PAGE_SIZE - 1));
      for (const row of batch) {
        if (!latest.has(row.party_id) && callOutcome(row)) latest.set(row.party_id, row);
      }
      if (batch.length < PAGE_SIZE || ids.every(id => latest.has(id))) break;
    }
  }

  const today = getComplaintISTDay(now);
  return schedules.flatMap(schedule => {
    const row = latest.get(schedule.party_id);
    const dueDay = getComplaintISTDay(schedule.next_due_date);
    if (!row || callOutcome(row) !== 'RESCHEDULED' || !dueDay) return [];
    const dueTime = getComplaintISTDay(row.rescheduled_time) === dueDay ? row.rescheduled_time : null;
    const overdue = dueDay < today || Boolean(dueTime && Date.parse(dueTime) < now.getTime());
    return [{
      ...row,
      assigned_caller_id: schedule.assigned_caller_id || row.assigned_caller_id,
      assigned_caller_name: schedule.assigned_caller_id ? null : row.assigned_caller_name,
      dueDay,
      dueTime,
      bucket: overdue ? 'overdue' : dueDay === today ? 'today' : 'upcoming',
    }];
  });
}

async function getCallParties(db, rows, scope) {
  const ids = [...new Set(rows.map(row => row.party_id).filter(id => UUID.test(id || '')))];
  const parties = await lookup(db, 'party_master', 'id,firm_name,party_universal_code,business_nature,source_lead_id', ids, [scope.tenant.id]);
  const leadIds = [...new Set(parties.filter(party => !partyCompany(party)).map(party => party.source_lead_id).filter(id => UUID.test(id || '')))];
  const leads = await lookup(db, 'leads', 'id,our_company', leadIds, [scope.tenant.id]);
  const companies = new Map(leads.map(row => [row.id, row.our_company]));
  return new Map(parties.map(party => {
    const company = partyCompany(party) || companies.get(party.source_lead_id);
    const branches = company ? scope.branches.filter(branch => matchesCompanyToken(company, branch.aliases)) : [];
    return [party.id, {
      visible: scope.unrestricted || Boolean(company && matchesCompanyToken(company, scope.branchAliases)),
      name: party.firm_name,
      code: party.party_universal_code,
      branch: branches.length === 1 ? formatBranchStandard(branches[0]) : 'Branch unavailable',
    }];
  }));
}

function readableName(value) {
  return typeof value === 'string' && !UUID.test(value.trim()) ? value.trim() : '';
}

async function optionalCallData(label, load) {
  try {
    return await load();
  } catch (error) {
    console.error('Order Desk analytics ' + label + ' unavailable:', error?.code || 'report_load_failed');
    return null;
  }
}

async function loadOrderDesk(db, scope, filters, range, now) {
  const { preset, workScope, employeeIds, detail } = filters;
  const previousRange = detail ? null : previousCallPeriod(preset, range);
  const readActivity = dateRange => readReportRows(db, 'order_followup', scope.tenant.id, dateRange);
  const [current, previous, callbacks] = await Promise.all([
    detail?.kind === 'queue' ? [] : readActivity(range),
    previousRange ? optionalCallData('comparison', () => readActivity(previousRange)) : null,
    detail?.kind === 'outcome' ? [] : optionalCallData('callbacks', () => readOpenCallbacks(db, scope.tenant.id, now)),
  ]);
  const parties = await getCallParties(db, [...current, ...(previous || []), ...(callbacks || [])], scope);
  const visible = rows => rows.filter(row => callOutcome(row) && (scope.unrestricted || parties.get(row.party_id)?.visible));
  const activity = visible(current);
  const comparison = visible(previous || []);
  const queue = visible(callbacks || []);
  const all = [...activity, ...comparison, ...queue];
  const attribution = await optionalCallData('employee attribution', () => getReportOwners(db, 'order_followup', all, scope));
  if (!attribution && workScope !== 'all') throw new Error('Employee attribution unavailable.');
  const { owners = [], employees = [] } = attribution || {};
  const callerByRow = new Map(all.map((row, index) => [row, owners[index]]));
  const directory = new Map(employees.map(employee => [employee.id, employee]));
  const selected = new Set(workScope === 'mine' ? [scope.viewerId] : employeeIds);
  const inScope = rows => workScope === 'all' ? rows : rows.filter(row => selected.has(callerByRow.get(row)));
  const callerName = row => directory.get(callerByRow.get(row))?.name || readableName(row.assigned_caller_name) || 'Unassigned';
  const branchName = row => parties.get(row.party_id)?.branch || 'Branch unavailable';
  const callbackTime = row => Date.parse(row.dueTime || row.dueDay + 'T00:00:00+05:30');
  const openCallbacks = inScope(queue).sort((a, b) => callbackTime(a) - callbackTime(b));
  const record = row => ({
    id: row.id,
    party: readableName(parties.get(row.party_id)?.name) || 'Partner unavailable',
    partyCode: readableName(parties.get(row.party_id)?.code),
    caller: callerName(row),
    branch: branchName(row),
    loggedAt: row.created_at,
    dueDay: row.dueDay || getComplaintISTDay(row.rescheduled_time) || null,
    dueTime: row.dueDay ? row.dueTime : (row.rescheduled_time || null),
    outcome: OUTCOMES[callOutcome(row)],
    orderNumber: readableName(row.generated_order_no),
  });

  if (detail) {
    if (detail.kind === 'queue' && !callbacks) return { success: false, error: 'The callback queue is unavailable. Try refreshing.' };
    const matches = detail.kind === 'queue'
      ? openCallbacks.filter(row => row.bucket === detail.key)
      : inScope(activity).filter(row => detail.key === 'all' || callOutcome(row) === detail.key).reverse();
    const pageNumber = Math.min(detail.page, Math.max(1, Math.ceil(matches.length / detail.pageSize)));
    const offset = (pageNumber - 1) * detail.pageSize;
    const rows = matches.slice(offset, offset + detail.pageSize).map(record);
    return { success: true, detail: { rows, page: pageNumber, total: matches.length } };
  }

  const filtered = inScope(activity);
  const result = assembleReport('order_followup', filtered, range, now);
  const callerCounts = new Map();
  const branchCounts = new Map();
  for (const row of filtered) {
    const employee = directory.get(callerByRow.get(row));
    addCount(callerCounts, employee?.code ? employee.name + ' · ' + employee.code : callerName(row));
    addCount(branchCounts, branchName(row));
  }
  const callbackCounts = { overdue: 0, today: 0, upcoming: 0 };
  for (const row of openCallbacks) callbackCounts[row.bucket]++;
  return {
    success: true, branchLabel: scope.branchLabel, range, employees, employeeFilterUnavailable: !attribution,
    ...result,
    calling: {
      callbacks: callbacks ? callbackCounts : null,
      callbackPreview: openCallbacks.slice(0, 3).map(record),
      comparison: previous ? { range: previousRange, kpis: assembleReport('order_followup', inScope(comparison), previousRange, now).kpis } : null,
      comparisonUnavailable: Boolean(previousRange && !previous),
      groups: [breakdown(callerCounts, 'Calls by caller'), breakdown(branchCounts, 'Calls by branch')],
    },
  };
}

function stageFor(row) {
  if (row.order_status === 'CANCELLED' || row.delivery_status === 'CANCELLED') return 'CANCELLED';
  return LEGACY_STAGES[row.delivery_status] || (Object.hasOwn(STAGES, row.delivery_status) ? row.delivery_status : (row.delivery_status ? 'OTHER' : 'S01'));
}

function breakdown(counts, title) {
  return { title, rows: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) };
}

function getPartyTier(party, meta) {
  const savedType = String(meta.party_type || '').trim().toLowerCase();
  if (Object.hasOwn(PARTY_TIERS, savedType)) return PARTY_TIERS[savedType];

  const tiers = new Set((party.party_roles || [])
    .filter(role => role.status === 'ACTIVE' && Object.hasOwn(PARTY_ROLE_TIERS, role.role_type))
    .map(role => PARTY_ROLE_TIERS[role.role_type]));
  return tiers.size === 1 ? tiers.values().next().value : 'Other partner type';
}

function assembleReport(page, rows, range, now) {
  const trend = new Map();
  const start = new Date(range.startDate + 'T00:00:00+05:30').getTime();
  const end = new Date(range.endDate + 'T00:00:00+05:30').getTime();
  // Keep empty days visible for short ranges. Long ranges plot days with records.
  if ((end - start) / DAY_MS < MAX_DENSE_TREND_DAYS) {
    for (let day = start; day <= end; day += DAY_MS) {
      const key = getComplaintISTDay(new Date(day));
      trend.set(key, { day: key, value: 0, secondary: 0 });
    }
  }
  const groups = new Map();
  const extraGroups = new Map();
  let total = 0, orders = 0, callbacks = 0, unreachable = 0, value = 0, open = 0, delivered = 0, closed = 0, breached = 0;
  let activePartners = 0, onboarding = 0, distributors = 0, dealers = 0;

  for (const row of rows) {
    const day = getComplaintISTDay(row.created_at);
    const point = trend.get(day) || { day, value: 0, secondary: 0 };
    if (day && !trend.has(day)) trend.set(day, point);
    if (page === 'order_followup') {
      const outcome = callOutcome(row);
      total++;
      point.value++;
      if (outcome === 'ORDER_PLACED') { orders++; point.secondary++; }
      if (outcome === 'RESCHEDULED') callbacks++;
      if (outcome === 'UNREACHABLE') unreachable++;
      addCount(groups, outcome);
    } else if (page === 'order_pipeline') {
      const stage = stageFor(row);
      total++;
      addCount(groups, stage === 'CANCELLED' || stage === 'OTHER' ? STAGES[stage] : stage + ' · ' + STAGES[stage]);
      if (stage === 'S13') delivered++;
      else if (stage !== 'CANCELLED' && row.order_status !== 'DRAFT') open++;
      if (stage !== 'CANCELLED' && row.order_status !== 'DRAFT' && !String(row.order_number || '').endsWith('-B')) {
        orders++;
        point.value++;
        value += Math.round((Number(row.total_amount) || 0) * 100);
      }
    } else if (page === 'party_master') {
      const meta = partyMetadata(row);
      const status = String(meta.activation_status || row.party_status || '').trim().toLowerCase();
      const stage = String(row.onboarding_stage || '').slice(0, 3).toUpperCase();
      const tier = getPartyTier(row, meta);
      const converted = status === 'active';
      total++;
      point.value++;
      if (converted) activePartners++;
      if (!converted && /^S0[0-7]$/.test(stage) && !['hold', 'inactive', 'blacklisted', 'rejected', 'closed'].includes(status)) onboarding++;
      if (tier === 'Distributor') distributors++;
      if (tier === 'Dealer') dealers++;
      addCount(groups, tier);
      addCount(extraGroups, /^S0[0-8]$/.test(stage) ? stage : 'Unspecified stage');
    } else {
      const status = getComplaintStatus(row);
      total++;
      point.value++;
      if (status === 'PENDING') {
        open++;
        if (row.sla_deadline && new Date(row.sla_deadline).getTime() < now.getTime()) breached++;
      }
      if (status === 'COMPLETED') { closed++; point.secondary++; }
      addCount(groups, Object.hasOwn(CATEGORIES, row.category) ? CATEGORIES[row.category] : 'Other category');
      addCount(extraGroups, Object.hasOwn(DEPARTMENTS, row.assigned_department) ? DEPARTMENTS[row.assigned_department] : 'Other department');
    }
  }

  if (page === 'party_master') {
    return {
      total,
      trend: [...trend.values()],
      kpis: { total, activePartners, onboarding, distributors, dealers },
      breakdowns: [breakdown(groups, 'Partner types'), breakdown(extraGroups, 'Current onboarding stage')],
    };
  }
  const kpis = page === 'order_followup' ? { total, orders, conversion: total ? orders / total : null, callbacks, unreachable }
    : page === 'order_pipeline' ? { orders, value: value / 100, open, delivered } : { total, open, closed, breached };
  const breakdowns = page === 'order_followup' ? [{
    title: 'Call outcomes',
    rows: [...groups].map(([key, count]) => ({ key, label: OUTCOMES[key], count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }]
    : page === 'order_pipeline' ? [breakdown(groups, 'Current stage')]
      : [breakdown(groups, 'By category'), breakdown(extraGroups, 'By department')];
  return { total, trend: [...trend.values()], kpis, breakdowns };
}

export async function getChannelAnalytics(input) {
  const { page, tenantId, viewer, branch, preset = 'last_7_days', startDate = '', endDate = '', workScope = 'all', employeeIds = [], detail = null } = input || {};
  if (!Object.hasOwn(REPORTS, page) || !UUID.test(tenantId || '') || (viewer && !UUID.test(viewer)) || !PRESETS.has(preset)) return denied();
  if (!['all', 'mine', 'employees'].includes(workScope) ||
      !Array.isArray(employeeIds) || employeeIds.some(id => typeof id !== 'string' || !UUID.test(id)) ||
      (workScope === 'employees' && !employeeIds.length)) return denied();
  if (detail !== null && (page !== 'order_followup' || typeof detail.key !== 'string' ||
      !(detail.kind === 'queue' && Object.hasOwn(CALLBACK_BUCKETS, detail.key) ||
        detail.kind === 'outcome' && (detail.key === 'all' || Object.hasOwn(OUTCOMES, detail.key))) ||
      !Number.isSafeInteger(detail.page) || detail.page < 1 ||
      !Number.isSafeInteger(detail.pageSize) || detail.pageSize < 1 || detail.pageSize > 100000)) return denied();
  try {
    const session = await createClient();
    const { data, error } = await session.auth.getUser();
    if (error || !data?.user) return denied();
    const db = getAdminClient();
    const scope = await authorizeReport(db, data.user, page, tenantId, viewer, branch);
    if (!scope) return denied();

    const now = new Date();
    if (preset === 'custom' && (typeof startDate !== 'string' || typeof endDate !== 'string')) {
      return { success: false, error: 'Enter valid dates.' };
    }
    const range = getComplaintDateRange(preset, startDate, endDate, now);
    if (range.error) return { success: false, error: range.error };
    if (page === 'order_followup') return await loadOrderDesk(db, scope, { preset, workScope, employeeIds, detail }, range, now);
    const activity = await readReportRows(db, page, scope.tenant.id, range, batch => filterToBranch(db, page, batch, scope));
    let attribution;
    let employeeFilterUnavailable = false;
    try {
      attribution = await getReportOwners(db, page, activity, scope);
    } catch (error) {
      if (workScope !== 'all') throw error;
      console.error('Channel analytics employee filters unavailable:', error?.code || 'report_attribution_failed');
      employeeFilterUnavailable = true;
      attribution = { owners: [], employees: [] };
    }
    const { owners, employees } = attribution;
    const requestedEmployees = new Set(employeeIds);
    const selected = new Set(workScope === 'mine'
      ? [scope.viewerId]
      : employees.filter(employee => requestedEmployees.has(employee.id)).map(employee => employee.id));
    const filtered = workScope === 'all' ? activity : activity.filter((_, index) => selected.has(owners[index]));
    return { success: true, branchLabel: scope.branchLabel, range, employees, employeeFilterUnavailable, ...assembleReport(page, filtered, range, now) };
  } catch (error) {
    console.error('Channel analytics read failed:', error?.code || 'report_load_failed');
    return { success: false, error: 'The report could not be loaded. Try refreshing.' };
  }
}
