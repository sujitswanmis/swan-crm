/**
 * Universal Granular Permission & Access Control Utility
 * Enforces 4-Column (View, Add, Edit, Delete) and Sub-Tab Permissions across CRM.
 */

import { INTEGRATION_PAGE, INTEGRATION_PAGE_IDS, INTEGRATION_TABS } from '../config/integrationsConfig.js';
import { WHATSAPP_LOG_PAGE_ID, WHATSAPP_LOG_VIEW_IDS } from '../config/whatsappMessageLogsConfig.js';

export function checkIsAdminRole(userRole) {
  const rLower = String(userRole || '').trim().toLowerCase();
  return rLower === 'admin' || rLower === 'superadmin' || rLower === 'masteradmin' || rLower === 'super_admin' || rLower === 'master_admin';
}

export function getModulePermissions(moduleAccess, userRole, moduleId) {
  if(moduleId==='config_master') {
    const master=['masteradmin','master_admin'].includes(String(userRole || '').trim().toLowerCase()) || moduleAccess?.is_master_admin===true || String(moduleAccess?._userEmail || '').trim().toLowerCase()==='supujacreations@gmail.com';
    return {view:master,add:master,edit:master,delete:false,is_manager:master};
  }
  const isAdmin = checkIsAdminRole(userRole);
  if (isAdmin) {
    return { view: true, add: true, edit: true, delete: true, is_manager: true };
  }

  if (!moduleAccess) {
    return { view: false, add: false, edit: false, delete: false, is_manager: false };
  }

  const m = moduleAccess[moduleId];
  if (!m) {
    return { view: false, add: false, edit: false, delete: false, is_manager: false };
  }

  if (m === true) {
    return { view: true, add: true, edit: true, delete: false, is_manager: false };
  }

  if (typeof m === 'object') {
    if (m.view === false) {
      return { view: false, add: false, edit: false, delete: false, is_manager: false };
    }
    return {
      view: true,
      add: m.add !== false,
      edit: m.edit !== false,
      delete: m.delete === true,
      is_manager: m.is_manager === true
    };
  }

  return { view: false, add: false, edit: false, delete: false, is_manager: false };
}

