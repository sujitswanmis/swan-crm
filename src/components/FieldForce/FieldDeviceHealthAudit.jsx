'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  Smartphone,
  BatteryCharging,
  MapPin,
  Download,
  RefreshCw,
  Search,
  Check,
  Copy,
  Settings,
  AlertTriangle,
  WifiOff,
  SlidersHorizontal,
  ExternalLink,
  Building2,
  Laptop,
  Monitor
} from 'lucide-react';
import {
  getDeviceHealthFleetReport,
  updateAppReleasePolicy,
  getAllAppReleasePolicies
} from '@/app/actions/liveTracking';
import {
  resolveKnownTenant
} from '@/app/actions/tenantBranches';
import {
  DEFAULT_ANDROID_RELEASE_POLICY,
  DEFAULT_WINDOWS_RELEASE_POLICY,
  DEFAULT_IOS_RELEASE_POLICY,
  PLATFORM_RELEASE_DEFAULTS
} from '@/config/appReleaseConfig';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import StandardTablePagination from '@/components/common/StandardTablePagination';

const DEFAULT_TABLE_WIDTHS = {
  employee: 210,
  tenantBranch: 165,
  appVersion: 175,
  locationPerm: 165,
  batteryOpt: 155,
  serviceGps: 165,
  status: 170,
  lastChecked: 155,
  actions: 170
};

const MIN_TABLE_WIDTHS = {
  employee: 160,
  tenantBranch: 130,
  appVersion: 135,
  locationPerm: 130,
  batteryOpt: 120,
  serviceGps: 130,
  status: 130,
  lastChecked: 120,
  actions: 140
};

const STATUS_FILTER_TABS = [
  { id: 'ALL', label: 'All Staff' },
  { id: 'ATTENTION', label: 'Needs Action' },
  { id: 'FORCE_UPGRADE', label: 'Old APK' },
  { id: 'NEEDS_PERMISSION_FIX', label: 'Permission / Battery' },
  { id: 'BROWSER_ONLY', label: 'Browser Only' },
  { id: 'HEALTHY', label: 'Ready (Healthy)' },
  { id: 'OFFLINE', label: 'Offline / Idle' }
];

