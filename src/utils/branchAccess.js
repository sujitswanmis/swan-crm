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
  'NSMLR',
  'NSTLP',
  'NSTL',
  'New Swan Group',
  'Swan Agro',
  'NSE-1',
  'NSE-2',
  'NSE-6',
  'NSCPL',
  'NSACPL',
  ''
];

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

export function expandCompanyAliases(companyToken) {
  const raw = String(companyToken || '').trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  if (upper === 'NSTL' || upper === 'NSTLP') {
    return ['NSTL', 'NSTLP'];
  }
  return [raw];
}

export function matchesCompanyToken(targetCompany, allowedTokens = []) {
  const cleanTarget = String(targetCompany || '').trim().toLowerCase();
  return allowedTokens.some(token => {
    const cleanToken = String(token || '').trim().toLowerCase();
    if (!cleanToken) return cleanTarget === '';
    if (cleanToken === 'nstl' || cleanToken === 'nstlp') {
      return cleanTarget === 'nstl' || cleanTarget === 'nstlp';
    }
    return cleanTarget === cleanToken;
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

  if (isAllBranches) {
    const swanHeaderOptions = ['NSMLR', 'NSTLP'];
    const customOptions = [];
    for (const c of [primaryCompany, ...rawBranches]) {
      if (!c || c.toUpperCase() === 'ALL') continue;
      const upper = c.toUpperCase();
      if (isSwanWorkspace && !['NSMLR', 'NSTLP', 'NSTL', 'NEW SWAN GROUP'].includes(upper)) {
        if (!customOptions.some(x => x.toUpperCase() === upper)) customOptions.push(c);
      }
    }
    return {
      scope: 'ALL',
      isAdminUser,
      isAllBranches: true,
      isMultiBranch: true,
      primaryCompany,
      allowedCompanies: isSwanWorkspace
        ? [...SWAN_ALL_LEAD_COMPANIES, ...customOptions]
        : expandCompanyAliases(primaryCompany),
      allowedBranchNames: ['All Branches'],
      allowedBranchCodes: ['ALL'],
      displayFilterOptions: isSwanWorkspace ? [...swanHeaderOptions, ...customOptions] : (primaryCompany ? [primaryCompany] : []),
      matchesLeadCompany: (leadCompany) => {
        if (isSwanWorkspace) {
          return matchesCompanyToken(leadCompany, [...SWAN_ALL_LEAD_COMPANIES, ...customOptions]);
        }
        return !primaryCompany || matchesCompanyToken(leadCompany, expandCompanyAliases(primaryCompany));
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
export function getScopedBranchFilterOptions(branchAccess = null, fallbackOptions = ['NSMLR', 'NSTLP']) {
  if (!branchAccess) return fallbackOptions;
  const opts = Array.isArray(branchAccess.displayFilterOptions)
    ? branchAccess.displayFilterOptions.filter(Boolean)
    : [];
  if (opts.length > 0) return opts;
  if (branchAccess.isAllBranches) return fallbackOptions;
  return branchAccess.primaryCompany ? [branchAccess.primaryCompany] : [];
}
