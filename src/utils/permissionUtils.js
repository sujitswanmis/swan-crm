/**
 * Universal Granular Permission & Access Control Utility
 * Enforces 4-Column (View, Add, Edit, Delete) and Sub-Tab Permissions across CRM.
 */

export function checkIsAdminRole(userRole) {
  const rLower = String(userRole || '').trim().toLowerCase();
  return rLower === 'admin' || rLower === 'superadmin' || rLower === 'masteradmin' || rLower === 'super_admin' || rLower === 'master_admin';
}

export function getModulePermissions(moduleAccess, userRole, moduleId) {
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
  const isAdmin = checkIsAdminRole(userRole);
  if (isAdmin) {
    return { view: true, add: true, edit: true, delete: true };
  }

  const parentPerms = getModulePermissions(moduleAccess, userRole, moduleId);
  if (!parentPerms.view) {
    return { view: false, add: false, edit: false, delete: false };
  }

  const m = moduleAccess?.[moduleId];
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
      // If this is dashboard or holidays in checklist, inherit from parent checklist view if not explicitly disabled
      if (moduleId === 'checklist' && (subItemId === 'dashboard' || subItemId === 'holidays')) {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is email_config tabs, inherit from parent email_config view if not explicitly disabled
      if (moduleId === 'email_config') {
        return { view: parentPerms.view, add: parentPerms.add, edit: parentPerms.edit, delete: false };
      }
      // If this is order_pipeline in settings, inherit from parent settings view if not explicitly disabled
      if (moduleId === 'settings' && subItemId === 'order_pipeline') {
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
    const perms = getSubItemPermissions(moduleAccess, userRole, moduleId, tab.id);
    return perms.view === true;
  });
}
