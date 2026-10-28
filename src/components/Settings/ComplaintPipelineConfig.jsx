'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, Settings2, Plus, Trash2, Save, RefreshCw, CheckCircle2,
  Clock, AlertCircle, Building2, Layers, CheckSquare, Sparkles, X, Edit3, ArrowRight, Lock,
  ShieldCheck, Users, UserCheck, Wrench, ShieldAlert
} from 'lucide-react';
import {
  getComplaintPipelineConfig,
  saveComplaintPipelineConfig,
  resetComplaintPipelineConfig
} from '@/app/actions/complaintPipelineConfig';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { getTeamMembers } from '@/app/actions/team';

const ALL_TENANTS = [
  { code: 'TNT00002', name: 'New Swan Group' },
  { code: 'TNT00001', name: 'SuPuja Creations' },
  { code: 'TNT00003', name: 'Testing NSG' }
];

const DEPARTMENTS = [
  { id: 'QUALITY_ASSURANCE', label: 'Plant Quality Assurance (QA)' },
  { id: 'LOGISTICS_DISPATCH', label: 'Logistics & Dispatch' },
  { id: 'ACCOUNTS_FINANCE', label: 'Accounts & Billing' },
  { id: 'SERVICE_ENGINEERING', label: 'Field Service Engineering' },
  { id: 'SALES_DESK', label: 'Sales Coordination / Order Desk' },
  { id: 'CRM_DESK', label: 'CRM / Support Desk' }
];

const AVAILABLE_ROLES = [
  { key: 'admin', label: 'Admin / Master Admin', color: '#dc2626' },
  { key: 'crm', label: 'CRM Head', color: '#2563eb' },
  { key: 'service_engineer', label: 'Service Engineer / Tech', color: '#ec4899' },
  { key: 'quality_assurance', label: 'Quality Assurance (QC)', color: '#16a34a' },
  { key: 'logistics_incharge', label: 'Logistics & Dispatch', color: '#ea580c' },
  { key: 'accounts_team', label: 'Accounts & Billing', color: '#4f46e5' },
  { key: 'sales_coordinator', label: 'Sales Coordinator', color: '#7c3aed' },
  { key: 'telecaller', label: 'Telecaller / Order Desk', color: '#64748b' },
  { key: 'hod_dept_head', label: 'HOD / Dept Head', color: '#9333ea' }
];

