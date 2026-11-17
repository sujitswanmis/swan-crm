/**
 * Shared Tenant-Scoped Branch & Company Access Resolver
 * Supports single primary branch, multi-branch chip selection (e.g. NSMLR + NSTLP),
 * and tenant-wide All Branches access without modifying single-branch legacy behavior.
 */

export const SWAN_WORKSPACE_COMPANIES = [
  'nsmlr',
  'nstlp',
  'nstl',
  'new swan group',
  'swan agro',
  'nse-1',
  'nse-2',
  'nse-6',
  'nscpl',
  'nsacpl'
];

export const SWAN_ALL_LEAD_COMPANIES = [
  'NSG',
  'New Swan Group',
  'New Swan Group (Headquarters)',
  'NSMLR',
  'New Swan Multitech Limited Raian',
  'NSTLP',
  'NSTL',
  'New Swan Technologies Limited Paharuwal',
  'Swan Agro',
  'NSE1',
  'NSE-1',
  'NSE01',
  'New Swan Enterprises - 1',
  'NSE2',
  'NSE-2',
  'New Swan Enterprises - 2',
  'NSE3',
  'NSE-3',
  'New Swan Enterprises - 3',
  'NSE4',
  'NSE-4',
  'New Swan Enterprises - 4',
  'NSE-6',
  'NSCPL',
  'NSACPL1',
  'NSACPL',
  'New Swan Autocomp Pvt. Ltd.',
  'TNT00002-B0001',
  'TNT00002-B0002',
  'TNT00002-B0003',
  'TNT00002-B0004',
  'TNT00002-B0005',
  'TNT00002-B0006',
  'TNT00002-B0007',
  'TNT00002-B0008',
  ''
];

export const KNOWN_BRANCH_ALIAS_MAP = {
  'NSG': ['NSG', 'NEW SWAN GROUP', 'NEW SWAN GROUP (HEADQUARTERS)', 'TNT00002-B0001', 'BR_NSG_HQ_001'],
  'NSMLR': ['NSMLR', 'NEW SWAN MULTITECH LIMITED RAIAN', 'TNT00002-B0002', 'BR_NSMLR_001'],
  'NSTLP': ['NSTLP', 'NSTL', 'NEW SWAN TECHNOLOGIES LIMITED PAHARUWAL', 'TNT00002-B0003', 'BR_NSTLP_001'],
  'NSE1': ['NSE1', 'NSE-1', 'NSE01', 'NEW SWAN ENTERPRISES - 1', 'TNT00002-B0004', 'BR_NSE1_001'],
  'NSE2': ['NSE2', 'NSE-2', 'NEW SWAN ENTERPRISES - 2', 'TNT00002-B0005', 'BR_NSE2_001'],
  'NSE3': ['NSE3', 'NSE-3', 'NEW SWAN ENTERPRISES - 3', 'TNT00002-B0006', 'BR_NSE3_001'],
  'NSE4': ['NSE4', 'NSE-4', 'NEW SWAN ENTERPRISES - 4', 'TNT00002-B0007', 'BR_NSE4_001'],
  'NSACPL1': ['NSACPL1', 'NSACPL', 'NEW SWAN AUTOCOMP PVT. LTD.', 'TNT00002-B0008'],
  'SUPUJA_CREATIONS': ['SUPUJA_CREATIONS', 'SUPUJA CREATIONS', 'SUPUJA CREATION', 'HQ-MAIN-01', 'TNT00001-B0001', 'BR_HQ_1791830835870', 'BR_HQ_1792173406378']
};

const TENANT_DEFAULT_CUSTOM_CODES = new Set(['HQ', 'HQ-MAIN-01', 'SUPUJA_CREATIONS', 'NSG']);

export function resolveCompanyTokenForBranch(branch, tenantCompanyName = '') {
  if (!branch) return tenantCompanyName || '';
  if (typeof branch === 'string') return branch.trim();
  const customCode = String(branch.custom_code || '').trim();
  if (customCode && !TENANT_DEFAULT_CUSTOM_CODES.has(customCode.toUpperCase())) {
    return customCode;
  }
  return tenantCompanyName || branch.company || branch.branch_name || '';
}

