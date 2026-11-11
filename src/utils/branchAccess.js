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
export function getUserBranchAccess({
  userCompany = '',
  userBranchName = '',
  moduleAccess = {},
  userRole = '',
  isMasterAdmin = false,
  isSwanWorkspace = false
} = {}) {
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