export default function ComplaintPipelineConfig({
  userCompany = 'New Swan Group',
  isMasterAdmin = false,
  userRole = ''
}) {
  const isMaster = isMasterAdmin === true || userRole === 'master_admin';

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

  const availableTenants = useMemo(() => {
    if (isMaster) return ALL_TENANTS;
    return [userTenant];
  }, [isMaster, userTenant]);

  const [selectedTenant, setSelectedTenant] = useState(userTenant.code);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [dynamicBranches, setDynamicBranches] = useState([]);

  // Load branches
  useEffect(() => {
    async function loadBranches() {
      try {
        const tenantObj = ALL_TENANTS.find(t => t.code === selectedTenant) || userTenant;
        const res = await getTenantBranches(tenantObj.name);
        if (res?.success && Array.isArray(res.branches)) {
          setDynamicBranches(res.branches);
        } else {
          setDynamicBranches([]);
        }
      } catch (_) {
        setDynamicBranches([]);
      }
    }
    loadBranches();
  }, [selectedTenant, userTenant]);

  const availableBranches = useMemo(() => {
    const list = [{ code: 'All Branches', label: 'All Branches (Default Baseline)' }];
    (dynamicBranches || []).forEach(db => {
      const branchCode = db.branch_code || db.id;
      const branchName = db.branch_name || db.name || 'Branch';
      const label = `${branchName} [${branchCode}]`;
      list.push({ code: label, label: label });
    });
    return list;
  }, [dynamicBranches]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('stages'); // 'stages' | 'categories' | 'rules'

  // Master Configuration State
  const [config, setConfig] = useState({
    tat_mode: 'DYNAMIC',
    otp_verification_mandatory: true,
    job_card_photo_mandatory: true,
    max_photo_size_kb: 100,
    allow_external_technician: true,
    enable_spares_tracking: true,
    categories: [],
    stages: []
  });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getComplaintPipelineConfig(selectedTenant, selectedBranch);
      if (res.success && res.config) {
        setConfig(res.config);
      } else {
        setErrorMsg(res.error || 'Failed to load complaint pipeline configuration.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, selectedBranch]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Stage Property Update Handler
  const handleStageChange = (stageId, field, value) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          return { ...st, [field]: value };
        }
        return st;
      })
    }));
  };

  // Category Property Update Handler
  const handleCategoryChange = (catId, field, value) => {
    setConfig(prev => ({
      ...prev,
      categories: (prev.categories || []).map(cat => {
        if (cat.id === catId) {
          return { ...cat, [field]: value };
        }
        return cat;
      })
    }));
  };

  // Add/Remove Role from Stage
  const handleToggleRoleInStage = (stageId, roleKey) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const current = Array.isArray(st.authorized_roles) ? st.authorized_roles : [];
          if (current.includes(roleKey)) {
            return { ...st, authorized_roles: current.filter(r => r !== roleKey) };
          } else {
            return { ...st, authorized_roles: [...current, roleKey] };
          }
        }
        return st;
      })
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      const res = await saveComplaintPipelineConfig(selectedTenant, selectedBranch, config);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        setErrorMsg(res.error || 'Failed to save configuration.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset configuration to defaults?')) return;
    setSaving(true);
    try {
      const res = await resetComplaintPipelineConfig(selectedTenant, selectedBranch);
      if (res.success && res.config) {
        setConfig(res.config);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 0' }}>
      {/* Top Banner Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(59,130,246,0.05) 100%)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Complaint Management Config
            </h2>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Configure 6-stage lifecycle, 8 category SLAs, technician rules, and branch overrides
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RefreshCw size={13} />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Save size={15} />
            {saving ? 'Saving Changes...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Tenant & Branch Dual Scoping Selectors */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '10px',
        padding: '0.85rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 240px' }}>
          <Building2 size={16} style={{ color: '#3b82f6' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Company / Tenant:</span>
          <select
            value={selectedTenant}
            onChange={e => setSelectedTenant(e.target.value)}
            disabled={!isMaster && availableTenants.length <= 1}
            style={{
              flex: 1,
              padding: '0.45rem 0.65rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 700
            }}
          >
            {availableTenants.map(t => (
              <option key={t.code} value={t.code}>{t.name} [{t.code}]</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 240px' }}>
          <Layers size={16} style={{ color: '#10b981' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Branch Scope:</span>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.65rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontWeight: 700
            }}
          >
            {availableBranches.map(b => (
              <option key={b.code} value={b.code}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={16} />
          <span>Complaint Pipeline configuration saved successfully in Indian Standard Time (IST)!</span>
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sub Tabs Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('stages')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: activeTab === 'stages' ? 'var(--accent-color, #2563eb)' : 'transparent',
            color: activeTab === 'stages' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700
          }}
        >
          1. 6-Stage Pipeline Master
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: activeTab === 'categories' ? 'var(--accent-color, #2563eb)' : 'transparent',
            color: activeTab === 'categories' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700
          }}
        >
          2. 8 Categories &amp; SLA Matrix
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: activeTab === 'rules' ? 'var(--accent-color, #2563eb)' : 'transparent',
            color: activeTab === 'rules' ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 700
          }}
        >
          3. Field Service &amp; Technician Rules
        </button>
      </div>

      {/* TAB 1: 6 Stages Manager */}
      {activeTab === 'stages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {(config.stages || []).map((st, idx) => (
            <div
              key={st.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: st.color,
                    background: `${st.color}20`,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    border: `1px solid ${st.color}`
                  }}>
                    {st.id}
                  </span>
                  <input
                    type="text"
                    value={st.name}
                    onChange={e => handleStageChange(st.id, 'name', e.target.value)}
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.65rem',
                      minWidth: '220px'
                    }}
                  />
                  <input
                    type="color"
                    value={st.color}
                    onChange={e => handleStageChange(st.id, 'color', e.target.value)}
                    style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Default SLA (Hours):</span>
                    <input
                      type="number"
                      min={1}
                      value={st.tat_hours || 4}
                      onChange={e => handleStageChange(st.id, 'tat_hours', Number(e.target.value))}
                      style={{ width: '65px', padding: '0.35rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'center' }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={st.is_enabled !== false}
                      onChange={e => handleStageChange(st.id, 'is_enabled', e.target.checked)}
                    />
                    <span>Active</span>
                  </label>
                </div>
              </div>

              {/* Roles Selector */}
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Authorized Roles to Advance this Stage:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {AVAILABLE_ROLES.map(role => {
                    const isSelected = (st.authorized_roles || []).includes(role.key);
                    return (
                      <button
                        type="button"
                        key={role.key}
                        onClick={() => handleToggleRoleInStage(st.id, role.key)}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          border: isSelected ? `1px solid ${role.color}` : '1px solid var(--border-light)',
                          background: isSelected ? `${role.color}20` : 'var(--bg-primary)',
                          color: isSelected ? role.color : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}{role.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: 8 Categories Matrix */}
      {activeTab === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(config.categories || []).map(cat => (
            <div
              key={cat.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '1 1 240px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cat.color || '#ef4444' }} />
                <div>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>{cat.name}</strong>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>ID: {cat.id}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Department */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Assigned Dept:</span>
                  <select
                    value={cat.department}
                    onChange={e => handleCategoryChange(cat.id, 'department', e.target.value)}
                    style={{ padding: '0.35rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>

                {/* SLA Hours */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>SLA (Hours):</span>
                  <input
                    type="number"
                    min={1}
                    value={cat.sla_hours || 24}
                    onChange={e => handleCategoryChange(cat.id, 'sla_hours', Number(e.target.value))}
                    style={{ width: '65px', padding: '0.35rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'center' }}
                  />
                </div>

                {/* Technician Mode */}
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Technician:</span>
                  <select
                    value={cat.technician_mode || 'NONE'}
                    onChange={e => handleCategoryChange(cat.id, 'technician_mode', e.target.value)}
                    style={{ padding: '0.35rem 0.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                  >
                    <option value="MANDATORY">🧑‍🔧 Mandatory</option>
                    <option value="OPTIONAL">Optional Site Visit</option>
                    <option value="NONE">None (Internal Only)</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Field Service & Technician Rules */}
      {activeTab === 'rules' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          <div>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              Field Service &amp; Technician Policies
            </h4>
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              Configure validation rules for field technician execution and customer sign-off
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.otp_verification_mandatory !== false}
                onChange={e => setConfig({ ...config, otp_verification_mandatory: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'block' }}>Mandatory Customer OTP in C05</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Technician cannot advance ticket without entering customer 4-digit OTP or signed sheet</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.allow_external_technician !== false}
                onChange={e => setConfig({ ...config, allow_external_technician: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'block' }}>Allow Third-Party / Local Technicians</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Permit assigning local vendor mechanics when Swan in-house engineers are unavailable</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.enable_spares_tracking !== false}
                onChange={e => setConfig({ ...config, enable_spares_tracking: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'block' }}>Spares Consumption Tracking</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Record replaced spare parts and quantities consumed on site in Job Card</span>
              </div>
            </label>

            <div style={{ padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'block', marginBottom: '0.35rem' }}>Max Photo / Document Size Limit</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  min={50}
                  max={500}
                  value={config.max_photo_size_kb || 100}
                  onChange={e => setConfig({ ...config, max_photo_size_kb: Number(e.target.value) })}
                  style={{ width: '80px', padding: '0.35rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>KB (Strictly compressed on device to save network)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