export const STANDARD_SWAN_BRANCH_MAP = {
  'NSG': { branch_code: 'TNT00002-B0001', branch_name: 'New Swan Group (Headquarters)', custom_code: 'HQ' },
  'NSMLR': { branch_code: 'TNT00002-B0002', branch_name: 'New Swan Multitech Limited Raian', custom_code: 'NSMLR' },
  'NSTLP': { branch_code: 'TNT00002-B0003', branch_name: 'New Swan Technologies Limited Paharuwal', custom_code: 'NSTLP' },
  'NSE1': { branch_code: 'TNT00002-B0004', branch_name: 'New Swan Enterprises - 1', custom_code: 'NSE1' },
  'NSE2': { branch_code: 'TNT00002-B0005', branch_name: 'New Swan Enterprises - 2', custom_code: 'NSE2' },
  'NSE3': { branch_code: 'TNT00002-B0006', branch_name: 'New Swan Enterprises - 3', custom_code: 'NSE3' },
  'NSE4': { branch_code: 'TNT00002-B0007', branch_name: 'New Swan Enterprises - 4', custom_code: 'NSE4' },
  'NSACPL1': { branch_code: 'TNT00002-B0008', branch_name: 'New Swan Autocomp Pvt. Ltd.', custom_code: 'NSACPL1' }
};

export const STANDARD_SWAN_BRANCH_LIST = Object.values(STANDARD_SWAN_BRANCH_MAP);

/**
 * Universal standard branch display formatter matching WhatsApp Official standard:
 * Returns `${branch_code} — ${branch_name}`
 * Example: "TNT00002-B0002 — New Swan Multitech Limited Raian"
 */
export function formatBranchStandard(branch) {
  if (!branch) return '';
  if (typeof branch === 'string') {
    const raw = branch.trim();
    if (!raw) return '';
    if (/^TNT\d+-B\d+\s*—/i.test(raw)) return raw;
    const upper = raw.toUpperCase();
    for (const [key, info] of Object.entries(STANDARD_SWAN_BRANCH_MAP)) {
      if (key === upper || info.branch_code.toUpperCase() === upper) {
        return `${info.branch_code} — ${info.branch_name}`;
      }
    }
    for (const [key, aliases] of Object.entries(KNOWN_BRANCH_ALIAS_MAP)) {
      if (key === upper || aliases.some(a => a.toUpperCase() === upper)) {
        const info = STANDARD_SWAN_BRANCH_MAP[key];
        if (info) return `${info.branch_code} — ${info.branch_name}`;
      }
    }
    return raw;
  }
  const uid = branch.branch_code || '';
  const name = branch.branch_name || branch.name || branch.company || '';
  if (uid && name) {
    return `${uid} — ${name}`;
  }
  return uid || name || branch.custom_code || '';
}

export function expandCompanyAliases(companyToken) {
  const raw = String(companyToken || '').trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  if (upper === 'NSTL' || upper === 'NSTLP') {
    return ['NSTL', 'NSTLP', 'New Swan Technologies Limited Paharuwal', 'TNT00002-B0003'];
  }
  for (const [canonical, aliases] of Object.entries(KNOWN_BRANCH_ALIAS_MAP)) {
    if (canonical.toUpperCase() === upper || aliases.some(a => a.toUpperCase() === upper)) {
      return Array.from(new Set([raw, canonical, ...aliases]));
    }
  }
  return [raw];
}

export function matchesCompanyToken(targetCompany, allowedTokens = []) {
  const cleanTarget = String(targetCompany || '').trim().toLowerCase();
  return allowedTokens.some(token => {
    const cleanToken = String(token || '').trim().toLowerCase();
    if (!cleanToken) return cleanTarget === '';
    if (cleanToken === cleanTarget) return true;
    if (cleanToken === 'nstl' || cleanToken === 'nstlp') {
      return cleanTarget === 'nstl' || cleanTarget === 'nstlp';
    }
    // Check if target matches any alias of the allowed token
    const tokenAliases = expandCompanyAliases(token).map(t => String(t || '').trim().toLowerCase());
    return tokenAliases.includes(cleanTarget);
  });
}

/**
 * Resolve normalized multi-branch access for a signed-in or inspected user row.
 */