export function getSubItemPermissions(moduleAccess, userRole, moduleId, subItemId) {
  if(moduleId==='config_master') {
    const parent=getModulePermissions(moduleAccess,userRole,moduleId);
    return {view:parent.view,add:parent.add,edit:parent.edit,delete:false};
  }
  const isAdmin = checkIsAdminRole(userRole);
  if (isAdmin) {
    return { view: true, add: true, edit: true, delete: true };
  }

  const parentPerms = getModulePermissions(moduleAccess, userRole, moduleId);
  if (!parentPerms.view) {
    return { view: false, add: false, edit: false, delete: false };
  }

  const m = moduleAccess?.[moduleId];
  // This existing page owns three registered views. Legacy explicit log grants
  // retain raw access; the two analytics views require separate explicit grants.
  if (moduleId === 'whatsapp_official' && subItemId === WHATSAPP_LOG_PAGE_ID) {
    return { view: WHATSAPP_LOG_VIEW_IDS.some(id => getSubItemPermissions(moduleAccess, userRole, moduleId, id).view), add: false, edit: false, delete: false };
  }
  if (moduleId === 'whatsapp_official' && WHATSAPP_LOG_VIEW_IDS.includes(subItemId)) {
    const configured = m?.sub_items?.[subItemId];
    const explicit = configured !== undefined ? configured : subItemId === 'sent_logs_raw' ? m?.sub_items?.sent_logs : undefined;
    return {
      view: explicit === true || (typeof explicit === 'object' && explicit?.view === true),
      add: false, edit: false, delete: false
    };
  }
  if (!m || typeof m !== 'object') {
    return { ...parentPerms };
  }

  // If user is a Manager for this module, full unrestricted sub-item access
  if (m.is_manager) {
    return { ...parentPerms };
  }

  const subItems = m.sub_items;
  // If sub_items object is explicitly configured with entries:
  if (subItems && typeof subItems === 'object' && Object.keys(subItems).length > 0) {
    if (subItems[subItemId] !== undefined) {
      const sub = subItems[subItemId];
      if (sub === false || (typeof sub === 'object' && sub.view === false)) {
        return { view: false, add: false, edit: false, delete: false };
      }
      if (sub === true) {
        return { view: true, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      if (typeof sub === 'object') {
        return {
          view: sub.view !== false,
          add: sub.add !== false && parentPerms.add,
          edit: sub.edit !== false && parentPerms.edit,
          delete: sub.delete === true
        };
      }
    } else {
      // If this is the new Stage 08 (Transfer to Party) in leads and not explicitly disabled, inherit parent view access
      if (moduleId === 'leads' && (subItemId === '08 - Transfer to Party' || subItemId.includes('Transfer to Party') || subItemId.startsWith('08'))) {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is my_leaves in attendance, inherit from my_attendance if not explicitly disabled
      if (moduleId === 'attendance' && subItemId === 'my_leaves') {
        const myAttView = subItems['my_attendance'] ? (subItems['my_attendance'].view !== false) : true;
        return { view: myAttView, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is live_tracking in attendance, STRICT DEFAULT-DENY for regular employees!
      // Only Master Admin, Admin, or attendance manager (is_manager) should have access.
      if (moduleId === 'attendance' && subItemId === 'live_tracking') {
        const isPrivileged = isAdmin || parentPerms.is_manager === true;
        return { view: isPrivileged, add: isPrivileged, edit: isPrivileged, delete: false };
      }
      // If this is field_force sub-items:
      // Form Studio & Live Radar are STRICTLY supervisory / admin-only tools.
      if (moduleId === 'field_force') {
        if (subItemId === 'form_studio' || subItemId === 'live_radar') {
          const isPrivileged = isAdmin || parentPerms.is_manager === true;
          return { view: isPrivileged, add: isPrivileged, edit: isPrivileged, delete: false };
        }
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is dashboard or holidays in checklist, inherit from parent checklist view if not explicitly disabled
      if (moduleId === 'checklist' && (subItemId === 'dashboard' || subItemId === 'holidays')) {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is email_config tabs, inherit from parent email_config view if not explicitly disabled
      if (moduleId === 'email_config') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // Legacy Settings users inherit tab visibility, never credential-management power.
      if (moduleId === 'settings' && INTEGRATION_PAGE_IDS.includes(subItemId)) {
        return { view: parentPerms.view, add: false, edit: false, delete: false };
      }
      // If this is order_pipeline in settings, inherit from parent settings view if not explicitly disabled
      if (moduleId === 'settings' && subItemId === 'order_pipeline') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is complaints_config in settings, inherit from parent settings view if not explicitly disabled
      if (moduleId === 'settings' && subItemId === 'complaints_config') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is holidays in settings, inherit from parent settings view if not explicitly disabled
      if (moduleId === 'settings' && subItemId === 'holidays') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is end_customers in channel_ops or party, inherit from parent permissions if not explicitly disabled
      if ((moduleId === 'channel_ops' || moduleId === 'party') && subItemId === 'end_customers') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is complaint stages (c01..c06) in channel_ops, inherit from complaints if not explicitly disabled
      if (moduleId === 'channel_ops' && /^c\d{2}$/i.test(subItemId)) {
        const compPerm = subItems['complaints'];
        if (compPerm !== undefined) {
          const isView = typeof compPerm === 'object' ? compPerm.view !== false : !!compPerm;
          const isAdd = typeof compPerm === 'object' ? compPerm.add !== false : !!compPerm;
          const isEdit = typeof compPerm === 'object' ? compPerm.edit !== false : !!compPerm;
          return { view: isView, add: isAdd && parentPerms.add, edit: isEdit && parentPerms.edit, delete: false };
        }
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is all_orders or individual stages (s01..s13) in channel_ops, inherit from parent order_pipeline if not explicitly disabled
      if (moduleId === 'channel_ops' && (subItemId === 'all_orders' || /^s\d{2}$/i.test(subItemId))) {
        const pipePerm = subItems['order_pipeline'];
        if (pipePerm !== undefined) {
          const isView = typeof pipePerm === 'object' ? pipePerm.view !== false : !!pipePerm;
          const isAdd = typeof pipePerm === 'object' ? pipePerm.add !== false : !!pipePerm;
          const isEdit = typeof pipePerm === 'object' ? pipePerm.edit !== false : !!pipePerm;
          return { view: isView, add: isAdd && parentPerms.add, edit: isEdit && parentPerms.edit, delete: false };
        }
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // Legacy WhatsApp Unofficial alias compatibility (templates <-> live_chat)
      if (moduleId === 'whatsapp_unofficial' && subItemId === 'templates' && subItems['live_chat'] !== undefined) {
        const legacy = subItems['live_chat'];
        const isAllowed = typeof legacy === 'object' ? legacy.view !== false : !!legacy;
        return { view: isAllowed, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If granular sub_items is defined for this module and subItemId is NOT in it -> Denied!
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  // Fallback for legacy assigned_steps (e.g. leads / recruiter):
  if (Array.isArray(m.assigned_steps)) {
    const isAssigned = m.assigned_steps.includes(subItemId);
    if (!isAssigned) {
      if (moduleId === 'leads' && (subItemId === '08 - Transfer to Party' || subItemId.includes('Transfer to Party') || subItemId.startsWith('08'))) {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  // Module-specific defensive security fallbacks when granular sub_items is not configured:
  const isHodOrManager = userRole === 'manager' || userRole === 'hod' || m.is_manager === true;

  if (moduleId === 'attendance') {
    const isBasicEmployeeTab = ['my_attendance', 'my_leaves', 'monthly_logs', 'regularization'].includes(subItemId);
    if (!isHodOrManager && !isBasicEmployeeTab) {
      return { view: false, add: false, edit: false, delete: false };
    }
    // live_tracking is privileged supervisory radar: restricted to Admin or explicit attendance manager
    if (subItemId === 'live_tracking' && !isAdmin && parentPerms.is_manager !== true) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'field_force') {
    if (!isAdmin && parentPerms.is_manager !== true) {
      if (subItemId === 'form_studio' || subItemId === 'live_radar') {
        return { view: false, add: false, edit: false, delete: false };
      }
    }
  }

  if (moduleId === 'user_management_new' && !isHodOrManager) {
    const isPrivilegedTab = ['roles', 'audit', 'sessions'].includes(subItemId);
    if (isPrivilegedTab) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'email_config' && !isHodOrManager) {
    const isPrivilegedTab = ['smtp', 'test'].includes(subItemId);
    if (isPrivilegedTab) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'aiadmin' && !isHodOrManager) {
    const isPrivilegedTab = ['billing', 'models'].includes(subItemId);
    if (isPrivilegedTab) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'checklist' && !isHodOrManager) {
    const isPrivilegedTab = ['templates', 'compliance'].includes(subItemId);
    if (isPrivilegedTab) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'delegation' && !isHodOrManager) {
    if (subItemId === 'all') {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  if (moduleId === 'channel_ops' && !isHodOrManager) {
    if (subItemId === 'frequency_rules') {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  return { ...parentPerms };
}

export function filterVisibleSubTabs(moduleAccess, userRole, moduleId, tabsList = []) {
  const isAdmin = checkIsAdminRole(userRole);
  if (isAdmin) return tabsList;

  return tabsList.filter(tab => {
    if (moduleId === 'settings' && tab.id === INTEGRATION_PAGE.id && tab.subItems?.length) {
      return canViewIntegrations(moduleAccess, userRole);
    }
    const perms = getSubItemPermissions(moduleAccess, userRole, moduleId, tab.id);
    return perms.view === true;
  });
}

export function canViewIntegrations(moduleAccess, userRole) {
  return INTEGRATION_TABS.some(tab => getSubItemPermissions(moduleAccess, userRole, 'settings', tab.id).view);
}
