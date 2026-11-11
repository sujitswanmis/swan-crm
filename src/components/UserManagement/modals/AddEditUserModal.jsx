'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, User, Phone, Mail, Building, MapPin, Shield, Key, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, Users, FileText, Globe, Plus, Star } from 'lucide-react';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';
import { getReportingEmail, getReportingFields } from '@/utils/reportingHierarchy';
import { DEFAULT_DEPARTMENTS, DESIGNATIONS, WORK_LOCATION_TYPES, EMP_STATUS_OPTIONS } from '../utils/userManagementUtils';
import { ROLE_PRESETS } from '../utils/rolePresets';
import { getTenantBranches, resolveKnownTenant } from '@/app/actions/tenantBranches';
import { getTenantAttendancePolicy } from '@/app/actions/attendance';
import { getAllTenantsWithSubscriptions } from '@/app/actions/saasSubscription';
import { getTeamMembers } from '@/app/actions/team';
import { resolveCompanyTokenForBranch, matchesCompanyToken } from '@/utils/branchAccess';

function getTenantPlaceholderEmail(tenantInfo) {
  const name = String(tenantInfo?.companyName || '').toLowerCase();
  if (name.includes('new swan')) return 'e.g. name@newswangroup.com';
  return 'e.g. name@company.com';
}

function resolveInitialBranchArrays(user, initCompany) {
  const ma = user?.module_access || {};
  const rawScope = String(ma.assigned_branch_scope || '').trim().toUpperCase();
  const rawBranches = Array.isArray(ma.assigned_branches) ? ma.assigned_branches.map(b => String(b || '').trim()).filter(Boolean) : [];
  const rawNames = Array.isArray(ma.assigned_branch_names) ? ma.assigned_branch_names.map(b => String(b || '').trim()).filter(Boolean) : [];
  const rawCodes = Array.isArray(ma.assigned_branch_codes) ? ma.assigned_branch_codes.map(b => String(b || '').trim()).filter(Boolean) : [];

  if (rawScope === 'ALL' || rawBranches.some(b => b.toUpperCase() === 'ALL')) {
    return {
      assigned_branch_scope: 'ALL',
      assigned_branches: ['ALL'],
      assigned_branch_names: ['All Branches'],
      assigned_branch_codes: ['ALL']
    };
  }

  const branchName = user?.branch_name || ma.branch_name || '';
  const names = rawNames.length > 0 ? rawNames : (branchName ? [branchName] : []);
  const branches = rawBranches.length > 0 ? rawBranches : (initCompany ? [initCompany] : []);

  return {
    assigned_branch_scope: (names.length > 1 || branches.length > 1 || rawScope === 'MULTI') ? 'MULTI' : 'SINGLE',
    assigned_branches: branches,
    assigned_branch_names: names,
    assigned_branch_codes: rawCodes
  };
}

function buildInitialFormData(user, departments, tenantId, currentUserCompany) {
  const initTenantId = user?.tenant_id || user?.module_access?._tenantId || tenantId || '';
  const initCompany = user?.company || currentUserCompany || '';
  if (user) {
    const uVehicle = user.vehicle_type || user.module_access?.vehicle_type || 'BIKE';
    const uRate = user.conveyance_rate_per_km ?? user.module_access?.conveyance_rate_per_km ?? (uVehicle === 'NONE' ? 0 : 4.50);
    const branchArrays = resolveInitialBranchArrays(user, initCompany);
    return {
      tenant_id: initTenantId,
      emp_id: user.emp_id || '',
      emp_status: user.emp_status || (user.module_access?.emp_status) || 'Active',
      emp_name: user.emp_name || '',
      emp_department: user.emp_department || '',
      emp_sub_department: user.emp_sub_department || (user.module_access?.emp_sub_department) || '',
      emp_designation: user.emp_designation || '',
      role: user.role || 'agent',
      role_template_id: user.module_access?.role_template_id || '',
      role_preset_key: user.module_access?.role_preset_key || (user.role?.toLowerCase() === 'admin' ? 'admin' : (user.role?.toLowerCase() === 'crm' ? 'crm' : (user.role?.toLowerCase() === 'telecaller' ? 'telecaller' : ''))),
      company: initCompany,
      branch_name: user.branch_name || (user.module_access?.branch_name) || '',
      ...branchArrays,
      work_location_type: user.work_location_type || (user.module_access?.work_location_type) || 'Headquarters',
      work_location_name: user.work_location_name || (user.module_access?.work_location_name) || '',
      assigned_shift: user.assigned_shift || (user.module_access?.assigned_shift) || '',
      salary_amount: (user.salary_amount !== null && user.salary_amount !== undefined) ? user.salary_amount : ((user.module_access && user.module_access.salary_amount !== undefined) ? user.module_access.salary_amount : ''),
      emp_mobile: user.emp_mobile || '',
      emp_alt_mobile: user.emp_alt_mobile || (user.module_access?.emp_alt_mobile) || '',
      email: user.email || '',
      password: '',
      tracking_policy: user.tracking_policy || user.module_access?.tracking_policy || 'PUNCH_ONLY',
      vehicle_type: uVehicle,
      conveyance_rate_per_km: uRate,
      ...getReportingFields(user),
      can_self_reset_password: user.can_self_reset_password === true || (user.module_access?.can_self_reset_password === true)
    };
  }
  return {
    tenant_id: initTenantId,
    emp_id: '',
    emp_status: 'Active',
    emp_name: '',
    emp_department: departments[0] || 'Sales',
    emp_sub_department: '',
    emp_designation: 'Sales Executive',
    role: 'agent',
    role_template_id: '',
    company: currentUserCompany || '',
    branch_name: '',
    assigned_branch_scope: 'SINGLE',
    assigned_branches: [],
    assigned_branch_names: [],
    assigned_branch_codes: [],
    work_location_type: 'Headquarters',
    work_location_name: '',
    assigned_shift: '',
    salary_amount: '',
    emp_mobile: '',
    emp_alt_mobile: '',
    email: '',
    password: '',
    tracking_policy: 'PUNCH_ONLY',
    vehicle_type: 'BIKE',
    conveyance_rate_per_km: 4.50,
    primary_reporting_person: '',
    secondary_reporting_person: '',
    hod_person: '',
    can_self_reset_password: true
  };
}