export function getUserBranchAccess(params = {}, tenantHint = null) {
  const opts = params && typeof params === 'object' ? params : {};
  const userCompany = opts.userCompany ?? opts.company ?? '';
  const userBranchName = opts.userBranchName ?? opts.branch_name ?? '';
  const moduleAccess = opts.moduleAccess ?? opts.module_access ?? {};
  const userRole = opts.userRole ?? opts.role ?? '';
  const isMasterAdmin = Boolean(
    opts.isMasterAdmin ||
    moduleAccess?.is_master_admin === true ||
    String(userRole || '').trim().toLowerCase().includes('master')
  );
  const rawTenant = String(tenantHint || opts.tenant_id || opts.tenantId || moduleAccess?._tenantId || '').trim();
  const compLower = String(userCompany || '').trim().toLowerCase();
  const isSwanWorkspace = Boolean(
    opts.isSwanWorkspace ||
    rawTenant === '00000000-0000-0000-0000-000000000001' ||
    rawTenant.toUpperCase() === 'TNT00002' ||
    SWAN_WORKSPACE_COMPANIES.includes(compLower)
  );
  const roleLower = String(userRole || '').trim().toLowerCase();
  const isAdminUser = Boolean(
    isMasterAdmin ||
    roleLower === 'admin' ||
    roleLower === 'superadmin' ||
    roleLower === 'masteradmin'
  );

  const rawScope = String(moduleAccess?.assigned_branch_scope || '').trim().toUpperCase();
  const rawBranches = Array.isArray(moduleAccess?.assigned_branches)
    ? moduleAccess.assigned_branches.map(b => String(b || '').trim()).filter(Boolean)
    : [];
  const rawBranchNames = Array.isArray(moduleAccess?.assigned_branch_names)
    ? moduleAccess.assigned_branch_names.map(b => String(b || '').trim()).filter(Boolean)
    : [];
  const rawBranchCodes = Array.isArray(moduleAccess?.assigned_branch_codes)
    ? moduleAccess.assigned_branch_codes.map(b => String(b || '').trim()).filter(Boolean)
    : [];

  const hasAllToken =
    rawScope === 'ALL' ||
    rawBranches.some(b => b.toUpperCase() === 'ALL' || b.toLowerCase() === 'all branches') ||
    rawBranchNames.some(b => b.toLowerCase() === 'all branches');

  const isAllBranches = Boolean(isAdminUser || hasAllToken);

  const primaryCompany = String(userCompany || '').trim();
  const primaryBranchName = String(userBranchName || moduleAccess?.branch_name || '').trim();

  const dynamicBranches = Array.isArray(opts.dynamicBranches) && opts.dynamicBranches.length > 0
    ? opts.dynamicBranches
    : null;

  let dynamicBranchTokens = [];
  if (dynamicBranches) {
    dynamicBranchTokens = Array.from(new Set(
      dynamicBranches.map(b => String(b.custom_code || b.legacy_code || b.branch_code || '').trim()).filter(Boolean)
    ));
  }

  if (isAllBranches) {
    const swanHeaderOptions = dynamicBranchTokens.length > 0
      ? dynamicBranchTokens
      : (isSwanWorkspace
          ? ['NSG', 'NSMLR', 'NSTLP', 'NSE1', 'NSE2', 'NSE3', 'NSE4', 'NSACPL1']
          : (primaryCompany ? [primaryCompany] : []));
    const customOptions = [];
    for (const c of [primaryCompany, ...rawBranches]) {
      if (!c || c.toUpperCase() === 'ALL') continue;
      const upper = c.toUpperCase();
      const isParentTenantGroup = isSwanWorkspace && ['NEW SWAN GROUP', 'NSG', 'SUPUJA CREATIONS', 'SUPUJA CREATION'].includes(upper);
      if (isParentTenantGroup && swanHeaderOptions.length > 0) continue;
      if (!swanHeaderOptions.some(x => x.toUpperCase() === upper)) {
        if (!customOptions.some(x => x.toUpperCase() === upper)) customOptions.push(c);
      }
    }
    const allAllowedCompanies = Array.from(new Set([
      ...(isSwanWorkspace ? SWAN_ALL_LEAD_COMPANIES : expandCompanyAliases(primaryCompany)),
      ...swanHeaderOptions,
      ...customOptions,
      ...(dynamicBranches ? dynamicBranches.map(b => b.branch_name).filter(Boolean) : []),
      ...(dynamicBranches ? dynamicBranches.map(b => b.branch_code).filter(Boolean) : [])
    ]));

    return {
      scope: 'ALL',
      isAdminUser,
      isAllBranches: true,
      isMultiBranch: true,
      primaryCompany,
      allowedCompanies: allAllowedCompanies,
      allowedBranchNames: ['All Branches'],
      allowedBranchCodes: ['ALL'],
      displayFilterOptions: [...swanHeaderOptions, ...customOptions],
      matchesLeadCompany: (leadCompany) => {
        return matchesCompanyToken(leadCompany, allAllowedCompanies);
      }
    };
  }

  // Build unique list of specific assigned company tokens & branch names
  const uniqueCompanies = [];
  const seenUpper = new Set();
  const pushCompany = (val) => {
    const clean = String(val || '').trim();
    if (!clean || clean.toUpperCase() === 'ALL') return;
    const key = clean.toUpperCase() === 'NSTL' ? 'NSTLP' : clean.toUpperCase();
    if (!seenUpper.has(key)) {
      seenUpper.add(key);
      uniqueCompanies.push(clean);
    }
  };

  for (const b of rawBranches) pushCompany(b);
  if (primaryCompany) pushCompany(primaryCompany);

  const uniqueBranchNames = [];
  const seenNames = new Set();
  const pushName = (val) => {
    const clean = String(val || '').trim();
    if (!clean || clean.toLowerCase() === 'all branches') return;
    const key = clean.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      uniqueBranchNames.push(clean);
    }
  };
  for (const n of rawBranchNames) pushName(n);
  if (primaryBranchName) pushName(primaryBranchName);

  const isMulti = uniqueCompanies.length > 1 || uniqueBranchNames.length > 1 || rawScope === 'MULTI';
  const expandedAllowed = uniqueCompanies.flatMap(expandCompanyAliases);

  return {
    scope: isMulti ? 'MULTI' : 'SINGLE',
    isAdminUser: false,
    isAllBranches: false,
    isMultiBranch: isMulti,
    primaryCompany: primaryCompany || uniqueCompanies[0] || '',
    allowedCompanies: expandedAllowed,
    allowedBranchNames: uniqueBranchNames,
    allowedBranchCodes: rawBranchCodes,
    displayFilterOptions: uniqueCompanies,
    matchesLeadCompany: (leadCompany) => {
      if (expandedAllowed.length === 0) return true;
      return matchesCompanyToken(leadCompany, expandedAllowed);
    }
  };
}

