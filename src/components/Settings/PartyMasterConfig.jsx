'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Building2, Layers, Sparkles, Hash, PhoneCall, ShieldCheck,
  CheckSquare, Save, RefreshCw, AlertCircle, CheckCircle2,
  ChevronRight, Eye, Edit3, Settings2, CreditCard, Clock, Truck,
  AlertTriangle, Lock, UserCheck, Check, DollarSign, MapPin
} from 'lucide-react';
import {
  getPartyMasterConfig,
  savePartyMasterConfig,
  resetPartyMasterConfig
} from '@/app/actions/partyMasterConfig';
import { getTenantBranches } from '@/app/actions/tenantBranches';

const ALL_TENANTS = [
  { code: 'TNT00002', name: 'New Swan Group' },
  { code: 'TNT00001', name: 'SuPuja Creations' },
  { code: 'TNT00003', name: 'Testing NSG' }
];

const CONFIG_TABS = [
  { id: 'numbering', label: 'Party Code & Numbering', icon: <Hash size={16} /> },
  { id: 'tiers', label: 'Partner Tiers & Categories', icon: <Users size={16} /> },
  { id: 'stages', label: 'Onboarding Stages (S00-S08)', icon: <Layers size={16} /> },
  { id: 'commercial', label: 'Commercial & Billing Terms', icon: <CreditCard size={16} /> }
];

