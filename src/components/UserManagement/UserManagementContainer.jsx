'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Users, Shield, Network, Monitor, Clock,
  AlertCircle, CheckCircle2, Loader2, Sparkles 
} from 'lucide-react';
import { 
  getTeamMembers, createAccountAdmin, updateEmployeeDetailsAdmin, 
  updateModuleAccess, updateEmpStatus, moveToTrashUser, 
  restoreUserFromTrash, deleteUserAdmin, toggleUserApproval,
  updateUserRole
} from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';
import { getRoleTemplates, createRoleTemplate, assignRoleTemplate } from '@/app/actions/roleTemplates';

// Tabs
import UserManageTab from './tabs/UserManageTab';
import RolesPermissionsTab from './tabs/RolesPermissionsTab';
import OrgHierarchyTab from './tabs/OrgHierarchyTab';
import ActiveSessionsTab from './tabs/ActiveSessionsTab';
import AuditLogsTab from './tabs/AuditLogsTab';

// Modals
import AddEditUserModal from './modals/AddEditUserModal';
import PermissionMatrixModal from './modals/PermissionMatrixModal';
import RoleTemplateModal from './modals/RoleTemplateModal';
import ResetPasswordModal from './modals/ResetPasswordModal';
import SendResetEmailModal from './modals/SendResetEmailModal';
import ViewChatModal from './modals/ViewChatModal';
import ImpersonateModal from './modals/ImpersonateModal';
import BulkImportExportModal from './modals/BulkImportExportModal';
import ConfirmActionModal from './modals/ConfirmActionModal';

import { isFeatureEntitled } from '@/utils/saasEntitlements';
import { DEFAULT_DEPARTMENTS } from './utils/userManagementUtils';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';
import { MODULES_CONFIG } from '@/config/modulesConfig';
import { ROLE_PRESETS } from './utils/rolePresets';

const USER_MANAGEMENT_TABS = [
  { id: 'user_manage', label: 'User Manage', icon: Users },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
  { id: 'hierarchy', label: 'Org Hierarchy', icon: Network },
  { id: 'sessions', label: 'Active Sessions', icon: Monitor },
  { id: 'audit', label: 'Audit Logs', icon: Clock }
];

const validSubTabs = ['user_manage', 'roles', 'hierarchy', 'sessions', 'audit'];
const normalizeSubTab = (tab) => validSubTabs.includes(tab) ? tab : 'user_manage';

