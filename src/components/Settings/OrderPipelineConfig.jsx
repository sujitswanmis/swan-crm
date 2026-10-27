'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck, Settings2, Plus, Trash2, Save, RefreshCw, CheckCircle2,
  Clock, AlertCircle, Building2, Layers, CheckSquare, Sparkles, X, Edit3, ArrowRight, Lock,
  ShieldCheck, Users, UserCheck
} from 'lucide-react';
import {
  getOrderPipelineConfig,
  saveOrderPipelineConfig,
  resetOrderPipelineConfig
} from '@/app/actions/orderPipelineConfig';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { getTeamMembers } from '@/app/actions/team';

const ALL_TENANTS = [
  { code: 'TNT00002', name: 'New Swan Group' },
  { code: 'TNT00001', name: 'SuPuja Creations' },
  { code: 'TNT00003', name: 'Testing NSG' }
];

const DEPARTMENTS = [
  'Sales / Order Desk',
  'Accounts / Billing',
  'Sales / Coordination',
  'Accounts & Sales',
  'Accounts Team',
  'Plant / Works',
  'Plant Floor Supervisor',
  'Quality Assurance (QC)',
  'Godown / Logistics',
  'Gate & Logistics',
  'Customer Support'
];

const AVAILABLE_ROLES = [
  { key: 'admin', label: 'Admin / Master Admin', color: '#dc2626' },
  { key: 'crm', label: 'CRM Head', color: '#2563eb' },
  { key: 'sales_coordinator', label: 'Sales Coordinator', color: '#7c3aed' },
  { key: 'sales_manager', label: 'Sales Manager', color: '#0284c7' },
  { key: 'sales_executive', label: 'Sales Executive', color: '#0d9488' },
  { key: 'accounts_team', label: 'Accounts & Billing', color: '#4f46e5' },
  { key: 'process_coordinator', label: 'Process Coordinator', color: '#0891b2' },
  { key: 'plant_supervisor', label: 'Plant / Works Supervisor', color: '#d97706' },
  { key: 'quality_assurance', label: 'Quality Assurance (QC)', color: '#16a34a' },
  { key: 'logistics_incharge', label: 'Logistics & Dispatch', color: '#ea580c' },
  { key: 'customer_support', label: 'Customer Support', color: '#db2777' },
  { key: 'telecaller', label: 'Telecaller / Order Desk', color: '#64748b' },
  { key: 'hod_dept_head', label: 'HOD / Dept Head', color: '#9333ea' }
];

const FIELD_TYPES = [
  { value: 'text', label: 'Single-line Text' },
  { value: 'number', label: 'Number / Amount' },
  { value: 'date', label: 'Date Picker (IST)' },
  { value: 'select', label: 'Dropdown / Multiple Choice' },
  { value: 'checkbox', label: 'Yes/No Checkbox' },
  { value: 'file', label: 'File / Document Upload' }
];