function buildBranchChipList(formData, availableBranches = [], tenantCompanyName = '') {
  if (formData.assigned_branch_scope === 'ALL' || (formData.assigned_branches || []).includes('ALL')) {
    return [];
  }
  const names = Array.isArray(formData.assigned_branch_names) ? formData.assigned_branch_names : [];
  const tokens = Array.isArray(formData.assigned_branches) ? formData.assigned_branches : [];
  const chips = [];
  const seenKeys = new Set();

  const pushMatched = (matched, fallbackLabel = '') => {
    if (matched) {
      const key = String(matched.branch_code || matched.branch_name).toLowerCase();
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      chips.push({
        key,
        branchName: matched.branch_name,
        branchCode: matched.branch_code || '',
        customCode: matched.custom_code || '',
        companyToken: resolveCompanyTokenForBranch(matched, tenantCompanyName),
        locationType: matched.location_type || ''
      });
    } else if (fallbackLabel) {
      const clean = String(fallbackLabel).trim();
      const key = clean.toLowerCase();
      if (!clean || seenKeys.has(key)) return;
      seenKeys.add(key);
      chips.push({
        key,
        branchName: clean,
        branchCode: '',
        customCode: '',
        companyToken: clean,
        locationType: ''
      });
    }
  };

  for (const name of names) {
    const matched = availableBranches.find(b => b.branch_name.toLowerCase() === String(name).trim().toLowerCase());
    pushMatched(matched, name);
  }
  for (const tok of tokens) {
    const cleanTok = String(tok || '').trim();
    if (!cleanTok || (tenantCompanyName && cleanTok.toLowerCase() === tenantCompanyName.toLowerCase() && names.length > 0)) continue;
    const matched = availableBranches.find(
      b => String(b.custom_code || '').trim().toLowerCase() === cleanTok.toLowerCase() ||
           String(b.branch_name || '').trim().toLowerCase() === cleanTok.toLowerCase() ||
           String(b.branch_code || '').trim().toLowerCase() === cleanTok.toLowerCase()
    );
    if (matched) {
      pushMatched(matched);
    } else if (names.length === 0) {
      pushMatched(null, cleanTok);
    }
  }
  if (chips.length === 0 && formData.branch_name) {
    const matched = availableBranches.find(b => b.branch_name === formData.branch_name);
    pushMatched(matched, formData.branch_name);
  }
  return chips;
}

function mergeChipsIntoFormState(prev, nextChips, tenantCompanyName = '') {
  if (!Array.isArray(nextChips) || nextChips.length === 0) {
    const resetLoc = prev.work_location_name === prev.branch_name;
    return {
      ...prev,
      branch_name: '',
      assigned_branch_scope: 'SINGLE',
      assigned_branches: [],
      assigned_branch_names: [],
      assigned_branch_codes: [],
      company: tenantCompanyName || prev.company || '',
      ...(resetLoc ? { work_location_name: '' } : {})
    };
  }

  const primary = nextChips[0];
  const names = nextChips.map(c => c.branchName).filter(Boolean);
  const tokens = Array.from(new Set(nextChips.map(c => c.companyToken).filter(Boolean)));
  const codes = Array.from(new Set(nextChips.map(c => c.branchCode).filter(Boolean)));
  const shouldSyncLoc = !prev.work_location_name || prev.work_location_name === prev.branch_name || prev.work_location_name === 'All Branches';

  return {
    ...prev,
    branch_name: primary.branchName,
    assigned_branch_scope: nextChips.length > 1 ? 'MULTI' : 'SINGLE',
    assigned_branches: tokens,
    assigned_branch_names: names,
    assigned_branch_codes: codes,
    company: primary.companyToken || tenantCompanyName || prev.company || '',
    ...(primary.locationType ? { work_location_type: primary.locationType } : {}),
    ...(shouldSyncLoc ? { work_location_name: primary.branchName } : {})
  };
}

function commitPendingCustomBranch(baseData, customDraft, availableBranches = [], tenantCompanyName = '') {
  const clean = String(customDraft || '').trim();
  if (!clean) return baseData;
  const matched = availableBranches.find(
    b => String(b.custom_code || '').trim().toLowerCase() === clean.toLowerCase() ||
         String(b.branch_name || '').trim().toLowerCase() === clean.toLowerCase() ||
         String(b.branch_code || '').trim().toLowerCase() === clean.toLowerCase()
  );
  const existingChips = buildBranchChipList(baseData, availableBranches, tenantCompanyName);
  const newChip = matched
    ? {
        key: String(matched.branch_code || matched.branch_name).toLowerCase(),
        branchName: matched.branch_name,
        branchCode: matched.branch_code || '',
        customCode: matched.custom_code || '',
        companyToken: resolveCompanyTokenForBranch(matched, tenantCompanyName),
        locationType: matched.location_type || ''
      }
    : {
        key: clean.toLowerCase(),
        branchName: clean,
        branchCode: '',
        customCode: '',
        companyToken: clean,
        locationType: ''
      };
  if (existingChips.some(c => c.key === newChip.key)) return baseData;
  return mergeChipsIntoFormState(baseData, [...existingChips, newChip], tenantCompanyName);
}

