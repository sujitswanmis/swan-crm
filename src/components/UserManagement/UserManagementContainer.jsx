'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, Shield, Network, Globe, Monitor, Clock, 
  AlertCircle, CheckCircle2, Loader2, Sparkles 
} from 'lucide-react';
import { 
  getTeamMembers, createAccountAdmin, updateEmployeeDetailsAdmin, 
  updateModuleAccess, updateEmpStatus, moveToTrashUser, 
  restoreUserFromTrash, deleteUserAdmin 
} from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';

// Tabs
import UserManageTab from './tabs/UserManageTab';
import RolesPermissionsTab from './tabs/RolesPermissionsTab';
import OrgHierarchyTab from './tabs/OrgHierarchyTab';
import PublicUsersTab from './tabs/PublicUsersTab';
import ActiveSessionsTab from './tabs/ActiveSessionsTab';
import AuditLogsTab from './tabs/AuditLogsTab';

// Modals
import AddEditUserModal from './modals/AddEditUserModal';
import PermissionMatrixModal from './modals/PermissionMatrixModal';
import ResetPasswordModal from './modals/ResetPasswordModal';
import ImpersonateModal from './modals/ImpersonateModal';
import BulkImportExportModal from './modals/BulkImportExportModal';
import ConfirmActionModal from './modals/ConfirmActionModal';

import { DEFAULT_DEPARTMENTS } from './utils/userManagementUtils';