/**
 * Evaluate whether a lead row belongs to the user's active tenant + branch + header filter scope.
 * Returns { inCompanyScope: boolean, allowDirectAssignment: boolean }.
 */
export function evaluateLeadCompanyScope(leadCompany, {
  isSwanWorkspace = false,
  userCompany = '',
  adminCompanyFilter = 'All',
  userBranchAccess = null,
  isAdmin = false
} = {}) {
  const scope = userBranchAccess?.scope || 'SINGLE';
  const cleanUserComp = String(userCompany || '').trim();

  if (!isSwanWorkspace && scope !== 'MULTI' && cleanUserComp) {
    const exactMatch = String(leadCompany || '').trim().toLowerCase() === cleanUserComp.toLowerCase();
    return { inCompanyScope: exactMatch, allowDirectAssignment: false };
  }

  if (isAdmin || userBranchAccess?.isAllBranches || scope === 'MULTI') {
    if (adminCompanyFilter && adminCompanyFilter !== 'All') {
      const filterAliases = expandCompanyAliases(adminCompanyFilter);
      return {
        inCompanyScope: matchesCompanyToken(leadCompany, filterAliases),
        allowDirectAssignment: !isAdmin && !userBranchAccess?.isAllBranches
      };
    }
    return {
      inCompanyScope: userBranchAccess ? userBranchAccess.matchesLeadCompany(leadCompany) : true,
      allowDirectAssignment: !isAdmin && !userBranchAccess?.isAllBranches
    };
  }

  if (cleanUserComp) {
    return {
      inCompanyScope: userBranchAccess
        ? userBranchAccess.matchesLeadCompany(leadCompany)
        : matchesCompanyToken(leadCompany, expandCompanyAliases(cleanUserComp)),
      allowDirectAssignment: true
    };
  }

  return { inCompanyScope: true, allowDirectAssignment: true };
}

/**
 * Shared Entity Branch Filter (Parties, S00 Transfers, Channel Ops Orders/Followups/Complaints, Check-In Entities)
 */