export default function UserManagementContainer({ 
  initialUsers = [], 
  activeSubTab = 'user_manage', 
  onTabChange = () => {}, 
  currentUserCompany = '',
  tenantId = null,
  tenantEntitlements = null,
  isAdmin = false,
  isMasterAdmin = false,
  userId = null,
  userEmail = null,
  userRole = '',
  moduleAccess = {}
}) {
  const visibleSubpages = useMemo(() => {
    return filterVisibleSubTabs(moduleAccess, userRole, 'user_management_new', USER_MANAGEMENT_TABS);
  }, [moduleAccess, userRole]);

  const [users, setUsers] = useState(initialUsers || []);
  const [loading, setLoading] = useState(!initialUsers || initialUsers.length === 0);
  const [activeTab, setActiveTab] = useState(() => {
    const nextTab = normalizeSubTab(activeSubTab);
    return visibleSubpages.some(t => t.id === nextTab) ? nextTab : (visibleSubpages[0]?.id || 'user_manage');
  });
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);

  const hasChatbot = useMemo(() => {
    return isFeatureEntitled('ai', tenantEntitlements, tenantId);
  }, [tenantEntitlements, tenantId]);

  const effectiveIsMasterAdmin = Boolean(
    isMasterAdmin ||
    (userEmail && userEmail.toLowerCase().trim() === 'supujacreations@gmail.com') ||
    moduleAccess?.is_master_admin === true
  );

  useEffect(() => {
    const nextTab = normalizeSubTab(activeSubTab);
    if (visibleSubpages.some(t => t.id === nextTab)) {
      if (nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    } else if (visibleSubpages.length > 0 && !visibleSubpages.some(t => t.id === activeTab)) {
      const fallback = visibleSubpages[0]?.id || 'user_manage';
      setActiveTab(fallback);
      onTabChange(fallback);
    }
  }, [activeSubTab, visibleSubpages, activeTab, onTabChange]);

  const handleTabSwitch = (newTabId) => {
    if (!visibleSubpages.some(t => t.id === newTabId)) return;
    const nextTab = normalizeSubTab(newTabId);
    setActiveTab(nextTab);
    onTabChange(nextTab);
  };

  // Modals state
  const [addEditModal, setAddEditModal] = useState({ isOpen: false, user: null });
  const [savingAddEdit, setSavingAddEdit] = useState(false);

  const [permissionModal, setPermissionModal] = useState({ isOpen: false, user: null });
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [roleTemplates, setRoleTemplates] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState('');
  const [canManageRoles, setCanManageRoles] = useState(Boolean(isAdmin || isMasterAdmin));
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [assigningRoleUserId, setAssigningRoleUserId] = useState(null);
  const [selectedRoleKey, setSelectedRoleKey] = useState(null);
  const [roleSaveBanner, setRoleSaveBanner] = useState(null);

  const [resetPasswordModal, setResetPasswordModal] = useState({ isOpen: false, user: null });
  const [savingPassword, setSavingPassword] = useState(false);

  const [sendResetEmailModal, setSendResetEmailModal] = useState({ isOpen: false, user: null });
  const [viewChatModal, setViewChatModal] = useState({ isOpen: false, user: null });

  const [impersonateModal, setImpersonateModal] = useState({ isOpen: false, user: null });
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

  // Sync canManageRoles if isAdmin or isMasterAdmin prop changes
  useEffect(() => {
    if (isAdmin || isMasterAdmin) {
      setCanManageRoles(true);
    }
  }, [isAdmin, isMasterAdmin]);

  // Confirm employee account changes and existing trash/restore actions.
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    type: 'warning',
    onConfirm: () => {}
  });
  const [confirmLoading, setConfirmLoading] = useState(false);
  const confirmationPendingRef = useRef(false);

  // Notification Toast state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3500);
  };

  const confirmUserChange = ({ title, message, confirmText, action }) => {
    if (confirmationPendingRef.current) return;
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      type: 'warning',
      onConfirm: async () => {
        if (confirmationPendingRef.current) return;
        confirmationPendingRef.current = true;
        setConfirmLoading(true);
        try {
          await action();
          setConfirmModal(previous => ({ ...previous, isOpen: false }));
        } catch (error) {
          showToast(error.message || 'Could not update employee. Please try again.', 'error');
        } finally {
          confirmationPendingRef.current = false;
          setConfirmLoading(false);
        }
      }
    });
  };

  useEffect(() => {
    let active = true;
    setRolesLoading(true);

    getRoleTemplates(userId, userEmail, currentUserCompany)
      .then(result => {
        if (!active) return;
        setRoleTemplates(result.roles || []);
        if (result.canManageRoles !== undefined) {
          setCanManageRoles(result.canManageRoles === true || isAdmin || isMasterAdmin);
        } else {
          setCanManageRoles(Boolean(isAdmin || isMasterAdmin));
        }
        setRolesError(result.success ? '' : result.error || 'Could not load saved roles.');
      })
      .catch(error => {
        if (!active) return;
        setRoleTemplates([]);
        setRolesError(error.message || 'Could not load saved roles.');
      })
      .finally(() => {
        setRolesLoading(false);
      });

    return () => { active = false; };
  }, [isAdmin, isMasterAdmin, userId, userEmail, currentUserCompany]);

  const handleCreateRole = async details => {
    setSavingRole(true);
    try {
      const { assignedUserIds = [], ...rolePayload } = details;
      const result = await createRoleTemplate(rolePayload);
      if (!result.success) throw new Error(result.error || 'Could not create role.');
      
      const newRoleKey = `custom:${result.role.id}`;
      setRoleTemplates(previous => [...previous, result.role].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedRoleKey(newRoleKey);
      setRoleSaveBanner(`Role template "${result.role.name}" saved successfully! You can inspect its capabilities below and assign it to staff members.`);

      // If user selected staff members to assign this role to immediately
      if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
        let assignedCount = 0;
        for (const uid of assignedUserIds) {
          try {
            const assignRes = await assignRoleTemplate(uid, result.role.id);
            if (assignRes.success) {
              assignedCount++;
              setUsers(previous => previous.map(m => m.user_id === uid ? { ...m, module_access: assignRes.moduleAccess } : m));
              try {
                const supabase = createClient();
                await supabase.channel('crm_realtime_permission_sync').send({
                  type: 'broadcast',
                  event: 'permission_updated',
                  payload: { userId: uid, moduleAccess: assignRes.moduleAccess, timestamp: Date.now() }
                });
              } catch (broadcastErr) {
                console.warn('Realtime sync unavailable for user:', uid, broadcastErr);
              }
            }
          } catch (assignErr) {
            console.warn('Failed assigning role to user:', uid, assignErr);
          }
        }
        showToast(`Role "${result.role.name}" saved and assigned to ${assignedCount} staff member(s)!`, 'success');
        fetchUsers(false);
      } else {
        showToast(`Role "${result.role.name}" saved successfully!`, 'success');
      }

      setRoleModalOpen(false);
    } finally {
      setSavingRole(false);
    }
  };

  const handleAssignRole = (user, role) => {
    if (!user?.user_id || !role?.id) return;
    confirmUserChange({
      title: 'Assign Role Template?',
      message: `Assign "${role.name}" to ${user.emp_name || user.email}? Their current module permissions will be replaced.`,
      confirmText: 'Assign Role',
      action: async () => {
        setAssigningRoleUserId(user.user_id);
        try {
          const result = await assignRoleTemplate(user.user_id, role.id);
          if (!result.success) throw new Error(result.error || 'Could not assign role.');
          setUsers(previous => previous.map(member => member.user_id === user.user_id ? { ...member, module_access: result.moduleAccess } : member));
          showToast(`Role "${role.name}" assigned to ${user.emp_name || user.email}.`);
          try {
            const supabase = createClient();
            await supabase.channel('crm_realtime_permission_sync').send({
              type: 'broadcast',
              event: 'permission_updated',
              payload: { userId: user.user_id, moduleAccess: result.moduleAccess, timestamp: Date.now() }
            });
          } catch (broadcastError) {
            console.warn('Role permission broadcast unavailable:', broadcastError);
          }
        } finally {
          setAssigningRoleUserId(null);
        }
      }
    });
  };

  const handleAssignPreset = (user, preset) => {
    if (!user?.user_id || !preset) return;
    confirmUserChange({
      title: 'Apply Role & Permission Preset?',
      message: `Assign "${preset.name}" preset permissions to ${user.emp_name || user.email}? Their module permissions will be updated to match the Roles & Permissions preset.`,
      confirmText: 'Assign Role Preset',
      action: async () => {
        setAssigningRoleUserId(user.user_id);
        try {
          const roleData = structuredClone(preset.presetData || {});
          delete roleData.is_master_admin;

          MODULES_CONFIG.forEach(mod => {
            if (roleData[mod.id]?.view && mod.subItems?.length && !roleData[mod.id].sub_items) {
              const subs = {};
              mod.subItems.forEach(s => {
                subs[s.id] = { view: true, add: false, edit: false, delete: false };
              });
              roleData[mod.id].sub_items = subs;
            }
          });

          const nextAccess = {
            ...(user.module_access || {}),
            ...roleData,
            role_preset_key: preset.key,
            role_preset_name: preset.name
          };
          delete nextAccess.role_template_id;
          delete nextAccess.role_template_name;

          const res = await updateModuleAccess(user.user_id, nextAccess);
          if (!res?.success) throw new Error(res?.error || 'Could not update permissions.');

          const systemRoleMap = {
            admin: 'Admin',
            crm: 'Admin',
            telecaller: 'agent',
            sales_coordinator: 'Sales',
            process_coordinator: 'Supervisor',
            hod_dept_head: 'Manager',
            sales_manager: 'Manager',
            sales_executive: 'Sales',
            hr_recruiter: 'Recruiter',
            read_only_viewer: 'agent'
          };
          const mappedRole = systemRoleMap[preset.key] || user.role || 'agent';
          if (mappedRole !== user.role) {
            try { await updateUserRole(user.user_id, mappedRole); } catch (e) { console.warn(e); }
          }

          setUsers(previous => previous.map(member => member.user_id === user.user_id ? {
            ...member,
            role: mappedRole,
            module_access: res.moduleAccess || nextAccess
          } : member));

          showToast(`Role "${preset.name}" assigned to ${user.emp_name || user.email}.`);

          try {
            const supabase = createClient();
            await supabase.channel('crm_realtime_permission_sync').send({
              type: 'broadcast',
              event: 'permission_updated',
              payload: { userId: user.user_id, moduleAccess: res.moduleAccess || nextAccess, timestamp: Date.now() }
            });
          } catch (broadcastError) {
            console.warn('Role permission broadcast unavailable:', broadcastError);
          }
        } catch (err) {
          showToast(err.message || 'Failed to assign role preset', 'error');
        } finally {
          setAssigningRoleUserId(null);
        }
      }
    });
  };

  // Fetch users from backend
  const fetchUsers = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const data = await getTeamMembers(currentUserCompany, tenantId);
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      showToast('Failed to load users: ' + err.message, 'error');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [currentUserCompany, tenantId]);

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('departments')
        .select('name')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        setDepartments(data.map(d => d.name));
      }
    } catch (e) {
      console.warn('Using default departments:', e);
    }
  }, []);

  useEffect(() => {
    fetchUsers(!initialUsers || initialUsers.length === 0);
    fetchDepartments();
  }, [fetchUsers, fetchDepartments, initialUsers]);

  // Handler: Confirm a system role change before saving.
  const handleChangeRole = (targetUser, newRole) => {
    if (!targetUser?.user_id || !newRole) return;
    const current = targetUser.role || 'agent';
    if (current === newRole) return;
    confirmUserChange({
      title: 'Change System Role?',
      message: `Change the system role of ${targetUser.emp_name || targetUser.email} from "${current}" to "${newRole}"?`,
      confirmText: 'Change Role',
      action: async () => {
        await updateUserRole(targetUser.user_id, newRole);
        setUsers(previous => previous.map(member => member.user_id === targetUser.user_id ? { ...member, role: newRole } : member));
        showToast(`Role updated to "${newRole}" for ${targetUser.emp_name || targetUser.email}`, 'success');
        fetchUsers(false);
      }
    });
  };

  // Handler: Add or Edit User
  const handleSaveAddEditUser = async (formData) => {
    setSavingAddEdit(true);
    try {
      const { role, role_template_id, role_preset_key, ...profileData } = formData;
      if (addEditModal.user) {
        // Edit Mode
        const res = await updateEmployeeDetailsAdmin(addEditModal.user.user_id, profileData);
        if (res && res.success) {
          if (role && role !== addEditModal.user.role) {
            try { await updateUserRole(addEditModal.user.user_id, role); } catch (e) { console.warn('Role update notice:', e); }
          }
          if (role_template_id && role_template_id !== addEditModal.user.module_access?.role_template_id) {
            try { await assignRoleTemplate(addEditModal.user.user_id, role_template_id); } catch (e) { console.warn('Role template assign notice:', e); }
          } else if (role_preset_key) {
            const preset = ROLE_PRESETS.find(p => p.key === role_preset_key);
            if (preset) {
              try {
                const roleData = structuredClone(preset.presetData || {});
                delete roleData.is_master_admin;
                MODULES_CONFIG.forEach(mod => {
                  if (roleData[mod.id]?.view && mod.subItems?.length && !roleData[mod.id].sub_items) {
                    const subs = {};
                    mod.subItems.forEach(s => {
                      subs[s.id] = { view: true, add: false, edit: false, delete: false };
                    });
                    roleData[mod.id].sub_items = subs;
                  }
                });
                const nextAccess = {
                  ...(addEditModal.user.module_access || {}),
                  ...roleData,
                  role_preset_key: preset.key,
                  role_preset_name: preset.name
                };
                delete nextAccess.role_template_id;
                delete nextAccess.role_template_name;
                await updateModuleAccess(addEditModal.user.user_id, nextAccess);
              } catch (e) {
                console.warn('Role preset assign notice:', e);
              }
            }
          }
          showToast(`Profile updated for ${formData.emp_name}!`, 'success');
          setAddEditModal({ isOpen: false, user: null });
          fetchUsers(false);
        } else {
          alert(res?.error || 'Failed to update employee details');
        }
      } else {
        // Add Mode
        const { email, password, ...details } = formData;
        const res = await createAccountAdmin(email, password, { ...details, role: role || 'agent' });
        if (res && res.success) {
          const newUserId = res.userId;
          if (newUserId) {
            if (role && role !== 'agent') {
              try { await updateUserRole(newUserId, role); } catch (e) { console.warn('Role update notice:', e); }
            }
            if (role_template_id) {
              try { await assignRoleTemplate(newUserId, role_template_id); } catch (e) { console.warn('Role template assign notice:', e); }
            } else if (role_preset_key) {
              const preset = ROLE_PRESETS.find(p => p.key === role_preset_key);
              if (preset) {
                try {
                  const roleData = structuredClone(preset.presetData || {});
                  delete roleData.is_master_admin;
                  MODULES_CONFIG.forEach(mod => {
                    if (roleData[mod.id]?.view && mod.subItems?.length && !roleData[mod.id].sub_items) {
                      const subs = {};
                      mod.subItems.forEach(s => {
                        subs[s.id] = { view: true, add: false, edit: false, delete: false };
                      });
                      roleData[mod.id].sub_items = subs;
                    }
                  });
                  const nextAccess = {
                    ...roleData,
                    role_preset_key: preset.key,
                    role_preset_name: preset.name
                  };
                  await updateModuleAccess(newUserId, nextAccess);
                } catch (e) {
                  console.warn('Role preset assign notice:', e);
                }
              }
            }
          }
          showToast(`Account created for ${formData.emp_name}!`, 'success');
          setAddEditModal({ isOpen: false, user: null });
          fetchUsers(false);
        } else {
          alert(res?.error || 'Failed to create user account');
        }
      }
    } catch (err) {
      alert('Error saving user: ' + err.message);
    } finally {
      setSavingAddEdit(false);
    }
  };

  // Handler: Save Permissions Matrix
  const handleSavePermissions = async (userId, updatedAccess) => {
    setSavingPermissions(true);
    try {
      // Save directly via updateModuleAccess so any fine-tuned checkbox selections are preserved
      const res = await updateModuleAccess(userId, updatedAccess);
      if (res && res.success) {
        const savedAccess = res.moduleAccess || updatedAccess;
        // Realtime broadcast to active user sessions
        try {
          const supabase = createClient();
          const syncChannel = supabase.channel('crm_realtime_permission_sync');
          await syncChannel.send({
            type: 'broadcast',
            event: 'permission_updated',
            payload: {
              userId,
              moduleAccess: savedAccess,
              timestamp: Date.now()
            }
          });
        } catch (realtimeErr) {
          console.warn('Realtime permission broadcast warning:', realtimeErr);
        }

        showToast('Permissions Matrix updated & broadcasted successfully!', 'success');
        setPermissionModal({ isOpen: false, user: null });
        fetchUsers(false);
      } else {
        alert(res?.error || 'Failed to save permissions');
      }
    } catch (err) {
      alert('Error saving permissions: ' + err.message);
    } finally {
      setSavingPermissions(false);
    }
  };

  // Handler: Direct Password Reset
  const handleSavePassword = async (userId, newPassword) => {
    setSavingPassword(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Password updated successfully!', 'success');
        setResetPasswordModal({ isOpen: false, user: null });
      } else {
        alert(data.error || 'Failed to update password');
      }
    } catch (err) {
      alert('Error updating password: ' + err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Handler: Change Status (supports direct select from EMP_STATUS_OPTIONS or toggle)
  const handleChangeStatus = (targetUser, newStatus) => {
    if (!targetUser?.user_id) return;
    const current = targetUser.emp_status || (targetUser.module_access?.emp_status) || 'Active';
    const nextStatus = newStatus || (current.toLowerCase() === 'active' ? 'InActive' : 'Active');
    if (current === nextStatus) return;

    confirmUserChange({
      title: 'Change Employee Status?',
      message: `Change the employee status of ${targetUser.emp_name || targetUser.email} from "${current}" to "${nextStatus}"?`,
      confirmText: 'Change Status',
      action: async () => {
        await updateEmpStatus(targetUser.user_id, nextStatus);
        setUsers(previous => previous.map(member => member.user_id === targetUser.user_id ? { ...member, emp_status: nextStatus } : member));
        showToast(`Status updated to "${nextStatus}" for ${targetUser.emp_name || targetUser.email}`, 'success');
        fetchUsers(false);
      }
    });
  };

  // Handler: Toggle Approval Status
  const handleToggleApproval = (targetUser) => {
    if (!targetUser?.user_id) return;
    const nextApproved = !targetUser.is_approved;
    confirmUserChange({
      title: 'Change Approval Status?',
      message: `Change the approval status of ${targetUser.emp_name || targetUser.email} from "${targetUser.is_approved ? 'Approved' : 'Pending'}" to "${nextApproved ? 'Approved' : 'Pending'}"?`,
      confirmText: nextApproved ? 'Approve User' : 'Mark as Pending',
      action: async () => {
        await toggleUserApproval(targetUser.user_id, nextApproved);
        setUsers(previous => previous.map(member => member.user_id === targetUser.user_id ? { ...member, is_approved: nextApproved } : member));
        showToast(`Approval status set to ${nextApproved ? 'Approved' : 'Pending'} for ${targetUser.emp_name || targetUser.email}`, 'success');
        fetchUsers(false);
      }
    });
  };

  // Handler: Save User as Draft (Partial creation)
  const handleSaveDraft = async (draftData) => {
    setSavingAddEdit(true);
    try {
      const fallbackId = draftData.emp_id?.trim() || `DRAFT-${Date.now().toString().slice(-6)}`;
      const fallbackEmail = draftData.email?.trim() || `${fallbackId.toLowerCase()}@draft.local`;
      const fallbackPassword = draftData.password || 'DraftPass@123';

      const payload = {
        ...draftData,
        emp_id: fallbackId,
        emp_status: 'Draft',
        emp_name: draftData.emp_name || 'Draft Employee',
        company: draftData.company || currentUserCompany || 'SuPuja Creations'
      };

      const res = await createAccountAdmin(fallbackEmail, fallbackPassword, payload);
      if (res && res.success) {
        showToast(`Draft created for ${payload.emp_name}!`, 'success');
        setAddEditModal({ isOpen: false, user: null });
        fetchUsers(false);
      } else {
        alert(res?.error || 'Failed to save draft account');
      }
    } catch (err) {
      alert('Error saving draft: ' + err.message);
    } finally {
      setSavingAddEdit(false);
    }
  };

  // Handler: Move to Trash
  const handleMoveToTrash = (targetUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Move User to Trash?',
      message: `This will deactivate ${targetUser.emp_name || targetUser.email} and move the account to Trash. You can restore it anytime within 30 days.`,
      confirmText: 'Move to Trash',
      type: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await moveToTrashUser(targetUser.user_id);
          showToast('User moved to Trash', 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchUsers(false);
        } catch (err) {
          alert('Failed to move to trash: ' + err.message);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  // Handler: Restore from Trash
  const handleRestoreFromTrash = (targetUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Restore User Account?',
      message: `Restore ${targetUser.emp_name || targetUser.email} back to Active employee status?`,
      confirmText: 'Restore Account',
      type: 'info',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await restoreUserFromTrash(targetUser.user_id);
          showToast('User restored successfully!', 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchUsers(false);
        } catch (err) {
          alert('Failed to restore user: ' + err.message);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  // Handler: Permanent Hard Delete
  const handleHardDelete = (targetUser) => {
    setConfirmModal({
      isOpen: true,
      title: 'Permanently Delete User?',
      message: `WARNING: This will permanently purge ${targetUser.emp_name || targetUser.email} from the authentication and database. This action CANNOT be undone!`,
      confirmText: 'Delete Permanently',
      type: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const result = await deleteUserAdmin(targetUser.user_id);
          if (!result?.success) throw new Error(result?.error || 'Delete failed');
          showToast('User permanently deleted', 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchUsers(false);
        } catch (err) {
          alert('Failed to delete user: ' + err.message);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  // Handler: Export CSV
  const handleExportCSV = () => {
    const internalUsers = users.filter(u => u.role !== 'customer');
    if (internalUsers.length === 0) {
      alert('No user records to export.');
      return;
    }

    const headers = [
      'Emp ID', 'Name', 'Email', 'Role', 'Status', 'Department', 'Sub Department',
      'Designation', 'Mobile', 'Alt Mobile', 'Company', 'Location Type',
      'Location Name', 'Primary Reporting', 'HOD', 'Created At'
    ];

    const rows = internalUsers.map(u => [
      `"${u.emp_id || ''}"`,
      `"${(u.emp_name || '').replace(/"/g, '""')}"`,
      `"${u.email || ''}"`,
      `"${u.role || 'agent'}"`,
      `"${u.emp_status || 'Active'}"`,
      `"${u.emp_department || ''}"`,
      `"${u.emp_sub_department || ''}"`,
      `"${u.emp_designation || ''}"`,
      `"${u.emp_mobile || ''}"`,
      `"${u.emp_alt_mobile || ''}"`,
      `"${u.company || 'SuPuja Creations'}"`,
      `"${u.work_location_type || 'Headquarters'}"`,
      `"${u.work_location_name || ''}"`,
      `"${u.primary_reporting_person || ''}"`,
      `"${u.hod_person || ''}"`,
      `"${u.created_at || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `supuja_workplace_users_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{
      width: '100%',
      minWidth: 0,
      minHeight: '80vh',
      padding: '0.75rem 1.5rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      gap: '1rem',
      backgroundColor: 'transparent',
      boxSizing: 'border-box'
    }}>
      {/* Toast Banner */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '0.75rem 1.25rem',
          borderRadius: '10px',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '0.85rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Subpage Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        background: 'var(--bg-surface)',
        padding: '0.35rem 0.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflowX: 'auto',
        width: 'fit-content',
        maxWidth: '100%',
        marginBottom: '0.75rem',
        flexShrink: 0
      }}>
        {visibleSubpages.map(sub => {
          const Icon = sub.icon;
          const isActive = activeTab === sub.id;

          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => handleTabSwitch(sub.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary, #64748b)',
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <Icon size={16} />
              <span>{sub.label}</span>
              {typeof sub.badge === 'number' && sub.badge > 0 && (
                <span style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '10px',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-primary, #f1f5f9)',
                  color: isActive ? '#ffffff' : 'var(--text-primary)',
                  fontWeight: 700
                }}>
                  {sub.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content Rendering */}
      <div style={{ flex: 1, width: '100%' }}>
        {!visibleSubpages.some(t => t.id === activeTab) && (
          <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <Shield size={52} style={{ color: '#ef4444', margin: '0 auto 1.25rem' }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Access Restricted</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '440px', margin: '0.6rem auto 1.5rem', lineHeight: '1.5' }}>
              Aapke account ko iss User Management section ({activeTab}) ka access nahi diya gaya hai.
            </p>
          </div>
        )}

        {activeTab === 'user_manage' && visibleSubpages.some(t => t.id === 'user_manage') && (
          <UserManageTab
            users={users}
            loading={loading}
            departments={departments}
            roleTemplates={roleTemplates}
            onRefresh={() => fetchUsers(true)}
            onAddUser={() => setAddEditModal({ isOpen: true, user: null })}
            onEditUser={(u) => setAddEditModal({ isOpen: true, user: u })}
            onManagePermissions={(u) => setPermissionModal({ isOpen: true, user: u })}
            onChangeRole={handleChangeRole}
            onAssignRole={handleAssignRole}
            onAssignPreset={handleAssignPreset}
            onResetPassword={(u) => setResetPasswordModal({ isOpen: true, user: u })}
            onSendResetEmail={(u) => setSendResetEmailModal({ isOpen: true, user: u })}
            onViewChat={(u) => setViewChatModal({ isOpen: true, user: u })}
            hasChatbot={hasChatbot}
            onImpersonate={(u) => setImpersonateModal({ isOpen: true, user: u })}
            onChangeStatus={handleChangeStatus}
            onToggleApproval={handleToggleApproval}
            onMoveToTrash={handleMoveToTrash}
            onRestoreFromTrash={handleRestoreFromTrash}
            onHardDelete={handleHardDelete}
            onOpenBulkImport={() => setBulkImportModalOpen(true)}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'roles' && visibleSubpages.some(t => t.id === 'roles') && (
          <RolesPermissionsTab
            users={users}
            onManagePermissions={(u) => setPermissionModal({ isOpen: true, user: u })}
            onAssignRoleToUser={handleAssignRole}
            onAddRole={() => setRoleModalOpen(true)}
            customRoles={roleTemplates}
            canManageRoles={canManageRoles}
            rolesLoading={rolesLoading}
            rolesError={rolesError}
            assigningRoleUserId={assigningRoleUserId}
            isMasterAdmin={effectiveIsMasterAdmin}
            activeRoleKey={selectedRoleKey}
            onSelectRoleKey={setSelectedRoleKey}
            saveBanner={roleSaveBanner}
            onDismissBanner={() => setRoleSaveBanner(null)}
          />
        )}

        {activeTab === 'hierarchy' && visibleSubpages.some(t => t.id === 'hierarchy') && (
          <OrgHierarchyTab
            users={users}
            departments={departments}
            onEditUser={(u) => setAddEditModal({ isOpen: true, user: u })}
          />
        )}

        {activeTab === 'sessions' && visibleSubpages.some(t => t.id === 'sessions') && (
          <ActiveSessionsTab currentUserCompany={currentUserCompany} />
        )}

        {activeTab === 'audit' && visibleSubpages.some(t => t.id === 'audit') && (
          <AuditLogsTab currentUserCompany={currentUserCompany} />
        )}
      </div>

      {/* Global Modals */}
      <AddEditUserModal
        isOpen={addEditModal.isOpen}
        onClose={() => setAddEditModal({ isOpen: false, user: null })}
        user={addEditModal.user}
        onSave={handleSaveAddEditUser}
        onSaveDraft={handleSaveDraft}
        departments={departments}
        allEmployees={users}
        roleTemplates={roleTemplates}
        saving={savingAddEdit}
      />

      <PermissionMatrixModal
        isOpen={permissionModal.isOpen}
        onClose={() => setPermissionModal({ isOpen: false, user: null })}
        user={permissionModal.user}
        onSave={handleSavePermissions}
        saving={savingPermissions}
        customRoles={roleTemplates}
      />

      {roleModalOpen && (
        <RoleTemplateModal
          onClose={() => setRoleModalOpen(false)}
          onSave={handleCreateRole}
          saving={savingRole}
          users={users}
        />
      )}

      <ResetPasswordModal
        isOpen={resetPasswordModal.isOpen}
        onClose={() => setResetPasswordModal({ isOpen: false, user: null })}
        user={resetPasswordModal.user}
        onSavePassword={handleSavePassword}
        saving={savingPassword}
      />

      <SendResetEmailModal
        isOpen={sendResetEmailModal.isOpen}
        onClose={() => setSendResetEmailModal({ isOpen: false, user: null })}
        user={sendResetEmailModal.user}
      />

      <ViewChatModal
        isOpen={viewChatModal.isOpen}
        onClose={() => setViewChatModal({ isOpen: false, user: null })}
        user={viewChatModal.user}
      />

      <ImpersonateModal
        isOpen={impersonateModal.isOpen}
        onClose={() => setImpersonateModal({ isOpen: false, user: null })}
        user={impersonateModal.user}
      />

      <BulkImportExportModal
        isOpen={bulkImportModalOpen}
        onClose={() => setBulkImportModalOpen(false)}
        onImportComplete={() => fetchUsers(false)}
      />

      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => {
          if (!confirmLoading && !confirmationPendingRef.current) {
            setConfirmModal(previous => ({ ...previous, isOpen: false }));
          }
        }}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        loading={confirmLoading}
      />
    </div>
  );
}