export default function AddEditUserModal({
  isOpen,
  onClose,
  onSave,
  onSaveDraft = () => {},
  user = null, // if null -> Add Mode, if object -> Edit Mode
  departments = DEFAULT_DEPARTMENTS,
  allEmployees = [],
  roleTemplates = [],
  currentUserCompany = '',
  tenantId = null,
  isMasterAdmin = false,
  branchAccess = null,
  saving = false
}) {
  const isEdit = Boolean(user);
  const [activeStep, setActiveStep] = useState('personal'); // 'personal' | 'job' | 'reporting' | 'auth'
  const [availableTenants, setAvailableTenants] = useState([]);
  const [resolvedTenant, setResolvedTenant] = useState({ tenantId: tenantId || '', tenantCode: '', companyName: currentUserCompany || '' });
  const [availableBranches, setAvailableBranches] = useState([]);
  const canGrantAllBranches = Boolean(isMasterAdmin || !branchAccess || branchAccess.isAllBranches);
  const scopedAvailableBranches = useMemo(() => {
    if (canGrantAllBranches || !Array.isArray(availableBranches)) return availableBranches;
    const allowedTokens = branchAccess?.allowedCompanies || [];
    const allowedNames = (branchAccess?.allowedBranchNames || []).map(n => n.toLowerCase());
    const allowedCodes = (branchAccess?.allowedBranchCodes || []).map(c => c.toLowerCase());
    if (allowedTokens.length === 0 && allowedNames.length === 0 && allowedCodes.length === 0) return availableBranches;
    return availableBranches.filter((b) => {
      const bName = String(b?.branch_name || b?.name || '').trim().toLowerCase();
      const bCode = String(b?.branch_code || '').trim().toLowerCase();
      const bCustom = String(b?.custom_code || '').trim();
      if (bCustom && matchesCompanyToken(bCustom, allowedTokens)) return true;
      if (bName && (allowedNames.includes(bName) || matchesCompanyToken(bName, allowedTokens))) return true;
      if (bCode && (allowedCodes.includes(bCode) || matchesCompanyToken(bCode, allowedTokens))) return true;
      return false;
    });
  }, [availableBranches, canGrantAllBranches, branchAccess]);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [tenantEmployeesByTenant, setTenantEmployeesByTenant] = useState({});
  const [customBranchNameInput, setCustomBranchNameInput] = useState(false);
  const [customBranchDraft, setCustomBranchDraft] = useState('');
  const [customLocationInput, setCustomLocationInput] = useState(false);

  const [formData, setFormData] = useState(() => buildInitialFormData(user, departments, tenantId, currentUserCompany));

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Reset form state asynchronously via microtask when modal opens or user changes
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const initTenantIdSync = user?.tenant_id || user?.module_access?._tenantId || tenantId || '';
    const initCompanySync = user?.company || currentUserCompany || '';
    const initialState = buildInitialFormData(user, departments, tenantId, currentUserCompany);

    Promise.resolve().then(() => {
      if (!isMounted) return;
      setCustomBranchNameInput(false);
      setCustomBranchDraft('');
      setCustomLocationInput(false);
      setActiveStep('personal');
      setErrorMsg('');
      setFormData(initialState);
    });

    const seedTenantKey = initTenantIdSync || initCompanySync;
    if (seedTenantKey) {
      resolveKnownTenant(seedTenantKey)
        .then(known => {
          if (!isMounted || !known) return;
          setResolvedTenant(prev => ({
            tenantId: initTenantIdSync || known.tenantId || prev.tenantId,
            tenantCode: known.tenantCode || prev.tenantCode,
            companyName: known.companyName || currentUserCompany || prev.companyName
          }));
          setFormData(prev => ({
            ...prev,
            tenant_id: prev.tenant_id || known.tenantId || '',
            company: prev.company || known.companyName || ''
          }));
        })
        .catch(() => {});
    }

    return () => { isMounted = false; };
  }, [user, isOpen, departments, tenantId, currentUserCompany]);

  // Load tenants catalog for Master Admin tenant selector
  useEffect(() => {
    let isMounted = true;
    if (isOpen && isMasterAdmin) {
      getAllTenantsWithSubscriptions()
        .then(res => {
          if (isMounted && res?.success && Array.isArray(res.tenants)) {
            setAvailableTenants(res.tenants);
          }
        })
        .catch(() => {});
    }
    return () => { isMounted = false; };
  }, [isOpen, isMasterAdmin]);

  // Load branches strictly for the active tenant (never falling back to 'Swan Hosting')
  const activeTenantLookupKey = formData.tenant_id || user?.company || currentUserCompany || '';
  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !activeTenantLookupKey) return;

    getTenantBranches(activeTenantLookupKey)
      .then(res => {
        if (!isMounted) return;
        const rawBranches = res?.success && Array.isArray(res.branches) ? res.branches : [];
        const activeList = rawBranches.filter(b => b?.is_active !== false);
        setAvailableBranches(activeList);

        const tenantMeta = res?.tenant || {};
        if (tenantMeta.tenantId || tenantMeta.tenantCode || tenantMeta.companyName) {
          setResolvedTenant(prev => ({
            tenantId: tenantMeta.tenantId || prev.tenantId,
            tenantCode: tenantMeta.tenantCode || prev.tenantCode,
            companyName: tenantMeta.companyName || prev.companyName
          }));
        }

        if (user) {
          const ma = user.module_access || {};
          const curBranchName = String(user.branch_name || ma.branch_name || '').trim();
          const curComp = String(user.company || '').trim();
          const curLocName = String(user.work_location_name || ma.work_location_name || '').trim();
          const isExplicitAll = ma.assigned_branch_scope === 'ALL' || (Array.isArray(ma.assigned_branches) && ma.assigned_branches.some(b => String(b).toUpperCase() === 'ALL'));

          let resolvedBranchName = isExplicitAll ? 'All Branches' : curBranchName;

          if (!isExplicitAll && !curBranchName && curComp) {
            const matchedByCode = activeList.find(
              b => String(b.custom_code || '').trim().toLowerCase() === curComp.toLowerCase() ||
                   String(b.branch_name || '').trim().toLowerCase() === curComp.toLowerCase() ||
                   String(b.branch_code || '').trim().toLowerCase() === curComp.toLowerCase()
            );
            if (matchedByCode) {
              resolvedBranchName = matchedByCode.branch_name;
            } else if (tenantMeta.companyName && curComp.toLowerCase() !== tenantMeta.companyName.toLowerCase()) {
              resolvedBranchName = curComp;
            }
          }

          if (curLocName && curLocName !== 'All Branches' && !activeList.some(b => b.branch_name === curLocName)) {
            setCustomLocationInput(true);
          }

          setFormData(prev => {
            const next = {
              ...prev,
              tenant_id: prev.tenant_id || tenantMeta.tenantId || '',
              company: prev.company || tenantMeta.companyName || '',
              branch_name: prev.branch_name || resolvedBranchName || ''
            };
            if (!isExplicitAll && activeList.length > 0 && (next.assigned_branch_names || []).length === 0 && next.branch_name) {
              const matchedCur = activeList.find(
                b => b.branch_name.toLowerCase() === next.branch_name.toLowerCase() ||
                     String(b.custom_code || '').trim().toLowerCase() === next.branch_name.toLowerCase() ||
                     String(b.branch_code || '').trim().toLowerCase() === next.branch_name.toLowerCase()
              );
              if (matchedCur) {
                const tok = resolveCompanyTokenForBranch(matchedCur, tenantMeta.companyName);
                next.branch_name = matchedCur.branch_name;
                next.assigned_branch_names = [matchedCur.branch_name];
                next.assigned_branches = [tok];
                next.assigned_branch_codes = matchedCur.branch_code ? [matchedCur.branch_code] : [];
              } else {
                next.assigned_branch_names = [next.branch_name];
              }
            }
            return next;
          });
        } else {
          setFormData(prev => {
            const next = { ...prev };
            let updated = false;
            if (!next.tenant_id && tenantMeta.tenantId) {
              next.tenant_id = tenantMeta.tenantId;
              updated = true;
            }
            if (!next.company && tenantMeta.companyName) {
              next.company = tenantMeta.companyName;
              updated = true;
            }
            const curCompLower = String(currentUserCompany || '').trim().toLowerCase();
            if (!next.branch_name && curCompLower && curCompLower !== String(tenantMeta.companyName || '').trim().toLowerCase()) {
              const matchedCur = activeList.find(
                b => String(b.custom_code || '').trim().toLowerCase() === curCompLower ||
                     String(b.branch_name || '').trim().toLowerCase() === curCompLower ||
                     String(b.branch_code || '').trim().toLowerCase() === curCompLower
              );
              if (matchedCur) {
                const companyToken = resolveCompanyTokenForBranch(matchedCur, tenantMeta.companyName);
                next.branch_name = matchedCur.branch_name;
                next.company = companyToken;
                next.assigned_branch_scope = 'SINGLE';
                next.assigned_branches = [companyToken];
                next.assigned_branch_names = [matchedCur.branch_name];
                next.assigned_branch_codes = matchedCur.branch_code ? [matchedCur.branch_code] : [];
                if (matchedCur.location_type) next.work_location_type = matchedCur.location_type;
                if (!next.work_location_name) next.work_location_name = matchedCur.branch_name;
                updated = true;
              }
            }
            return updated ? next : prev;
          });
        }
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [isOpen, activeTenantLookupKey, user, currentUserCompany]);

  // If Master Admin switches to a different tenant inside the modal, fetch reporting employees for that tenant
  useEffect(() => {
    let isMounted = true;
    const chosenTenantId = formData.tenant_id || '';
    if (!isOpen || !isMasterAdmin || !chosenTenantId || (tenantId && chosenTenantId === tenantId)) {
      return;
    }
    if (Array.isArray(tenantEmployeesByTenant[chosenTenantId])) {
      return;
    }
    getTeamMembers(resolvedTenant.companyName || formData.company || '', chosenTenantId)
      .then(list => {
        if (isMounted && Array.isArray(list)) {
          setTenantEmployeesByTenant(prev => ({ ...prev, [chosenTenantId]: list }));
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [isOpen, isMasterAdmin, formData.tenant_id, formData.company, resolvedTenant.companyName, tenantId, tenantEmployeesByTenant]);

  const effectiveEmployees = useMemo(() => {
    const chosenTenantId = formData.tenant_id || '';
    if (isMasterAdmin && chosenTenantId && chosenTenantId !== tenantId && Array.isArray(tenantEmployeesByTenant[chosenTenantId])) {
      return tenantEmployeesByTenant[chosenTenantId];
    }
    return allEmployees;
  }, [isMasterAdmin, formData.tenant_id, tenantId, tenantEmployeesByTenant, allEmployees]);

  // Load tenant/branch attendance shifts dynamically using active tenant + branch
  const activeTenantCompanyName = resolvedTenant.companyName || currentUserCompany || '';
  const shiftLookupTenantId = formData.tenant_id || resolvedTenant.tenantId || tenantId || null;
  const shiftLookupCompany = formData.company || activeTenantCompanyName || '';
  const shiftLookupBranch = formData.branch_name && formData.branch_name !== 'All Branches'
    ? formData.branch_name
    : (formData.work_location_name && formData.work_location_name !== 'All Branches' ? formData.work_location_name : '');

  useEffect(() => {
    let isMounted = true;
    if (isOpen && (shiftLookupTenantId || shiftLookupCompany)) {
      getTenantAttendancePolicy(shiftLookupTenantId, shiftLookupCompany, shiftLookupBranch)
        .then(res => {
          if (isMounted && res?.success && res.data) {
            const pol = res.data;
            let shifts = [];
            if (Array.isArray(pol.shifts) && pol.shifts.length > 0) {
              shifts = pol.shifts;
            } else if (pol.shift_name) {
              shifts = [{
                id: 'shift_default',
                shift_name: pol.shift_name,
                start_time: pol.start_time || '09:00',
                end_time: pol.end_time || '18:30',
                is_default: true
              }];
            }
            setAvailableShifts(shifts);
          }
        })
        .catch(() => {});
    }
    return () => { isMounted = false; };
  }, [isOpen, shiftLookupTenantId, shiftLookupCompany, shiftLookupBranch]);

  const branchChips = useMemo(
    () => buildBranchChipList(formData, availableBranches, activeTenantCompanyName),
    [formData, availableBranches, activeTenantCompanyName]
  );

  if (!isOpen) return null;

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
    if (errorMsg) setErrorMsg('');
  };

  const isAllBranchesSelected = formData.assigned_branch_scope === 'ALL' ||
    (Array.isArray(formData.assigned_branches) && formData.assigned_branches.some(b => String(b).toUpperCase() === 'ALL'));

  const handleSelectAllBranches = () => {
    setCustomBranchNameInput(false);
    setCustomBranchDraft('');
    setFormData(prev => ({
      ...prev,
      branch_name: 'All Branches',
      assigned_branch_scope: 'ALL',
      assigned_branches: ['ALL'],
      assigned_branch_names: ['All Branches'],
      assigned_branch_codes: ['ALL'],
      company: activeTenantCompanyName || prev.company || '',
      work_location_name: prev.work_location_name || 'All Branches'
    }));
  };

  const handleClearAllBranches = () => {
    setFormData(prev => ({
      ...prev,
      branch_name: '',
      assigned_branch_scope: 'SINGLE',
      assigned_branches: [],
      assigned_branch_names: [],
      assigned_branch_codes: [],
      company: activeTenantCompanyName || prev.company || '',
      ...(prev.work_location_name === 'All Branches' ? { work_location_name: '' } : {})
    }));
  };

  const handleToggleBranchFromList = (branchName) => {
    const matched = availableBranches.find(b => b.branch_name === branchName);
    if (!matched) return;
    const chipKey = String(matched.branch_code || matched.branch_name).toLowerCase();
    const exists = !isAllBranchesSelected && branchChips.some(c => c.key === chipKey);
    const nextChips = exists
      ? branchChips.filter(c => c.key !== chipKey)
      : [
          ...(isAllBranchesSelected ? [] : branchChips),
          {
            key: chipKey,
            branchName: matched.branch_name,
            branchCode: matched.branch_code || '',
            customCode: matched.custom_code || '',
            companyToken: resolveCompanyTokenForBranch(matched, activeTenantCompanyName),
            locationType: matched.location_type || ''
          }
        ];
    if (matched && !exists) setCustomLocationInput(false);
    setFormData(prev => mergeChipsIntoFormState(prev, nextChips, activeTenantCompanyName));
  };

  const handleAddCustomBranchChip = () => {
    const clean = customBranchDraft.trim();
    if (!clean) return;
    setFormData(prev => {
      const base = isAllBranchesSelected
        ? { ...prev, branch_name: '', assigned_branch_scope: 'SINGLE', assigned_branches: [], assigned_branch_names: [], assigned_branch_codes: [] }
        : prev;
      return commitPendingCustomBranch(base, clean, availableBranches, activeTenantCompanyName);
    });
    setCustomBranchDraft('');
  };

  const handleRemoveBranchChip = (chipKey) => {
    const nextChips = branchChips.filter(c => c.key !== chipKey);
    setFormData(prev => mergeChipsIntoFormState(prev, nextChips, activeTenantCompanyName));
  };

  const handlePromotePrimaryChip = (chipKey) => {
    const targetChip = branchChips.find(c => c.key === chipKey);
    if (!targetChip) return;
    const reordered = [targetChip, ...branchChips.filter(c => c.key !== chipKey)];
    setFormData(prev => mergeChipsIntoFormState(prev, reordered, activeTenantCompanyName));
  };

  const buildFinalBranchPayload = (draftText) => {
    const base = isAllBranchesSelected
      ? {
          ...formData,
          branch_name: 'All Branches',
          assigned_branch_scope: 'ALL',
          assigned_branches: ['ALL'],
          assigned_branch_names: ['All Branches'],
          assigned_branch_codes: ['ALL'],
          company: formData.company || activeTenantCompanyName || ''
        }
      : mergeChipsIntoFormState(formData, branchChips, activeTenantCompanyName);
    if (customBranchNameInput && String(draftText || '').trim()) {
      const prepared = base.assigned_branch_scope === 'ALL'
        ? { ...base, branch_name: '', assigned_branch_scope: 'SINGLE', assigned_branches: [], assigned_branch_names: [], assigned_branch_codes: [] }
        : base;
      return commitPendingCustomBranch(prepared, draftText, availableBranches, activeTenantCompanyName);
    }
    return base;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.emp_name.trim()) {
      setActiveStep('personal');
      setErrorMsg('Full Name is required');
      return;
    }
    if (!isEdit && !formData.email.trim()) {
      setActiveStep('personal');
      setErrorMsg('Email address is required for new accounts');
      return;
    }
    if (!isEdit && (!formData.password || formData.password.length < 6)) {
      setActiveStep('auth');
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    const syncedData = buildFinalBranchPayload(customBranchDraft);
    const resolvedTenantId = syncedData.tenant_id || resolvedTenant.tenantId || tenantId || '';
    const resolvedCompany = syncedData.company || activeTenantCompanyName || '';
    const resolvedVehicle = syncedData.vehicle_type || 'BIKE';
    const resolvedConveyance = resolvedVehicle === 'NONE'
      ? 0
      : (syncedData.conveyance_rate_per_km ?? 4.50);

    const payload = {
      ...syncedData,
      tenant_id: resolvedTenantId,
      company: resolvedCompany,
      vehicle_type: resolvedVehicle,
      conveyance_rate_per_km: resolvedConveyance,
      emp_id: syncedData.emp_id?.trim() || (isEdit ? (user?.emp_id || '') : `EMP-${Date.now().toString().slice(-5)}`)
    };

    onSave(payload);
  };

  const handleDraftClick = () => {
    if (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim()) {
      setErrorMsg('Please enter at least an Emp Name, Email, or Emp ID to save as Draft.');
      return;
    }
    const syncedData = buildFinalBranchPayload(customBranchDraft);
    const fallbackId = syncedData.emp_id?.trim() || `DRAFT-${Date.now().toString().slice(-6)}`;
    const fallbackEmail = syncedData.email?.trim() || `${fallbackId.toLowerCase()}@draft.local`;
    const fallbackPassword = syncedData.password || 'DraftPass@123';
    onSaveDraft({
      ...syncedData,
      tenant_id: syncedData.tenant_id || resolvedTenant.tenantId || tenantId || '',
      company: syncedData.company || activeTenantCompanyName || '',
      conveyance_rate_per_km: syncedData.vehicle_type === 'NONE' ? 0 : (syncedData.conveyance_rate_per_km ?? 4.50),
      emp_id: fallbackId,
      email: fallbackEmail,
      password: fallbackPassword,
      emp_status: 'Draft',
      emp_name: syncedData.emp_name?.trim() || 'Draft Employee'
    });
  };

  const steps = [
    { id: 'personal', label: '1. Personal & Contact', icon: User },
    { id: 'job', label: '2. Job & Location', icon: Building },
    { id: 'reporting', label: '3. Reporting & HOD', icon: Users },
    ...(!isEdit ? [{ id: 'auth', label: '4. Login Credentials', icon: Key }] : [])
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '740px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={22} style={{ color: 'var(--primary-color, #2563eb)' }} />
              {isEdit ? `Edit User: ${user.emp_name || user.email}` : 'Add New User'}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isEdit ? 'Update employee profile, organizational mapping and status' : 'Create a new user account with employee details and credentials'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Wizard Step Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary, rgba(0,0,0,0.02))',
          padding: '0 1rem',
          overflowX: 'auto'
        }}>
          {steps.map(s => {
            const Icon = s.icon;
            const isActive = activeStep === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(s.id)}
                style={{
                  padding: '0.75rem 1.25rem',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: isActive ? '2px solid var(--primary-color, #2563eb)' : '2px solid transparent',
                  color: isActive ? 'var(--primary-color, #2563eb)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Error Notice */}
        {errorMsg && (
          <div style={{
            margin: '1rem 1.75rem 0',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
            
            {/* Step 1: Personal & Contact */}
            {activeStep === 'personal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Full Name *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        required
                        value={formData.emp_name}
                        onChange={e => handleChange('emp_name', e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Email Address *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => handleChange('email', e.target.value)}
                        placeholder={getTenantPlaceholderEmail(resolvedTenant)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Primary Mobile Number
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="tel"
                        value={formData.emp_mobile}
                        onChange={e => handleChange('emp_mobile', e.target.value)}
                        placeholder="10-digit mobile"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Alternate Mobile Number
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="tel"
                        value={formData.emp_alt_mobile}
                        onChange={e => handleChange('emp_alt_mobile', e.target.value)}
                        placeholder="Emergency / alternate mobile"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Job & Location */}
            {activeStep === 'job' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                {/* Tenant Workspace Bar (Never exposes raw UUID) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-primary, #f8fafc)',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    <Building size={15} style={{ color: 'var(--primary-color, #2563eb)' }} />
                    <span>Organization / Tenant Workspace</span>
                  </div>
                  {isMasterAdmin && availableTenants.length > 0 ? (
                    <select
                      value={formData.tenant_id || resolvedTenant.tenantId || ''}
                      onChange={e => {
                        const nextTid = e.target.value;
                        const matchedT = availableTenants.find(t => t.id === nextTid);
                        const tName = matchedT?.name || '';
                        const tCode = matchedT?.tenant_code || '';
                        setResolvedTenant({ tenantId: nextTid, tenantCode: tCode, companyName: tName });
                        setCustomBranchNameInput(false);
                        setCustomBranchDraft('');
                        setCustomLocationInput(false);
                        setFormData(prev => ({
                          ...prev,
                          tenant_id: nextTid,
                          company: tName,
                          branch_name: '',
                          assigned_branch_scope: 'SINGLE',
                          assigned_branches: [],
                          assigned_branch_names: [],
                          assigned_branch_codes: [],
                          work_location_name: '',
                          assigned_shift: ''
                        }));
                      }}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '7px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        minWidth: '220px'
                      }}
                    >
                      {availableTenants.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.tenant_code ? `${t.tenant_code} · ` : ''}{t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#1e40af',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '999px'
                    }}>
                      {resolvedTenant.tenantCode ? `${resolvedTenant.tenantCode} · ` : ''}
                      {resolvedTenant.companyName || currentUserCompany || formData.company || 'Current Workspace'}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Employee Code / ID
                    </label>
                    <input
                      type="text"
                      value={formData.emp_id}
                      onChange={e => handleChange('emp_id', e.target.value)}
                      placeholder="e.g. EMP-0104"
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Status
                    </label>
                    <select
                      value={formData.emp_status}
                      onChange={e => handleChange('emp_status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {EMP_STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Department
                    </label>
                    <select
                      value={formData.emp_department}
                      onChange={e => handleChange('emp_department', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Select Department --</option>
                      {departments.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Sub-Department
                    </label>
                    <input
                      type="text"
                      value={formData.emp_sub_department}
                      onChange={e => handleChange('emp_sub_department', e.target.value)}
                      placeholder="e.g. North Region / Key Accounts"
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Designation
                    </label>
                    <select
                      value={formData.emp_designation}
                      onChange={e => handleChange('emp_designation', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Select Designation --</option>
                      {DESIGNATIONS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      System Role & Access Template
                    </label>
                    <select
                      value={
                        formData.role_template_id 
                          ? `custom:${formData.role_template_id}` 
                          : (formData.role_preset_key ? `preset:${formData.role_preset_key}` : (formData.role || 'agent'))
                      }
                      onChange={e => {
                        const val = e.target.value;
                        if (val.startsWith('custom:')) {
                          const tId = val.replace('custom:', '');
                          handleChange('role_template_id', tId);
                          handleChange('role_preset_key', '');
                          handleChange('role', 'agent');
                        } else if (val.startsWith('preset:')) {
                          const pKey = val.replace('preset:', '');
                          handleChange('role_template_id', '');
                          handleChange('role_preset_key', pKey);
                          const systemRoleMap = {
                            admin: 'Admin',
                            crm: 'Admin',
                            telecaller: 'agent',
                            sales_coordinator: 'Sales',
                            process_coordinator: 'Supervisor',
                            hod_dept_head: 'Manager',
                            sales_manager: 'Manager',
                            sales_executive: 'Sales',
                            hr_recruiter: 'Recruiter',
                            read_only_viewer: 'agent'
                          };
                          handleChange('role', systemRoleMap[pKey] || 'agent');
                        } else {
                          handleChange('role_template_id', '');
                          handleChange('role_preset_key', '');
                          handleChange('role', val);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <optgroup label="Roles & Permissions Presets">
                        {ROLE_PRESETS.filter(p => p.key !== 'master_admin').map(preset => (
                          <option key={preset.key} value={`preset:${preset.key}`}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                      {roleTemplates && roleTemplates.length > 0 && (
                        <optgroup label="Custom Role Templates (RBAC)">
                          {roleTemplates.map(rt => (
                            <option key={rt.id} value={`custom:${rt.id}`}>
                              {rt.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="System Base Fallback">
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Sales">Sales</option>
                        <option value="Recruiter">Recruiter</option>
                        <option value="Purchase">Purchase</option>
                        <option value="agent">Agent (Standard Staff)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Branch Name
                      </label>
                      {availableBranches.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomBranchNameInput(v => !v);
                            setCustomBranchDraft('');
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          {customBranchNameInput ? 'Done Custom' : '+ Type Custom'}
                        </button>
                      )}
                    </div>

                    {/* Selected Branch Chips (Single / Multi / All Branches) */}
                    {(isAllBranchesSelected || branchChips.length > 0) && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.35rem',
                        marginBottom: '0.45rem',
                        padding: '0.45rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary, #f8fafc)'
                      }}>
                        {isAllBranchesSelected ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.22rem 0.55rem',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(37, 99, 235, 0.12)',
                            color: '#1d4ed8',
                            border: '1px solid rgba(37, 99, 235, 0.28)',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            <Globe size={12} />
                            <span>All Branches (Full Tenant Access)</span>
                            <button
                              type="button"
                              onClick={handleClearAllBranches}
                              aria-label="Remove All Branches"
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          branchChips.map((chip, idx) => {
                            const isPrimaryChip = idx === 0;
                            const showPrimaryTag = branchChips.length > 1 && isPrimaryChip;
                            return (
                              <span
                                key={chip.key}
                                title={
                                  branchChips.length > 1 && !isPrimaryChip
                                    ? `Click to set "${chip.branchName}" as Primary branch`
                                    : `${chip.branchName}${chip.branchCode ? ` (${chip.branchCode})` : ''}`
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '9999px',
                                  backgroundColor: isPrimaryChip ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                                  color: isPrimaryChip ? '#047857' : 'var(--text-primary)',
                                  border: `1px solid ${isPrimaryChip ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.25)'}`,
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  maxWidth: '100%'
                                }}
                              >
                                {showPrimaryTag && (
                                  <span style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#059669' }}>
                                    Primary ·
                                  </span>
                                )}
                                {branchChips.length > 1 && !isPrimaryChip && (
                                  <button
                                    type="button"
                                    onClick={() => handlePromotePrimaryChip(chip.key)}
                                    title="Set as Primary Branch"
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' }}
                                  >
                                    <Star size={11} />
                                  </button>
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {chip.customCode ? `${chip.customCode} · ` : ''}{chip.branchName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBranchChip(chip.key)}
                                  aria-label={`Remove ${chip.branchName}`}
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'inline-flex', alignItems: 'center', opacity: 0.8 }}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Branch Selector Dropdown (supports 1, 2+, or All Branches) */}
                    {scopedAvailableBranches.length > 0 && (
                      <div style={{ position: 'relative' }}>
                        <Building size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <select
                          value=""
                          onChange={e => {
                            const val = e.target.value;
                            if (!val) return;
                            if (val === '__ALL__') {
                              handleSelectAllBranches();
                              return;
                            }
                            if (val === '__custom__') {
                              setCustomBranchNameInput(true);
                              return;
                            }
                            handleToggleBranchFromList(val);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.84rem'
                          }}
                        >
                          <option value="">
                            {isAllBranchesSelected
                              ? 'Switch to specific branch...'
                              : branchChips.length > 0
                                ? `+ Add / toggle branch (${branchChips.length} selected)...`
                                : (canGrantAllBranches ? '-- Select Branch or All Branches --' : '-- Select Assigned Branch --')}
                          </option>
                          {canGrantAllBranches && (
                            <option value="__ALL__">
                              {isAllBranchesSelected ? '✓ ' : ''}All Branches (Full Tenant Access)
                            </option>
                          )}
                          {scopedAvailableBranches.map(br => {
                            const brKey = String(br.branch_code || br.branch_name).toLowerCase();
                            const isAdded = !isAllBranchesSelected && branchChips.some(c => c.key === brKey);
                            return (
                              <option key={br.id || br.branch_code} value={br.branch_name}>
                                {isAdded ? '✓ ' : ''}{br.custom_code ? `${br.custom_code} · ` : ''}{br.branch_name} ({br.branch_code}){isAdded ? ' (Remove)' : ''}
                              </option>
                            );
                          })}
                          <option value="__custom__">+ Add Custom Branch Chip...</option>
                        </select>
                      </div>
                    )}

                    {/* Custom Branch Chip Adder (when + Type Custom clicked or tenant has no configured branches) */}
                    {(customBranchNameInput || availableBranches.length === 0) && (
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: availableBranches.length > 0 ? '0.4rem' : 0 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Building size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                          <input
                            type="text"
                            value={customBranchDraft}
                            onChange={e => setCustomBranchDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomBranchChip();
                              }
                            }}
                            placeholder="Type branch / unit & press Add"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.7rem 0.5rem 2.1rem',
                              borderRadius: '8px',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                              fontSize: '0.83rem'
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddCustomBranchChip}
                          disabled={!customBranchDraft.trim()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0 0.75rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: customBranchDraft.trim() ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface)',
                            color: customBranchDraft.trim() ? '#ffffff' : 'var(--text-secondary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: customBranchDraft.trim() ? 'pointer' : 'not-allowed'
                          }}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    )}

                    {(isAllBranchesSelected || branchChips.length > 1) && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.35 }}>
                        {isAllBranchesSelected
                          ? 'User can view & manage data across every branch in this organization.'
                          : `Multi-branch enabled (${branchChips.length} branches). Primary chip sets the default branch.`}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Work Location Type
                    </label>
                    <select
                      value={formData.work_location_type}
                      onChange={e => handleChange('work_location_type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {WORK_LOCATION_TYPES.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                      {formData.work_location_type && !WORK_LOCATION_TYPES.includes(formData.work_location_type) && (
                        <option value={formData.work_location_type}>{formData.work_location_type}</option>
                      )}
                    </select>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Location / Branch / Plant Name
                      </label>
                      {availableBranches.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomLocationInput(!customLocationInput)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          {customLocationInput ? '← Select from Created Branches' : '+ Type Custom Location'}
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <MapPin size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      {!customLocationInput && availableBranches.length > 0 ? (
                        <select
                          value={formData.work_location_name || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setCustomLocationInput(true);
                            } else {
                              handleChange('work_location_name', val);
                              const matched = availableBranches.find(b => b.branch_name === val);
                              if (matched?.location_type) {
                                handleChange('work_location_type', matched.location_type);
                              }
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="">-- Select Branch Office / Plant --</option>
                          {availableBranches.map(br => (
                            <option key={br.id || br.branch_code} value={br.branch_name}>
                              {br.branch_name} ({br.branch_code}) - {br.location_type}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom Location...</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formData.work_location_name || ''}
                          onChange={e => handleChange('work_location_name', e.target.value)}
                          placeholder="e.g. Head Office / Factory Unit 1 / Field Territory"
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Assigned Attendance Shift (Default)
                    </label>
                    <select
                      value={formData.assigned_shift || ''}
                      onChange={e => handleChange('assigned_shift', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Auto-Detect Shift (Recommended) --</option>
                      {availableShifts.length > 0 ? (
                        <>
                          {availableShifts.map((s, idx) => (
                            <option key={s.id || s.shift_code || idx} value={s.shift_name}>
                              {s.shift_name} ({s.start_time} - {s.end_time}){s.is_default ? ' (Default)' : ''}
                            </option>
                          ))}
                          {formData.assigned_shift && !availableShifts.some(s => s.shift_name === formData.assigned_shift) && (
                            <option value={formData.assigned_shift}>
                              {formData.assigned_shift} (Assigned)
                            </option>
                          )}
                        </>
                      ) : (
                        <>
                          <option value="Regular Shift">Regular / General Shift (09:00 - 18:30)</option>
                          <option value="Shift A (Morning Production)">Shift A (Morning, 06:00 - 14:30)</option>
                          <option value="Shift B (Evening Production)">Shift B (Evening, 14:30 - 23:00)</option>
                          <option value="Shift C (Night Production)">Shift C (Night, 23:00 - 07:30)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Monthly Salary Amount (₹ / Month)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={formData.salary_amount !== undefined && formData.salary_amount !== null ? formData.salary_amount : ''}
                        onChange={e => handleChange('salary_amount', e.target.value)}
                        placeholder="e.g. 35000"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 1.9rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  {/* Attendance & Field Tracking Policy */}
                  <div style={{ gridColumn: '1 / -1', padding: '0.85rem', background: 'var(--bg-canvas, #f8fafc)', borderRadius: '10px', border: '1px solid var(--border-light)', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        📍 Attendance & Field GPS Policy
                      </label>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
                        Quota Managed
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        border: `1.5px solid ${formData.tracking_policy === 'PUNCH_ONLY' ? '#2563eb' : 'var(--border-light)'}`,
                        background: formData.tracking_policy === 'PUNCH_ONLY' ? '#eff6ff' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}>
                        <input
                          type="radio"
                          name="tracking_policy"
                          value="PUNCH_ONLY"
                          checked={formData.tracking_policy === 'PUNCH_ONLY'}
                          onChange={() => handleChange('tracking_policy', 'PUNCH_ONLY')}
                        />
                        <span>📍 Punch GPS Only (Office/Plant)</span>
                      </label>

                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        border: `1.5px solid ${formData.tracking_policy === 'LIVE_TRACKING' ? '#16a34a' : 'var(--border-light)'}`,
                        background: formData.tracking_policy === 'LIVE_TRACKING' ? '#f0fdf4' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}>
                        <input
                          type="radio"
                          name="tracking_policy"
                          value="LIVE_TRACKING"
                          checked={formData.tracking_policy === 'LIVE_TRACKING'}
                          onChange={() => handleChange('tracking_policy', 'LIVE_TRACKING')}
                        />
                        <span>🚗 Live Tracking (Field Force)</span>
                      </label>
                    </div>

                    {formData.tracking_policy === 'LIVE_TRACKING' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.4rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                            Vehicle Type
                          </label>
                          <select
                            value={formData.vehicle_type || 'BIKE'}
                            onChange={e => {
                              const v = e.target.value;
                              handleChange('vehicle_type', v);
                              if (v === 'NONE') handleChange('conveyance_rate_per_km', 0);
                              else if (v === 'BIKE') handleChange('conveyance_rate_per_km', 4.50);
                              else if (v === 'CAR') handleChange('conveyance_rate_per_km', 9.00);
                              else handleChange('conveyance_rate_per_km', 2.50);
                            }}
                            style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                          >
                            <option value="NONE">None / No Vehicle (₹0/KM)</option>
                            <option value="BIKE">Bike / Two Wheeler (₹4.50/KM)</option>
                            <option value="CAR">Car / Four Wheeler (₹9.00/KM)</option>
                            <option value="PUBLIC_TRANSPORT">Public Transport (₹2.50/KM)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text-secondary)' }}>
                            Conveyance Rate (₹ / KM)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            disabled={formData.vehicle_type === 'NONE'}
                            value={formData.conveyance_rate_per_km ?? (formData.vehicle_type === 'NONE' ? 0 : 4.50)}
                            onChange={e => handleChange('conveyance_rate_per_km', Number(e.target.value))}
                            style={{
                              width: '100%',
                              padding: '0.45rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              fontSize: '0.8rem',
                              boxSizing: 'border-box',
                              backgroundColor: formData.vehicle_type === 'NONE' ? '#f1f5f9' : 'var(--bg-surface)',
                              color: formData.vehicle_type === 'NONE' ? '#64748b' : 'var(--text-primary)'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Reporting & HOD */}
            {activeStep === 'reporting' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Assign organizational reporting hierarchy. This links Smart Attendance punch approvals, delegation task routing, and lead assignment.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Primary Reporting Manager (Daily Work / Tasks)
                    </label>
                    <SearchableEmployeeSelect
                      employees={effectiveEmployees}
                      selectedEmail={formData.primary_reporting_person}
                      onSelect={(employee) => handleChange('primary_reporting_person', getReportingEmail(employee, effectiveEmployees))}
                      placeholder="Select Primary Reporting Manager..."
                      allowAllStaff={false}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Secondary Reporting Manager (Backup / Operational)
                    </label>
                    <SearchableEmployeeSelect
                      employees={effectiveEmployees}
                      selectedEmail={formData.secondary_reporting_person}
                      onSelect={(employee) => handleChange('secondary_reporting_person', getReportingEmail(employee, effectiveEmployees))}
                      placeholder="Select Secondary Manager (Optional)..."
                      allowAllStaff={false}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Head of Department (HOD) - For Attendance & Leave Approvals
                    </label>
                    <SearchableEmployeeSelect
                      employees={effectiveEmployees}
                      selectedEmail={formData.hod_person}
                      onSelect={(employee) => handleChange('hod_person', getReportingEmail(employee, effectiveEmployees))}
                      placeholder="Select Department HOD..."
                      allowAllStaff={false}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Login Credentials (Only for Add Mode) */}
            {!isEdit && activeStep === 'auth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Initial Password * (Minimum 6 characters)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!isEdit}
                        value={formData.password}
                        onChange={e => handleChange('password', e.target.value)}
                        placeholder="Set user password"
                        style={{
                          width: '100%',
                          padding: '0.55rem 2.5rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="selfResetCheck"
                      checked={formData.can_self_reset_password}
                      onChange={e => handleChange('can_self_reset_password', e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="selfResetCheck" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Allow employee to change or reset their own password
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem'
              }}
            >
              Cancel
            </button>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {!isEdit && (
                <button
                  type="button"
                  onClick={handleDraftClick}
                  disabled={saving || (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim())}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    cursor: (saving || (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim())) ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <FileText size={15} />
                  {saving ? 'Saving Draft...' : 'Save Draft'}
                </button>
              )}

              {activeStep !== 'personal' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === 'job') setActiveStep('personal');
                    else if (activeStep === 'reporting') setActiveStep('job');
                    else if (activeStep === 'auth') setActiveStep('reporting');
                  }}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem'
                  }}
                >
                  Previous
                </button>
              )}

              {activeStep !== (!isEdit ? 'auth' : 'reporting') ? (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === 'personal') setActiveStep('job');
                    else if (activeStep === 'job') setActiveStep('reporting');
                    else if (activeStep === 'reporting' && !isEdit) setActiveStep('auth');
                  }}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--primary-color, #2563eb)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem'
                  }}
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.55rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--primary-color, #2563eb)',
                    color: '#ffffff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  {isEdit ? 'Save Changes' : 'Create User'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