export default function UserManagementContainer({ initialUsers = [] }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [loading, setLoading] = useState(!initialUsers || initialUsers.length === 0);
  const [activeTab, setActiveTab] = useState('user_manage');
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);

  // Modals state
  const [addEditModal, setAddEditModal] = useState({ isOpen: false, user: null });
  const [savingAddEdit, setSavingAddEdit] = useState(false);

  const [permissionModal, setPermissionModal] = useState({ isOpen: false, user: null });
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [resetPasswordModal, setResetPasswordModal] = useState({ isOpen: false, user: null });
  const [savingPassword, setSavingPassword] = useState(false);

  const [impersonateModal, setImpersonateModal] = useState({ isOpen: false, user: null });
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

  // Confirm modal for dangerous actions (status, trash, restore, delete)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    type: 'warning',
    onConfirm: () => {}
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Notification Toast state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3500);
  };

  // Fetch users from backend
  const fetchUsers = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const data = await getTeamMembers();
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      showToast('Failed to load users: ' + err.message, 'error');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

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

  // Handler: Add or Edit User
  const handleSaveAddEditUser = async (formData) => {
    setSavingAddEdit(true);
    try {
      if (addEditModal.user) {
        // Edit Mode
        const res = await updateEmployeeDetailsAdmin(addEditModal.user.user_id, formData);
        if (res && res.success) {
          showToast(`Profile updated for ${formData.emp_name}!`, 'success');
          setAddEditModal({ isOpen: false, user: null });
          fetchUsers(false);
        } else {
          alert(res?.error || 'Failed to update employee details');
        }
      } else {
        // Add Mode
        const res = await createAccountAdmin(formData);
        if (res && res.success) {
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
      const res = await updateModuleAccess(userId, updatedAccess);
      if (res && res.success) {
        // Realtime broadcast to active user sessions
        try {
          const supabase = createClient();
          const syncChannel = supabase.channel('crm_realtime_permission_sync');
          await syncChannel.send({
            type: 'broadcast',
            event: 'permission_updated',
            payload: {
              userId,
              moduleAccess: updatedAccess,
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

  // Handler: Change Status
  const handleChangeStatus = (targetUser) => {
    const nextStatus = (targetUser.emp_status || '').toLowerCase() === 'active' ? 'InActive' : 'Active';
    setConfirmModal({
      isOpen: true,
      title: `Change Status to "${nextStatus}"?`,
      message: `Are you sure you want to mark ${targetUser.emp_name || targetUser.email} as ${nextStatus}?`,
      confirmText: `Set to ${nextStatus}`,
      type: nextStatus === 'Active' ? 'success' : 'warning',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await updateEmpStatus(targetUser.user_id, nextStatus);
          showToast(`Status updated to ${nextStatus}`, 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          fetchUsers(false);
        } catch (err) {
          alert('Failed to change status: ' + err.message);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
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
          await deleteUserAdmin(targetUser.user_id);
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

  // Navigation Subpage Tabs definition
  const subpages = [
    { id: 'user_manage', label: 'User Manage', icon: Users, badge: users.filter(u => u.role !== 'customer').length },
    { id: 'roles', label: 'Roles & Permissions', icon: Shield },
    { id: 'hierarchy', label: 'Org Hierarchy', icon: Network },
    { id: 'public', label: 'Public Users', icon: Globe, badge: users.filter(u => u.role === 'customer').length },
    { id: 'sessions', label: 'Active Sessions', icon: Monitor },
    { id: 'audit', label: 'Audit Logs', icon: Clock }
  ];

  return (
    <div style={{
      width: '100%',
      minHeight: '80vh',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
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

      {/* Clean Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '0.5rem',
        overflowX: 'auto'
      }}>
        {subpages.map(sub => {
          const Icon = sub.icon;
          const isActive = activeTab === sub.id;

          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => setActiveTab(sub.id)}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? 'var(--primary-color, #2563eb)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={16} />
              <span>{sub.label}</span>
              {typeof sub.badge === 'number' && sub.badge > 0 && (
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.05rem 0.45rem',
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
        {activeTab === 'user_manage' && (
          <UserManageTab
            users={users}
            loading={loading}
            departments={departments}
            onRefresh={() => fetchUsers(true)}
            onAddUser={() => setAddEditModal({ isOpen: true, user: null })}
            onEditUser={(u) => setAddEditModal({ isOpen: true, user: u })}
            onManagePermissions={(u) => setPermissionModal({ isOpen: true, user: u })}
            onResetPassword={(u) => setResetPasswordModal({ isOpen: true, user: u })}
            onImpersonate={(u) => setImpersonateModal({ isOpen: true, user: u })}
            onChangeStatus={handleChangeStatus}
            onMoveToTrash={handleMoveToTrash}
            onRestoreFromTrash={handleRestoreFromTrash}
            onHardDelete={handleHardDelete}
            onOpenBulkImport={() => setBulkImportModalOpen(true)}
            onExportCSV={handleExportCSV}
          />
        )}

        {activeTab === 'roles' && (
          <RolesPermissionsTab
            users={users}
            onManagePermissions={(u) => setPermissionModal({ isOpen: true, user: u })}
          />
        )}

        {activeTab === 'hierarchy' && (
          <OrgHierarchyTab
            users={users}
            departments={departments}
            onEditUser={(u) => setAddEditModal({ isOpen: true, user: u })}
          />
        )}

        {activeTab === 'public' && (
          <PublicUsersTab
            users={users}
            onRefresh={() => fetchUsers(false)}
            onResetPassword={(u) => setResetPasswordModal({ isOpen: true, user: u })}
          />
        )}

        {activeTab === 'sessions' && (
          <ActiveSessionsTab />
        )}

        {activeTab === 'audit' && (
          <AuditLogsTab />
        )}
      </div>

      {/* Global Modals */}
      <AddEditUserModal
        isOpen={addEditModal.isOpen}
        onClose={() => setAddEditModal({ isOpen: false, user: null })}
        user={addEditModal.user}
        onSave={handleSaveAddEditUser}
        departments={departments}
        allEmployees={users}
        saving={savingAddEdit}
      />

      <PermissionMatrixModal
        isOpen={permissionModal.isOpen}
        onClose={() => setPermissionModal({ isOpen: false, user: null })}
        user={permissionModal.user}
        onSave={handleSavePermissions}
        saving={savingPermissions}
      />

      <ResetPasswordModal
        isOpen={resetPasswordModal.isOpen}
        onClose={() => setResetPasswordModal({ isOpen: false, user: null })}
        user={resetPasswordModal.user}
        onSavePassword={handleSavePassword}
        saving={savingPassword}
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
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
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
