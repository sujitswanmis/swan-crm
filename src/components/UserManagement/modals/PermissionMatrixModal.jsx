'use client';

import React, { useState, useEffect } from 'react';
import { X, Shield, Search, ChevronDown, ChevronRight, CheckSquare, Square, Save, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { MODULES_CONFIG } from '@/config/modulesConfig';
import { ROLE_PRESETS } from '../utils/rolePresets';
import { createClient } from '@/utils/supabase/client';

export default function PermissionMatrixModal({
  isOpen,
  onClose,
  user,
  onSave,
  saving = false
}) {
  const [accessForm, setAccessForm] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({
    General: true,
    Sales: true,
    Purchase: false,
    'Human Resource': false,
    System: false,
    Settings: false
  });
  const [expandedModules, setExpandedModules] = useState({});

  useEffect(() => {
    if (user && user.module_access) {
      setAccessForm({ ...user.module_access });
    } else {
      setAccessForm({});
    }
    setSearchQuery('');
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleModuleExpand = (modId) => {
    setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  const handleGlobalFlagChange = (flagKey, val) => {
    setAccessForm(prev => ({
      ...prev,
      [flagKey]: val
    }));
  };

  const handleApplyPreset = (presetKey) => {
    const preset = ROLE_PRESETS.find(p => p.key === presetKey);
    if (!preset) return;
    if (window.confirm(`Apply "${preset.name}" preset permissions to this user? This will update current selections.`)) {
      setAccessForm(JSON.parse(JSON.stringify(preset.presetData)));
    }
  };

  const handleModulePermissionChange = (modId, permType, val) => {
    setAccessForm(prev => {
      const currentMod = prev[modId] || {};
      const updatedMod = { ...currentMod, [permType]: val };
      
      // If turning on read/write/edit/export, ensure view is also on
      if (val && permType !== 'view') {
        updatedMod.view = true;
      }
      // If turning off view, turn off all perms
      if (!val && permType === 'view') {
        updatedMod.read = false;
        updatedMod.write = false;
        updatedMod.edit = false;
        updatedMod.export = false;
        updatedMod.delete = false;
      }

      return {
        ...prev,
        [modId]: updatedMod
      };
    });
  };

  const handleSubItemToggle = (modId, subItemId, val) => {
    setAccessForm(prev => {
      const currentMod = prev[modId] || {};
      const currentSubs = currentMod.sub_items || {};
      const newSubs = {
        ...currentSubs,
        [subItemId]: { ...(currentSubs[subItemId] || {}), view: val }
      };

      return {
        ...prev,
        [modId]: {
          ...currentMod,
          view: true,
          sub_items: newSubs
        }
      };
    });
  };

  const handleSelectAllByType = (permType, val) => {
    setAccessForm(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(mod => {
        const cur = updated[mod.id] || {};
        updated[mod.id] = {
          ...cur,
          [permType]: val,
          ...(val ? { view: true } : {})
        };
      });
      return updated;
    });
  };

  const handleSave = async () => {
    // Auto-sync assigned_steps for leads & recruiter from sub_items if present
    const updatedForm = { ...accessForm };
    if (updatedForm.leads && updatedForm.leads.sub_items) {
      updatedForm.leads.assigned_steps = Object.keys(updatedForm.leads.sub_items).filter(k => updatedForm.leads.sub_items[k]?.view === true);
    }
    if (updatedForm.recruiter && updatedForm.recruiter.sub_items) {
      updatedForm.recruiter.assigned_steps = Object.keys(updatedForm.recruiter.sub_items).filter(k => updatedForm.recruiter.sub_items[k]?.view === true);
    }

    onSave(user.user_id, updatedForm);
  };

  // Group modules by Category
  const categories = ['General', 'Sales', 'Purchase', 'Human Resource', 'System', 'Settings'];
  const filteredModules = MODULES_CONFIG.filter(mod => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesLabel = (mod.label || '').toLowerCase().includes(q);
    const matchesCat = (mod.category || '').toLowerCase().includes(q);
    const matchesSubs = mod.subItems?.some(s => (s.label || '').toLowerCase().includes(q));
    return matchesLabel || matchesCat || matchesSubs;
  });

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
        maxWidth: '960px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={22} style={{ color: '#7c3aed' }} />
              Permissions Matrix: {user.emp_name || user.email}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Configure role templates, global privileges, and granular CRUD permissions per module
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

        {/* Preset Selector & Quick Controls */}
        <div style={{
          padding: '0.85rem 1.75rem',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary, rgba(0,0,0,0.02))',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Sparkles size={14} style={{ color: '#d97706' }} />
              Role Preset:
            </span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyPreset(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
                fontWeight: 600
              }}
            >
              <option value="">-- Apply Predefined Role Template --</option>
              {ROLE_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Quick Select All Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.2rem' }}>Quick:</span>
            <button
              type="button"
              onClick={() => handleSelectAllByType('read', true)}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              All Read
            </button>
            <button
              type="button"
              onClick={() => handleSelectAllByType('write', true)}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              All Write
            </button>
            <button
              type="button"
              onClick={() => handleSelectAllByType('export', true)}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              All Export
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear all module permissions for this user?')) {
                  setAccessForm({});
                }
              }}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Global Security & Admin Privileges */}
        <div style={{
          padding: '0.85rem 1.75rem',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            System Privileges & Operational Rights
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
            {[
              { key: 'can_export_data', label: 'Export Data (CSV / Excel)' },
              { key: 'can_import_data', label: 'Import Data (CSV / Excel)' },
              { key: 'can_assign_leads', label: 'Assign / Transfer Leads' },
              { key: 'can_delete_leads', label: 'Delete Leads' },
              { key: 'can_claim_unassigned', label: 'Claim Unassigned Leads' },
              { key: 'can_bulk_actions', label: 'Perform Bulk Actions' },
              { key: 'can_access_audit_logs', label: 'Access Audit Logs' },
              { key: 'can_manage_settings', label: 'Manage System Settings' },
              { key: 'can_self_reset_password', label: 'Self Reset Password' }
            ].map(flag => (
              <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(accessForm[flag.key])}
                  onChange={e => handleGlobalFlagChange(flag.key, e.target.checked)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
                {flag.label}
              </label>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0.75rem 1.75rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search module or sub-item (e.g. leads, attendance, checklist, recruiter)..."
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2.1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-primary, #f8fafc)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem'
              }}
            />
          </div>
        </div>

        {/* Matrix Body - Categorized Accordion */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>
          {categories.map(cat => {
            const catMods = filteredModules.filter(m => m.category === cat);
            if (catMods.length === 0) return null;
            const isCatOpen = expandedCategories[cat] !== false;

            return (
              <div key={cat} style={{ marginBottom: '1.25rem', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
                {/* Category Header */}
                <div
                  onClick={() => toggleCategory(cat)}
                  style={{
                    padding: '0.65rem 1rem',
                    backgroundColor: 'var(--bg-primary, #f8fafc)',
                    borderBottom: isCatOpen ? '1px solid var(--border-light)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCatOpen ? <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />}
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{cat}</span>
                    <span style={{ fontSize: '0.72rem', backgroundColor: 'var(--border-light)', color: 'var(--text-secondary)', padding: '0.1rem 0.5rem', borderRadius: '10px' }}>
                      {catMods.length}
                    </span>
                  </div>
                </div>

                {/* Modules Table */}
                {isCatOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {catMods.map((mod, idx) => {
                      const modAccess = accessForm[mod.id] || {};
                      const isExpanded = expandedModules[mod.id] === true;
                      const hasSubItems = mod.subItems && mod.subItems.length > 0;

                      return (
                        <div
                          key={mod.id}
                          style={{
                            borderBottom: idx === catMods.length - 1 ? 'none' : '1px solid var(--border-light)',
                            backgroundColor: modAccess.view ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))'
                          }}
                        >
                          {/* Module Row */}
                          <div style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem'
                          }}>
                            {/* Module Name & Icon */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: '220px', flex: 1 }}>
                              {hasSubItems ? (
                                <button
                                  type="button"
                                  onClick={() => toggleModuleExpand(mod.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-secondary)' }}
                                >
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                              ) : (
                                <div style={{ width: '16px' }} />
                              )}
                              
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: modAccess.view ? 700 : 500, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(modAccess.view)}
                                  onChange={e => handleModulePermissionChange(mod.id, 'view', e.target.checked)}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                {mod.label}
                              </label>
                            </div>

                            {/* CRUD Switches */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: modAccess.view ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: modAccess.view ? 'pointer' : 'not-allowed' }}>
                                <input
                                  type="checkbox"
                                  disabled={!modAccess.view}
                                  checked={Boolean(modAccess.read)}
                                  onChange={e => handleModulePermissionChange(mod.id, 'read', e.target.checked)}
                                  style={{ width: '14px', height: '14px' }}
                                />
                                Read
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: modAccess.view ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: modAccess.view ? 'pointer' : 'not-allowed' }}>
                                <input
                                  type="checkbox"
                                  disabled={!modAccess.view}
                                  checked={Boolean(modAccess.write)}
                                  onChange={e => handleModulePermissionChange(mod.id, 'write', e.target.checked)}
                                  style={{ width: '14px', height: '14px' }}
                                />
                                Create
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: modAccess.view ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: modAccess.view ? 'pointer' : 'not-allowed' }}>
                                <input
                                  type="checkbox"
                                  disabled={!modAccess.view}
                                  checked={Boolean(modAccess.edit)}
                                  onChange={e => handleModulePermissionChange(mod.id, 'edit', e.target.checked)}
                                  style={{ width: '14px', height: '14px' }}
                                />
                                Edit
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: modAccess.view ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: modAccess.view ? 'pointer' : 'not-allowed' }}>
                                <input
                                  type="checkbox"
                                  disabled={!modAccess.view}
                                  checked={Boolean(modAccess.export)}
                                  onChange={e => handleModulePermissionChange(mod.id, 'export', e.target.checked)}
                                  style={{ width: '14px', height: '14px' }}
                                />
                                Export
                              </label>
                            </div>
                          </div>

                          {/* Sub-items Accordion */}
                          {hasSubItems && isExpanded && (
                            <div style={{
                              padding: '0.65rem 1rem 0.75rem 2.8rem',
                              backgroundColor: 'var(--bg-primary, #f1f5f9)',
                              borderTop: '1px dashed var(--border-light)',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                              gap: '0.5rem'
                            }}>
                              {mod.subItems.map(sub => {
                                const subVal = modAccess.sub_items?.[sub.id]?.view === true;
                                return (
                                  <label
                                    key={sub.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.45rem',
                                      fontSize: '0.76rem',
                                      color: 'var(--text-primary)',
                                      cursor: 'pointer',
                                      backgroundColor: 'var(--bg-surface)',
                                      padding: '0.35rem 0.6rem',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-light)'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={subVal}
                                      onChange={e => handleSubItemToggle(mod.id, sub.id, e.target.checked)}
                                      style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                                    />
                                    {sub.label}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
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

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{
              padding: '0.55rem 1.6rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#7c3aed',
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
            Save Permissions Matrix
          </button>
        </div>
      </div>
    </div>
  );
}