const CALLING_FREQUENCIES = [
  { id: 'DAILY', label: 'Daily (Every Working Day)' },
  { id: 'WEEKLY', label: 'Weekly (Once a Week)' },
  { id: 'HALF_MONTHLY', label: 'Half-Monthly (Twice a Month)' },
  { id: 'MONTHLY', label: 'Monthly (Standard 30 Days)' },
  { id: 'QUARTERLY', label: 'Quarterly (Every 90 Days)' }
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BILLING_ROUTE_OPTIONS = [
  { id: 'DIRECT_COMPANY_BILLING', label: 'Direct Company / Factory Billing' },
  { id: 'DISTRIBUTOR_BILLED', label: 'Distributor Billed (Through Parent Hub)' },
  { id: 'DEALER_BILLED', label: 'Dealer Billed (Sub-Dealer Retail)' }
];

export default function PartyMasterConfig({
  userCompany = 'New Swan Group',
  isMasterAdmin = false,
  userRole = ''
}) {
  const isMaster = isMasterAdmin === true || userRole === 'master_admin';

  // Determine user's company tenant code
  const userTenant = useMemo(() => {
    const comp = (userCompany || '').toLowerCase();
    if (comp.includes('supuja')) {
      return { code: 'TNT00001', name: 'SuPuja Creations' };
    }
    if (comp.includes('testing')) {
      return { code: 'TNT00003', name: 'Testing NSG' };
    }
    return { code: 'TNT00002', name: 'New Swan Group' };
  }, [userCompany]);

  // Master Admin can switch tenants, tenant admins strictly see their own
  const availableTenants = useMemo(() => {
    if (isMaster) return ALL_TENANTS;
    return [userTenant];
  }, [isMaster, userTenant]);

  const [selectedTenant, setSelectedTenant] = useState(userTenant.code);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [tenantBranches, setTenantBranches] = useState([]);
  const [activeTab, setActiveTab] = useState('numbering');

  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Load branches for selected tenant
  useEffect(() => {
    let isMounted = true;
    async function loadBranches() {
      try {
        const res = await getTenantBranches(selectedTenant);
        if (isMounted && res?.success) {
          setTenantBranches(res.branches || []);
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    }
    loadBranches();
    return () => { isMounted = false; };
  }, [selectedTenant]);

  // Load config for selected tenant and branch
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await getPartyMasterConfig(selectedTenant, selectedBranch);
      if (res?.success && res.config) {
        setConfig(res.config);
      } else {
        setMessage({ type: 'error', text: res?.error || 'Failed to load configuration' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error fetching config' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedTenant, selectedBranch]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Save handler
  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await savePartyMasterConfig(selectedTenant, selectedBranch, config);
      if (res?.success) {
        setMessage({ type: 'success', text: `Configuration successfully saved for ${selectedBranch}!` });
        // Dispatch window event so open operational tabs can sync in real-time
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('party_config_updated', {
            detail: { tenantCode: selectedTenant, branchName: selectedBranch, config }
          }));
        }
      } else {
        setMessage({ type: 'error', text: res?.error || 'Failed to save configuration' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error saving config' });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset handler
  const handleReset = async () => {
    if (!window.confirm(`Are you sure you want to reset ${selectedBranch} configuration to standard baseline?`)) {
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await resetPartyMasterConfig(selectedTenant, selectedBranch);
      if (res?.success) {
        setConfig(res.config);
        setMessage({ type: 'success', text: 'Configuration reset to factory defaults!' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('party_config_updated', {
            detail: { tenantCode: selectedTenant, branchName: selectedBranch, config: res.config }
          }));
        }
      } else {
        setMessage({ type: 'error', text: res?.error || 'Failed to reset configuration' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Error resetting config' });
    } finally {
      setIsSaving(false);
    }
  };

  // State updates helpers
  const updateGeneral = (key, value) => {
    setConfig(prev => ({
      ...prev,
      general: {
        ...(prev?.general || {}),
        [key]: value
      }
    }));
  };

  const updateTier = (tierId, updates) => {
    setConfig(prev => ({
      ...prev,
      tiers: (prev?.tiers || []).map(t => t.id === tierId ? { ...t, ...updates } : t)
    }));
  };

  const updateStage = (stageId, updates) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev?.stages || []).map(s => s.id === stageId ? { ...s, ...updates } : s)
    }));
  };

  const updateCallingDefaults = (key, value) => {
    setConfig(prev => ({
      ...prev,
      order_calling_defaults: {
        ...(prev?.order_calling_defaults || {}),
        [key]: value
      }
    }));
  };

  const updateCommercialDefaults = (key, value) => {
    setConfig(prev => ({
      ...prev,
      commercial_defaults: {
        ...(prev?.commercial_defaults || {}),
        [key]: value
      }
    }));
  };

  // Dynamic Live Preview of Universal Party Code
  const samplePartyCode = useMemo(() => {
    if (!config?.general) return 'PTY-NSMLR-000000001';
    const pfx = config.general.party_code_prefix || 'PTY-';
    const br = config.general.include_branch_code ? 'NSMLR-' : '';
    const pad = parseInt(config.general.sequence_padding, 10) || 9;
    const start = parseInt(config.general.start_sequence, 10) || 1;
    const seqStr = String(start).padStart(pad, '0');
    return `${pfx}${br}${seqStr}`;
  }, [config?.general]);

  const sampleChannelCodes = useMemo(() => {
    if (!config?.general) return { dst: 'DST-NSMLR-000000001', dlr: 'DLR-NSMLR-000000001', sub: 'SUB-NSMLR-000000001' };
    const pad = parseInt(config.general.sequence_padding, 10) || 9;
    const start = parseInt(config.general.start_sequence, 10) || 1;
    const seqStr = String(start).padStart(pad, '0');
    return {
      dst: `${config.general.distributor_code_prefix || 'DST-'}NSMLR-${seqStr}`,
      dlr: `${config.general.dealer_code_prefix || 'DLR-'}NSMLR-${seqStr}`,
      sub: `${config.general.subdealer_code_prefix || 'SUB-'}NSMLR-${seqStr}`
    };
  }, [config?.general]);

  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--accent-color, #2563eb)' }} />
        <p style={{ fontSize: '0.95rem' }}>Loading Party Master configuration...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid var(--border-light, #e2e8f0)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '8px',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Party Master & Channel Network Config
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Tenants aur branches ke anusar Partner numbering, tiers, onboarding stages, order frequency aur commercial terms configure karein
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Tenant Selector */}
          {isMaster ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Tenant:</span>
              <select
                value={selectedTenant}
                onChange={(e) => {
                  setSelectedTenant(e.target.value);
                  setSelectedBranch('All Branches');
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {availableTenants.map(t => (
                  <option key={t.code} value={t.code}>{t.name} ({t.code})</option>
                ))}
              </select>
            </div>
          ) : (
            <span style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary, #f1f5f9)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}>
              {userTenant.name} ({userTenant.code})
            </span>
          )}

          {/* Branch Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Branch Scope:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #cbd5e1)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <option value="All Branches">🌐 All Branches (Tenant Default)</option>
              {tenantBranches.map(b => (
                <option key={b.id || b.branch_code} value={b.branch_name}>
                  📍 {b.branch_name} {b.branch_code ? `(${b.branch_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: isSaving ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} />
            Reset Defaults
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 1.1rem',
              fontSize: '0.85rem',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontWeight: 500,
              cursor: isSaving ? 'not-allowed' : 'pointer'
            }}
          >
            {isSaving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {message && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          fontSize: '0.88rem',
          backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-light, #e2e8f0)',
        overflowX: 'auto',
        paddingBottom: '0.25rem'
      }}>
        {CONFIG_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#2563eb' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: AUTO-NUMBERING & PARTY CODE */}
      {activeTab === 'numbering' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Live Preview Card */}
          <div style={{
            padding: '1.25rem',
            borderRadius: '8px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Live Format Preview (Branch: NSMLR)
              </span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#1e293b', color: '#38bdf8', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                Tenants Customized
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Universal Party Code:</div>
                <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: '#4ade80', letterSpacing: '0.04em' }}>
                  {samplePartyCode}
                </div>
              </div>

              <div style={{ borderLeft: '1px solid #334155', paddingLeft: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Channel Specific Codes:</div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                  <span>Distributor: <strong style={{ color: '#60a5fa' }}>{sampleChannelCodes.dst}</strong></span>
                  <span>Dealer: <strong style={{ color: '#34d399' }}>{sampleChannelCodes.dlr}</strong></span>
                  <span>Sub-Dealer: <strong style={{ color: '#c084fc' }}>{sampleChannelCodes.sub}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Form Settings Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem'
          }}>
            {/* Universal Code Settings */}
            <div style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Hash size={16} color="#2563eb" />
                Universal Party Code Rules
              </h4>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Party Code Prefix
                </label>
                <input
                  type="text"
                  value={config?.general?.party_code_prefix || 'PTY-'}
                  onChange={(e) => updateGeneral('party_code_prefix', e.target.value.toUpperCase())}
                  placeholder="e.g. PTY-"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>e.g. PTY-, VENDOR-, CLIENT-</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Sequence Number Padding Length (Zeroes)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min="4"
                    max="12"
                    value={config?.general?.sequence_padding || 9}
                    onChange={(e) => updateGeneral('sequence_padding', parseInt(e.target.value, 10) || 9)}
                    style={{
                      width: '80px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light, #cbd5e1)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontWeight: 600
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Digits (e.g. 9 digits = <strong>000000001</strong>, 6 digits = <strong>000001</strong>)
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Sequence Start Number
                </label>
                <input
                  type="number"
                  min="1"
                  value={config?.general?.start_sequence || 1}
                  onChange={(e) => updateGeneral('start_sequence', parseInt(e.target.value, 10) || 1)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 600
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sequence counter yahan se aage badhega</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light, #f1f5f9)' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Include Branch Code</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>e.g. PTY-<strong>NSMLR</strong>-000000001</div>
                </div>
                <input
                  type="checkbox"
                  checked={config?.general?.include_branch_code !== false}
                  onChange={(e) => updateGeneral('include_branch_code', e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Channel Category Code Prefixes */}
            <div style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} color="#16a34a" />
                Channel Code Prefixes
              </h4>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Distributor Code Prefix
                </label>
                <input
                  type="text"
                  value={config?.general?.distributor_code_prefix || 'DST-'}
                  onChange={(e) => updateGeneral('distributor_code_prefix', e.target.value.toUpperCase())}
                  placeholder="e.g. DST- or DIS-"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Dealer Code Prefix
                </label>
                <input
                  type="text"
                  value={config?.general?.dealer_code_prefix || 'DLR-'}
                  onChange={(e) => updateGeneral('dealer_code_prefix', e.target.value.toUpperCase())}
                  placeholder="e.g. DLR-"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Sub-Dealer Code Prefix
                </label>
                <input
                  type="text"
                  value={config?.general?.subdealer_code_prefix || 'SUB-'}
                  onChange={(e) => updateGeneral('subdealer_code_prefix', e.target.value.toUpperCase())}
                  placeholder="e.g. SUB- or SDL-"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                />
              </div>

              {/* Data Quality Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light, #f1f5f9)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>GSTIN Mandatory for B2B Registration</span>
                  <input
                    type="checkbox"
                    checked={config?.general?.gstin_mandatory !== false}
                    onChange={(e) => updateGeneral('gstin_mandatory', e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>PAN Card Mandatory</span>
                  <input
                    type="checkbox"
                    checked={config?.general?.pan_mandatory !== false}
                    onChange={(e) => updateGeneral('pan_mandatory', e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>Primary Mobile Duplicate Prevention</span>
                  <input
                    type="checkbox"
                    checked={config?.general?.phone_duplicate_check !== false}
                    onChange={(e) => updateGeneral('phone_duplicate_check', e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PARTNER TIERS & CATEGORIES */}
      {activeTab === 'tiers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Apne network ke operational tiers enable/disable karein aur unke default commercial & hierarchy rules set karein:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(config?.tiers || []).map(tier => (
              <div
                key={tier.id}
                style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  border: `1px solid ${tier.enabled ? 'var(--border-light, #cbd5e1)' : 'var(--border-light, #e2e8f0)'}`,
                  backgroundColor: tier.enabled ? 'var(--bg-surface)' : 'var(--bg-secondary, #f8fafc)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{
                      padding: '0.25rem 0.65rem',
                      borderRadius: '4px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      backgroundColor: tier.badge_bg || '#dbeafe',
                      color: tier.badge_color || '#2563eb'
                    }}>
                      {tier.name}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Identifier: <code>{tier.id}</code>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: tier.enabled ? '#16a34a' : 'var(--text-secondary)', cursor: 'pointer' }}>
                      {tier.enabled ? 'Enabled' : 'Disabled'}
                    </label>
                    <input
                      type="checkbox"
                      checked={tier.enabled}
                      onChange={(e) => updateTier(tier.id, { enabled: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {tier.enabled && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-light, #f1f5f9)'
                  }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Default Credit Days
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={tier.default_credit_days || 0}
                        onChange={(e) => updateTier(tier.id, { default_credit_days: parseInt(e.target.value, 10) || 0 })}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light, #cbd5e1)',
                          backgroundColor: 'var(--bg-surface)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Min Security Deposit (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5000"
                        value={tier.default_min_security_deposit || 0}
                        onChange={(e) => updateTier(tier.id, { default_min_security_deposit: parseInt(e.target.value, 10) || 0 })}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light, #cbd5e1)',
                          backgroundColor: 'var(--bg-surface)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Parent Hub / Distributor Mapping
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="checkbox"
                          checked={tier.requires_parent_hub}
                          onChange={(e) => updateTier(tier.id, { requires_parent_hub: e.target.checked })}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                          Must select Parent Hub
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ONBOARDING STAGES (S00 - S08) */}
      {activeTab === 'stages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Party Onboarding Pipeline (S00 se lekar S08 Partner Activation) ke mandatory checkpoints configure karein:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(config?.stages || []).map((stage, idx) => (
              <div
                key={stage.id}
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 300px' }}>
                  <span style={{
                    width: 38,
                    height: 38,
                    borderRadius: '8px',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.85rem'
                  }}>
                    {stage.id}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {stage.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {stage.description}
                    </div>
                  </div>
                </div>

                {/* Stage Specific Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  {stage.id === 'S00' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Strict Admin Handoff Confirmation:</span>
                      <input
                        type="checkbox"
                        checked={stage.mandatory_confirmation !== false}
                        onChange={(e) => updateStage(stage.id, { mandatory_confirmation: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Mandatory Stage:</span>
                      <input
                        type="checkbox"
                        checked={stage.mandatory !== false}
                        onChange={(e) => updateStage(stage.id, { mandatory: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </div>
                  )}

                  {stage.id === 'S05' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>Require Security Cheque (PDC):</span>
                      <input
                        type="checkbox"
                        checked={stage.require_security_cheques !== false}
                        onChange={(e) => updateStage(stage.id, { require_security_cheques: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: COMMERCIAL & BILLING TERMS */}
      {activeTab === 'commercial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Billing routing, payment terms aur grace period ke tenant defaults:
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem'
          }}>
            <div style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #e2e8f0)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Truck size={16} color="#2563eb" />
                Default Billing Route
              </h4>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Default Route for New Partners
                </label>
                <select
                  value={config?.commercial_defaults?.default_billing_route || 'DIRECT_COMPANY_BILLING'}
                  onChange={(e) => updateCommercialDefaults('default_billing_route', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 500
                  }}
                >
                  {BILLING_ROUTE_OPTIONS.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Default Credit Days
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={config?.commercial_defaults?.default_credit_days || 30}
                  onChange={(e) => updateCommercialDefaults('default_credit_days', parseInt(e.target.value, 10) || 30)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Payment Overdue Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={config?.commercial_defaults?.grace_period_days || 7}
                  onChange={(e) => updateCommercialDefaults('grace_period_days', parseInt(e.target.value, 10) || 7)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 600
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Due date ke baad itne din tak dispatch lock hold nahi hoga</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
