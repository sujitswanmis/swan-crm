'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserCheck, Settings2, Plus, Trash2, Save, RefreshCw, CheckCircle2,
  Clock, AlertCircle, Building2, Layers, CheckSquare, Sparkles, X, Edit3, ArrowRight, Lock,
  ShieldCheck, Briefcase, Calendar, ChevronRight
} from 'lucide-react';
import {
  getRecruiterPipelineConfig,
  saveRecruiterPipelineConfig
} from '@/app/actions/recruiterConfig';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { getTeamMembers } from '@/app/actions/team';
import UniversalBranchSelect from '@/components/common/UniversalBranchSelect';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';

const KNOWN_TENANTS = [
  { id: '00000000-0000-0000-0000-000000000001', code: 'TNT00002', name: 'New Swan Group' },
  { id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', code: 'TNT00001', name: 'SuPuja Creations' },
  { id: '922d3e72-6588-457f-a562-4f1bdbf10d98', code: 'TNT00003', name: 'Testing New Swan Group' }
];

const AVAILABLE_ROLES = [
  { key: 'admin', label: 'Admin / Master Admin', color: '#dc2626' },
  { key: 'hr_manager', label: 'HR Manager / Head', color: '#7c3aed' },
  { key: 'recruiter', label: 'Recruiter', color: '#2563eb' },
  { key: 'hod', label: 'Department HOD', color: '#ea580c' },
  { key: 'interviewer', label: 'Technical Interviewer', color: '#0284c7' },
  { key: 'ed', label: 'Executive Director (ED)', color: '#b91c1c' }
];

const STAGE_COLOR_PRESETS = [
  { color: '#94a3b8', textColor: '#1e293b', label: 'Slate' },
  { color: '#a855f7', textColor: '#581c87', label: 'Purple' },
  { color: '#cbd5e1', textColor: '#334155', label: 'Gray' },
  { color: '#fef9c3', textColor: '#854d0e', label: 'Yellow' },
  { color: '#dbeafe', textColor: '#1e40af', label: 'Blue' },
  { color: '#ffedd5', textColor: '#c2410c', label: 'Orange' },
  { color: '#f5d0fe', textColor: '#86198f', label: 'Fuchsia' },
  { color: '#e0e7ff', textColor: '#3730a3', label: 'Indigo' },
  { color: '#e0f2fe', textColor: '#0369a1', label: 'Sky' },
  { color: '#dcfce7', textColor: '#166534', label: 'Green' }
];

export default function RecruiterPipelineConfig({
  userCompany = 'New Swan Group',
  isMasterAdmin = false,
  userRole = ''
}) {
  const isMaster = isMasterAdmin === true || userRole === 'master_admin';

  // 1. Dual Scope Selection: Company (Tenant) & Branch (Plant)
  const [selectedCompany, setSelectedCompany] = useState(() => {
    const raw = String(userCompany || '').trim().toLowerCase();
    if (raw.includes('supuja') || raw === 'tnt00001') return 'SuPuja Creations';
    if (raw.includes('testing') || raw === 'tnt00003') return 'Testing New Swan Group';
    return 'New Swan Group';
  });

  // Resolved Standard Tenant Metadata
  const currentTenantMeta = useMemo(() => {
    const nameLow = selectedCompany.toLowerCase();
    return KNOWN_TENANTS.find(t => nameLow.includes(t.name.toLowerCase()) || nameLow.includes(t.code.toLowerCase())) || KNOWN_TENANTS[0];
  }, [selectedCompany]);

  const selectedTenant = currentTenantMeta.code; // 'TNT00002'

  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [availableBranches, setAvailableBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Load registered branches for selected company dynamically (Universal Branch Standard)
  useEffect(() => {
    let isCancelled = false;
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const res = await getTenantBranches(selectedCompany);
        if (!isCancelled) {
          const list = Array.isArray(res) ? res : (res?.branches || []);
          setAvailableBranches(list);
        }
      } catch (err) {
        console.warn('Failed to load branches:', err);
      } finally {
        if (!isCancelled) setLoadingBranches(false);
      }
    }
    loadBranches();
    return () => { isCancelled = true; };
  }, [selectedCompany]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // New Status Option inputs state per stage: { 'S02': 'New Status Name' }
  const [newStatusInputs, setNewStatusInputs] = useState({});

  // Team Members for incharge assignment (resolving with internal tenant UUID)
  useEffect(() => {
    let isCancelled = false;
    async function loadTeam() {
      setLoadingMembers(true);
      try {
        const members = await getTeamMembers(currentTenantMeta.name, currentTenantMeta.id);
        if (!isCancelled) {
          if (Array.isArray(members)) {
            // Filter active employees and sort alphabetically by emp_name
            const activeMembers = members
              .filter(m => {
                const name = m.emp_name || m.name || m.email;
                const status = m.emp_status || m.module_access?.emp_status;
                return Boolean(name && status !== 'InActive' && status !== 'Trash' && status !== 'Terminated');
              })
              .sort((a, b) => {
                const nameA = String(a.emp_name || a.name || a.email || '').toLowerCase();
                const nameB = String(b.emp_name || b.name || b.email || '').toLowerCase();
                return nameA.localeCompare(nameB);
              });
            setTeamMembers(activeMembers);
          } else {
            setTeamMembers([]);
          }
        }
      } catch (err) {
        console.warn('Failed to load team members:', err);
        if (!isCancelled) setTeamMembers([]);
      } finally {
        if (!isCancelled) setLoadingMembers(false);
      }
    }
    loadTeam();
    return () => { isCancelled = true; };
  }, [currentTenantMeta]);

  // Master Config State
  const [config, setConfig] = useState({
    tat_mode: 'DUAL',
    planned_anchor: 'CANDIDATE_CREATION',
    enable_tat_alerts: true,
    stages: []
  });

  // Load Config
  const loadConfig = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getRecruiterPipelineConfig(selectedTenant, selectedBranch);
      if (res?.success && res.config) {
        setConfig(res.config);
      } else {
        setErrorMsg(res?.error || 'Failed to load configuration.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [selectedTenant, selectedBranch]);

  // Save Config
  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMsg('');

    try {
      const res = await saveRecruiterPipelineConfig(selectedTenant, selectedBranch, config);
      if (res?.success) {
        setSaveSuccess(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('crm_recruiter_config_updated', {
            detail: { tenant: selectedTenant, branch: selectedBranch, config }
          }));
        }
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        setErrorMsg(res?.error || 'Failed to save configuration.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

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

  // Toggle Stage Enabled/Disabled
  const handleToggleStage = (stageId) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          return { ...st, is_enabled: st.is_enabled === false ? true : false };
        }
        return st;
      })
    }));
  };

  // Role Add/Remove
  const handleToggleRole = (stageId, roleKey) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const currentRoles = Array.isArray(st.authorized_roles) ? st.authorized_roles : [];
          const exists = currentRoles.includes(roleKey);
          const updated = exists 
            ? currentRoles.filter(r => r !== roleKey)
            : [...currentRoles, roleKey];
          return { ...st, authorized_roles: updated };
        }
        return st;
      })
    }));
  };

  // Assign Stage Incharge (Search & Selection Support)
  const handleAssignIncharge = (stageId, empId, empName = null) => {
    let resolvedName = empName;
    if (empId && !resolvedName) {
      const selectedEmp = teamMembers.find(m => String(m.user_id || m.id) === String(empId));
      resolvedName = selectedEmp ? (selectedEmp.emp_name || selectedEmp.name || selectedEmp.email) : null;
    }
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          return {
            ...st,
            assigned_emp_id: empId || null,
            assigned_emp_name: resolvedName || null
          };
        }
        return st;
      })
    }));
  };

  // Add Status Option
  const handleAddStatusOption = (stageId) => {
    const text = (newStatusInputs[stageId] || '').trim();
    if (!text) return;

    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const opts = Array.isArray(st.status_options) ? st.status_options : [];
          if (opts.includes(text)) {
            alert('This status option already exists.');
            return st;
          }
          return { ...st, status_options: [...opts, text] };
        }
        return st;
      })
    }));

    setNewStatusInputs(prev => ({ ...prev, [stageId]: '' }));
  };

  // Remove Status Option
  const handleRemoveStatusOption = (stageId, optToRemove) => {
    setConfig(prev => ({
      ...prev,
      stages: (prev.stages || []).map(st => {
        if (st.id === stageId) {
          const opts = Array.isArray(st.status_options) ? st.status_options : [];
          return { ...st, status_options: opts.filter(o => o !== optToRemove) };
        }
        return st;
      })
    }));
  };

  const activeStagesCount = (config.stages || []).filter(s => s.is_enabled !== false).length;

  return (
    <div style={{ padding: '1.5rem', width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)' }}>
      {/* Top Header Card */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb'
            }}>
              <Users size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Recruiter Stages &amp; TAT SLA Configuration Studio
              </h2>
              <p style={{ fontSize: '0.82rem', margin: 0, color: 'var(--text-secondary)' }}>
                Configure all recruitment pipeline stages (S00–S09), Planned vs Actual TAT SLA models, incharge assignments, and candidate status options.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={loadConfig}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Reload
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={saving || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: (saving || loading) ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Pipeline Config'}
          </button>
        </div>
      </div>

      {/* Save Success Banner */}
      {saveSuccess && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid #22c55e',
          color: '#16a34a',
          fontSize: '0.85rem',
          fontWeight: 600,
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={18} />
          <span>Recruiter Pipeline Configuration saved successfully in IST!</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          color: '#ef4444',
          fontSize: '0.85rem',
          fontWeight: 600,
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Scope Selectors: Company & Branch */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem'
      }}>
        {/* Company / Tenant Scope (Standardized Tenant Code) */}
        <div style={{ minWidth: '220px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            🏢 Company / Tenant Scope
          </label>
          {isMaster ? (
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setSelectedBranch('All Branches');
              }}
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: '1.5px solid #3b82f6',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Select Company / Tenant"
            >
              {KNOWN_TENANTS.map(t => (
                <option key={t.code} value={t.name}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-primary)',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--text-primary)'
            }}>
              <Building2 size={16} style={{ color: '#2563eb' }} />
              <span>{selectedCompany} ({currentTenantMeta.code})</span>
            </div>
          )}
        </div>

        {/* Branch Scope (Mandatory UniversalBranchSelect) */}
        <div style={{ minWidth: '260px', maxWidth: '340px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            📍 Branch Scope
          </label>
          <UniversalBranchSelect
            mode="filter"
            value={selectedBranch}
            onChange={(val) => setSelectedBranch(val || 'All Branches')}
            branches={availableBranches}
            allValue="All Branches"
            allLabel="All Branches (Default Baseline)"
            title="BRANCH / PLANT SCOPE"
            triggerStyle={{
              minHeight: '38px',
              borderRadius: '8px'
            }}
          />
        </div>

        {/* TAT SLA Calculation Mode */}
        <div style={{ minWidth: '260px', flex: 1 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
            ⏱️ TAT SLA &amp; Planning Mode
          </label>
          <select
            value={config.tat_mode || 'DUAL'}
            onChange={(e) => setConfig(prev => ({ ...prev, tat_mode: e.target.value }))}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          >
            <option value="DUAL">Dual Mode (Baseline Planned + Dynamic Cascading Actual to Planned)</option>
            <option value="DYNAMIC">Dynamic Cascading (Actual Done Date + Next Stage TAT = Next Planned)</option>
            <option value="FIXED">Fixed Baseline SLA (Planned Opening/Creation + Master Cumulative TAT)</option>
          </select>
        </div>
      </div>

      {/* SLA Mode Explainer Card */}
      <div style={{
        background: 'rgba(59, 130, 246, 0.05)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem'
      }}>
        <Clock size={20} color="#2563eb" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Planned &amp; Actual SLA Logic (IST): </strong>
          <strong>Model 1: Planned ➔ TAT ➔ Planned</strong> builds the master baseline target date for each stage (S00 to S09).
          <br />
          <strong>Model 2: Planned ➔ Actual ➔ TAT ➔ Planned</strong> captures the actual interview/test completion date and automatically cascades the next stage's target date: 
          <code style={{ background: 'var(--bg-surface)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)', marginLeft: '0.4rem' }}>
            Next Stage Planned = Actual Date + Next Stage TAT
          </code>
        </div>
      </div>

      {/* Stage Cards Header & Summary */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem'
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>Recruiter Pipeline Stages (S00 to S09)</span>
          <span style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.55rem',
            borderRadius: '12px',
            background: 'rgba(37,99,235,0.1)',
            color: '#2563eb',
            fontWeight: 700
          }}>
            {activeStagesCount} Active Stages
          </span>
        </h3>
      </div>

      {/* Stages Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {(config.stages || []).map((stage) => {
          const isEnabled = stage.is_enabled !== false;
          const currentRoles = Array.isArray(stage.authorized_roles) ? stage.authorized_roles : [];
          const statusOpts = Array.isArray(stage.status_options) ? stage.status_options : [];

          return (
            <div
              key={stage.id}
              style={{
                background: 'var(--bg-surface)',
                border: isEnabled ? '1px solid var(--border-light)' : '1px dashed var(--border-light)',
                borderRadius: '12px',
                padding: '1.25rem',
                opacity: isEnabled ? 1 : 0.6,
                transition: 'all 0.2s ease',
                boxShadow: isEnabled ? '0 1px 3px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              {/* Card Top Row: ID, Enable Toggle, Name, Color */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Stage Code Pill */}
                  <span style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    backgroundColor: stage.color || '#cbd5e1',
                    color: stage.textColor || '#334155'
                  }}>
                    {stage.id}
                  </span>

                  {/* Stage Name Input */}
                  <input
                    type="text"
                    value={stage.name || ''}
                    onChange={(e) => handleStageChange(stage.id, 'name', e.target.value)}
                    placeholder="Stage Display Name"
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      padding: '0.4rem 0.65rem',
                      backgroundColor: 'var(--bg-primary)',
                      minWidth: '260px'
                    }}
                  />

                  {/* Short Code */}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {stage.short_code}
                  </span>
                </div>

                {/* Right controls: Color Presets & Enable Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Color Preset Palette */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Change Stage Color">
                    {STAGE_COLOR_PRESETS.slice(0, 5).map(cp => (
                      <div
                        key={cp.color}
                        onClick={() => {
                          handleStageChange(stage.id, 'color', cp.color);
                          handleStageChange(stage.id, 'textColor', cp.textColor);
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          backgroundColor: cp.color,
                          cursor: 'pointer',
                          border: stage.color === cp.color ? '2px solid var(--text-primary)' : '1px solid rgba(0,0,0,0.1)'
                        }}
                      />
                    ))}
                  </div>

                  {/* Enable / Disable Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggleStage(stage.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ color: isEnabled ? '#16a34a' : 'var(--text-secondary)' }}>
                      {isEnabled ? 'Active Stage' : 'Disabled'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Grid: TAT Hours, Incharge, Roles */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                {/* TAT SLA Hours */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    ⏱️ Target TAT SLA (Hours)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={stage.tat_hours ?? 24}
                      onChange={(e) => handleStageChange(stage.id, 'tat_hours', parseInt(e.target.value, 10) || 1)}
                      style={{
                        width: '90px',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 700
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      hours ({Math.round(((stage.tat_hours ?? 24) / 24) * 10) / 10} days)
                    </span>
                  </div>
                </div>

                {/* Stage Incharge (Search & Selection) */}
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    👤 Stage Incharge (Lead Person)
                  </label>
                  <SearchableEmployeeSelect
                    employees={teamMembers}
                    selectedEmail={stage.assigned_emp_id || stage.assigned_emp_name || ''}
                    onSelect={(emp) => {
                      if (!emp || emp.email === 'ALL') {
                        handleAssignIncharge(stage.id, null, null);
                      } else {
                        handleAssignIncharge(
                          stage.id,
                          emp.user_id || emp.id,
                          emp.emp_name || emp.name || emp.email
                        );
                      }
                    }}
                    placeholder="Search by name, role, email..."
                    allowAllStaff={true}
                    allStaffLabel="👥 Anyone with Role / Open (No Specific Incharge)"
                  />
                  {stage.assigned_emp_name && (
                    <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, marginTop: '0.25rem', display: 'block' }}>
                      ✓ Assigned: {stage.assigned_emp_name}
                    </span>
                  )}
                </div>

                {/* Default Note / Guidance */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    📝 Stage Description / Guidance
                  </label>
                  <input
                    type="text"
                    value={stage.default_note || ''}
                    onChange={(e) => handleStageChange(stage.id, 'default_note', e.target.value)}
                    placeholder="Internal guidance note for recruiters..."
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              {/* Authorized Roles Multi-Select */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                  🛡️ Authorized Roles (Who can advance candidate in this stage)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {AVAILABLE_ROLES.map(role => {
                    const isAssigned = currentRoles.includes(role.key);
                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => handleToggleRole(stage.id, role.key)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '16px',
                          border: isAssigned ? `1px solid ${role.color}` : '1px solid var(--border-light)',
                          backgroundColor: isAssigned ? `${role.color}15` : 'var(--bg-primary)',
                          color: isAssigned ? role.color : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: isAssigned ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {isAssigned && <CheckSquare size={12} />}
                        {role.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Options Editor */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.85rem'
              }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                  🏷️ Candidate Status Options for {stage.id} (Configurable Dropdown Options)
                </label>

                {/* Status Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {statusOpts.map(opt => (
                    <span
                      key={opt}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.55rem',
                        borderRadius: '6px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                      }}
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() => handleRemoveStatusOption(stage.id, opt)}
                        title="Remove status"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {statusOpts.length === 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      No status options configured. Add one below.
                    </span>
                  )}
                </div>

                {/* Add Status Option Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '420px' }}>
                  <input
                    type="text"
                    value={newStatusInputs[stage.id] || ''}
                    onChange={(e) => setNewStatusInputs(prev => ({ ...prev, [stage.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddStatusOption(stage.id);
                      }
                    }}
                    placeholder={`e.g. Cleared, Rejected, Reschedule...`}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddStatusOption(stage.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} /> Add Status
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Save Button */}
      <div style={{
        marginTop: '1.5rem',
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <button
          onClick={handleSaveConfig}
          disabled={saving || loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.75rem',
            borderRadius: '8px',
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: (saving || loading) ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
          }}
        >
          {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Pipeline Configuration'}
        </button>
      </div>
    </div>
  );
}