function formatISTDateTime(isoStr) {
  if (!isoStr) return 'Never';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 'Invalid';
  return dt.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function readInitialPageSize() {
  if (typeof window === 'undefined') return 25;
  try {
    const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
    if (s.defaultPageSize) {
      return s.defaultPageSize === 'All' ? 100000 : parseInt(s.defaultPageSize, 10) || 25;
    }
  } catch {
    // Ignore storage read failure
  }
  return 25;
}

function renderLocationModeBadge(mode) {
  if (mode === 'all_the_time') {
    return (
      <span style={{ background: 'var(--spc-view-success-bg)', color: 'var(--spc-view-success)', border: '1px solid var(--spc-view-success-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Check size={12} /> All the Time
      </span>
    );
  }
  if (mode === 'while_using') {
    return (
      <span style={{ background: 'var(--spc-view-warning-bg)', color: 'var(--spc-view-warning)', border: '1px solid var(--spc-view-warning-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
        While Using Only
      </span>
    );
  }
  if (mode === 'denied') {
    return (
      <span style={{ background: 'var(--spc-view-danger-bg)', color: 'var(--spc-view-danger)', border: '1px solid var(--spc-view-danger-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
        Denied / Blocked
      </span>
    );
  }
  if (mode === 'browser') {
    return (
      <span style={{ background: 'var(--spc-view-warning-bg)', color: 'var(--spc-view-warning)', border: '1px solid var(--spc-view-warning-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
        Browser Foreground Only
      </span>
    );
  }
  return (
    <span style={{ background: 'var(--spc-view-raised)', color: 'var(--spc-view-muted)', border: '1px solid var(--spc-view-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
      Not Reported
    </span>
  );
}

export default function FieldDeviceHealthAudit({
  company = 'TNT00001',
  tenantId = null,
  userRole = 'ADMIN',
  isMasterAdmin = false,
  branchAccess = null,
  onInspectEmployeeRoute = null
}) {
  const [selectedTenantCode, setSelectedTenantCode] = useState(isMasterAdmin ? 'ALL' : '');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [availableTenants, setAvailableTenants] = useState([]);
  const [isMasterScope, setIsMasterScope] = useState(Boolean(isMasterAdmin));
  const [branches, setBranches] = useState([]);
  const [rows, setRows] = useState([]);
  const [summaryCounts, setSummaryCounts] = useState({
    total: 0,
    healthy: 0,
    needsPermissionFix: 0,
    outdatedApk: 0,
    browserOnly: 0,
    offline: 0
  });
  const [policy, setPolicy] = useState(DEFAULT_ANDROID_RELEASE_POLICY);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedUserId, setCopiedUserId] = useState(null);

  // Multi-Platform Release Policy Editor State
  const [showPolicyEditor, setShowPolicyEditor] = useState(false);
  const [policyPlatform, setPolicyPlatform] = useState('android');
  const [allPolicies, setAllPolicies] = useState(PLATFORM_RELEASE_DEFAULTS);
  const [policyForm, setPolicyForm] = useState(DEFAULT_ANDROID_RELEASE_POLICY);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyNotice, setPolicyNotice] = useState('');

  // Unified Table Pagination + Resizable Columns (AGENTS.md standard)
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(readInitialPageSize);

  const { colWidths, resizingCol, handleResizeStart, resetColumnWidth } = useTableColumnResize(
    'crm_device_health_audit_widths_v1',
    DEFAULT_TABLE_WIDTHS,
    MIN_TABLE_WIDTHS
  );

  useEffect(() => {
    let active = true;
    const initTenant = async () => {
      try {
        if (isMasterAdmin) return;
        const resolved = await resolveKnownTenant(tenantId || company || 'TNT00001');
        if (active && resolved?.tenantCode) {
          setSelectedTenantCode((prev) => prev || resolved.tenantCode);
        }
      } catch {
        // Handled server-side via caller role tenant lock
      }
    };
    initTenant();
    return () => { active = false; };
  }, [company, tenantId, isMasterAdmin]);

  useEffect(() => {
    const syncNav = () => {
      setRowsPerPage(readInitialPageSize());
      setCurrentPage(1);
    };
    window.addEventListener('crm_page_nav_updated', syncNav);
    window.addEventListener('crm_config_updated', syncNav);
    return () => {
      window.removeEventListener('crm_page_nav_updated', syncNav);
      window.removeEventListener('crm_config_updated', syncNav);
    };
  }, []);

  const applyFleetResponse = useCallback((res) => {
    if (!res?.success) {
      setErrorMsg(res?.error || 'Could not load fleet health diagnostics.');
      setRows([]);
      return;
    }
    setRows(res.rows || []);
    if (Array.isArray(res.availableTenants)) setAvailableTenants(res.availableTenants);
    if (typeof res.isMasterScope === 'boolean') setIsMasterScope(res.isMasterScope);
    if (Array.isArray(res.availableBranches)) setBranches(res.availableBranches);
    if (res.activeTenantCode && !res.isMasterScope) {
      setSelectedTenantCode(res.activeTenantCode);
    }
    if (res.summaryCounts) setSummaryCounts(res.summaryCounts);
    if (res.policy) {
      setPolicy(res.policy);
      setAllPolicies((prev) => ({ ...prev, android: res.policy }));
      setPolicyForm((prev) => {
        if (policyPlatform === 'android') {
          return {
            latest_version_code: res.policy.latest_version_code ?? DEFAULT_ANDROID_RELEASE_POLICY.latest_version_code,
            latest_version_name: res.policy.latest_version_name || DEFAULT_ANDROID_RELEASE_POLICY.latest_version_name,
            min_supported_version_code: res.policy.min_supported_version_code ?? DEFAULT_ANDROID_RELEASE_POLICY.min_supported_version_code,
            download_url: res.policy.download_url || DEFAULT_ANDROID_RELEASE_POLICY.download_url,
            release_notes: res.policy.release_notes || ''
          };
        }
        return prev;
      });
    }
  }, []);

  const resolveScopeTarget = useCallback(() => {
    if (isMasterAdmin || isMasterScope) {
      return selectedTenantCode || 'ALL';
    }
    return selectedTenantCode || tenantId || company || '';
  }, [isMasterAdmin, isMasterScope, selectedTenantCode, tenantId, company]);

  const fetchFleetAudit = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const targetCompany = resolveScopeTarget();
      const targetBranch = selectedBranch === 'ALL' ? null : selectedBranch;
      const res = await getDeviceHealthFleetReport(targetCompany, targetBranch);
      applyFleetResponse(res);
    } catch (err) {
      setErrorMsg(err?.message || 'Unexpected error fetching fleet health');
    } finally {
      setLoading(false);
    }
  }, [resolveScopeTarget, selectedBranch, applyFleetResponse]);

  useEffect(() => {
    let active = true;
    const targetCompany = resolveScopeTarget();
    const targetBranch = selectedBranch === 'ALL' ? null : selectedBranch;
    getDeviceHealthFleetReport(targetCompany, targetBranch)
      .then((res) => {
        if (!active) return;
        setErrorMsg('');
        applyFleetResponse(res);
      })
      .catch((err) => {
        if (active) setErrorMsg(err?.message || 'Unexpected error fetching fleet health');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [resolveScopeTarget, selectedBranch, applyFleetResponse]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'ATTENTION') {
        if (!['FORCE_UPGRADE', 'OUTDATED_APK', 'NEEDS_PERMISSION_FIX', 'BROWSER_ONLY'].includes(r.status)) {
          return false;
        }
      } else if (statusFilter === 'FORCE_UPGRADE') {
        if (!['FORCE_UPGRADE', 'OUTDATED_APK'].includes(r.status)) {
          return false;
        }
      } else if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      return (
        String(r.employeeName || '').toLowerCase().includes(q) ||
        String(r.phone || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.tenantCode || '').toLowerCase().includes(q) ||
        String(r.branchCode || '').toLowerCase().includes(q) ||
        String(r.deviceName || '').toLowerCase().includes(q) ||
        String(r.issueSummary || '').toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, searchQuery]);

  const totalRecords = filteredRows.length;
  const effectiveSize = rowsPerPage === 'All' ? 100000 : Number(rowsPerPage) || 25;
  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * effectiveSize;
    return filteredRows.slice(startIdx, startIdx + effectiveSize);
  }, [filteredRows, currentPage, effectiveSize]);

  useEffect(() => {
    let active = true;
    getAllAppReleasePolicies()
      .then((res) => {
        if (!active || !res?.success || !res?.policies) return;
        setAllPolicies(res.policies);
        if (res.policies.android) {
          setPolicy(res.policies.android);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handlePlatformTabSwitch = (targetPlatform) => {
    setPolicyPlatform(targetPlatform);
    const existing = allPolicies?.[targetPlatform] || PLATFORM_RELEASE_DEFAULTS[targetPlatform] || DEFAULT_ANDROID_RELEASE_POLICY;
    setPolicyForm({
      latest_version_code: existing.latest_version_code ?? 1,
      latest_version_name: existing.latest_version_name || '',
      min_supported_version_code: existing.min_supported_version_code ?? 1,
      download_url: existing.download_url || '',
      release_notes: existing.release_notes || ''
    });
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    setPolicyNotice('');
    try {
      const res = await updateAppReleasePolicy({
        ...policyForm,
        platform: policyPlatform
      });
      if (res?.success && res.policy) {
        setAllPolicies((prev) => ({ ...prev, [policyPlatform]: res.policy }));
        if (policyPlatform === 'android') {
          setPolicy(res.policy);
        }
        setPolicyNotice(`[${policyPlatform.toUpperCase()}] Policy updated cleanly (${res.policy.latest_version_name} / code ${res.policy.latest_version_code} / min ${res.policy.min_supported_version_code}).`);
        fetchFleetAudit();
      } else {
        setPolicyNotice(res?.error || 'Could not update policy.');
      }
    } catch (err) {
      setPolicyNotice(err?.message || 'Save failed.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleCopyEmployeeGuide = (row) => {
    const apkLink =
      policy?.download_url?.startsWith('http')
        ? policy.download_url
        : `${typeof window !== 'undefined' ? window.location.origin : 'https://app.supujacreations.com'}${policy?.download_url || '/api/public/android-apk'}`;

    const steps = [];
    if (row.platform?.includes('Windows')) {
      const winTarget = allPolicies?.windows || PLATFORM_RELEASE_DEFAULTS.windows;
      const winUrl = winTarget?.download_url?.startsWith('http')
        ? winTarget.download_url
        : `${typeof window !== 'undefined' ? window.location.origin : 'https://app.supujacreations.com'}${winTarget?.download_url || '/api/public/desktop-installer'}`;
      if (row.status === 'FORCE_UPGRADE' || row.status === 'OUTDATED_APK') {
        steps.push(`1. Latest SPC Workspace Windows Desktop Setup (v${winTarget?.latest_version_code || 3}) download & install karein: ${winUrl}`);
      } else {
        steps.push(`Sab settings OK hain (Windows Desktop v${row.appVersionCode || winTarget?.latest_version_code || 3}).`);
      }
    } else {
      if (row.status === 'FORCE_UPGRADE' || row.status === 'OUTDATED_APK' || row.status === 'BROWSER_ONLY') {
        steps.push(`1. Latest SPC Workspace Android APK (v${policy?.latest_version_code || 10}) download & install karein: ${apkLink}`);
      }
      if (row.locationMode !== 'all_the_time') {
        steps.push('2. Phone Settings > Apps > SPC Workspace > Permissions > Location -> "Allow all the time" select karein.');
      }
      if (row.batteryUnrestricted === false) {
        steps.push('3. Phone Settings > Apps > SPC Workspace > Battery -> "Unrestricted" (No Restrictions) select karein.');
      }
      if (row.gpsProviderEnabled === false) {
        steps.push('4. Phone ka GPS / Location toggle ON karein.');
      }
      if (steps.length === 0) {
        steps.push(`Sab settings OK hain (APK v${row.appVersionCode || policy?.latest_version_code || 10}).`);
      }
    }

    const msg = `Namaste ${row.employeeName},\nLive Field Tracking sahi chalne ke liye apne phone me ye check/fix karein:\n${steps.join('\n')}`;
    try {
      navigator.clipboard.writeText(msg);
      setCopiedUserId(row.userId);
      setTimeout(() => setCopiedUserId(null), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  const isPrivilegedRole =
    isMasterAdmin || ['masteradmin', 'master_admin', 'admin', 'superadmin', 'hr', 'manager', 'hod'].includes(String(userRole || '').toLowerCase());

  return (
    <div data-spc-module-theme style={{ padding: '14px 18px', background: 'var(--spc-view-canvas)', minHeight: 'calc(100vh - 130px)' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--spc-view-surface)',
        border: '1px solid var(--spc-view-border)',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 14,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'var(--spc-view-info-bg)',
            border: '1px solid var(--spc-view-info-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--spc-view-info)'
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--spc-view-text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              Universal App Version &amp; Field Device Health Audit
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--spc-view-success-bg)', color: 'var(--spc-view-success)', border: '1px solid var(--spc-view-success-border)' }}>
                🤖 APK: v{policy.latest_version_code} ({policy.latest_version_name})
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--spc-view-info-bg)', color: 'var(--spc-view-info)', border: '1px solid var(--spc-view-info-border)' }}>
                🪟 Windows: {allPolicies?.windows?.latest_version_name ? (allPolicies.windows.latest_version_name.startsWith('v') ? allPolicies.windows.latest_version_name : `v${allPolicies.windows.latest_version_name}`) : 'v3.0'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--spc-view-violet-bg)', color: 'var(--spc-view-violet)', border: '1px solid #e9d5ff' }}>
                🍎 iOS: {allPolicies?.ios?.latest_version_name || 'v1.0 (2.5.1333)'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--spc-view-muted)', marginTop: 2 }}>
              Multi-platform application governance (Android, Windows Desktop &amp; iOS) &amp; field battery/GPS diagnostics.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={policy.download_url || '/api/public/android-apk'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              background: 'var(--spc-view-success-fill)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            <Download size={14} /> Download APK v{policy.latest_version_code}
          </a>

          <a
            href={allPolicies?.windows?.download_url || '/api/public/desktop-installer'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              background: 'var(--spc-view-action)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            <Download size={14} /> Desktop Setup (.exe)
          </a>

          {isPrivilegedRole && (
            <button
              type="button"
              onClick={() => setShowPolicyEditor((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                background: showPolicyEditor ? 'var(--spc-view-info-bg)' : 'var(--spc-view-surface)',
                border: '1px solid var(--spc-view-border)',
                color: 'var(--spc-view-text)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <SlidersHorizontal size={14} /> Release Policy
            </button>
          )}

          <button
            type="button"
            onClick={fetchFleetAudit}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              background: 'var(--spc-view-action)',
              border: 'none',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.75 : 1
            }}
          >
            <RefreshCw size={14} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Collapsible Dynamic Multi-Platform Release Governance Form */}
      {showPolicyEditor && (
        <form
          onSubmit={handleSavePolicy}
          style={{
            background: 'var(--spc-view-surface)',
            border: '1px solid var(--spc-view-info-border)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 14,
            boxShadow: '0 2px 8px rgba(37,99,235,0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--spc-view-border)', paddingBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--spc-view-info)' }}>
                Universal Multi-Platform App Governance Policy (Real-Time Supabase Sync)
              </div>
              <div style={{ fontSize: 11, color: 'var(--spc-view-muted)', marginTop: 2 }}>
                Configure live mandatory &amp; optional upgrade thresholds across Android, Windows Desktop, and Apple iOS.
              </div>
            </div>

            {/* Platform Selector Tabs */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'android', label: 'Android APK', icon: <Smartphone size={14} /> },
                { id: 'windows', label: 'Windows Desktop', icon: <Monitor size={14} /> },
                { id: 'ios', label: 'Apple iOS', icon: <Laptop size={14} /> }
              ].map((p) => {
                const isActive = policyPlatform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePlatformTabSwitch(p.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      border: isActive ? '1px solid var(--spc-view-info-border)' : '1px solid var(--spc-view-border)',
                      background: isActive ? 'var(--spc-view-info-bg)' : 'var(--spc-view-surface)',
                      color: isActive ? 'var(--spc-view-info)' : 'var(--spc-view-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {p.icon}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)' }}>
              {policyPlatform === 'windows' ? 'Latest Build Code (e.g. 251333)' : policyPlatform === 'ios' ? 'Latest Build Code (Integer)' : 'Latest Version Code (Integer)'}
              <input
                type="number"
                min={1}
                value={policyForm.latest_version_code}
                onChange={(e) => setPolicyForm((p) => ({ ...p, latest_version_code: parseInt(e.target.value, 10) || 1 }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--spc-view-border)', fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)' }}>
              {policyPlatform === 'windows' ? 'Latest App Version Label (e.g. 2.5.1333)' : 'Latest CRM Version Label'}
              <input
                type="text"
                value={policyForm.latest_version_name}
                onChange={(e) => setPolicyForm((p) => ({ ...p, latest_version_name: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--spc-view-border)', fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)' }}>
              Min Supported Version Code (Forces Upgrade)
              <input
                type="number"
                min={1}
                value={policyForm.min_supported_version_code}
                onChange={(e) => setPolicyForm((p) => ({ ...p, min_supported_version_code: parseInt(e.target.value, 10) || 1 }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--spc-view-border)', fontSize: 13 }}
              />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)' }}>
              {policyPlatform === 'windows' ? 'Desktop Installer (.exe) Download URL' : policyPlatform === 'ios' ? 'Apple App Store / TestFlight URL' : 'APK Download URL / Endpoint'}
              <input
                type="text"
                value={policyForm.download_url}
                onChange={(e) => setPolicyForm((p) => ({ ...p, download_url: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--spc-view-border)', fontSize: 13 }}
              />
            </label>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={`Release notes for ${policyPlatform.toUpperCase()} (shown to outdated app users)...`}
              value={policyForm.release_notes}
              onChange={(e) => setPolicyForm((p) => ({ ...p, release_notes: e.target.value }))}
              style={{ flex: 1, minWidth: 260, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--spc-view-border)', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowPolicyEditor(false)}
                style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--spc-view-border)', background: 'var(--spc-view-surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPolicy}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--spc-view-action)', color: '#ffffff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {savingPolicy ? 'Saving...' : `Save ${policyPlatform.toUpperCase()} Policy`}
              </button>
            </div>
          </div>
        </form>
      )}

      {policyNotice && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--spc-view-info-bg)', border: '1px solid var(--spc-view-info-border)', color: 'var(--spc-view-info)', fontSize: 12, fontWeight: 600 }}>
          {policyNotice}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-surface)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'ALL' ? '2px solid var(--spc-view-info-border)' : '1px solid var(--spc-view-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)' }}>TOTAL STAFF</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-text)', marginTop: 2 }}>{summaryCounts.total}</div>
        </button>

        <button type="button" onClick={() => { setStatusFilter('HEALTHY'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-success-bg)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'HEALTHY' ? '2px solid var(--spc-view-success-border)' : '1px solid var(--spc-view-success-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-success)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={13} /> TRACKING READY
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-success)', marginTop: 2 }}>{summaryCounts.healthy}</div>
        </button>

        <button type="button" onClick={() => { setStatusFilter('NEEDS_PERMISSION_FIX'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-warning-bg)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'NEEDS_PERMISSION_FIX' ? '2px solid #d97706' : '1px solid var(--spc-view-warning-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-warning)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Settings size={13} /> PERMISSION / BATTERY FIX
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-warning)', marginTop: 2 }}>{summaryCounts.needsPermissionFix}</div>
        </button>

        <button type="button" onClick={() => { setStatusFilter('FORCE_UPGRADE'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-danger-bg)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'FORCE_UPGRADE' ? '2px solid #dc2626' : '1px solid var(--spc-view-danger-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-danger)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={13} /> OLD APK (v&le;3 / OUTDATED)
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-danger)', marginTop: 2 }}>{summaryCounts.outdatedApk}</div>
        </button>

        <button type="button" onClick={() => { setStatusFilter('BROWSER_ONLY'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-warning-bg)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'BROWSER_ONLY' ? '2px solid #ea580c' : '1px solid var(--spc-view-warning-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-warning)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Smartphone size={13} /> BROWSER ONLY (NO APK)
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-warning)', marginTop: 2 }}>{summaryCounts.browserOnly}</div>
        </button>

        <button type="button" onClick={() => { setStatusFilter('OFFLINE'); setCurrentPage(1); }} style={{ textAlign: 'left', background: 'var(--spc-view-canvas)', padding: '10px 14px', borderRadius: 10, border: statusFilter === 'OFFLINE' ? '2px solid #475569' : '1px solid var(--spc-view-border)', cursor: 'pointer' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--spc-view-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <WifiOff size={13} /> OFFLINE / IDLE
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--spc-view-text)', marginTop: 2 }}>{summaryCounts.offline}</div>
        </button>
      </div>

      {/* Filters Toolbar (Tenant Code + Branch Code Dual Scope + Search + Status Pills) */}
      <div style={{
        background: 'var(--spc-view-surface)',
        border: '1px solid var(--spc-view-border)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isMasterScope ? (
            <select
              value={selectedTenantCode || 'ALL'}
              onChange={(e) => {
                setSelectedTenantCode(e.target.value);
                setSelectedBranch('ALL');
                setCurrentPage(1);
                setLoading(true);
              }}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--spc-view-border)', fontSize: 12, fontWeight: 600, background: 'var(--spc-view-canvas)', minWidth: 230 }}
              title="Select Tenant / Company (MasterAdmin)"
            >
              <option value="ALL">All Tenants (Master Overview)</option>
              {availableTenants.map((t) => (
                <option key={t.tenantCode} value={t.tenantCode}>
                  {t.tenantCode} — {t.companyName}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--spc-view-border)',
                background: 'var(--spc-view-canvas)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--spc-view-text)',
                minWidth: 210
              }}
              title="Locked to your Tenant Workspace"
            >
              <Building2 size={14} color="#2563eb" />
              <span>
                {availableTenants[0]
                  ? `${availableTenants[0].tenantCode} — ${availableTenants[0].companyName}`
                  : (selectedTenantCode || 'Workspace Tenant')}
              </span>
            </div>
          )}

          <select
            value={(!isMasterScope && branchAccess && !branchAccess.isAllBranches && branches.length === 1 && selectedBranch === 'ALL') ? (branches[0]?.branch_code || branches[0]?.id || 'ALL') : selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setCurrentPage(1); setLoading(true); }}
            disabled={(isMasterScope && (!selectedTenantCode || selectedTenantCode === 'ALL')) || branches.length === 0}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--spc-view-border)', fontSize: 12, fontWeight: 600, background: 'var(--spc-view-canvas)', minWidth: 230 }}
            title="Filter by Branch / Plant of Active Tenant"
          >
            {(isMasterScope || !branchAccess || branchAccess.isAllBranches || branches.length > 1) && (
              <option value="ALL">
                {!isMasterScope && branchAccess && !branchAccess.isAllBranches
                  ? `All Assigned Branches (${branches.length})`
                  : `All Branches (${isMasterScope && (!selectedTenantCode || selectedTenantCode === 'ALL') ? 'Select Tenant First' : branches.length})`}
              </option>
            )}
            {branches.map((b) => {
              const code = b.branch_code || b.id || b.code;
              const name = b.branch_name || b.name || code;
              const shortTag = b.custom_code || b.legacy_code;
              return (
                <option key={code} value={code}>
                  {code} — {name}{shortTag ? ` (${shortTag})` : ''}
                </option>
              );
            })}
          </select>

          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search employee name, phone, device model, branch code..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: 8,
                border: '1px solid var(--spc-view-border)',
                fontSize: 12,
                outline: 'none'
              }}
            />
          </div>
        </div>

        {isMasterScope && availableTenants.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--spc-view-muted)', marginRight: 4 }}>Company:</span>
            <button
              type="button"
              onClick={() => { setSelectedTenantCode('ALL'); setSelectedBranch('ALL'); setCurrentPage(1); setLoading(true); }}
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: (selectedTenantCode === 'ALL' || !selectedTenantCode) ? '#1e293b' : 'var(--spc-view-raised)',
                color: (selectedTenantCode === 'ALL' || !selectedTenantCode) ? '#ffffff' : 'var(--spc-view-muted)'
              }}
            >
              All Tenants ({summaryCounts.total || rows.length})
            </button>
            {availableTenants.map((t) => {
              const active = selectedTenantCode === t.tenantCode;
              const count = rows.filter(r => r.tenantCode === t.tenantCode).length;
              return (
                <button
                  key={t.tenantCode}
                  type="button"
                  onClick={() => { setSelectedTenantCode(t.tenantCode); setSelectedBranch('ALL'); setCurrentPage(1); setLoading(true); }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--spc-view-action)' : 'var(--spc-view-raised)',
                    color: active ? '#ffffff' : 'var(--spc-view-muted)'
                  }}
                >
                  {t.tenantCode} — {t.companyName} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTER_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setStatusFilter(tab.id); setCurrentPage(1); }}
                style={{
                  padding: '5px 11px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: active ? 700 : 600,
                  border: active ? '1px solid var(--spc-view-info-border)' : '1px solid var(--spc-view-border)',
                  background: active ? 'var(--spc-view-info-bg)' : 'var(--spc-view-surface)',
                  color: active ? 'var(--spc-view-info)' : 'var(--spc-view-muted)',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--spc-view-danger-bg)', border: '1px solid var(--spc-view-danger-border)', color: 'var(--spc-view-danger)', fontSize: 12, fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {/* Unified Resizable Sticky-Header Table + Standard Pagination */}
      <div style={{
        background: 'var(--spc-view-surface)',
        borderRadius: 12,
        border: '1px solid var(--spc-view-border)',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15,23,42,0.05)'
      }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--spc-view-canvas)' }}>
                {[
                  { key: 'employee', label: 'Employee' },
                  { key: 'tenantBranch', label: 'Company & Branch' },
                  { key: 'appVersion', label: 'App Runtime & APK' },
                  { key: 'locationPerm', label: 'Location Permission' },
                  { key: 'batteryOpt', label: 'Battery Saver' },
                  { key: 'serviceGps', label: 'Service & Phone GPS' },
                  { key: 'status', label: 'Overall Health' },
                  { key: 'lastChecked', label: 'Last Audit (IST)' },
                  { key: 'actions', label: 'Actions' }
                ].map((col) => (
                  <th
                    key={col.key}
                    style={{
                      width: colWidths[col.key],
                      minWidth: MIN_TABLE_WIDTHS[col.key],
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'var(--bg-surface, #f8fafc)',
                      boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                      padding: '11px 12px',
                      fontWeight: 700,
                      color: 'var(--spc-view-text)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {col.label}
                    <ColumnResizer
                      colKey={col.key}
                      onResizeStart={handleResizeStart}
                      onReset={resetColumnWidth}
                      isResizing={resizingCol === col.key}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--spc-view-muted)' }}>
                    Scanning device health telemetry across field team...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--spc-view-muted)' }}>
                    No matching field team records found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.userId} style={{ borderBottom: '1px solid var(--spc-view-border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--spc-view-text)' }}>{row.employeeName}</div>
                      <div style={{ fontSize: 11, color: 'var(--spc-view-muted)' }}>
                        {row.phone || row.email} • <span style={{ textTransform: 'uppercase' }}>{row.role}</span>
                      </div>
                      {row.deviceName && (
                        <div style={{ fontSize: 10.5, color: 'var(--spc-view-muted)', marginTop: 2 }}>
                          {row.platform?.includes('Windows') || row.platform?.includes('macOS') ? '💻' : '📱'} {row.deviceName} {row.osVersion ? `(${row.platform?.includes('Windows') ? 'Windows' : row.platform?.includes('iOS') ? 'iOS' : 'Android'} ${row.osVersion})` : ''}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--spc-view-info)', fontSize: 11.5 }}>
                        {row.tenantCode} {row.companyName ? `— ${row.companyName}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--spc-view-muted)', marginTop: 1 }}>{row.branchCode}</div>
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--spc-view-text)' }}>{row.platform}</div>
                      {row.appVersionCode != null ? (
                        (() => {
                          const isWin = row.platform?.includes('Windows');
                          const isIos = row.platform?.includes('iOS');
                          const targetVer = isWin
                            ? (allPolicies?.windows?.latest_version_code || 3)
                            : isIos
                              ? (allPolicies?.ios?.latest_version_code || 1)
                              : (policy.latest_version_code || 10);
                          const prefix = isWin ? 'Desktop' : isIos ? 'iOS' : 'APK';
                          return (
                            <div style={{ fontSize: 11, color: row.appVersionCode >= targetVer ? 'var(--spc-view-success)' : 'var(--spc-view-warning)', fontWeight: 700 }}>
                              {prefix} v{row.appVersionCode} ({row.appVersionName || 'build'})
                            </div>
                          );
                        })()
                      ) : row.platform?.includes('Android') ? (
                        <div style={{ fontSize: 11, color: 'var(--spc-view-danger)', fontWeight: 700 }}>
                          Legacy APK (v&le;3)
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--spc-view-muted)' }}>
                          {row.platformDetails || 'No app telemetry'}
                        </div>
                      )}
                      {row.desktopSessionLabel && !row.platform?.includes('Windows') && row.platform !== 'Web App' && (
                        <div style={{ fontSize: 10.5, color: 'var(--spc-view-info)', marginTop: 3 }}>
                          💻 PC: {row.desktopSessionLabel}
                        </div>
                      )}
                      {row.mobileSessionLabel && (row.platform === 'Web App' || row.platform?.includes('Windows')) && !row.platformDetails?.includes('Mobile') && (
                        <div style={{ fontSize: 10.5, color: 'var(--spc-view-info)', marginTop: 3 }}>
                          📱 Mobile: {row.mobileSessionLabel}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      {renderLocationModeBadge(row.locationMode)}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      {row.batteryUnrestricted === true ? (
                        <span style={{ background: 'var(--spc-view-success-bg)', color: 'var(--spc-view-success)', border: '1px solid var(--spc-view-success-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <BatteryCharging size={12} /> Unrestricted
                        </span>
                      ) : row.batteryUnrestricted === false ? (
                        <span style={{ background: 'var(--spc-view-danger-bg)', color: 'var(--spc-view-danger)', border: '1px solid var(--spc-view-danger-border)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          Restricted (Kill Risk)
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--spc-view-muted)' }}>Unknown</span>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: row.serviceRunning ? 'var(--spc-view-success)' : 'var(--spc-view-muted)' }}>
                        {row.serviceRunning ? '🟢 Service Active' : '⚪ Service Idle'}
                      </div>
                      <div style={{ color: row.gpsProviderEnabled === false ? 'var(--spc-view-danger)' : 'var(--spc-view-muted)', fontWeight: row.gpsProviderEnabled === false ? 700 : 500, marginTop: 2 }}>
                        {row.gpsProviderEnabled === false ? '🔴 Phone GPS OFF' : row.gpsProviderEnabled === true ? '🛰️ Phone GPS ON' : 'GPS Unknown'}
                        {row.pendingQueueCount > 0 ? ` • Queue: ${row.pendingQueueCount}` : ''}
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: row.statusBg,
                        color: row.statusColor,
                        border: `1px solid ${row.statusBorder}`
                      }}>
                        {row.statusShortLabel}
                      </span>
                      <div style={{ fontSize: 10.5, color: 'var(--spc-view-muted)', marginTop: 3, lineHeight: 1.3 }}>
                        {row.issueSummary}
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--spc-view-text)' }}>
                      <div style={{ fontWeight: 600 }}>{formatISTDateTime(row.lastCheckedAt)}</div>
                      {row.lastGpsPingAt && (
                        <div style={{ fontSize: 10.5, color: 'var(--spc-view-muted)', marginTop: 2 }}>
                          GPS: {formatISTDateTime(row.lastGpsPingAt)}
                        </div>
                      )}
                      {row.lastSessionAt && (!row.lastCheckedAt || new Date(row.lastSessionAt).getTime() - new Date(row.lastCheckedAt).getTime() > 5 * 60000) && (
                        <div style={{ fontSize: 10.5, color: 'var(--spc-view-info)', marginTop: 2 }}>
                          Web/PC Active: {formatISTDateTime(row.lastSessionAt)}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <button
                          type="button"
                          onClick={() => handleCopyEmployeeGuide(row)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            padding: '5px 9px',
                            borderRadius: 6,
                            border: '1px solid var(--spc-view-border)',
                            background: copiedUserId === row.userId ? 'var(--spc-view-success-bg)' : 'var(--spc-view-surface)',
                            color: copiedUserId === row.userId ? 'var(--spc-view-success)' : 'var(--spc-view-text)',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedUserId === row.userId ? <Check size={12} /> : <Copy size={12} />}
                          {copiedUserId === row.userId ? 'Copied Fix Guide' : 'Copy Fix Guide'}
                        </button>

                        {typeof onInspectEmployeeRoute === 'function' && (
                          <button
                            type="button"
                            onClick={() => onInspectEmployeeRoute(row)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              padding: '4px 9px',
                              borderRadius: 6,
                              border: '1px solid var(--spc-view-info-border)',
                              background: 'var(--spc-view-info-bg)',
                              color: 'var(--spc-view-info)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            <MapPin size={12} /> View Route <ExternalLink size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <StandardTablePagination
          currentPage={currentPage}
          totalRecords={totalRecords}
          pageSize={rowsPerPage === 'All' ? 100000 : Number(rowsPerPage)}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setRowsPerPage(newSize);
            setCurrentPage(1);
          }}
          style={{ borderRadius: '0 0 12px 12px' }}
        />
      </div>
    </div>
  );
}
