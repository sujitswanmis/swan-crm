'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UserPlus,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Sparkles,
  ShieldCheck,
  Zap,
  PhoneCall,
  FileSpreadsheet,
  CheckSquare,
  ListTodo,
  Clock,
  UserCheck,
  Building2,
  RefreshCw
} from 'lucide-react';
import {
  getProcessCatalog,
  purchaseAddonSeats,
  purchaseAddonModule,
  getOwnTenantBillingSummary
} from '@/app/actions/saasSubscription';

const PROCESS_ICONS = {
  LEADS_ONLY: FileSpreadsheet,
  CALLING_STANDALONE: PhoneCall,
  LEADS_WITH_CALLING: Zap,
  TASK_DELEGATION: ListTodo,
  SMART_CHECKLIST: CheckSquare,
  ATTENDANCE: Clock,
  RECRUITER: UserCheck,
  PARTY_MASTER: Building2
};

export default function AddonPurchaseModal({
  tenantId = null,
  subscription = null,
  entitlements = null,
  isOpen = false,
  onClose = null
}) {
  const [modalOpen, setModalOpen] = useState(isOpen);
  const inFlight = useRef(false);
  const requests = useRef(new Map());
  const requestFor = details => {
    const key=JSON.stringify([tenantId,subscription?.user_seat_limit,details]);
    if(!requests.current.has(key)) {
      let request;
      try {request=sessionStorage.getItem('saas-addon:'+key);} catch { /* Storage is optional. */ }
      request=request||crypto.randomUUID();requests.current.set(key,request);
      try {sessionStorage.setItem('saas-addon:'+key,request);} catch { /* Keep the in-memory request. */ }
    }
    return requests.current.get(key);
  };
  const [activeTab, setActiveTab] = useState('SEATS'); // 'SEATS' | 'MODULES'

  const [catalog, setCatalog] = useState([]);
  const [enabledModuleDetails, setEnabledModuleDetails] = useState([]);
  const [seatAdditionsMap, setSeatAdditionsMap] = useState({});
  const [expansionMode, setExpansionMode] = useState('MODULES'); // 'MODULES' (table) | 'WORKSPACE'
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [loading, setLoading] = useState(false);
  const [requestingModule, setRequestingModule] = useState(null);
  const [configuringModule, setConfiguringModule] = useState(null);
  const [moduleUsers, setModuleUsers] = useState(1);
  const [requestedModules, setRequestedModules] = useState({});
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Listen for custom event 'open-addon-modal'
  useEffect(() => {
    const handleOpen = () => {
      setModalOpen(true);
      setSuccessMsg(null);
      setErrorMsg(null);
    };
    window.addEventListener('open-addon-modal', handleOpen);
    return () => {
      window.removeEventListener('open-addon-modal', handleOpen);
    };
  }, []);

  const isModalActive = modalOpen || isOpen;

  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const [res, billingRes] = await Promise.all([
          getProcessCatalog(tenantId),
          tenantId ? getOwnTenantBillingSummary(tenantId).catch(() => null) : Promise.resolve(null)
        ]);
        if (isMounted && res.success) {
          setCatalog(res.catalog.filter(p => p.is_active !== false));
        }
        if (isMounted && billingRes?.success) {
          if (Array.isArray(billingRes.subscription?.enabled_modules)) {
            setEnabledModuleDetails(billingRes.subscription.enabled_modules);
          }
          if (Array.isArray(billingRes.invoices)) {
            const pendingMap = {};
            for (const inv of billingRes.invoices) {
              if (String(inv.status || '').toUpperCase() === 'PENDING' && inv.category === 'ADDON_MODULE' && !inv.seat_expansion) {
                const desc = String(inv.description || '');
                const code = inv.module_key || desc.replace('Module add-on request:', '').trim();
                if (code && !pendingMap[code]) {
                  pendingMap[code] = inv.requested_users
                    ? `${inv.invoice_number || 'Pending'} • ${inv.requested_users} Users`
                    : (inv.invoice_number || 'Requested');
                }
              }
            }
            setRequestedModules(pendingMap);
          }
        }
      } catch (err) {
        console.error('Addon modal catalog fetch error:', err);
      }
    }
    if (isModalActive) {
      loadCatalog();
    }
    return () => {
      isMounted = false;
    };
  }, [isModalActive, tenantId]);

  // Merge active modules from BOTH entitlements prop AND live getOwnTenantBillingSummary enabled_modules
  const propActiveKeys = entitlements ? Object.keys(entitlements).filter((k) => entitlements[k]) : [];
  const summaryActiveKeys = (enabledModuleDetails || []).map(d => d.process_code).filter(Boolean);
  const activeModuleKeysList = Array.from(new Set([...summaryActiveKeys, ...propActiveKeys]));
  const hasComboLeadCalling = activeModuleKeysList.includes('LEADS_WITH_CALLING');
  const detailsByCode = new Map(enabledModuleDetails.map(d => [d.process_code, d]));

  const currentSeatLimit = subscription?.user_seat_limit || 5;
  const daysRemaining = subscription?.is_expired
    ? 0
    : (subscription?.days_remaining === 0 ? 1 : Math.max(0, Number(subscription?.days_remaining) || 0));

  const baseModulesSource = catalog.length > 0 ? catalog : enabledModuleDetails;
  const activeBillableModules = baseModulesSource
    .filter(p =>
      activeModuleKeysList.includes(p.process_code) &&
      !(hasComboLeadCalling && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE'))
    )
    .map(p => {
      const det = detailsByCode.get(p.process_code);
      const licensed = Number(det?.licensed_seats) > 0 ? Number(det.licensed_seats) : currentSeatLimit;
      return {
        ...p,
        licensed_seats: licensed,
        monthly_rate_per_user: Number(det?.monthly_rate_per_user ?? p.monthly_rate_per_user ?? 0),
        has_custom_seats: licensed < currentSeatLimit || Boolean(det?.has_custom_seats)
      };
    });

  if (!isModalActive) return null;

  // Workspace-wide calculation (optional mode)
  const workspaceWideModules = activeBillableModules.filter(m => m.licensed_seats >= currentSeatLimit);
  const workspaceRatePerUser = (workspaceWideModules.length > 0 ? workspaceWideModules : activeBillableModules)
    .reduce((sum, p) => sum + Number(p.monthly_rate_per_user || 0), 0);
  const proratedMultiplier = Math.max(0, daysRemaining / 30);

  // Selected module rows with add > 0 in Table mode
  const selectedExpansionRows = activeBillableModules
    .map(mod => {
      const addCount = Math.max(0, parseInt(seatAdditionsMap[mod.process_code] || 0, 10) || 0);
      const rowCost = Math.round(addCount * mod.monthly_rate_per_user * proratedMultiplier * 100) / 100;
      return {
        ...mod,
        addCount,
        newSeats: mod.licensed_seats + addCount,
        rowCost
      };
    })
    .filter(r => r.addCount > 0);

  const totalModuleAddSeats = selectedExpansionRows.reduce((s, r) => s + r.addCount, 0);
  const totalModuleAddonCost = Math.round(selectedExpansionRows.reduce((s, r) => s + r.rowCost, 0) * 100) / 100;
  const workspaceAddonCost = Math.round(additionalSeats * workspaceRatePerUser * proratedMultiplier * 100) / 100;
  const estimatedSeatAddonCost = expansionMode === 'WORKSPACE' ? workspaceAddonCost : totalModuleAddonCost;

  const setModuleAddCount = (code, val) => {
    const clean = Math.max(0, Math.min(10000, parseInt(val, 10) || 0));
    setSeatAdditionsMap(prev => ({ ...prev, [code]: clean }));
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const applyBulkSeats = (num) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (num <= 0) {
      setSeatAdditionsMap({});
      return;
    }
    const currentlyChecked = activeBillableModules.filter(m => (parseInt(seatAdditionsMap[m.process_code] || 0, 10) || 0) > 0);
    const targets = currentlyChecked.length > 0 ? currentlyChecked : activeBillableModules;
    const next = { ...seatAdditionsMap };
    targets.forEach(m => {
      next[m.process_code] = num;
    });
    setSeatAdditionsMap(next);
  };

  const handleClose = () => {
    setModalOpen(false);
    onClose?.();
  };

  const handleAddSeats = async () => {
    if (!tenantId) {
      setErrorMsg('Tenant ID missing. Please refresh.');
      return;
    }
    if (expansionMode === 'MODULES' && selectedExpansionRows.length === 0) {
      setErrorMsg('Please select at least 1 module and enter additional seats.');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let res;
      if (expansionMode === 'WORKSPACE') {
        res = await purchaseAddonSeats(
          tenantId,
          additionalSeats,
          requestFor(['seats', 'ALL_WORKSPACE', additionalSeats, subscription?.valid_until]),
          'ALL_WORKSPACE'
        );
      } else {
        const additions = selectedExpansionRows.map(r => ({
          module_key: r.process_code,
          additional_seats: r.addCount
        }));
        const sig = additions.map(a => `${a.module_key}:${a.additional_seats}`).sort().join(',');
        res = await purchaseAddonSeats(
          tenantId,
          totalModuleAddSeats,
          requestFor(['seats-batch', sig, subscription?.valid_until]),
          additions.length === 1 ? additions[0].module_key : null,
          additions
        );
      }
      if (res.success) {
        const invNo = res?.invoice?.invoice_number;
        setSuccessMsg(invNo ? `${res.message} (Proforma: ${invNo})` : res.message);
        if (expansionMode === 'MODULES') setSeatAdditionsMap({});
        window.dispatchEvent(new CustomEvent('saas-billing-updated'));
      } else {
        setErrorMsg(res.error || 'Failed to add seats.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const handleUnlockModule = async (procCode, selectedUsersCount = currentSeatLimit) => {
    if (!tenantId) {
      setErrorMsg('Tenant ID missing. Please refresh.');
      return;
    }
    const cleanUsers = Math.max(1, Math.min(currentSeatLimit, parseInt(selectedUsersCount, 10) || 1));
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setRequestingModule(procCode);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await purchaseAddonModule(
        tenantId,
        procCode,
        requestFor(['module', procCode, cleanUsers, subscription?.valid_until]),
        cleanUsers
      );
      if (res.success) {
        const invNo = res?.invoice?.invoice_number || 'Pending';
        setRequestedModules(prev => ({ ...prev, [procCode]: `${invNo} • ${cleanUsers} Users` }));
        setConfiguringModule(null);
        setSuccessMsg(res?.invoice?.invoice_number ? `${res.message} (Proforma: ${res.invoice.invoice_number})` : res.message);
        window.dispatchEvent(new CustomEvent('saas-billing-updated'));
      } else {
        setErrorMsg(res.error || 'Failed to unlock module.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRequestingModule(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#e0e7ff',
                color: '#4338ca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                Add-on Seats & Module Manager (SaaS Add-ons)
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                Current Active Seats: <strong>{currentSeatLimit} Users</strong> | Remaining Term: <strong>{daysRemaining} Days</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* FEEDBACK MESSAGES */}
        {errorMsg && (
          <div
            style={{
              margin: '1rem 1.5rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              margin: '1rem 1.5rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: '#dcfce7',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#166534',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB TOGGLE */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '1rem 1.5rem 0',
            borderBottom: '1px solid #f1f5f9'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('SEATS')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.1rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: 'none',
              borderBottom: activeTab === 'SEATS' ? '3px solid #4f46e5' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'SEATS' ? '#4f46e5' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <UserPlus size={16} /> Add Extra Seats
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MODULES')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.1rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: 'none',
              borderBottom: activeTab === 'MODULES' ? '3px solid #4f46e5' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'MODULES' ? '#4f46e5' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <Layers size={16} /> Unlock Additional Modules
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {activeTab === 'SEATS' && (
            <div>
              {/* EXPANSION MODE PILLS */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.85rem' }}>
                <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => { setExpansionMode('MODULES'); setErrorMsg(null); setSuccessMsg(null); }}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: expansionMode === 'MODULES' ? '#4f46e5' : 'transparent',
                      color: expansionMode === 'MODULES' ? '#ffffff' : '#475569'
                    }}
                  >
                    Module-Wise Table ({activeBillableModules.length} Modules)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setExpansionMode('WORKSPACE'); setErrorMsg(null); setSuccessMsg(null); }}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: expansionMode === 'WORKSPACE' ? '#4f46e5' : 'transparent',
                      color: expansionMode === 'WORKSPACE' ? '#ffffff' : '#475569'
                    }}
                  >
                    All Workspace Capacity
                  </button>
                </div>

                {expansionMode === 'MODULES' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Quick Fill:</span>
                    {[1, 2, 5, 6, 10].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => applyBulkSeats(num)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          border: '1px solid #c7d2fe',
                          backgroundColor: '#eef2ff',
                          color: '#3730a3',
                          cursor: 'pointer'
                        }}
                        title="Apply this seat increase to checked modules (or all modules if none checked)"
                      >
                        +{num}
                      </button>
                    ))}
                    {selectedExpansionRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => applyBulkSeats(0)}
                        style={{
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          cursor: 'pointer'
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              {expansionMode === 'MODULES' ? (
                <>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>
                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5 }}>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', width: '36px' }}>✓</th>
                            <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Active Module</th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#475569', fontWeight: 700 }}>Current</th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>Rate/u/mo</th>
                            <th style={{ padding: '0.55rem 0.75rem', textAlign: 'center', color: '#475569', fontWeight: 700 }}>Add Seats</th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#475569', fontWeight: 700 }}>New Total</th>
                            <th style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: '#475569', fontWeight: 700 }}>Cost ({daysRemaining}d)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBillableModules.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
                                No active billable modules found. Loading or check workspace entitlements.
                              </td>
                            </tr>
                          ) : (
                            activeBillableModules.map((mod) => {
                              const addVal = Math.max(0, parseInt(seatAdditionsMap[mod.process_code] || 0, 10) || 0);
                              const isSelected = addVal > 0;
                              const rowCost = Math.round(addVal * mod.monthly_rate_per_user * proratedMultiplier * 100) / 100;
                              const IconComp = PROCESS_ICONS[mod.process_code] || Zap;
                              return (
                                <tr
                                  key={mod.process_code}
                                  style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    backgroundColor: isSelected ? '#f5f3ff' : '#ffffff'
                                  }}
                                >
                                  <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => setModuleAddCount(mod.process_code, e.target.checked ? (addVal || 1) : 0)}
                                      style={{ width: '15px', height: '15px', accentColor: '#4f46e5', cursor: 'pointer' }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.55rem 0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                      <IconComp size={14} color={isSelected ? '#4f46e5' : '#64748b'} />
                                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{mod.display_name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                                    {mod.licensed_seats}u
                                  </td>
                                  <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                                    ₹{mod.monthly_rate_per_user}
                                  </td>
                                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <button
                                        type="button"
                                        onClick={() => setModuleAddCount(mod.process_code, Math.max(0, addVal - 1))}
                                        disabled={addVal <= 0}
                                        style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#fff', cursor: addVal <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Minus size={12} />
                                      </button>
                                      <input
                                        type="number"
                                        min={0}
                                        max={10000}
                                        value={addVal}
                                        onChange={(e) => setModuleAddCount(mod.process_code, e.target.value)}
                                        style={{
                                          width: '54px',
                                          height: '26px',
                                          textAlign: 'center',
                                          borderRadius: '5px',
                                          border: `1px solid ${isSelected ? '#818cf8' : '#cbd5e1'}`,
                                          fontWeight: 700,
                                          fontSize: '0.8rem',
                                          backgroundColor: '#ffffff'
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setModuleAddCount(mod.process_code, addVal + 1)}
                                        style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        <Plus size={12} />
                                      </button>
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', fontWeight: 700, color: isSelected ? '#4f46e5' : '#94a3b8' }}>
                                    {mod.licensed_seats + addVal}u
                                  </td>
                                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontWeight: 700, color: isSelected ? '#1e3a8a' : '#94a3b8' }}>
                                    ₹{rowCost.toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    marginBottom: '1.25rem'
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                    Expand Workspace-Wide User Capacity
                  </label>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', marginBottom: '0.85rem' }}>
                    Increases total workspace seat limit ({currentSeatLimit} → {currentSeatLimit + additionalSeats}) across {(workspaceWideModules.length > 0 ? workspaceWideModules : activeBillableModules).length} workspace-wide modules @ ₹{workspaceRatePerUser}/user/mo.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setAdditionalSeats((prev) => Math.max(1, prev - 1))}
                      disabled={additionalSeats <= 1}
                      style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: additionalSeats <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                    >
                      <Minus size={16} />
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={additionalSeats}
                      onChange={(e) => setAdditionalSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{ width: '90px', height: '40px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 700, borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff' }}
                    />

                    <button
                      type="button"
                      onClick={() => setAdditionalSeats((prev) => prev + 1)}
                      style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                    >
                      <Plus size={16} />
                    </button>

                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                      Additional Workspace Seats (+{additionalSeats})
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[1, 2, 5, 6, 10, 20].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setAdditionalSeats(num)}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.78rem',
                          fontWeight: additionalSeats === num ? 700 : 500,
                          backgroundColor: additionalSeats === num ? '#4f46e5' : '#ffffff',
                          color: additionalSeats === num ? '#ffffff' : '#475569',
                          border: `1px solid ${additionalSeats === num ? '#4f46e5' : '#cbd5e1'}`,
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        +{num} {num === 1 ? 'Seat' : 'Seats'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PRORATED PRICE SUMMARY */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '0.95rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  marginBottom: '0.5rem'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 600 }}>
                    {expansionMode === 'WORKSPACE'
                      ? `Prorated Cost (All Workspace Modules • ${daysRemaining} Days):`
                      : `Prorated Cost (${selectedExpansionRows.length} Module${selectedExpansionRows.length !== 1 ? 's' : ''} • ${daysRemaining} Days):`}
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e3a8a' }}>
                    ₹{estimatedSeatAddonCost.toLocaleString('en-IN')} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#475569' }}>(+ 18% GST)</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#2563eb', fontWeight: 600 }}>
                    {expansionMode === 'WORKSPACE'
                      ? `+${additionalSeats} × ₹${workspaceRatePerUser}/u/mo × ${daysRemaining}/30d • Workspace limit: ${currentSeatLimit} → ${currentSeatLimit + additionalSeats}`
                      : selectedExpansionRows.length === 0
                        ? 'Enter +Seats in any module row(s) above (e.g. +6 in 3-4 modules) to generate 1 combined Proforma Invoice.'
                        : selectedExpansionRows.map(r => `${r.display_name} (+${r.addCount})`).join(' • ')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSeats}
                  disabled={loading || (expansionMode === 'MODULES' && selectedExpansionRows.length === 0)}
                  style={{
                    padding: '0.75rem 1.35rem',
                    backgroundColor: (loading || (expansionMode === 'MODULES' && selectedExpansionRows.length === 0)) ? '#93c5fd' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: (loading || (expansionMode === 'MODULES' && selectedExpansionRows.length === 0)) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {loading
                    ? 'Processing...'
                    : expansionMode === 'WORKSPACE'
                      ? `Request +${additionalSeats} Workspace Seats`
                      : selectedExpansionRows.length > 0
                        ? `Request Seats (${selectedExpansionRows.length} Mod${selectedExpansionRows.length > 1 ? 's' : ''})`
                        : 'Select Modules Above'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'MODULES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Request a proforma for additional features. Master Admin confirms payment and activation.
              </div>

              {catalog.map((proc) => {
                const isAlreadyActive = activeModuleKeysList.includes(proc.process_code);
                const isConfiguring = configuringModule?.process_code === proc.process_code;
                const IconComp = PROCESS_ICONS[proc.process_code] || Zap;
                const safeUsersCount = Math.max(1, Math.min(currentSeatLimit, parseInt(moduleUsers, 10) || 1));
                const estimatedModuleCost = Math.round(Number(proc.monthly_rate_per_user || 0) * safeUsersCount * proratedMultiplier * 100) / 100;
                const userPresets = [...new Set([5, 10, 25, 50, currentSeatLimit].filter(n => n >= 1 && n <= currentSeatLimit))];

                return (
                  <div
                    key={proc.process_code}
                    style={{
                      border: `1px solid ${isConfiguring ? '#6366f1' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      backgroundColor: isAlreadyActive ? '#f8fafc' : isConfiguring ? '#f5f3ff' : '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            backgroundColor: isAlreadyActive ? '#dcfce7' : '#eff6ff',
                            color: isAlreadyActive ? '#15803d' : '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <IconComp size={18} />
                        </div>

                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                            {proc.display_name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            ₹{proc.monthly_rate_per_user} / user / mo
                          </div>
                        </div>
                      </div>

                      {isAlreadyActive ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px'
                          }}
                        >
                          <CheckCircle2 size={14} /> Active
                        </span>
                      ) : requestedModules[proc.process_code] ? (
                        <span
                          title={`Proforma: ${requestedModules[proc.process_code]}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: '#eef2ff',
                            color: '#3730a3',
                            border: '1px solid #c7d2fe',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px'
                          }}
                        >
                          <Clock size={13} /> {requestedModules[proc.process_code]}
                        </span>
                      ) : isConfiguring ? (
                        <button
                          type="button"
                          onClick={() => setConfiguringModule(null)}
                          disabled={loading}
                          style={{
                            padding: '0.35rem 0.7rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const suggested = Math.min(currentSeatLimit, Math.max(1, Number(subscription?.active_users_count) || Math.min(10, currentSeatLimit)));
                            setConfiguringModule(proc);
                            setModuleUsers(suggested);
                            setErrorMsg(null);
                            setSuccessMsg(null);
                          }}
                          disabled={loading}
                          style={{
                            padding: '0.45rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            backgroundColor: requestingModule === proc.process_code ? '#6366f1' : '#4f46e5',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading && requestingModule !== proc.process_code ? 0.65 : 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <Sparkles size={14} />
                          Request Module
                        </button>
                      )}
                    </div>

                    {isConfiguring && !isAlreadyActive && !requestedModules[proc.process_code] && (
                      <div
                        style={{
                          padding: '0.85rem',
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #c7d2fe',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.65rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e1b4b' }}>
                            How many users need {proc.display_name}? (Max {currentSeatLimit})
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => setModuleUsers(Math.max(1, safeUsersCount - 1))}
                              style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={currentSeatLimit}
                              value={moduleUsers}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setModuleUsers(Number.isNaN(val) ? '' : Math.max(1, Math.min(currentSeatLimit, val)));
                              }}
                              style={{ width: '74px', height: '30px', textAlign: 'center', borderRadius: '6px', border: '1px solid #a5b4fc', fontWeight: 700, fontSize: '0.86rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => setModuleUsers(Math.min(currentSeatLimit, safeUsersCount + 1))}
                              style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {userPresets.map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setModuleUsers(n)}
                              style={{
                                padding: '0.2rem 0.55rem',
                                fontSize: '0.73rem',
                                fontWeight: safeUsersCount === n ? 700 : 500,
                                borderRadius: '6px',
                                border: `1px solid ${safeUsersCount === n ? '#4f46e5' : '#cbd5e1'}`,
                                backgroundColor: safeUsersCount === n ? '#4f46e5' : '#f8fafc',
                                color: safeUsersCount === n ? '#ffffff' : '#334155',
                                cursor: 'pointer'
                              }}
                            >
                              {n === currentSeatLimit ? `All (${n})` : `${n} Users`}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>
                              Prorated Cost ({safeUsersCount} User{safeUsersCount > 1 ? 's' : ''} × ₹{proc.monthly_rate_per_user}/mo • {daysRemaining} Days):
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a' }}>
                              ₹{estimatedModuleCost.toLocaleString('en-IN')} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#475569' }}>(+ 18% GST)</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUnlockModule(proc.process_code, safeUsersCount)}
                            disabled={loading || !(safeUsersCount >= 1)}
                            style={{
                              padding: '0.5rem 0.95rem',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              backgroundColor: '#4f46e5',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            {requestingModule === proc.process_code ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {requestingModule === proc.process_code ? 'Requesting...' : `Confirm Request (${safeUsersCount} Users)`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.76rem',
            color: '#64748b'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={14} style={{ color: '#10b981' }} />
            <span>Enterprise Multi-Tenant SaaS Licensing</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '0.4rem 0.85rem',
              backgroundColor: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
