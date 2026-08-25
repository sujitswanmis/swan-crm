/**
 * Universal Granular Permission & Access Control Utility
 * Enforces 4-Column (View, Add, Edit, Delete) and Sub-Tab Permissions across CRM.
 */

export function getModulePermissions(moduleAccess, userRole, moduleId) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
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
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
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

  const subItems = m.sub_items;
  // If sub_items object is explicitly configured with entries:
  if (subItems && typeof subItems === 'object') {
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
    } else if (Object.keys(subItems).length > 0) {
      // If granular sub_items is defined for this module and subItemId is NOT in it -> Denied!
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  // If module uses assigned_steps (e.g. leads / recruiter):
  if (Array.isArray(m.assigned_steps) && !m.is_manager) {
    const isAssigned = m.assigned_steps.includes(subItemId) || 
      ((subItemId === 'lead_dashboard' || subItemId === 'hourly_work') && m.view);
    if (!isAssigned) {
      return { view: false, add: false, edit: false, delete: false };
    }
  }

  return { ...parentPerms };
}

export function filterVisibleSubTabs(moduleAccess, userRole, moduleId, tabsList = []) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  if (isAdmin) return tabsList;

  return tabsList.filter(tab => {
    const perms = getSubItemPermissions(moduleAccess, userRole, moduleId, tab.id);
    return perms.view === true;
  });
}
