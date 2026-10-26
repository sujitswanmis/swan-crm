'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Shield,
  ShieldPlus,
  Loader2,
  Search,
  LockKeyhole,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Users,
  CheckCircle2,
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
  { id: 'edit', label: 'EDIT / SAVE', width: 115, minWidth: 95 },
  { id: 'delete', label: 'DELETE', width: 85, minWidth: 65 }
];
const COLUMN_WIDTHS_KEY = 'crm-role-template-modal-column-widths';
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

export default function RoleTemplateModal({ onClose, onSave, saving = false, users = [], initialRole = null }) {
  const isEdit = Boolean(initialRole?.id);
  const [name, setName] = useState(initialRole?.name || '');
  const [description, setDescription] = useState(initialRole?.description || '');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [permissions, setPermissions] = useState(() => {
    if (initialRole?.presetData) return structuredClone(initialRole.presetData);
    if (initialRole?.permissions) return structuredClone(initialRole.permissions);
    return {};
  });
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState(() => {
    const perms = initialRole?.presetData || initialRole?.permissions || {};
    const initialExpanded = {};
    Object.keys(perms).forEach(k => {
      if (perms[k]?.sub_items && Object.values(perms[k].sub_items).some(s => s?.view)) {
        initialExpanded[k] = true;
      }
    });
    return initialExpanded;
  });
  const [error, setError] = useState('');

  // Column Resizing State
  const [columnWidths, setColumnWidths] = useState(readColumnWidths);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [hoveredColumn, setHoveredColumn] = useState(null);
  const resizingRef = useRef(null);
  const widthsRef = useRef(columnWidths);

  // Available Presets (exclude Master Admin since custom roles are for staff members)
  const availablePresets = useMemo(() => {
    return ROLE_PRESETS.filter(p => p.key !== 'master_admin');
  }, []);

  // Only role-assignable modules for staff templates
  const assignableModules = useMemo(() => {
    return MODULES_CONFIG.filter(m => m.roleAssignable !== false && m.masterAdminOnly !== true && m.category !== 'Master Admin');
  }, []);

  // Filter modules based on search
  const query = search.trim().toLowerCase();
  const visibleModules = useMemo(() => {
    if (!query) return assignableModules;
    return assignableModules.filter(module => {
      const matchLabel = (module.label || '').toLowerCase().includes(query);
      const matchCat = (module.category || '').toLowerCase().includes(query);
      const matchSubs = (module.subItems || []).some(s => (s.label || '').toLowerCase().includes(query));
      const matchTabs = (module.roleDisplayTabs || []).some(t => (t.label || '').toLowerCase().includes(query));
      return matchLabel || matchCat || matchSubs || matchTabs;
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

  // Eligible Staff members for Role-wise assignment
  const eligibleStaff = useMemo(() => {
    const uq = userSearch.trim().toLowerCase();
    return (users || []).filter(u => {
      if (u.role === 'customer' || u.emp_status === 'Trash') return false;
      if (String(u.role || '').toLowerCase() === 'masteradmin' || String(u.emp_id || '').toUpperCase() === 'MASTERADMIN') return false;
      if (!uq) return true;
      const name = (u.emp_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const empId = (u.emp_id || '').toLowerCase();
      const dept = (u.emp_department || '').toLowerCase();
      return name.includes(uq) || email.includes(uq) || empId.includes(uq) || dept.includes(uq);
    });
  }, [users, userSearch]);

  const tableWidth = TABLE_COLUMNS.reduce((sum, c) => sum + (columnWidths[c.id] || c.width), 0);

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
    const m = permissions[moduleId];
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
    const m = permissions[moduleId] || {};
    const subs = m.sub_items || {};
    const sub = subs[subId];
    if (!sub) return { view: false, add: false, edit: false, delete: false };
    if (sub === true) return { view: true, add: parentPerms.add, edit: parentPerms.edit, delete: parentPerms.delete };
    if (sub.view === false) return { view: false, add: false, edit: false, delete: false };
    return {
      view: true,
      add: (sub.add ?? true) && parentPerms.add,
      edit: (sub.edit ?? true) && parentPerms.edit,
      delete: sub.delete === true
    };
  };

  // Permission Toggle Handlers
  const handleToggleModulePerm = (module, perm) => {
    if (module.roleAssignable === false) return;
    setPermissions(prev => {
      const current = prev[module.id] || {};
      const currentPerms = getModulePerms(module.id);
      const nextVal = !currentPerms[perm];

      let updated = { ...current };
      if (perm === 'view') {
        if (!nextVal) {
          // Disabling View disables all and unchecks sub-items
          delete prev[module.id];
          return { ...prev };
        } else {
          updated = {
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
        }
      } else {
        updated = {
          ...current,
          [perm]: nextVal,
          view: true,
          read: true
        };
        if (perm === 'add') updated.write = nextVal;
      }

      return { ...prev, [module.id]: updated };
    });
  };

  const handleToggleSubItemPerm = (moduleId, subId, perm) => {
    setPermissions(prev => {
      const parent = prev[moduleId] || { view: true, read: true, write: true, add: true, edit: true };
      const currentSubs = parent.sub_items || {};
      const curSub = currentSubs[subId] || { view: false };
      const nextVal = !curSub[perm];

      let updatedSub = { ...curSub };
      if (perm === 'view') {
        if (!nextVal) {
          updatedSub = { view: false, add: false, edit: false, delete: false };
        } else {
          updatedSub = { view: true, add: curSub.add ?? true, edit: curSub.edit ?? true, delete: curSub.delete ?? false };
        }
      } else {
        updatedSub = { ...curSub, [perm]: nextVal, view: true };
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
    setPermissions(prev => {
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
    setPermissions(prev => {
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
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Quick Presets Application
  const handleApplyPreset = (presetKey) => {
    const preset = availablePresets.find(p => p.key === presetKey);
    if (!preset) return;
    setSelectedPresetKey(presetKey);

    const presetData = structuredClone(preset.presetData);
    delete presetData.is_master_admin;

    // Ensure all sub-items are auto-populated if module is view:true in preset
    MODULES_CONFIG.forEach(mod => {
      if (presetData[mod.id]?.view && mod.subItems?.length && !presetData[mod.id].sub_items) {
        const subs = {};
        mod.subItems.forEach(s => {
          subs[s.id] = { view: true, add: false, edit: false, delete: false };
        });
        presetData[mod.id].sub_items = subs;
      }
    });

    setPermissions(presetData);
    if (!name) setName(preset.name);
    if (!description) setDescription(preset.description);
  };

  // Quick Batch Actions
  const handleGrantAllView = () => {
    setPermissions(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(m => {
        if (m.roleAssignable === false) return;
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
    setPermissions(prev => {
      const updated = { ...prev };
      MODULES_CONFIG.forEach(m => {
        if (m.roleAssignable === false) return;
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
      // Also grant standard global powers
      OPERATIONAL_POWERS.forEach(p => {
        if (p.key !== 'can_manage_settings') updated[p.key] = true;
      });
      return updated;
    });
  };

  const handleSetReadOnly = () => {
    setPermissions(prev => {
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
    if (window.confirm('Clear all selected permissions?')) {
      setPermissions({});
    }
  };

  // Staff Assignment Selection Handlers
  const handleToggleUserSelection = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllStaff = () => {
    setSelectedUserIds(eligibleStaff.map(u => u.user_id));
  };

  const handleDeselectAllStaff = () => {
    setSelectedUserIds([]);
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 60) {
      setError('Role name must be between 2 and 60 characters.');
      return;
    }

    // Check module selection
    const activeModuleKeys = Object.keys(permissions).filter(k => {
      const m = MODULES_CONFIG.find(def => def.id === k);
      return m && permissions[k]?.view === true;
    });

    if (activeModuleKeys.length === 0) {
      setError('Enable View access for at least one module.');
      return;
    }

    // Check that sub-items are selected for modules that have them
    for (const modId of activeModuleKeys) {
      const def = MODULES_CONFIG.find(m => m.id === modId);
      if (def?.subItems?.length) {
        const subs = permissions[modId]?.sub_items || {};
        const hasAnySub = Object.values(subs).some(s => s?.view === true);
        if (!hasAnySub) {
          setError(`Select at least one subpage or tab for ${def.label}.`);
          setExpandedModules(exp => ({ ...exp, [modId]: true }));
          return;
        }
      }
    }

    // Prepare clean permissions object
    const finalPermissions = {};
    // 1. Global powers
    OPERATIONAL_POWERS.forEach(p => {
      if (permissions[p.key] === true) {
        finalPermissions[p.key] = true;
      }
    });

    // 2. Module permissions
    activeModuleKeys.forEach(modId => {
      const raw = permissions[modId];
      const def = MODULES_CONFIG.find(m => m.id === modId);
      const modPerms = {
        view: true,
        read: true,
        add: raw.add ?? raw.write ?? true,
        write: raw.write ?? raw.add ?? true,
        edit: raw.edit ?? true,
        delete: raw.delete === true
      };

      if (raw.is_manager) modPerms.is_manager = true;

      if (def?.subItems?.length) {
        const subItems = {};
        def.subItems.forEach(s => {
          const sRaw = raw.sub_items?.[s.id];
          if (sRaw?.view) {
            subItems[s.id] = {
              view: true,
              add: sRaw.add ?? true,
              edit: sRaw.edit ?? true,
              delete: sRaw.delete === true
            };
          }
        });
        modPerms.sub_items = subItems;
        if (modId === 'leads' || modId === 'recruiter') {
          modPerms.assigned_steps = Object.keys(subItems).filter(k => subItems[k].view === true);
        }
      }
      finalPermissions[modId] = modPerms;
    });

    try {
      await onSave({
        ...(initialRole?.id ? { id: initialRole.id } : {}),
        name: cleanName,
        description: description.trim(),
        permissions: finalPermissions,
        assignedUserIds: selectedUserIds
      });
    } catch (saveErr) {
      setError(saveErr.message || 'Could not save role.');
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
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-role-title"
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
        {/* Modal Header */}
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
              id="add-role-title"
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
              <ShieldPlus size={22} style={{ color: 'var(--accent-color, #2563eb)' }} />
              {isEdit ? `Edit Role Template: ${initialRole.name}` : 'Add Role & Permission Matrix'}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {isEdit
                ? `Update role identity, global operational privileges, and granular module access for "${initialRole.name}"`
                : 'Configure role identity, global operational privileges, granular module access, and assign to staff members'}
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

          {/* Section 1: Role Identity & Preset Selector */}
          <div
            style={{
              flexShrink: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Shield size={18} style={{ color: '#0284c7' }} /> Role Identity & Template Preset
              </div>
              {/* Preset Selector Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={16} style={{ color: '#d97706' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Load Preset:</span>
                <select
                  value={selectedPresetKey}
                  onChange={(e) => handleApplyPreset(e.target.value)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">— Select a Role Preset —</option>
                  {availablePresets.map(preset => (
                    <option key={preset.key} value={preset.key}>
                      {preset.name} ({preset.description})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <span>Role Name</span>
                  <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sales Coordinator / HR Executive"
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    height: '42px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <span>Description</span>
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Briefly describe responsibilities and privilege scope"
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    height: '42px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Global Operational Powers (11 Powers Grid) */}
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
                const isActivePower = permissions[power.key] === true;
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
                      borderColor: isActivePower ? 'var(--accent-color, #2563eb)' : 'var(--border-light)',
                      background: isActivePower ? 'var(--nav-active-bg, #eff6ff)' : 'var(--bg-primary)',
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
                        accentColor: 'var(--accent-color, #2563eb)',
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

          {/* Section 3: Granular Module Access Matrix */}
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
              <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
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
                  value={search}
                  onChange={e => setSearch(e.target.value)}
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
            <div style={{ overflow: 'auto', height: '360px', maxHeight: '420px', minHeight: '300px' }}>
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
                          const locked = module.roleAssignable === false;
                          const children = module.subItems || [];
                          const hasSubs = children.length > 0;
                          const expanded = isExpanded(module.id, children);
                          const isSpecialManager = module.id === 'leads' || module.id === 'recruiter';
                          const mAccess = permissions[module.id] || {};

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

          {/* Section 4: Role-Wise Staff Assignment (Optional / Immediate allocation) */}
          <div
            style={{
              flexShrink: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '1.25rem'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.85rem',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={18} style={{ color: '#7c3aed' }} /> Assign Role to Staff Members (Optional / Role-wise)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Select workplace team members to immediately apply this role and permissions upon creation
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-color, #2563eb)' }}>
                  {selectedUserIds.length} member(s) selected
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllStaff}
                  style={{
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllStaff}
                  style={{
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    cursor: 'pointer'
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Staff Search input */}
            <div style={{ marginBottom: '0.85rem', position: 'relative' }}>
              <Search
                size={15}
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
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search staff by name, email, department, or designation..."
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Staff selection grid */}
            <div
              style={{
                maxHeight: '180px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '0.5rem',
                padding: '0.25rem'
              }}
            >
              {eligibleStaff.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.5rem' }}>
                  No matching team members found.
                </div>
              ) : (
                eligibleStaff.map(u => {
                  const isChecked = selectedUserIds.includes(u.user_id);
                  return (
                    <label
                      key={u.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: isChecked ? '#7c3aed' : 'var(--border-light)',
                        background: isChecked ? '#f5f3ff' : 'var(--bg-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleUserSelection(u.user_id)}
                        style={{
                          width: '1rem',
                          height: '1rem',
                          accentColor: '#7c3aed',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.emp_name || 'Unnamed Employee'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.email} {u.emp_department ? `• ${u.emp_department}` : ''}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: error ? 'space-between' : 'flex-end',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-light)',
            background: 'var(--bg-surface)'
          }}
        >
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, maxWidth: '65%' }}>
              <Info size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
            style={{
              padding: '0.55rem 1.1rem',
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
            type="submit"
            disabled={saving}
            style={{
              padding: '0.55rem 1.4rem',
              borderRadius: '8px',
              border: 0,
              background: 'var(--primary-color, #2563eb)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: saving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
            }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving Role...
              </>
            ) : selectedUserIds.length > 0 ? (
              <>
                <CheckCircle2 size={16} />
                Save & Assign to {selectedUserIds.length} Staff
              </>
            ) : (
              <>
                <ShieldPlus size={16} />
                Save Role Template
              </>
            )}
          </button>
          </div>
        </div>
      </form>
    </div>
  );
}
