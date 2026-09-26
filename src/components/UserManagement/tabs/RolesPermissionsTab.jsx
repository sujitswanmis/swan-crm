'use client';

import React, { useState, useMemo } from 'react';
import { Shield, Sparkles, Users, CheckCircle2, ChevronRight, Eye, ShieldAlert, Search, Filter } from 'lucide-react';
import { ROLE_PRESETS } from '../utils/rolePresets';
import { isMasterAdmin } from '../utils/userManagementUtils';

export default function RolesPermissionsTab({
  users = [],
  onManagePermissions = () => {},
  onAssignRoleToUser = () => {}
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState('master_admin');
  const [searchUserQuery, setSearchUserQuery] = useState('');

  // Active Preset definition
  const currentPreset = useMemo(() => {
    return ROLE_PRESETS.find(p => p.key === selectedPresetKey) || ROLE_PRESETS[0];
  }, [selectedPresetKey]);

  // Compute users per role
  const roleStats = useMemo(() => {
    const stats = {};
    ROLE_PRESETS.forEach(p => {
      stats[p.key] = 0;
    });

    (users || []).forEach(u => {
      if (u.role === 'customer') return;
      if (isMasterAdmin(u)) {
        stats.master_admin = (stats.master_admin || 0) + 1;
        return;
      }
      const desig = (u.emp_designation || '').toLowerCase();
      if (desig.includes('hod') || desig.includes('director') || desig.includes('head')) {
        stats.hod_dept_head = (stats.hod_dept_head || 0) + 1;
      } else if (desig.includes('manager') || desig.includes('lead')) {
        stats.sales_manager = (stats.sales_manager || 0) + 1;
      } else if (desig.includes('recruiter') || desig.includes('hr')) {
        stats.hr_recruiter = (stats.hr_recruiter || 0) + 1;
      } else if (desig.includes('account') || desig.includes('finance') || desig.includes('purchase')) {
        stats.accounts_billing = (stats.accounts_billing || 0) + 1;
      } else {
        stats.sales_executive = (stats.sales_executive || 0) + 1;
      }
    });

    return stats;
  }, [users]);

  // Filter users matching search query for quick permission inspection
  const filteredUsers = useMemo(() => {
    let list = (users || []).filter(u => u.role !== 'customer');
    if (searchUserQuery.trim()) {
      const q = searchUserQuery.toLowerCase().trim();
      list = list.filter(u => {
        const name = (u.emp_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const desig = (u.emp_designation || '').toLowerCase();
        return name.includes(q) || email.includes(q) || desig.includes(q);
      });
    }
    return list;
  }, [users, searchUserQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Intro Header */}
      <div style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} style={{ color: '#7c3aed' }} />
            Role-Based Access Control (RBAC) & Profile Templates
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Standardize security and workflow access across departments. Apply pre-configured role profiles or customize per-user overrides.
          </p>
        </div>
      </div>

      {/* Grid: Left Column (Role Profiles List) & Right Column (Profile Inspector) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Left: Role Presets Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Predefined Role Templates ({ROLE_PRESETS.length})
          </span>

          {ROLE_PRESETS.map(preset => {
            const isSelected = selectedPresetKey === preset.key;
            const count = roleStats[preset.key] || 0;

            return (
              <div
                key={preset.key}
                onClick={() => setSelectedPresetKey(preset.key)}
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  backgroundColor: 'var(--bg-surface)',
                  border: isSelected ? `2px solid ${preset.color}` : '1px solid var(--border-light)',
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 4px 15px rgba(0, 0, 0, 0.08)' : 'none',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: preset.color }} />
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{preset.name}</span>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.55rem',
                    borderRadius: '12px',
                    backgroundColor: preset.badgeBg,
                    color: preset.color,
                    border: `1px solid ${preset.badgeBorder}`
                  }}>
                    {count} Users
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {preset.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Right: Selected Role Capabilities & User Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Preset Capabilities Overview Card */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentPreset.name} Capabilities
                </h4>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Default permissions included when this role is applied
                </span>
              </div>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                backgroundColor: currentPreset.badgeBg,
                color: currentPreset.color,
                border: `1px solid ${currentPreset.badgeBorder}`
              }}>
                Role Template
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Key Permissions:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                {Object.entries(currentPreset.presetData).map(([key, val]) => {
                  if (typeof val === 'boolean') {
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: val ? '#059669' : '#94a3b8' }}>
                        <CheckCircle2 size={14} style={{ color: val ? '#10b981' : '#cbd5e1' }} />
                        <span>{key.replace(/_/g, ' ')}</span>
                      </div>
                    );
                  }
                  if (typeof val === 'object' && val?.view) {
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: '#059669' }}>
                        <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                        <span>Module: <strong>{key}</strong></span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>

          {/* Quick User Permission Manager */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Customize Individual User Permissions
              </h4>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {filteredUsers.length} staff members
              </span>
            </div>

            {/* Quick search user */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                value={searchUserQuery}
                onChange={e => setSearchUserQuery(e.target.value)}
                placeholder="Search staff to open matrix..."
                style={{
                  width: '100%',
                  padding: '0.4rem 0.75rem 0.4rem 2rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary, #f8fafc)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem'
                }}
              />
            </div>

            {/* Quick staff list with 1-click matrix button */}
            <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {filteredUsers.slice(0, 15).map(u => (
                <div
                  key={u.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    fontSize: '0.78rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.emp_name || u.email}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{u.emp_designation || u.emp_department || 'Staff'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onManagePermissions(u)}
                    style={{
                      padding: '0.25rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #ddd6fe',
                      backgroundColor: '#f5f3ff',
                      color: '#7c3aed',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Shield size={12} />
                    Edit Matrix
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