export default function OrderPipelineConfig({
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

  // Only Master Admin can see other tenants. Tenant Admins strictly see their own!
  const availableTenants = useMemo(() => {
    if (isMaster) {
      return ALL_TENANTS;
    }
    return [userTenant];
  }, [isMaster, userTenant]);

  const [selectedTenant, setSelectedTenant] = useState(userTenant.code);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [dynamicBranches, setDynamicBranches] = useState([]);

  // Load actual registered branches for selected tenant strictly from system records
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

  // Construct branches list strictly from registered branches (No duplicates)
  const availableBranches = useMemo(() => {
    const list = [
      { code: 'All Branches', label: 'All Branches (Default Baseline)' }
    ];

    (dynamicBranches || []).forEach(db => {
      const branchCode = db.branch_code || db.id;
      const branchName = db.branch_name || db.name || 'Branch';
      const label = `${branchName} [${branchCode}]`;
      list.push({
        code: label,
        label: label
      });
    });

    return list;
  }, [dynamicBranches]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Load team members for selected tenant
  useEffect(() => {
    async function loadTeam() {
      setLoadingMembers(true);
      try {
        const tenantObj = ALL_TENANTS.find(t => t.code === selectedTenant) || userTenant;
        const members = await getTeamMembers(tenantObj.name, selectedTenant);
        if (Array.isArray(members)) {
          setTeamMembers(members);
        } else {
          setTeamMembers([]);
        }
      } catch (err) {
        console.warn('Failed to load team members:', err);
        setTeamMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    }
    loadTeam();
  }, [selectedTenant, userTenant]);

  // Pipeline Config State
  const [config, setConfig] = useState({
    tat_mode: 'DYNAMIC',
    default_advance_pct: 30,
    auto_skip_balance_on_full_advance: true,
    allow_regular_party_credit_waiver: true,
    allow_partial_split_lots: true,
    stages: []
  });

  // Active Stage for Custom Field Editing Modal
  const [editingStage, setEditingStage] = useState(null);
  const [newField, setNewField] = useState({
    id: '',
    label: '',
    type: 'text',
    optionsText: '',
    default_value: '',
    placeholder: '',
    required: false
  });

  // Fetch pipeline configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getOrderPipelineConfig(selectedTenant, selectedBranch);
      if (res.success && res.config) {
        setConfig(res.config);
      } else {
        setErrorMsg(res.error || 'Failed to load pipeline configuration.');
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

  // Handle stage property updates
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

  // Add role to stage
  const handleAddRoleToStage = (stageId, roleKey) => {
    if (!roleKey) return;
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const current = Array.isArray(st.authorized_roles) ? st.authorized_roles : [];
          if (!current.includes(roleKey)) {
            return { ...st, authorized_roles: [...current, roleKey] };
          }
        }
        return st;
      })
    }));
  };

  // Remove role from stage
  const handleRemoveRoleFromStage = (stageId, roleKey) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const current = Array.isArray(st.authorized_roles) ? st.authorized_roles : [];
          return { ...st, authorized_roles: current.filter(r => r !== roleKey) };
        }
        return st;
      })
    }));
  };

  // Assign employee incharge to stage
  const handleAssignEmpToStage = (stageId, empId) => {
    const emp = teamMembers.find(m => String(m.user_id || m.id) === String(empId));
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          return {
            ...st,
            assigned_emp_id: empId || '',
            assigned_emp_name: emp ? (emp.name || emp.full_name || emp.email || '') : ''
          };
        }
        return st;
      })
    }));
  };

  // Toggle stage active/inactive
  const handleToggleStage = (stageId) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          return { ...st, is_enabled: !st.is_enabled };
        }
        return st;
      })
    }));
  };

  // Save changes
  const handleSaveConfig = async () => {
    setSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);
    try {
      const res = await saveOrderPipelineConfig(selectedTenant, selectedBranch, config);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setErrorMsg(res.error || 'Failed to save configuration');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset to Defaults
  const handleReset = async () => {
    if (!window.confirm(`Are you sure you want to restore the 13-stage baseline configuration for ${selectedTenant} (${selectedBranch})? Any custom modifications will be reset.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await resetOrderPipelineConfig(selectedTenant, selectedBranch);
      if (res.success && res.config) {
        setConfig(res.config);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Open Custom Field Modal
  const openFieldModal = (stage) => {
    setEditingStage(stage);
    setNewField({
      id: '',
      label: '',
      type: 'text',
      optionsText: '',
      default_value: '',
      placeholder: '',
      required: false
    });
  };

  // Add Custom Field to Stage
  const handleAddCustomField = () => {
    if (!editingStage || !newField.label.trim()) {
      alert('Please enter a Field Label');
      return;
    }

    const fieldKey = (newField.id.trim() || newField.label.toLowerCase().replace(/[^a-z0-9_]/g, '_')).slice(0, 32);
    const existing = editingStage.custom_fields || [];
    if (existing.some(f => f.id === fieldKey)) {
      alert(`A field with ID "${fieldKey}" already exists on this stage.`);
      return;
    }

    const options = newField.type === 'select'
      ? newField.optionsText.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const constructedField = {
      id: fieldKey,
      label: newField.label.trim(),
      type: newField.type,
      default_value: newField.default_value,
      placeholder: newField.placeholder,
      required: newField.required,
      ...(options ? { options } : {})
    };

    const updatedStages = (config.stages || []).map(st => {
      if (st.id === editingStage.id) {
        const updatedFields = [...(st.custom_fields || []), constructedField];
        setEditingStage({ ...st, custom_fields: updatedFields });
        return { ...st, custom_fields: updatedFields };
      }
      return st;
    });

    setConfig(prev => ({ ...prev, stages: updatedStages }));
    setNewField({
      id: '',
      label: '',
      type: 'text',
      optionsText: '',
      default_value: '',
      placeholder: '',
      required: false
    });
  };

  // Delete Custom Field
  const handleDeleteCustomField = (fieldId) => {
    if (!editingStage) return;
    const updatedFields = (editingStage.custom_fields || []).filter(f => f.id !== fieldId);
    setEditingStage({ ...editingStage, custom_fields: updatedFields });

    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === editingStage.id) {
          return { ...st, custom_fields: updatedFields };
        }
        return st;
      })
    }));
  };

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7'
            }}>
              <Truck size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Order to Delivery Pipeline Configuration
              </h2>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Customize 13 lifecycle stages, TAT SLAs, dynamic custom fields, and split lot policies per Tenant &amp; Branch.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading || saving}
            style={{
              padding: '0.55rem 1rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={loading || saving}
            style={{
              padding: '0.55rem 1.25rem',
              background: saveSuccess ? '#10b981' : '#2563eb',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {saving ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 size={15} />
                Saved Successfully!
              </>
            ) : (
              <>
                <Save size={15} />
                Save Pipeline Config
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scope Selector Bar (Tenant Code & Branch Code) */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        display: 'flex',
        gap: '1.25rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Tenant Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 280px' }}>
          <Building2 size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Tenant / Company:
          </span>
          {isMaster ? (
            <select
              value={selectedTenant}
              onChange={e => {
                setSelectedTenant(e.target.value);
                setSelectedBranch('All Branches');
              }}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.84rem',
                fontWeight: 700
              }}
            >
              {availableTenants.map(t => (
                <option key={t.code} value={t.code}>
                  {t.name} [{t.code}]
                </option>
              ))}
            </select>
          ) : (
            <div style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{userTenant.name} [{userTenant.code}]</span>
              <span style={{
                fontSize: '0.72rem',
                color: '#10b981',
                fontWeight: 700,
                background: 'rgba(16,185,129,0.1)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <Lock size={11} /> Workspace Locked
              </span>
            </div>
          )}
        </div>

        {/* Branch Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 340px' }}>
          <Layers size={16} style={{ color: '#a855f7' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Branch / Plant Scope:
          </span>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              fontWeight: 700
            }}
          >
            {availableBranches.map(b => (
              <option key={b.code} value={b.code}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '0.84rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Global Commercial & TAT Rules Card */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* TAT Mode */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ⏱️ TAT SLA Calculation Mode
          </label>
          <select
            value={config.tat_mode || 'DYNAMIC'}
            onChange={e => setConfig(prev => ({ ...prev, tat_mode: e.target.value }))}
            style={{
              padding: '0.55rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.84rem'
            }}
          >
            <option value="DYNAMIC">Dynamic Handover (Actual Handover Timestamp + Target TAT)</option>
            <option value="FIXED">Fixed Baseline SLA (Planned Order Punch + Master TAT)</option>
            <option value="DUAL">Dual Mode (Show both Fixed Baseline &amp; Dynamic Handover)</option>
          </select>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Controls how expected stage completion deadlines are calculated.
          </span>
        </div>

        {/* Commercial Policies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            💰 Commercial &amp; Advance Rules
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!config.auto_skip_balance_on_full_advance}
              onChange={e => setConfig(prev => ({ ...prev, auto_skip_balance_on_full_advance: e.target.checked }))}
            />
            <span>Auto-skip balance payment (S09 &amp; S10) if 100% advance received upfront</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!config.allow_regular_party_credit_waiver}
              onChange={e => setConfig(prev => ({ ...prev, allow_regular_party_credit_waiver: e.target.checked }))}
            />
            <span>Allow regular trusted credit parties to waive advance &amp; proceed directly to production</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!config.allow_partial_split_lots}
              onChange={e => setConfig(prev => ({ ...prev, allow_partial_split_lots: e.target.checked }))}
            />
            <span>Allow partial split lots (dispatch ready units, keep remaining in active pipeline)</span>
          </label>
        </div>
      </div>

      {/* 13-Stages Configuration List */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              13-Stage Master Lifecycle Flow
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Configure stage names, authorized roles, stage incharge, target TAT hours, and dynamic custom fields.
            </span>
          </div>
          <span style={{
            fontSize: '0.76rem',
            padding: '0.25rem 0.6rem',
            background: 'rgba(56, 189, 248, 0.1)',
            color: '#0284c7',
            borderRadius: '6px',
            fontWeight: 700
          }}>
            {(config.stages || []).filter(s => s.is_enabled !== false).length} Active Stages
          </span>
        </div>

        {/* 3-Tier Execution Control Banner */}
        <div style={{
          margin: '0.85rem 1.25rem',
          padding: '0.75rem 1rem',
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)'
        }}>
          <ShieldCheck size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>3-Tier Stage Execution Control &amp; Permission Matrix Fallback:</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem', marginTop: '0.35rem' }}>
              <div>
                <span style={{ color: '#10b981', fontWeight: 700 }}>1. Stage Incharge:</span> If an employee is selected, only they (or Admins) can advance this stage.
              </div>
              <div>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>2. Authorized Roles:</span> If roles are picked, any staff with those roles can execute.
              </div>
              <div>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>3. Open Matrix Fallback:</span> If both are blank, access is decided directly by individual user <strong>Permission Matrix (View + Edit)</strong>.
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            Loading pipeline configuration...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 0.85rem', width: '70px' }}>Stage</th>
                  <th style={{ padding: '0.75rem 0.85rem', width: '60px' }}>Active</th>
                  <th style={{ padding: '0.75rem 0.85rem', minWidth: '150px' }}>Stage Name</th>
                  <th style={{ padding: '0.75rem 0.85rem', minWidth: '230px' }}>Authorized Roles (Multi-Select)</th>
                  <th style={{ padding: '0.75rem 0.85rem', minWidth: '200px' }}>Stage Incharge (Assigned Emp)</th>
                  <th style={{ padding: '0.75rem 0.85rem', width: '105px' }}>Target TAT</th>
                  <th style={{ padding: '0.75rem 0.85rem', minWidth: '160px' }}>Default Note</th>
                  <th style={{ padding: '0.75rem 0.85rem', width: '130px', textAlign: 'center' }}>Custom Fields</th>
                </tr>
              </thead>
              <tbody>
                {(config.stages || []).map((stage) => {
                  const customFieldsCount = (stage.custom_fields || []).length;
                  const currentRoles = Array.isArray(stage.authorized_roles) ? stage.authorized_roles : [];

                  return (
                    <tr
                      key={stage.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        opacity: stage.is_enabled === false ? 0.5 : 1,
                        transition: 'background 0.15s'
                      }}
                    >
                      {/* Stage ID */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          background: `${stage.color || '#3b82f6'}20`,
                          color: stage.color || '#3b82f6',
                          border: `1px solid ${stage.color || '#3b82f6'}40`
                        }}>
                          {stage.id}
                        </span>
                      </td>

                      {/* Active Toggle Switch */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={stage.is_enabled !== false}
                          onChange={() => handleToggleStage(stage.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>

                      {/* Stage Name */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <input
                          type="text"
                          value={stage.name}
                          onChange={e => handleStageChange(stage.id, 'name', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem 0.6rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontSize: '0.83rem',
                            fontWeight: 700
                          }}
                        />
                      </td>

                      {/* Authorized Roles (Multi-Select Tags) */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', minHeight: '26px', alignItems: 'center' }}>
                            {currentRoles.length === 0 ? (
                              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                🔓 All Roles / Fallback to Matrix
                              </span>
                            ) : (
                              currentRoles.map(rKey => {
                                const rObj = AVAILABLE_ROLES.find(r => r.key === rKey);
                                const rLabel = rObj?.label || rKey;
                                const rColor = rObj?.color || '#3b82f6';
                                return (
                                  <span
                                    key={rKey}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontSize: '0.71rem',
                                      fontWeight: 700,
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px',
                                      background: `${rColor}15`,
                                      color: rColor,
                                      border: `1px solid ${rColor}35`
                                    }}
                                  >
                                    {rLabel}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRoleFromStage(stage.id, rKey)}
                                      title={`Remove ${rLabel}`}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        color: 'inherit'
                                      }}
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>
                                );
                              })
                            )}
                          </div>

                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                handleAddRoleToStage(stage.id, e.target.value);
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '0.3rem 0.5rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.75rem'
                            }}
                          >
                            <option value="">➕ Add Authorized Role...</option>
                            {AVAILABLE_ROLES
                              .filter(r => !currentRoles.includes(r.key))
                              .map(r => (
                                <option key={r.key} value={r.key}>
                                  {r.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      </td>

                      {/* Stage Incharge (Assigned Employee) */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <select
                            value={stage.assigned_emp_id || ''}
                            onChange={e => handleAssignEmpToStage(stage.id, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.35rem 0.5rem',
                              background: 'var(--bg-primary)',
                              border: stage.assigned_emp_id ? '1px solid #10b981' : '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: stage.assigned_emp_id ? '#10b981' : 'var(--text-primary)',
                              fontSize: '0.76rem',
                              fontWeight: stage.assigned_emp_id ? 700 : 400
                            }}
                          >
                            <option value="">👥 Anyone with Role / Open</option>
                            {teamMembers.map(emp => {
                              const empId = emp.user_id || emp.id;
                              const empName = emp.name || emp.full_name || emp.email;
                              const empRole = emp.role || 'Staff';
                              return (
                                <option key={empId} value={empId}>
                                  👤 {empName} ({empRole})
                                </option>
                              );
                            })}
                          </select>
                          {stage.assigned_emp_name && (
                            <span style={{ fontSize: '0.71rem', color: '#10b981', fontWeight: 600 }}>
                              ✓ Incharge: {stage.assigned_emp_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Target TAT */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <input
                            type="number"
                            min="0"
                            max="720"
                            value={stage.tat_hours ?? 4}
                            onChange={e => handleStageChange(stage.id, 'tat_hours', Number(e.target.value) || 0)}
                            style={{
                              width: '55px',
                              padding: '0.35rem 0.4rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem',
                              textAlign: 'center'
                            }}
                          />
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Hrs</span>
                        </div>
                      </td>

                      {/* Default Note */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <input
                          type="text"
                          value={stage.default_note || ''}
                          onChange={e => handleStageChange(stage.id, 'default_note', e.target.value)}
                          placeholder="Standard note text..."
                          style={{
                            width: '100%',
                            padding: '0.35rem 0.5rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem'
                          }}
                        />
                      </td>

                      {/* Custom Fields Action */}
                      <td style={{ padding: '0.85rem 0.85rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openFieldModal(stage)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            background: customFieldsCount > 0 ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-primary)',
                            border: customFieldsCount > 0 ? '1px solid #6366f1' : '1px solid var(--border-light)',
                            borderRadius: '6px',
                            color: customFieldsCount > 0 ? '#4f46e5' : 'var(--text-secondary)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Edit3 size={13} />
                          {customFieldsCount} Field{customFieldsCount === 1 ? '' : 's'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custom Fields Builder Modal */}
      {editingStage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Dynamic Fields: {editingStage.id} — {editingStage.name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Fields added here will automatically render in the Action Modal of this stage.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  display: 'flex'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Existing Fields List */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'block' }}>
                  Current Configured Fields ({(editingStage.custom_fields || []).length}):
                </label>
                {(editingStage.custom_fields || []).length === 0 ? (
                  <div style={{
                    padding: '1.25rem',
                    background: 'var(--bg-primary)',
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem'
                  }}>
                    No custom fields configured for this stage yet. Add one below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(editingStage.custom_fields || []).map((field) => (
                      <div
                        key={field.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65rem 0.85rem',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '8px',
                          fontSize: '0.82rem'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                            Type: <span style={{ fontWeight: 600, color: '#38bdf8' }}>{field.type}</span> | Key: <code>{field.id}</code>
                            {field.options && ` | Options: ${field.options.join(', ')}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomField(field.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            color: '#ef4444',
                            padding: '0.35rem 0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.74rem'
                          }}
                        >
                          <Trash2 size={13} />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Custom Field Box */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px dashed var(--border-light)',
                borderRadius: '10px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={16} style={{ color: '#2563eb' }} />
                  Add New Custom Field
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Field Label *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Tally PI Number"
                      value={newField.label}
                      onChange={e => setNewField({ ...newField, label: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Field Type
                    </label>
                    <select
                      value={newField.type}
                      onChange={e => setNewField({ ...newField, type: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        marginTop: '0.25rem'
                      }}
                    >
                      {FIELD_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {newField.type === 'select' && (
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Dropdown Options (comma-separated) *
                    </label>
                    <input
                      type="text"
                      placeholder="Option 1, Option 2, Option 3"
                      value={newField.optionsText}
                      onChange={e => setNewField({ ...newField, optionsText: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Placeholder Text
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Enter voucher number"
                      value={newField.placeholder}
                      onChange={e => setNewField({ ...newField, placeholder: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Default Value
                    </label>
                    <input
                      type="text"
                      placeholder="Optional default"
                      value={newField.default_value}
                      onChange={e => setNewField({ ...newField, default_value: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        marginTop: '0.25rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newField.required}
                      onChange={e => setNewField({ ...newField, required: e.target.checked })}
                    />
                    <span>Mandatory / Required Field</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    style={{
                      padding: '0.45rem 1rem',
                      background: '#2563eb',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Plus size={14} />
                    Insert Field
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--bg-surface)'
            }}>
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
