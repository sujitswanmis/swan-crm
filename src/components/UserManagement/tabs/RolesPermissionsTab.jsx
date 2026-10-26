'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Shield, CheckCircle2, Search, Plus, Loader2, Edit3, Trash2 } from 'lucide-react';
import { ROLE_PRESETS } from '../utils/rolePresets';
import { isMasterAdmin as checkIsMasterAdmin } from '../utils/userManagementUtils';
import { MODULES_CONFIG } from '@/config/modulesConfig';

export default function RolesPermissionsTab({
  users = [],
  onManagePermissions = () => {},
  onAssignRoleToUser = () => {},
  onAddRole = () => {},
  onEditRole = () => {},
  onDeleteRole = () => {},
  customRoles = [],
  canManageRoles = false,
  rolesLoading = false,
  rolesError = '',
  assigningRoleUserId = null,
  isMasterAdmin = false,
  activeRoleKey = null,
  onSelectRoleKey = () => {},
  saveBanner = null,
  onDismissBanner = () => {}
}) {
  const visiblePresets = useMemo(() => {
    return isMasterAdmin 
      ? ROLE_PRESETS 
      : ROLE_PRESETS.filter(p => p.key !== 'master_admin');
  }, [isMasterAdmin]);

  const defaultPresetKey = isMasterAdmin ? 'master_admin' : 'admin';
  const [selectedPresetKey, setSelectedPresetKey] = useState(activeRoleKey || defaultPresetKey);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [activeRightTab, setActiveRightTab] = useState('capabilities');

  // Sync selected role when parent signals a new active role (e.g. newly created role)
  useEffect(() => {
    if (activeRoleKey) {
      setSelectedPresetKey(activeRoleKey);
    }
  }, [activeRoleKey]);

  useEffect(() => {
    if (!isMasterAdmin && selectedPresetKey === 'master_admin') {
      setSelectedPresetKey('admin');
    }
  }, [isMasterAdmin, selectedPresetKey]);

  const roleProfiles = useMemo(() => {
    const customRoleByName = new Map();
    customRoles.forEach(r => {
      if (r?.name) customRoleByName.set(r.name.trim().toLowerCase(), r);
    });

    // 1. Process visiblePresets: if a custom role matches its name, override it with custom data (except protected Admin/Master Admin)
    const processedPresets = visiblePresets.map(preset => {
      if (preset.key === 'admin' || preset.key === 'master_admin') {
        return {
          ...preset,
          originalKey: preset.key,
          custom: false,
          isOverride: false,
          isSystemProtected: true
        };
      }
      const match = customRoleByName.get(preset.name.trim().toLowerCase());
      if (match) {
        return {
          ...preset,
          originalKey: preset.key,
          key: `custom:${match.id}`,
          id: match.id,
          name: match.name,
          description: match.description || preset.description,
          presetData: match.permissions || preset.presetData || {},
          custom: true,
          isOverride: true,
          isSystemProtected: false
        };
      }
      return {
        ...preset,
        originalKey: preset.key,
        custom: false,
        isOverride: false,
        isSystemProtected: false
      };
    });

    // 2. Add remaining custom roles that don't match any default preset name
    const presetNames = new Set(visiblePresets.map(p => p.name.trim().toLowerCase()));
    const additionalCustom = customRoles
      .filter(r => r?.name && !presetNames.has(r.name.trim().toLowerCase()))
      .map(role => ({
        key: `custom:${role.id}`,
        id: role.id,
        name: role.name,
        description: role.description || 'Custom permission template',
        presetData: role.permissions || {},
        color: '#4f46e5',
        badgeBg: '#eef2ff',
        badgeBorder: '#c7d2fe',
        custom: true,
        isOverride: false
      }));

    return [...processedPresets, ...additionalCustom];
  }, [visiblePresets, customRoles]);

  // Active Preset definition
  const currentPreset = useMemo(() => {
    return roleProfiles.find(p => p.key === selectedPresetKey) || roleProfiles[0] || visiblePresets[0] || ROLE_PRESETS[0];
  }, [roleProfiles, selectedPresetKey, visiblePresets]);

  // Compute users per role
  const roleStats = useMemo(() => {
    const stats = {};
    roleProfiles.forEach(p => {
      stats[p.key] = 0;
    });

    (users || []).forEach(u => {
      if (u.role === 'customer') return;

      // 1. Direct role template id match
      if (u.module_access?.role_template_id) {
        const customKey = `custom:${u.module_access.role_template_id}`;
        if (Object.hasOwn(stats, customKey)) {
          stats[customKey] += 1;
          return;
        }
      }

      if (checkIsMasterAdmin(u)) {
        if (isMasterAdmin && Object.hasOwn(stats, 'master_admin')) {
          stats.master_admin = (stats.master_admin || 0) + 1;
        }
        return;
      }

      // 2. Preset key match (check if overridden or original)
      if (u.module_access?.role_preset_key) {
        const matchedProfile = roleProfiles.find(p => p.originalKey === u.module_access.role_preset_key || p.key === u.module_access.role_preset_key);
        if (matchedProfile && Object.hasOwn(stats, matchedProfile.key)) {
          stats[matchedProfile.key] += 1;
          return;
        }
      }

      // 3. Role string match (telecaller, admin, etc.)
      const r = (u.role || '').toLowerCase().trim();
      const matchedByRole = roleProfiles.find(p => (p.originalKey || p.key || '').toLowerCase() === r || (p.name || '').toLowerCase() === r);
      if (matchedByRole && Object.hasOwn(stats, matchedByRole.key)) {
        stats[matchedByRole.key] += 1;
        return;
      }

      // Fallback
      const defaultProfile = roleProfiles.find(p => p.originalKey === 'sales_executive' || p.key === 'sales_executive');
      if (defaultProfile && Object.hasOwn(stats, defaultProfile.key)) {
        stats[defaultProfile.key] += 1;
      }
    });

    return stats;
  }, [roleProfiles, users, isMasterAdmin]);

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

  // Separate modules vs global powers for clean capabilities display
  const { moduleEntries, powerEntries } = useMemo(() => {
    const data = currentPreset?.presetData || {};
    const modules = [];
    const powers = [];

    Object.entries(data).forEach(([key, val]) => {
      if (typeof val === 'object' && val?.view) {
        modules.push([key, val]);
      } else if (typeof val === 'boolean' && key !== 'is_master_admin') {
        powers.push([key, val]);
      }
    });

    return { moduleEntries: modules, powerEntries: powers };
  }, [currentPreset]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      width: '100%',
      height: 'calc(100vh - 195px)',
      minHeight: '520px',
      boxSizing: 'border-box'
    }}>
      {/* Sleek Compact Header */}
      <div style={{
        padding: '0.55rem 1rem',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.6rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7c3aed',
            flexShrink: 0
          }}>
            <Shield size={16} />
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              Role-Based Access Control (RBAC)
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-primary, #f1f5f9)',
                padding: '0.08rem 0.45rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)'
              }}>
                {roleProfiles.length} Roles
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Standardize security & operational permissions across teams.
            </div>
          </div>
        </div>

        {canManageRoles && (
          <button
            type="button"
            onClick={onAddRole}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '7px',
              border: 0,
              background: 'var(--primary-color, #2563eb)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
            }}
          >
            <Plus size={14} /> Add Custom Role
          </button>
        )}
      </div>

      {rolesLoading && <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)', flexShrink: 0 }}><Loader2 size={13} className="animate-spin" /> Loading saved roles...</div>}
      {rolesError && <div role="alert" style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: '#fffbeb', color: '#92400e', fontSize: '0.76rem', flexShrink: 0 }}>{rolesError}</div>}

      {/* Save Success Banner */}
      {saveBanner && (
        <div style={{
          padding: '0.55rem 0.9rem',
          borderRadius: '8px',
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.6rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          boxShadow: '0 1px 4px rgba(16, 185, 129, 0.08)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <CheckCircle2 size={16} style={{ color: '#059669', flexShrink: 0 }} />
            <span>{saveBanner}</span>
          </div>
          <button
            type="button"
            onClick={onDismissBanner}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#059669',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.15rem 0.4rem',
              borderRadius: '4px'
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Grid: Left Column (Role Profiles List) & Right Column (Profile Inspector) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '310px minmax(0, 1fr)',
        gap: '0.75rem',
        flex: 1,
        minHeight: 0,
        boxSizing: 'border-box'
      }}>
        {/* Left Column: Role Profiles List */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          background: 'var(--bg-surface)',
          borderRadius: '10px',
          border: '1px solid var(--border-light)',
          padding: '0.65rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
            paddingBottom: '0.45rem',
            borderBottom: '1px solid var(--border-light)',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Role Templates ({roleProfiles.length})
            </span>
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            paddingRight: '3px'
          }}>
            {roleProfiles.map(preset => {
              const isSelected = selectedPresetKey === preset.key;
              const count = roleStats[preset.key] || 0;

              return (
                <div
                  key={preset.key}
                  onClick={() => {
                    setSelectedPresetKey(preset.key);
                    onSelectRoleKey(preset.key);
                    if (saveBanner) onDismissBanner();
                  }}
                  style={{
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? 'var(--bg-primary, #f8fafc)' : 'transparent',
                    border: isSelected ? `2px solid ${preset.color}` : '1px solid var(--border-light)',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 2px 6px rgba(0, 0, 0, 0.05)' : 'none',
                    transition: 'all 0.12s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: preset.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {preset.name}
                      </span>
                      {preset.isSystemProtected || preset.key === 'admin' || preset.key === 'master_admin' ? (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          padding: '0.06rem 0.35rem',
                          borderRadius: '5px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          flexShrink: 0
                        }}>
                          Protected
                        </span>
                      ) : preset.isOverride ? (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          padding: '0.06rem 0.35rem',
                          borderRadius: '5px',
                          backgroundColor: '#ede9fe',
                          color: '#6d28d9',
                          border: '1px solid #ddd6fe',
                          flexShrink: 0
                        }}>
                          Customized
                        </span>
                      ) : preset.custom ? (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          padding: '0.06rem 0.35rem',
                          borderRadius: '5px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          flexShrink: 0
                        }}>
                          Custom
                        </span>
                      ) : null}
                    </div>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '10px',
                      backgroundColor: preset.badgeBg,
                      color: preset.color,
                      border: `1px solid ${preset.badgeBorder}`,
                      flexShrink: 0
                    }}>
                      {count}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {preset.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Role Capabilities & Assigned Staff */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          background: 'var(--bg-surface)',
          borderRadius: '10px',
          border: '1px solid var(--border-light)',
          padding: '0.85rem 1rem',
          boxSizing: 'border-box'
        }}>
          {/* Header Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.65rem',
            borderBottom: '1px solid var(--border-light)',
            paddingBottom: '0.55rem',
            flexShrink: 0
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentPreset.name}
                </h4>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '0.12rem 0.5rem',
                  borderRadius: '10px',
                  backgroundColor: currentPreset.badgeBg,
                  color: currentPreset.color,
                  border: `1px solid ${currentPreset.badgeBorder}`
                }}>
                  {currentPreset.isSystemProtected || currentPreset.key === 'admin' || currentPreset.key === 'master_admin'
                    ? 'Protected System Role'
                    : currentPreset.isOverride 
                      ? 'Customized Preset' 
                      : currentPreset.custom 
                        ? 'Custom Role' 
                        : 'Default Preset'}
                </span>
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {currentPreset.description}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              {canManageRoles && !currentPreset.isSystemProtected && currentPreset.key !== 'master_admin' && currentPreset.key !== 'admin' && currentPreset.originalKey !== 'admin' && (
                <button
                  type="button"
                  onClick={() => onEditRole(currentPreset)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #c7d2fe',
                    backgroundColor: '#eef2ff',
                    color: '#4338ca',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                  title="Edit Role Name, Description & Permissions"
                >
                  <Edit3 size={13} />
                  <span>Edit Role</span>
                </button>
              )}
              {canManageRoles && currentPreset.isOverride && (
                <button
                  type="button"
                  onClick={() => onDeleteRole(currentPreset)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #fed7aa',
                    backgroundColor: '#fff7ed',
                    color: '#c2410c',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                  title="Reset role overrides back to factory default"
                >
                  <Trash2 size={13} />
                  <span>Reset to Default</span>
                </button>
              )}
              {canManageRoles && currentPreset.custom && !currentPreset.isOverride && (
                <button
                  type="button"
                  onClick={() => onDeleteRole(currentPreset)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.55rem',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                  title="Delete Custom Role Template"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-tab Switch: Role Capabilities vs Assigned Staff */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setActiveRightTab('capabilities')}
              style={{
                padding: '0.3rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeRightTab === 'capabilities' ? 'var(--primary-color, #2563eb)' : 'var(--bg-primary, #f1f5f9)',
                color: activeRightTab === 'capabilities' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Role Capabilities
            </button>
            <button
              type="button"
              onClick={() => setActiveRightTab('staff')}
              style={{
                padding: '0.3rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeRightTab === 'staff' ? 'var(--primary-color, #2563eb)' : 'var(--bg-primary, #f1f5f9)',
                color: activeRightTab === 'staff' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <span>Staff Members</span>
              <span style={{
                fontSize: '0.66rem',
                padding: '0.04rem 0.35rem',
                borderRadius: '8px',
                backgroundColor: activeRightTab === 'staff' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface, #e2e8f0)',
                color: activeRightTab === 'staff' ? '#fff' : 'var(--text-primary)'
              }}>
                {roleStats[currentPreset.key] || 0}
              </span>
            </button>
          </div>

          {/* Tab 1: Capabilities Overview */}
          {activeRightTab === 'capabilities' && (
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: '3px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>
              {/* Modules & Subpages Section */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>Modules & Pages Access</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>({moduleEntries.length} enabled)</span>
                </div>
                {moduleEntries.length === 0 ? (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.4rem' }}>
                    No specific modules enabled for this role.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.45rem' }}>
                    {moduleEntries.map(([key, val]) => {
                      const modConfig = MODULES_CONFIG.find(m => m.id === key);
                      const modLabel = modConfig?.label || key.replace(/_/g, ' ');
                      const activeSubs = val.sub_items
                        ? Object.entries(val.sub_items)
                            .filter(([, s]) => s === true || s?.view === true)
                            .map(([subKey]) => {
                              const subDef = modConfig?.subItems?.find(s => s.id === subKey);
                              return subDef?.label ? subDef.label.replace(/^[^\w\s]+/, '').trim() : subKey.replace(/_/g, ' ');
                            })
                        : [];

                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.15rem',
                            fontSize: '0.74rem',
                            color: '#059669',
                            backgroundColor: 'var(--bg-primary, #f8fafc)',
                            padding: '0.35rem 0.55rem',
                            borderRadius: '7px',
                            border: '1px solid var(--border-light)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{modLabel}</span>
                          </div>
                          {activeSubs.length > 0 && (
                            <div style={{ paddingLeft: '1.15rem', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                              {activeSubs.slice(0, 3).join(', ')}{activeSubs.length > 3 ? ` +${activeSubs.length - 3} more` : ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Operational Powers Section */}
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>Operational Privileges</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>({powerEntries.filter(([, val]) => Boolean(val)).length} active)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '0.35rem' }}>
                  {powerEntries.map(([key, val]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.72rem',
                        color: val ? '#059669' : '#94a3b8',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--bg-primary, #f8fafc)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)'
                      }}
                    >
                      <CheckCircle2 size={13} style={{ color: val ? '#10b981' : '#cbd5e1', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Assigned Staff Members */}
          {activeRightTab === 'staff' && (
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: '3px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem'
            }}>
              {/* Search Staff */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={searchUserQuery}
                  onChange={e => setSearchUserQuery(e.target.value)}
                  placeholder="Search staff members to customize permissions..."
                  style={{
                    width: '100%',
                    padding: '0.38rem 0.75rem 0.38rem 1.9rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary, #f8fafc)',
                    color: 'var(--text-primary)',
                    fontSize: '0.76rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Staff List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', padding: '0.75rem', textAlign: 'center' }}>
                    No staff members match your search.
                  </div>
                ) : (
                  filteredUsers.map(u => (
                    <div
                      key={u.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.65rem',
                        borderRadius: '7px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary, #f8fafc)',
                        fontSize: '0.76rem'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.emp_name || u.email}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                          {u.emp_designation || u.emp_department || 'Staff'}
                          {u.module_access?.role_template_name ? ` • Role: ${u.module_access.role_template_name}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                        {currentPreset.custom && canManageRoles && (
                          <button
                            type="button"
                            onClick={() => onAssignRoleToUser(u, currentPreset)}
                            disabled={assigningRoleUserId === u.user_id || u.role === 'customer' || checkIsMasterAdmin(u)}
                            style={{
                              padding: '0.2rem 0.55rem',
                              borderRadius: '5px',
                              border: 0,
                              backgroundColor: '#4f46e5',
                              color: '#fff',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              cursor: (assigningRoleUserId === u.user_id || u.role === 'customer' || checkIsMasterAdmin(u)) ? 'not-allowed' : 'pointer',
                              opacity: (assigningRoleUserId === u.user_id || u.role === 'customer' || checkIsMasterAdmin(u)) ? 0.5 : 1
                            }}
                          >
                            {assigningRoleUserId === u.user_id ? 'Assigning...' : 'Assign Role'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onManagePermissions(u)}
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '5px',
                            border: '1px solid #ddd6fe',
                            backgroundColor: '#f5f3ff',
                            color: '#7c3aed',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <Shield size={11} /> Edit Matrix
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