export function matchesEntityBranchScope(entityCompany, branchAccess = null, activeHeaderFilter = 'All') {
  const cleanFilter = String(activeHeaderFilter || '').trim();
  const hasHeaderFilter = Boolean(cleanFilter && cleanFilter.toLowerCase() !== 'all' && cleanFilter.toLowerCase() !== 'all companies');

  if (!branchAccess) {
    if (!hasHeaderFilter) return true;
    return matchesCompanyToken(entityCompany, expandCompanyAliases(cleanFilter));
  }

  if (branchAccess.isAllBranches) {
    if (hasHeaderFilter) {
      return matchesCompanyToken(entityCompany, expandCompanyAliases(cleanFilter));
    }
    return branchAccess.matchesLeadCompany ? branchAccess.matchesLeadCompany(entityCompany) : true;
  }

  if (hasHeaderFilter && matchesCompanyToken(cleanFilter, branchAccess.allowedCompanies || [])) {
    return matchesCompanyToken(entityCompany, expandCompanyAliases(cleanFilter));
  }

  return branchAccess.matchesLeadCompany ? branchAccess.matchesLeadCompany(entityCompany) : true;
}

/**
 * Shared Employee Membership Matcher (Attendance Team Report, Regularization/Leave Approvals, Field Force, User Directory)
 */
export function matchesUserBranchMembership(employeeRow, branchAccess = null, activeHeaderFilter = 'All') {
  if (!employeeRow) return false;
  const cleanFilter = String(activeHeaderFilter || '').trim();
  const hasHeaderFilter = Boolean(cleanFilter && cleanFilter.toLowerCase() !== 'all' && cleanFilter.toLowerCase() !== 'all companies');

  const ma = employeeRow.module_access || {};
  const empScope = String(employeeRow.assigned_branch_scope || ma.assigned_branch_scope || '').trim().toUpperCase();
  const rawTokens = [
    employeeRow.company,
    employeeRow.company_name,
    ...(Array.isArray(employeeRow.assigned_branches) ? employeeRow.assigned_branches : []),
    ...(Array.isArray(ma.assigned_branches) ? ma.assigned_branches : [])
  ].map(v => String(v || '').trim()).filter(Boolean);

  const rawNamesAndCodes = [
    employeeRow.branch_name,
    employeeRow.branch_code,
    ma.branch_name,
    ...(Array.isArray(employeeRow.assigned_branch_names) ? employeeRow.assigned_branch_names : []),
    ...(Array.isArray(ma.assigned_branch_names) ? ma.assigned_branch_names : []),
    ...(Array.isArray(employeeRow.assigned_branch_codes) ? employeeRow.assigned_branch_codes : []),
    ...(Array.isArray(ma.assigned_branch_codes) ? ma.assigned_branch_codes : [])
  ].map(v => String(v || '').trim()).filter(Boolean);

  const empHasAll = empScope === 'ALL' || rawTokens.some(t => t.toUpperCase() === 'ALL');

  // Determine effective allowed tokens & names to test against
  let targetCompanies = null;
  let targetNames = [];

  if (!branchAccess || branchAccess.isAllBranches) {
    if (!hasHeaderFilter) return true;
    targetCompanies = expandCompanyAliases(cleanFilter);
  } else {
    if (hasHeaderFilter && matchesCompanyToken(cleanFilter, branchAccess.allowedCompanies || [])) {
      targetCompanies = expandCompanyAliases(cleanFilter);
    } else {
      targetCompanies = branchAccess.allowedCompanies || [];
      targetNames = [
        ...(Array.isArray(branchAccess.allowedBranchNames) ? branchAccess.allowedBranchNames : []),
        ...(Array.isArray(branchAccess.allowedBranchCodes) ? branchAccess.allowedBranchCodes : [])
      ].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    }
  }

  if (empHasAll) return true;
  if (!targetCompanies || targetCompanies.length === 0) return true;

  if (rawTokens.some(tok => matchesCompanyToken(tok, targetCompanies))) {
    return true;
  }

  if (targetNames.length > 0 && rawNamesAndCodes.some(n => targetNames.includes(n.toLowerCase()))) {
    return true;
  }

  return false;
}

/**
 * Helper to return normalized Company/Branch dropdown options based on branchAccess.
 */
export function getScopedBranchFilterOptions(branchAccess = null, fallbackOptions = ['NSG', 'NSMLR', 'NSTLP', 'NSE1', 'NSE2', 'NSE3', 'NSE4', 'NSACPL1']) {
  if (!branchAccess) return fallbackOptions;
  const opts = Array.isArray(branchAccess.displayFilterOptions)
    ? branchAccess.displayFilterOptions.filter(Boolean)
    : [];
  if (opts.length > 0) return opts;
  if (branchAccess.isAllBranches) return fallbackOptions;
  return branchAccess.primaryCompany ? [branchAccess.primaryCompany] : [];
}
