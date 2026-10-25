'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Shield,
  Search,
  ChevronDown,
  ChevronRight,
  Save,
  Loader2,
  Sparkles,
  LockKeyhole,
  Info
} from 'lucide-react';
import { MODULES_CONFIG } from '@/config/modulesConfig';
import { ROLE_PRESETS } from '../utils/rolePresets';

const OPERATIONAL_POWERS = [
  { key: 'can_import_data', label: '📥 Import Leads Power', desc: 'Allows uploading and bulk importing CSV lead files into CRM' },
  { key: 'can_export_data', label: '📤 Export / Download Data Power', desc: 'Allows downloading CSV reports and exporting lead data' },
  { key: 'can_assign_leads', label: '👥 Lead Assignment Power', desc: 'Allows assigning and reallocating leads to team members' },
  { key: 'can_delete_leads', label: '🗑️ Delete Records & Leads Power', desc: 'Allows deleting leads from pipeline and report tables' },
  { key: 'can_claim_unassigned', label: '🎯 Claim Open Leads Power', desc: 'Allows taking ownership of unassigned leads from open pool' },
  { key: 'can_bulk_actions', label: '⚡ Bulk Operations Power', desc: 'Allows bulk status changes and multi-lead batch actions' },
  { key: 'can_view_all_companies', label: '🏢 Multi-Company Full Access', desc: 'Allows viewing leads and data across all company entities' },
  { key: 'can_self_reset_password', label: '🔑 Self Password Reset', desc: 'Allows self password reset via Email OTP on login screen' },
  { key: 'can_access_audit_logs', label: '📜 View Activity Audit Logs', desc: 'Allows viewing security audit logs and event history in Settings' },
  { key: 'can_manage_settings', label: '⚙️ Edit CRM Pipeline Config', desc: 'Allows modifying stages, sources, and system preferences' },
  { key: 'can_manage_column_data', label: '🛠️ Column Data Manager & Bulk Edit Power', desc: 'Allows bulk updating column values and find-and-replace across lead reports' }
];

const TABLE_COLUMNS = [
  { id: 'page', label: 'Module / Page / Sub-Page / Tab', width: 440, minWidth: 240 },
  { id: 'view', label: 'VIEW', width: 85, minWidth: 65 },
  { id: 'add', label: 'ADD', width: 85, minWidth: 65 },
  { id: 'edit', label: 'EDIT / SAVE', width: 105, minWidth: 80 },
  { id: 'delete', label: 'DELETE', width: 85, minWidth: 65 }
];
const COLUMN_WIDTHS_KEY = 'crm-permission-matrix-modal-column-widths';
const COLUMN_COUNT = TABLE_COLUMNS.length;

function readColumnWidths() {
  try {
    if (typeof window === 'undefined') return {};
    const stored = JSON.parse(window.localStorage.getItem(COLUMN_WIDTHS_KEY) || '{}');
    return Object.fromEntries(
      TABLE_COLUMNS.filter(c => Number.isFinite(stored[c.id]))
        .map(c => [c.id, Math.max(c.minWidth, Math.min(stored[c.id], 700))])
    );
  } catch {
    return {};
  }
}

function saveColumnWidths(widths) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths));
    }
  } catch {
    // Graceful fallback
  }
}

export default function PermissionMatrixModal({
  isOpen,
  onClose,
  user,
  onSave,
  saving = false,
  customRoles = []
}) {
  const [accessForm, setAccessForm] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState({});
  const [error, setError] = useState('');

  // Column Resizing State
  const [columnWidths, setColumnWidths] = useState(readColumnWidths);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [hoveredColumn, setHoveredColumn] = useState(null);
  const resizingRef = useRef(null);
  const widthsRef = useRef(columnWidths);

  useEffect(() => {
    if (user && user.module_access) {
      setAccessForm({ ...user.module_access });
    } else {
      setAccessForm({});
    }
    setSearchQuery('');
    setError('');
  }, [user, isOpen]);

  // Available Presets (exclude Master Admin for standard accounts)
  const availablePresets = useMemo(() => {
    return ROLE_PRESETS.filter(p => p.key !== 'master_admin');
  }, []);

  // Only role-assignable modules for staff accounts
  const assignableModules = useMemo(() => {
    return MODULES_CONFIG.filter(m => m.roleAssignable !== false && m.masterAdminOnly !== true && m.category !== 'Master Admin');
  }, []);

  // Filter modules based on search
  const query = searchQuery.trim().toLowerCase();
  const visibleModules = useMemo(() => {
    if (!query) return assignableModules;
    return assignableModules.filter(module => {
      const matchLabel = (module.label || '').toLowerCase().includes(query);
      const matchCat = (module.category || '').toLowerCase().includes(query);
      const matchSubs = (module.subItems || []).some(s => (s.label || '').toLowerCase().includes(query));
      return matchLabel || matchCat || matchSubs;
    });
  }, [assignableModules, query]);

  const categories = useMemo(() => {
    const defaultOrder = [
      'General',
      'AI Chatbot',
      'Call Center',
      'Sales',
      'Purchase',
      'Human Resource',
      'User Management',
      'Communication Center',
      'Workflow Builder',
      'System',
      'Settings'
    ];
    const presentCategories = [...new Set(visibleModules.map(m => m.category || 'General'))];
    return defaultOrder.filter(c => presentCategories.includes(c)).concat(
      presentCategories.filter(c => !defaultOrder.includes(c))
    );
  }, [visibleModules]);

  const tableWidth = TABLE_COLUMNS.reduce((sum, c) => sum + (columnWidths[c.id] || c.width), 0);

  if (!isOpen || !user) return null;

  // Expand / Collapse helper
  const isExpanded = (id, children = []) => {
    return expandedModules[id] ?? (query.length > 0 && children.some(c => (c.label || '').toLowerCase().includes(query)));
  };

  const toggleExpanded = (id, children = []) => {
    setExpandedModules(prev => {
      const autoExp = query.length > 0 && children.some(c => (c.label || '').toLowerCase().includes(query));
      return { ...prev, [id]: !(prev[id] ?? autoExp) };
    });
  };

  // Column Resizing Handlers
  const setColumnWidth = (column, width) => {
    const next = { ...widthsRef.current, [column.id]: Math.max(column.minWidth, Math.min(width, 700)) };
    widthsRef.current = next;
    setColumnWidths(next);
  };

  const startResize = (event, column) => {
    event.preventDefault();
    resizingRef.current = {
      id: column.id,
      startX: event.clientX,
      startWidth: widthsRef.current[column.id] || column.width
    };
    setResizingColumn(column.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event, column) => {
    const active = resizingRef.current;
    if (!active || active.id !== column.id) return;
    setColumnWidth(column, active.startWidth + event.clientX - active.startX);
  };

  const stopResize = () => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    setResizingColumn(null);
    saveColumnWidths(widthsRef.current);
  };

  const resetColumnWidth = column => {
    const next = { ...widthsRef.current };
    delete next[column.id];
    widthsRef.current = next;
    setColumnWidths(next);
    saveColumnWidths(next);
  };

  // Permission resolution helpers
  const getModulePerms = (moduleId) => {
    const m = accessForm[moduleId];
    if (!m) return { view: false, add: false, edit: false, delete: false };
    if (m === true) return { view: true, add: true, edit: true, delete: false };
    if (m.view === false) return { view: false, add: false, edit: false, delete: false };
    return {
      view: true,
      add: m.add ?? m.write ?? true,
      edit: m.edit ?? true,
      delete: m.delete === true
    };
  };

  const getSubItemPerms = (moduleId, subId) => {
    const parentPerms = getModulePerms(moduleId);
    if (!parentPerms.view) return { view: false, add: false, edit: false, delete: false };
    const m = accessForm[moduleId] || {};
    const subs = m.sub_items || {};

    // Explicit sub-item configuration in module_access
    if (subs && typeof subs === 'object' && subs[subId] !== undefined) {
      const sub = subs[subId];
      if (sub === false || sub.view === false) {
        return { view: false, add: false, edit: false, delete: false };
      }
      if (sub === true) {
        return { view: true, add: parentPerms.add, edit: parentPerms.edit, delete: parentPerms.delete };
      }
      return {
        view: true,
        add: sub.add !== false && parentPerms.add,
        edit: sub.edit !== false && parentPerms.edit,
        delete: sub.delete === true
      };
    }

    // Support assigned_steps (e.g. leads pipeline stages or recruiter steps)
    if (Array.isArray(m.assigned_steps) && !m.is_manager) {
      const isAssigned = m.assigned_steps.includes(subId);
      if (!isAssigned) {
        return { view: false, add: false, edit: false, delete: false };
      }
    }

    // Default: Inherit parent module's active permissions (matching TeamManagement pattern)
    return { ...parentPerms };
  };

  // Toggle Handlers
  const handleToggleModulePerm = (module, perm) => {
    if (module.roleAssignable === false || module.masterAdminOnly === true) return;
    setAccessForm(prev => {
      const current = prev[module.id] || {};
      const currentPerms = getModulePerms(module.id);
      const nextVal = !currentPerms[perm];

      if (perm === 'view') {
        if (!nextVal) {
          const nextState = { ...prev };
          delete nextState[module.id];
          return nextState;
        } else {
          const updated = {
            view: true,
            read: true,
            write: current.write ?? true,
            add: current.add ?? true,
            edit: current.edit ?? true,
            delete: current.delete ?? false
          };
          if (module.subItems?.length) {
            setExpandedModules(e => ({ ...e, [module.id]: true }));
            const defaultSubs = {};
            module.subItems.forEach(s => {
              defaultSubs[s.id] = { view: true, add: true, edit: true, delete: false };
            });
            updated.sub_items = defaultSubs;
          }
          delete updated.role_template_id;
          delete updated.role_template_name;
          return { ...prev, [module.id]: updated };
        }
      } else {
        const updated = {
          ...current,
          [perm]: nextVal,
          view: true,
          read: true
        };
        if (perm === 'add') updated.write = nextVal;
        delete updated.role_template_id;
        delete updated.role_template_name;
        return { ...prev, [module.id]: updated };
      }
    });
  };

  const handleToggleSubItemPerm = (moduleId, subId, perm) => {
    setAccessForm(prev => {
      const parent = prev[moduleId] || { view: true, read: true, write: true, add: true, edit: true };
      const currentSubs = parent.sub_items || {};
      const currentSubPerms = getSubItemPerms(moduleId, subId);
      const nextVal = !currentSubPerms[perm];

      let updatedSub = { ...currentSubPerms, [perm]: nextVal };
      if (perm === 'view') {
        if (!nextVal) {
          updatedSub = { view: false, add: false, edit: false, delete: false };
        } else {
          updatedSub.view = true;
        }
      } else {
        if (nextVal) {
          updatedSub.view = true;
        }
      }

      return {
        ...prev,
        [moduleId]: {
          ...parent,
          view: true,
          read: true,
          sub_items: {
            ...currentSubs,
            [subId]: updatedSub
          }
        }
      };
    });
  };

  const handleSelectAllSubItems = (module, perm, value) => {
    setAccessForm(prev => {
      const parent = prev[module.id] || { view: true, read: true, write: true, add: true, edit: true };
      const newSubs = { ...(parent.sub_items || {}) };
      (module.subItems || []).forEach(sub => {
        const cur = newSubs[sub.id] || {};
        newSubs[sub.id] = {
          ...cur,
          [perm]: value,
          ...(value && perm !== 'view' ? { view: true } : {})
        };
      });
      return {
        ...prev,
        [module.id]: {
          ...parent,
          view: value || parent.view,
          read: true,
          sub_items: newSubs
        }
      };
    });
  };

  const handleToggleManagerLevel = (moduleId) => {
    setAccessForm(prev => {
      const cur = prev[moduleId] || { view: true, read: true, write: true, add: true, edit: true };
      return {
        ...prev,
        [moduleId]: {
          ...cur,
          view: true,
          is_manager: !cur.is_manager
        }
      };
    });
  };

  // Global Powers Toggle
  const handleTogglePower = (key) => {
    setAccessForm(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Quick Presets Application
  const handleApplyPreset = (presetKey) => {
    const preset = availablePresets.find(p => p.key === presetKey);
    const customRole = customRoles.find(r => `custom:${r.id}` === presetKey);
    const selectedRole = preset || customRole;
    if (!selectedRole) return;

    if (window.confirm(`Apply "${selectedRole.name}" preset permissions to this user? This will update current selections.`)) {
      setAccessForm(prev => {
        const next = { ...prev };
        // Clean out module keys and global powers, keep profile metadata
        MODULES_CONFIG.forEach(mod => { delete next[mod.id]; });
        OPERATIONAL_POWERS.forEach(p => { delete next[p.key]; });
        delete next.can_import_export;
        delete next.role_template_id;
        delete next.role_template_name;

        const roleData = structuredClone(customRole ? customRole.permissions : preset.presetData);
        delete roleData.is_master_admin;

        // Ensure all sub-items are auto-populated if module is view:true in preset
        MODULES_CONFIG.forEach(mod => {
          if (roleData[mod.id]?.view && mod.subItems?.length && !roleData[mod.id].sub_items) {
            const subs = {};
            mod.subItems.forEach(s => {
              subs[s.id] = { view: true, add: false, edit: false, delete: false };
            });
            roleData[mod.id].sub_items = subs;
          }
        });

        return {
          ...next,
          ...roleData,
          ...(customRole ? { role_template_id: customRole.id, role_template_name: customRole.name } : {})
        };
      });
    }
  };

  // Quick Batch Actions
  const handleGrantAllView = () => {
    setAccessForm(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(m => {
        if (m.roleAssignable === false || m.masterAdminOnly === true) return;
        const cur = updated[m.id] || {};
        const subItems = {};
        (m.subItems || []).forEach(s => {
          subItems[s.id] = { view: true, add: false, edit: false, delete: false };
        });
        updated[m.id] = {
          ...cur,
          view: true,
          read: true,
          add: false,
          write: false,
          edit: false,
          delete: false,
          ...(m.subItems?.length ? { sub_items: subItems } : {})
        };
      });
      return updated;
    });
  };

  const handleGrantFullAccess = () => {
    setAccessForm(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(m => {
        if (m.roleAssignable === false || m.masterAdminOnly === true) return;
        const subItems = {};
        (m.subItems || []).forEach(s => {
          subItems[s.id] = { view: true, add: true, edit: true, delete: false };
        });
        updated[m.id] = {
          view: true,
          read: true,
          add: true,
          write: true,
          edit: true,
          delete: false,
          ...(m.subItems?.length ? { sub_items: subItems } : {})
        };
      });
      OPERATIONAL_POWERS.forEach(p => {
        if (p.key !== 'can_manage_settings') updated[p.key] = true;
      });
      return updated;
    });
  };

  const handleSetReadOnly = () => {
    setAccessForm(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(m => {
        if (updated[m.id]) {
          const subs = updated[m.id].sub_items || {};
          const newSubs = {};
          Object.keys(subs).forEach(k => {
            newSubs[k] = { ...subs[k], add: false, edit: false, delete: false };
          });
          updated[m.id] = {
            ...updated[m.id],
            add: false,
            write: false,
            edit: false,
            delete: false,
            sub_items: newSubs
          };
        }
      });
      return updated;
    });
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all assigned permissions for this user?')) {
      setAccessForm(prev => {
        const next = { ...prev };
        MODULES_CONFIG.forEach(m => { delete next[m.id]; });
        OPERATIONAL_POWERS.forEach(p => { delete next[p.key]; });
        return next;
      });
    }
  };

  const handleSave = async () => {
    setError('');
    // Auto-sync assigned_steps for leads & recruiter from sub_items if present
    const updatedForm = { ...accessForm };
    if (updatedForm.leads && updatedForm.leads.sub_items) {
      updatedForm.leads.assigned_steps = Object.keys(updatedForm.leads.sub_items).filter(k => updatedForm.leads.sub_items[k]?.view === true);
    }
    if (updatedForm.recruiter && updatedForm.recruiter.sub_items) {
      updatedForm.recruiter.assigned_steps = Object.keys(updatedForm.recruiter.sub_items).filter(k => updatedForm.recruiter.sub_items[k]?.view === true);
    }

    try {
      await onSave(user.user_id, updatedForm);
    } catch (saveErr) {
      setError(saveErr.message || 'Could not save permissions.');
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-matrix-title"
        style={{
          width: 'min(1160px, 98vw)',
          height: '92vh',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)'
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-surface)'
          }}
        >
          <div>
            <h3
              id="permission-matrix-title"
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem'
              }}
            >
              <Shield size={22} style={{ color: '#7c3aed' }} />
              Manage Access: {user.emp_name || user.email}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {user.email} • {user.emp_department || 'No Department'} ({user.emp_designation || user.role})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            style={{
              border: 0,
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            background: 'var(--bg-default)'
          }}
        >
          {error && (
            <div
              role="alert"
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Info size={16} />
              {error}
            </div>
          )}

          {/* Section 1: Additional System & Operational Powers (11 Powers Grid) */}
          <div
            style={{
              flexShrink: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '0.75rem 1.25rem',
                background: 'var(--bg-primary)',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                ⚡ Additional System & Operational Powers
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Global action overrides & privileges
              </span>
            </div>

            <div
              style={{
                padding: '1rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                gap: '0.85rem'
              }}
            >
              {OPERATIONAL_POWERS.map(power => {
                const isActivePower = accessForm[power.key] === true;
                return (
                  <label
                    key={power.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.7rem',
                      padding: '0.7rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isActivePower ? '#7c3aed' : 'var(--border-light)',
                      background: isActivePower ? '#f5f3ff' : 'var(--bg-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isActivePower}
                      onChange={() => handleTogglePower(power.key)}
                      style={{
                        width: '1.1rem',
                        height: '1.1rem',
                        accentColor: '#7c3aed',
                        marginTop: '0.15rem',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {power.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: '1.3' }}>
                        {power.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 2: Granular Module Access Matrix */}
          <div
            style={{
              flexShrink: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '240px' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <Search
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary)'
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search page, sub-page, tab, or department..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Preset Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={15} style={{ color: '#d97706' }} />
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleApplyPreset(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">— Apply Role Preset —</option>
                    {availablePresets.map(preset => (
                      <option key={preset.key} value={preset.key}>
                        {preset.name}
                      </option>
                    ))}
                    {customRoles.map(role => (
                      <option key={role.id} value={`custom:${role.id}`}>
                        {role.name} (Custom)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Batch Actions */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleGrantAllView}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid #bfdbfe',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    color: '#0284c7',
                    fontWeight: 600
                  }}
                >
                  + Grant All VIEW
                </button>
                <button
                  type="button"
                  onClick={handleGrantFullAccess}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid #bbf7d0',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    color: '#16a34a',
                    fontWeight: 600
                  }}
                >
                  + Grant Full Access
                </button>
                <button
                  type="button"
                  onClick={handleSetReadOnly}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid #fef08a',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    color: '#d97706',
                    fontWeight: 600
                  }}
                >
                  Set Read-Only
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid #fecaca',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    color: '#dc2626',
                    fontWeight: 600
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Interactive Resizable Table */}
            <div style={{ overflow: 'auto', maxHeight: 'min(620px, 62vh)', minHeight: '340px' }}>
              <table
                style={{
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  tableLayout: 'fixed',
                  width: tableWidth,
                  fontSize: '0.82rem'
                }}
              >
                <colgroup>
                  {TABLE_COLUMNS.map(column => (
                    <col key={column.id} style={{ width: columnWidths[column.id] || column.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map(column => (
                      <th
                        key={column.id}
                        scope="col"
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 3,
                          padding: '0.7rem 0.8rem',
                          paddingRight: '1.2rem',
                          textAlign: column.id === 'page' ? 'left' : 'center',
                          background: 'var(--bg-primary)',
                          borderBottom: '1px solid var(--border-light)',
                          borderRight: '1px solid var(--border-light)',
                          whiteSpace: 'nowrap',
                          fontWeight: 700,
                          color:
                            column.id === 'view' ? '#0284c7' :
                            column.id === 'add' ? '#16a34a' :
                            column.id === 'edit' ? '#d97706' :
                            column.id === 'delete' ? '#dc2626' : 'var(--text-primary)'
                        }}
                      >
                        {column.label}
                        <span
                          role="separator"
                          aria-label={`Resize ${column.label} column`}
                          aria-orientation="vertical"
                          aria-valuemin={column.minWidth}
                          aria-valuemax={700}
                          aria-valuenow={columnWidths[column.id] || column.width}
                          tabIndex={0}
                          onPointerDown={e => startResize(e, column)}
                          onPointerMove={e => moveResize(e, column)}
                          onPointerUp={stopResize}
                          onPointerCancel={stopResize}
                          onLostPointerCapture={stopResize}
                          onDoubleClick={() => resetColumnWidth(column)}
                          onPointerEnter={() => setHoveredColumn(column.id)}
                          onPointerLeave={() => setHoveredColumn(null)}
                          onKeyDown={e => {
                            if (e.key === 'Home') {
                              e.preventDefault();
                              resetColumnWidth(column);
                            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                              e.preventDefault();
                              const delta = e.key === 'ArrowRight' ? 10 : -10;
                              setColumnWidth(column, (widthsRef.current[column.id] || column.width) + delta);
                              saveColumnWidths(widthsRef.current);
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            height: '100%',
                            width: '12px',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <span
                            style={{
                              height: '65%',
                              width: '3px',
                              borderRadius: '3px',
                              background:
                                resizingColumn === column.id || hoveredColumn === column.id
                                  ? 'var(--accent-color, #2563eb)'
                                  : 'var(--border-light)'
                            }}
                          />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map(category => {
                    const catModules = visibleModules.filter(m => (m.category || 'General') === category);
                    if (catModules.length === 0) return null;

                    return (
                      <React.Fragment key={category}>
                        <tr>
                          <td
                            colSpan={COLUMN_COUNT}
                            style={{
                              padding: '0.6rem 1rem',
                              fontWeight: 700,
                              background: 'var(--bg-primary)',
                              borderBottom: '1px solid var(--border-light)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {category === 'General'
                              ? 'Core Features & Dashboards'
                              : ['AI Chatbot', 'Call Center', 'Communication Center', 'Workflow Builder', 'Settings'].includes(category)
                              ? category
                              : `${category} Department`}
                          </td>
                        </tr>

                        {catModules.map(module => {
                          const mPerms = getModulePerms(module.id);
                          const locked = module.roleAssignable === false || module.masterAdminOnly === true;
                          // Real functional sub-items only
                          const children = module.subItems || [];
                          const hasSubs = children.length > 0;
                          const expanded = isExpanded(module.id, children);
                          const isSpecialManager = module.id === 'leads' || module.id === 'recruiter';
                          const mAccess = accessForm[module.id] || {};

                          return (
                            <React.Fragment key={module.id}>
                              <tr
                                style={{
                                  background: mPerms.view ? 'var(--nav-active-bg, #eff6ff)' : 'var(--bg-surface)',
                                  transition: 'background-color 0.15s ease'
                                }}
                              >
                                {/* Module Name / Expand Toggle */}
                                <td
                                  style={{
                                    padding: '0.6rem 0.8rem',
                                    borderBottom: '1px solid var(--border-light)',
                                    overflowWrap: 'anywhere'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {hasSubs ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpanded(module.id, children)}
                                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${module.label} tabs`}
                                        aria-expanded={expanded}
                                        style={{
                                          border: 0,
                                          background: 'transparent',
                                          color: 'var(--text-secondary)',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          padding: '0.15rem'
                                        }}
                                      >
                                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                      </button>
                                    ) : (
                                      <span style={{ width: '18px', flexShrink: 0 }} />
                                    )}

                                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: mPerms.view ? 700 : 500, color: 'var(--text-primary)' }}>
                                        {module.label}
                                      </span>
                                      {hasSubs && (
                                        <span
                                          style={{
                                            fontSize: '0.7rem',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '10px',
                                            background: 'var(--border-light)',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 600
                                          }}
                                        >
                                          {children.length} Tabs
                                        </span>
                                      )}
                                      {locked && (
                                        <span style={{ fontSize: '0.72rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                          <LockKeyhole size={11} /> {module.roleRestrictionLabel || 'Master Admin only'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* VIEW Checkbox */}
                                <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                  <input
                                    type="checkbox"
                                    checked={mPerms.view}
                                    disabled={locked}
                                    onChange={() => handleToggleModulePerm(module, 'view')}
                                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#0284c7', cursor: locked ? 'not-allowed' : 'pointer' }}
                                  />
                                </td>

                                {/* ADD Checkbox */}
                                <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                  {module.viewOnly || locked ? (
                                    <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={mPerms.add}
                                      disabled={!mPerms.view}
                                      onChange={() => handleToggleModulePerm(module, 'add')}
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#16a34a', cursor: !mPerms.view ? 'not-allowed' : 'pointer' }}
                                    />
                                  )}
                                </td>

                                {/* EDIT Checkbox */}
                                <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                  {module.viewOnly || locked ? (
                                    <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={mPerms.edit}
                                      disabled={!mPerms.view}
                                      onChange={() => handleToggleModulePerm(module, 'edit')}
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#d97706', cursor: !mPerms.view ? 'not-allowed' : 'pointer' }}
                                    />
                                  )}
                                </td>

                                {/* DELETE Checkbox */}
                                <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                  {module.viewOnly || locked ? (
                                    <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={mPerms.delete}
                                      disabled={!mPerms.view}
                                      onChange={() => handleToggleModulePerm(module, 'delete')}
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#dc2626', cursor: !mPerms.view ? 'not-allowed' : 'pointer' }}
                                    />
                                  )}
                                </td>
                              </tr>

                              {/* Special Override Row for Leads / Recruiter */}
                              {isSpecialManager && mPerms.view && (
                                <tr style={{ background: 'var(--bg-surface)' }}>
                                  <td colSpan={COLUMN_COUNT} style={{ padding: '0.4rem 1rem 0.4rem 2.5rem', borderBottom: '1px dashed var(--border-light)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#0369a1', fontWeight: 600, fontSize: '0.8rem' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!mAccess.is_manager}
                                        onChange={() => handleToggleManagerLevel(module.id)}
                                        style={{ accentColor: '#0369a1' }}
                                      />
                                      Full Manager / Supervisor Override (Unrestricted access across all stages & pipeline teams)
                                    </label>
                                  </td>
                                </tr>
                              )}

                              {/* Sub-items / Sub-pages nested rows */}
                              {hasSubs && expanded && (
                                <>
                                  {/* Quick Sub-tab action row */}
                                  <tr style={{ background: 'var(--bg-primary)' }}>
                                    <td colSpan={COLUMN_COUNT} style={{ padding: '0.4rem 1rem 0.4rem 2.5rem', borderBottom: '1px solid var(--border-light)' }}>
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.73rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Quick Tab Toggles:</span>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectAllSubItems(module, 'view', true)}
                                          style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}
                                        >
                                          All View ON
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectAllSubItems(module, 'view', false)}
                                          style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#be123c', cursor: 'pointer' }}
                                        >
                                          All View OFF
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectAllSubItems(module, 'edit', true)}
                                          style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #fef08a', background: '#fefce8', color: '#a16207', cursor: 'pointer' }}
                                        >
                                          All Edit ON
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectAllSubItems(module, 'delete', true)}
                                          style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}
                                        >
                                          All Delete ON
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {children.map(sub => {
                                    const subPerms = getSubItemPerms(module.id, sub.id);
                                    const isSubViewOnly = sub.id === 'lead_dashboard' || sub.id === 'hourly_work' || module.viewOnly;

                                    return (
                                      <tr
                                        key={sub.id}
                                        style={{
                                          background: subPerms.view ? 'var(--bg-surface)' : 'var(--bg-primary)'
                                        }}
                                      >
                                        <td
                                          style={{
                                            padding: '0.45rem 0.8rem 0.45rem 2.8rem',
                                            borderBottom: '1px solid var(--border-light)',
                                            color: subPerms.view ? 'var(--text-primary)' : 'var(--text-secondary)'
                                          }}
                                        >
                                          ↳ {sub.label}
                                        </td>
                                        <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                          <input
                                            type="checkbox"
                                            checked={subPerms.view}
                                            disabled={!mPerms.view}
                                            onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'view')}
                                            style={{ width: '1rem', height: '1rem', accentColor: '#0284c7', cursor: !mPerms.view ? 'not-allowed' : 'pointer' }}
                                          />
                                        </td>
                                        <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                          {isSubViewOnly ? (
                                            <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                          ) : (
                                            <input
                                              type="checkbox"
                                              checked={subPerms.add}
                                              disabled={!subPerms.view}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'add')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#16a34a', cursor: !subPerms.view ? 'not-allowed' : 'pointer' }}
                                            />
                                          )}
                                        </td>
                                        <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                          {isSubViewOnly ? (
                                            <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                          ) : (
                                            <input
                                              type="checkbox"
                                              checked={subPerms.edit}
                                              disabled={!subPerms.view}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'edit')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#d97706', cursor: !subPerms.view ? 'not-allowed' : 'pointer' }}
                                            />
                                          )}
                                        </td>
                                        <td style={{ textAlign: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                          {isSubViewOnly ? (
                                            <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                                          ) : (
                                            <input
                                              type="checkbox"
                                              checked={subPerms.delete}
                                              disabled={!subPerms.view}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'delete')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#dc2626', cursor: !subPerms.view ? 'not-allowed' : 'pointer' }}
                                            />
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-surface)'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
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
              background: '#7c3aed',
              color: '#ffffff',
              cursor: saving ? 'wait' : 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)'
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Permissions Matrix
          </button>
        </div>
      </div>
    </div>
  );
}
