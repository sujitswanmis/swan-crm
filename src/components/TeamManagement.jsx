'use client';

import React, { useState, useEffect } from 'react';
import { getTeamMembers, updateUserRole, toggleUserApproval, toggleUserPermissions, toggleReadPermissions, toggleWritePermissions, updateEmployeeDetailsAdmin, updateModuleAccess, createAccountAdmin, updateEmpStatus, deleteUserAdmin } from '@/app/actions/team';
import { Eye, EyeOff, Search, ChevronDown, ChevronRight, CheckSquare, Square, Shield, Filter, Download, Upload, FileSpreadsheet, MessageSquare, Pencil, Key, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PremiumProgressLoader } from './PremiumProgressLoader';
import { createClient } from '@/utils/supabase/client';

import { MODULES_CONFIG } from '@/config/modulesConfig';

const DEFAULT_DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

const LEAD_STAGES = [
  '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', 
  '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage'
];

const DESIGNATIONS = [
  'Recruiter', 'Senior Recruiter', 'HR Manager', 'HR Executive',
  'Sales Manager', 'Sales Executive', 'Sales Officer',
  'Purchase Manager', 'Purchase Executive',
  'Operations Manager', 'Team Lead', 'Supervisor',
  'Director', 'General Manager', 'Assistant Manager',
  'IT Manager', 'System Administrator', 'Data Analyst',
  'Accountant', 'Finance Manager', 'Other'
];

const EMP_STATUS_OPTIONS = ['Active', 'InActive', 'Hold', 'Resigned', 'Terminated', 'Draft'];

function HoverIconButton({ icon: Icon, label, bg, color, borderColor, hoverBg, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: hovered ? (hoverBg || bg) : bg,
          color: color,
          border: `1px solid ${borderColor}`,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: hovered ? '0 2px 8px rgba(0, 0, 0, 0.12)' : 'none'
        }}
      >
        <Icon size={16} />
      </button>

      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          padding: '0.35rem 0.6rem',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          fontSize: '0.72rem',
          fontWeight: 600,
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 100,
          pointerEvents: 'none'
        }}>
          {label}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '4px',
            borderStyle: 'solid',
            borderColor: '#0f172a transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
}

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_designation: '', company: '', emp_mobile: '', email: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Add Account state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addForm, setAddForm] = useState({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_designation: '', emp_mobile: '', company: '', email: '', password: '' });
  const [savingAddUser, setSavingAddUser] = useState(false);
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);

  // Import / Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Access Manage state
  const [accessUser, setAccessUser] = useState(null);
  const [accessForm, setAccessForm] = useState({});
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessSearchQuery, setAccessSearchQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState({});

  // Password reset state
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Chat viewer state
  const [viewChatUser, setViewChatUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [userSessions, setUserSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const supabase = React.useMemo(() => createClient(), []);
  const [departments, setDepartments] = useState([]);

  const [confirmModal, setConfirmModal] = useState({
    show: false,
    userId: null,
    currentValue: null,
    userName: ''
  });

  const [deleteModal, setDeleteModal] = useState({
    show: false,
    userId: null,
    userName: ''
  });
  const [deletingUser, setDeletingUser] = useState(false);

  const handleConfirmDeleteUser = async () => {
    if (!deleteModal.userId) return;
    setDeletingUser(true);
    const result = await deleteUserAdmin(deleteModal.userId);
    setDeletingUser(false);
    if (result.success) {
      setDeleteModal({ show: false, userId: null, userName: '' });
      fetchUsers();
    } else {
      alert("Error deleting user: " + result.error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('name')
        .order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        setDepartments(data.map(d => d.name));
      } else {
        setDepartments(DEFAULT_DEPARTMENTS);
      }
    } catch (e) {
      console.error('Error fetching departments:', e);
      setDepartments(DEFAULT_DEPARTMENTS);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getTeamMembers();
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const updateRole = async (userId, newRole) => {
    await updateUserRole(userId, newRole);
    fetchUsers();
  };

  const toggleImportExport = async (userId, currentValue) => {
    await toggleUserPermissions(userId, !currentValue);
    fetchUsers();
  };

  const toggleReadAccess = async (userId, currentValue) => {
    const newValue = currentValue === false ? true : false;
    await toggleReadPermissions(userId, newValue);
    fetchUsers();
  };

  const toggleWriteAccess = async (userId, currentValue) => {
    const newValue = currentValue === false ? true : false;
    await toggleWritePermissions(userId, newValue);
    fetchUsers();
  };

  const toggleApproval = (userId, currentValue, userName) => {
    setConfirmModal({
      show: true,
      userId,
      currentValue,
      userName
    });
  };

  const confirmToggleApproval = async () => {
    const { userId, currentValue } = confirmModal;
    setConfirmModal({ show: false, userId: null, currentValue: null, userName: '' });
    try {
      await toggleUserApproval(userId, !currentValue);
      fetchUsers();
    } catch (e) {
      alert("Error toggling approval: " + e.message);
    }
  };

  const toggleRead = async (userId, currentValue) => {
    await toggleReadPermissions(userId, !currentValue);
    fetchUsers();
  };

  const toggleWrite = async (userId, currentValue) => {
    await toggleWritePermissions(userId, !currentValue);
    fetchUsers();
  };

  const handleEmpStatusChange = async (userId, newStatus) => {
    try {
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, emp_status: newStatus } : u));
      await updateEmpStatus(userId, newStatus);
    } catch (e) {
      alert("Error updating Emp Status: " + e.message);
      fetchUsers();
    }
  };

  const getEmpStatusStyle = (status) => {
    switch (status) {
      case 'Draft':
        return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
      case 'InActive':
        return { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
      case 'Hold':
        return { bg: '#fef9c3', color: '#854d0e', border: '#fef08a' };
      case 'Resigned':
        return { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' };
      case 'Terminated':
        return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' };
      case 'Active':
      default:
        return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
    }
  };

  const handleExportTeamCSV = () => {
    if (!users || users.length === 0) {
      alert("No users to export.");
      return;
    }
    const headers = ["Emp ID", "Emp Status", "Name", "Email", "Mobile", "Department", "Designation", "Company", "Approval Status", "Role"];
    const rows = filteredUsers.map(u => [
      `"${u.emp_id || ''}"`,
      `"${u.emp_status || 'Active'}"`,
      `"${u.emp_name || ''}"`,
      `"${u.email || ''}"`,
      `"${u.emp_mobile || ''}"`,
      `"${u.emp_department || ''}"`,
      `"${u.emp_designation || ''}"`,
      `"${u.company || 'All'}"`,
      `"${u.is_approved ? 'Approved' : 'Pending'}"`,
      `"${u.role || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Team_Members_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + "Emp ID,Emp Status,Name,Email,Password,Department,Designation,Mobile,Company\nEMP101,Active,John Doe,john@example.com,Password@123,Sales,Sales Executive,9876543210,NSMLR";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Team_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleProcessImportCSV = async () => {
    if (!importFile) {
      alert("Please select a CSV file to import.");
      return;
    }
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/).filter(l => l.trim());
        if (lines.length <= 1) {
          alert("CSV file is empty or missing data rows.");
          setImporting(false);
          return;
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
          if (!row || row.length < 4) continue;

          const emp_id = row[0] || `EMP-${Date.now()}`;
          const emp_status = row[1] || 'Active';
          const emp_name = row[2] || 'Team Member';
          const email = row[3];
          const password = row[4] || 'Swan@12345';
          const emp_department = row[5] || 'Sales';
          const emp_designation = row[6] || 'Executive';
          const emp_mobile = row[7] || '';
          const company = row[8] || 'NSMLR';

          if (!email) {
            failCount++;
            continue;
          }

          const res = await createAccountAdmin(email, password, {
            emp_id,
            emp_name,
            emp_department,
            emp_designation,
            emp_mobile,
            company,
            emp_status
          });

          if (res.success) successCount++;
          else failCount++;
        }

        alert(`Import Complete!\n\nSuccessfully Imported: ${successCount}\nFailed/Skipped: ${failCount}`);
        setShowImportModal(false);
        setImportFile(null);
        fetchUsers();
      } catch (err) {
        alert("Error reading CSV file: " + err.message);
      }
      setImporting(false);
    };
    reader.readAsText(importFile);
  };

  const handleEditClick = (user) => {
    setEditingUser(user.user_id);
    setEditForm({
      emp_id: user.emp_id || '',
      emp_status: user.emp_status || 'Active',
      emp_name: user.emp_name || '',
      emp_department: user.emp_department || '',
      emp_designation: user.emp_designation || '',
      company: user.company || '',
      emp_mobile: user.emp_mobile || '',
      email: user.email || ''
    });
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    const result = await updateEmployeeDetailsAdmin(editingUser, editForm);
    setSavingEdit(false);
    if (result.success) {
      setEditingUser(null);
      fetchUsers();
    } else {
      alert("Error saving details: " + result.error);
    }
  };

  const handleAccessClick = (user) => {
    setAccessUser(user.user_id);
    setAccessForm(user.module_access || {});
    setAccessSearchQuery('');
    setExpandedModules({});
  };

  const getModulePerms = (form, moduleId) => {
    const m = form[moduleId];
    if (!m) return { view: false, add: false, edit: false, delete: false };
    if (m === true) return { view: true, add: true, edit: true, delete: false };
    if (m.view === false) return { view: false, add: false, edit: false, delete: false };

    return {
      view: true,
      add: m.add !== false,
      edit: m.edit !== false,
      delete: m.delete === true
    };
  };

  const getSubItemPerms = (form, moduleId, subId) => {
    const parentPerms = getModulePerms(form, moduleId);
    if (!parentPerms.view) {
      return { view: false, add: false, edit: false, delete: false };
    }
    const subItems = form[moduleId]?.sub_items;
    if (!subItems || !subItems[subId]) {
      return { ...parentPerms };
    }
    const sub = subItems[subId];
    if (sub.view === false) {
      return { view: false, add: false, edit: false, delete: false };
    }
    return {
      view: true,
      add: sub.add !== false && parentPerms.add,
      edit: sub.edit !== false && parentPerms.edit,
      delete: sub.delete === true
    };
  };

  const handleToggleModulePerm = (moduleId, permType) => {
    setAccessForm(prev => {
      const current = getModulePerms(prev, moduleId);
      const newPermVal = !current[permType];

      if (permType === 'view') {
        if (!newPermVal) {
          const newState = { ...prev };
          delete newState[moduleId];
          return newState;
        } else {
          return {
            ...prev,
            [moduleId]: {
              ...(prev[moduleId] || {}),
              view: true,
              add: true,
              edit: true,
              delete: prev[moduleId]?.delete === true
            }
          };
        }
      } else {
        const updatedModule = {
          ...(prev[moduleId] || {}),
          view: true,
          [permType]: newPermVal
        };
        return {
          ...prev,
          [moduleId]: updatedModule
        };
      }
    });
  };

  const handleToggleSubItemPerm = (moduleId, subItemId, permType) => {
    setAccessForm(prev => {
      const currentSub = getSubItemPerms(prev, moduleId, subItemId);
      const newPermVal = !currentSub[permType];

      const moduleData = prev[moduleId] || { view: true, add: true, edit: true, delete: true, sub_items: {} };
      const currentSubItems = moduleData.sub_items || {};

      let updatedSub = { ...currentSub, [permType]: newPermVal };
      if (permType === 'view' && !newPermVal) {
        updatedSub.add = false;
        updatedSub.edit = false;
        updatedSub.delete = false;
      }
      if (permType !== 'view' && newPermVal) {
        updatedSub.view = true;
      }

      return {
        ...prev,
        [moduleId]: {
          ...moduleData,
          view: true,
          sub_items: {
            ...currentSubItems,
            [subItemId]: updatedSub
          }
        }
      };
    });
  };

  const handleToggleManagerLevel = (moduleId) => {
    setAccessForm(prev => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        is_manager: !prev[moduleId]?.is_manager
      }
    }));
  };

  const handleSelectAllSubItems = (module, permType, value) => {
    setAccessForm(prev => {
      const moduleData = prev[module.id] || { view: true, add: true, edit: true, delete: true, sub_items: {} };
      const newSubItems = { ...(moduleData.sub_items || {}) };

      (module.subItems || []).forEach(sub => {
        const cur = getSubItemPerms(prev, module.id, sub.id);
        let updated = { ...cur, [permType]: value };
        if (permType === 'view' && !value) {
          updated.add = false;
          updated.edit = false;
          updated.delete = false;
        }
        if (permType !== 'view' && value) {
          updated.view = true;
        }
        newSubItems[sub.id] = updated;
      });

      return {
        ...prev,
        [module.id]: {
          ...moduleData,
          view: value || moduleData.view,
          sub_items: newSubItems
        }
      };
    });
  };

  const toggleExpandModule = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  const handleSaveAccess = async () => {
    setSavingAccess(true);
    const result = await updateModuleAccess(accessUser, accessForm);
    setSavingAccess(false);
    if (result.success) {
      setAccessUser(null);
      fetchUsers();
    } else {
      alert("Error saving access: " + result.error);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: passwordUser, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Password updated successfully!");
        setPasswordUser(null);
        setNewPassword('');
      } else {
        alert("Error: " + data.error);
      }
    } catch (e) {
      alert("Error updating password: " + e.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleViewChatClick = async (user) => {
    setViewChatUser(user);
    setUserSessions([]);
    setSelectedSessionId('');
    setChatMessages([]);
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/ai/history?userId=${user.user_id}`);
      if (res.ok) {
        const data = await res.json();
        const sessions = data.sessions || [];
        setUserSessions(sessions);
        if (sessions.length > 0) {
          const latestSession = sessions[sessions.length - 1];
          setSelectedSessionId(latestSession.id);
          setChatMessages(latestSession.messages || []);
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
    setLoadingChat(false);
  };

  const handleSessionChange = (sessionId) => {
    setSelectedSessionId(sessionId);
    const selected = userSessions.find(s => s.id === sessionId);
    setChatMessages(selected ? selected.messages || [] : []);
  };

  const handleSaveAddUser = async () => {
    if (!addForm.email || !addForm.password || !addForm.emp_id || !addForm.emp_name) {
      alert("Email, Password, Emp ID, and Name are required.");
      return;
    }
    setSavingAddUser(true);
    const result = await createAccountAdmin(addForm.email, addForm.password, {
      emp_id: addForm.emp_id,
      emp_status: addForm.emp_status || 'Active',
      emp_name: addForm.emp_name,
      emp_department: addForm.emp_department,
      emp_designation: addForm.emp_designation,
      emp_mobile: addForm.emp_mobile,
      company: addForm.company,
      emp_official_mail_id: addForm.email
    });
    setSavingAddUser(false);
    if (result.success) {
      setShowAddUserModal(false);
      setAddForm({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_designation: '', emp_mobile: '', company: '', email: '', password: '' });
      fetchUsers();
    } else {
      alert("Error adding user: " + result.error);
    }
  };

  const handleSaveAddUserDraft = async () => {
    if (!addForm.emp_name && !addForm.email && !addForm.emp_id) {
      alert("Please enter at least an Emp Name, Email, or Emp ID to save draft.");
      return;
    }
    setSavingAddUser(true);
    const fallbackId = addForm.emp_id || `DRAFT-${Date.now().toString().slice(-6)}`;
    const fallbackEmail = addForm.email || `${fallbackId.toLowerCase()}@draft.local`;
    const fallbackPassword = addForm.password || 'DraftPass@123';

    const result = await createAccountAdmin(fallbackEmail, fallbackPassword, {
      emp_id: fallbackId,
      emp_status: 'Draft',
      emp_name: addForm.emp_name || 'Draft Employee',
      emp_department: addForm.emp_department || '',
      emp_designation: addForm.emp_designation || '',
      emp_mobile: addForm.emp_mobile || '',
      company: addForm.company || '',
      emp_official_mail_id: fallbackEmail
    });
    setSavingAddUser(false);
    if (result.success) {
      setShowAddUserModal(false);
      setAddForm({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_designation: '', emp_mobile: '', company: '', email: '', password: '' });
      fetchUsers();
    } else {
      alert("Error saving draft: " + result.error);
    }
  };

  const filteredUsers = users.filter(u => {
    // Filter out public customers from Team Management list
    if (u.role === 'customer') return false;

    const q = searchQuery.toLowerCase();
    return (
      (u.emp_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.emp_id || '').toLowerCase().includes(q) ||
      (u.emp_mobile || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <PremiumProgressLoader message="Loading Team Workplace" active={loading} />;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Team Roles & Permissions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Manage what your team members can see and do within the CRM. Only Admins can access this panel.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search by name, email, ID, or mobile..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', width: '100%', maxWidth: '350px' }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={handleExportTeamCSV}
            className="btn-action-secondary"
            style={{ padding: '0.55rem 1rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
            title="Export team data to CSV"
          >
            <Download size={16} /> Export CSV
          </button>
          <button 
            onClick={() => setShowImportModal(true)}
            className="btn-action-primary"
            style={{ padding: '0.55rem 1rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', backgroundColor: '#0284c7', color: '#fff', border: 'none' }}
            title="Import team members from CSV"
          >
            <Upload size={16} /> Import CSV
          </button>
          <button 
            onClick={() => setShowAddUserModal(true)}
            className="btn-primary"
            style={{ padding: '0.6rem 1.5rem', borderRadius: '6px' }}
          >
            Add New User
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', width: '100%', maxHeight: 'calc(100vh - 260px)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
        <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.9rem' }}>
          <thead style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
          <tr>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Emp ID</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Emp Status</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Name, Email & Mobile</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Dept / Desig</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Company</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Approval Status</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Role</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Permissions</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(user => (
            <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '1rem', fontWeight: 500 }}>{user.emp_id || '-'}</td>
              <td style={{ padding: '1rem' }}>
                {(() => {
                  const s = user.emp_status || 'Active';
                  const style = getEmpStatusStyle(s);
                  return (
                    <select
                      value={s}
                      onChange={(e) => handleEmpStatusChange(user.user_id, e.target.value)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: style.bg,
                        color: style.color,
                        border: `1px solid ${style.border}`,
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      {EMP_STATUS_OPTIONS.map(opt => (
                        <option key={opt} value={opt} style={{ background: '#fff', color: '#000' }}>{opt}</option>
                      ))}
                    </select>
                  );
                })()}
              </td>
              <td style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 600 }}>{user.emp_name || '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.email}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.emp_mobile || '-'}</div>
              </td>
              <td style={{ padding: '1rem' }}>
                <div>{user.emp_department || '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.emp_designation || '-'}</div>
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--th-hover-bg)', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{user.company || 'All'}</span>
              </td>
              <td style={{ padding: '1rem' }}>
                <button 
                  onClick={() => toggleApproval(user.user_id, user.is_approved, user.emp_name || user.email)}
                  disabled={user.role === 'admin'}
                  style={{ 
                    padding: '0.3rem 0.6rem', 
                    borderRadius: '99px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    border: 'none', 
                    cursor: user.role === 'admin' ? 'not-allowed' : 'pointer',
                    backgroundColor: user.is_approved ? '#dcfce7' : '#fee2e2',
                    color: user.is_approved ? '#166534' : '#991b1b'
                  }}
                >
                  {user.is_approved ? '✓ Approved' : '⏳ Pending'}
                </button>
              </td>
              <td style={{ padding: '1rem' }}>
                <select 
                  value={user.role} 
                  onChange={(e) => updateRole(user.user_id, e.target.value)}
                  disabled={user.role === 'admin'}
                  style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Sales">Sales</option>
                  <option value="Recruiter">Recruiter</option>
                  <option value="Purchase">Purchase</option>
                  <option value="agent">Agent (Legacy)</option>
                </select>
              </td>
              <td style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button 
                    onClick={() => handleAccessClick(user)}
                    disabled={user.role === 'admin' || user.role === 'Admin'}
                    className="btn-action-primary"
                    style={{ cursor: (user.role === 'admin' || user.role === 'Admin') ? 'not-allowed' : 'pointer' }}
                  >
                    Manage Access
                  </button>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                    <input 
                      type="checkbox" 
                      checked={user.can_import_export} 
                      onChange={() => toggleImportExport(user.user_id, user.can_import_export)}
                      disabled={user.role === 'Admin' || user.role === 'admin'}
                    />
                    Import/Export Power
                  </label>
                </div>
              </td>
              <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                  <HoverIconButton
                    icon={MessageSquare}
                    label="View Chat"
                    bg="#dcfce7"
                    hoverBg="#bbf7d0"
                    color="#15803d"
                    borderColor="#bbf7d0"
                    onClick={() => handleViewChatClick(user)}
                  />
                  <HoverIconButton
                    icon={Pencil}
                    label="Edit User"
                    bg="#eff6ff"
                    hoverBg="#dbeafe"
                    color="#1d4ed8"
                    borderColor="#bfdbfe"
                    onClick={() => handleEditClick(user)}
                  />
                  <HoverIconButton
                    icon={Key}
                    label="Change Password"
                    bg="#fff1f2"
                    hoverBg="#fecdd3"
                    color="#be123c"
                    borderColor="#fecdd3"
                    onClick={() => setPasswordUser(user.user_id)}
                  />
                  <HoverIconButton
                    icon={Trash2}
                    label="Delete User"
                    bg="#fee2e2"
                    hoverBg="#fecaca"
                    color="#991b1b"
                    borderColor="#fecaca"
                    onClick={() => setDeleteModal({ show: true, userId: user.user_id, userName: user.emp_name || user.email })}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '430px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center',
            color: 'var(--text-primary)'
          }}>
            <div style={{ fontSize: '2.8rem', marginBottom: '1rem' }}>❓</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem' }}>Confirm Status Change</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to {confirmModal.currentValue ? 'suspend/unapprove' : 'approve'} <strong>{confirmModal.userName}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setConfirmModal({ show: false, userId: null, currentValue: null, userName: '' })}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmToggleApproval}
                className="btn-primary"
                style={{ 
                  padding: '0.6rem 1.5rem', 
                  borderRadius: '8px', 
                  backgroundColor: confirmModal.currentValue ? '#dc2626' : '#16a34a',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Yes, {confirmModal.currentValue ? 'Unapprove' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '430px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center',
            color: 'var(--text-primary)'
          }}>
            <div style={{ fontSize: '2.8rem', marginBottom: '1rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem', color: '#dc2626' }}>Delete Employee Account</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to delete <strong>{deleteModal.userName}</strong>? This action will permanently remove their access and details.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setDeleteModal({ show: false, userId: null, userName: '' })}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDeleteUser}
                disabled={deletingUser}
                style={{ 
                  padding: '0.6rem 1.5rem', 
                  borderRadius: '8px', 
                  backgroundColor: '#dc2626',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: deletingUser ? 'not-allowed' : 'pointer'
                }}
              >
                {deletingUser ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Create New Account</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email Address *</label>
                <input 
                  type="email" 
                  value={addForm.email} 
                  onChange={e => setAddForm({...addForm, email: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password *</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showAddUserPassword ? "text" : "password"} 
                    value={addForm.password} 
                    onChange={e => setAddForm({...addForm, password: e.target.value})}
                    style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddUserPassword(!showAddUserPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showAddUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp ID *</label>
                <input 
                  type="text" 
                  value={addForm.emp_id} 
                  onChange={e => setAddForm({...addForm, emp_id: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Status</label>
                <select 
                  value={addForm.emp_status || 'Active'} 
                  onChange={e => setAddForm({...addForm, emp_status: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  {EMP_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name *</label>
                <input 
                  type="text" 
                  value={addForm.emp_name} 
                  onChange={e => setAddForm({...addForm, emp_name: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mobile Number</label>
                <input 
                  type="tel" 
                  value={addForm.emp_mobile} 
                  onChange={e => setAddForm({...addForm, emp_mobile: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                <select 
                  value={addForm.company} 
                  onChange={e => setAddForm({...addForm, company: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">Select Company...</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Department</label>
                <select 
                  value={addForm.emp_department} 
                  onChange={e => setAddForm({...addForm, emp_department: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">Select Department...</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                <input 
                  type="text"
                  list="designation_options"
                  value={addForm.emp_designation} 
                  onChange={e => setAddForm({...addForm, emp_designation: e.target.value})}
                  placeholder="Enter designation (e.g. Sales Executive)"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
                <datalist id="designation_options">
                  {DESIGNATIONS.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button 
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveAddUserDraft}
                disabled={savingAddUser}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                title="Save partial registration details as Draft"
              >
                📝 Save as Draft
              </button>
              <button 
                type="button"
                onClick={handleSaveAddUser}
                disabled={savingAddUser || !addForm.email || !addForm.password || !addForm.emp_id || !addForm.emp_name}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingAddUser ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '480px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Upload size={20} style={{ color: '#0284c7' }} /> Import Team Members from CSV
              </h3>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              Upload a `.csv` file containing employee details. Download the sample CSV template first to verify column names.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="btn-action-secondary"
                style={{ width: '100%', padding: '0.66rem', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px dashed var(--border-light)', fontSize: '0.85rem' }}
              >
                <FileSpreadsheet size={16} style={{ color: '#0284c7' }} /> Download Sample CSV Template
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Select CSV File *</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => setImportFile(e.target.files[0])}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setImportFile(null); }}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProcessImportCSV}
                disabled={importing || !importFile}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', backgroundColor: '#0284c7', border: 'none', color: '#fff' }}
              >
                {importing ? 'Importing...' : 'Import Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Edit Employee Details</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp ID</label>
                <input 
                  type="text" 
                  value={editForm.emp_id} 
                  onChange={e => setEditForm({...editForm, emp_id: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Status</label>
                <select 
                  value={editForm.emp_status || 'Active'} 
                  onChange={e => setEditForm({...editForm, emp_status: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  {EMP_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name</label>
                <input 
                  type="text" 
                  value={editForm.emp_name} 
                  onChange={e => setEditForm({...editForm, emp_name: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Department</label>
                <select 
                  value={editForm.emp_department} 
                  onChange={e => setEditForm({...editForm, emp_department: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">Select Department...</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                <input 
                  type="text"
                  list="designation_options"
                  value={editForm.emp_designation} 
                  onChange={e => setEditForm({...editForm, emp_designation: e.target.value})}
                  placeholder="Enter designation (e.g. Sales Executive)"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email Address</label>
                <input 
                  type="email" 
                  value={editForm.email || ''} 
                  onChange={e => setEditForm({...editForm, email: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mobile Number</label>
                <input 
                  type="tel" 
                  value={editForm.emp_mobile} 
                  onChange={e => setEditForm({...editForm, emp_mobile: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                <select 
                  value={editForm.company} 
                  onChange={e => setEditForm({...editForm, company: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">All Companies</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setEditingUser(null)}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Modal */}
      {accessUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '95%', maxWidth: '880px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderRadius: '14px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            
            {/* Fixed Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', zIndex: 10 }}>
              {(() => {
                const u = users.find(x => x.user_id === accessUser);
                return u ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px dashed var(--border-light)' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{u.emp_name || 'Unknown User'}</h3>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{u.email} ({u.emp_department || 'No Dept'} — {u.emp_designation || u.role})</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'var(--nav-active-bg)', color: 'var(--accent-color)', fontWeight: 600 }}>
                      Manage Permissions
                    </span>
                  </div>
                ) : null;
              })()}
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, position: 'relative', minWidth: '220px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input 
                    type="text"
                    value={accessSearchQuery}
                    onChange={e => setAccessSearchQuery(e.target.value)}
                    placeholder="Search page, sub-page, sub-menu, or tab..."
                    style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  4-Column Ultra-Granular Permission Control
                </div>
              </div>
            </div>
            
            {/* Scrollable Content */}
            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, backgroundColor: 'var(--bg-default)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Global Permissions Section */}
                <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                  <div style={{ padding: '0.6rem 1rem', backgroundColor: 'var(--bg-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    Additional System Powers
                  </div>
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    {(() => {
                      const u = users.find(x => x.user_id === accessUser);
                      if (!u) return null;
                      return (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={!!u.can_import_export} 
                            onChange={() => toggleImportExport(u.user_id, !!u.can_import_export)}
                            disabled={u.role === 'Admin' || u.role === 'admin'}
                            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent-color)' }}
                          />
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Import/Export Data Power</span>
                        </label>
                      );
                    })()}
                  </div>
                </div>

                {/* Matrix Legend Header */}
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <div style={{ flex: 1 }}>Module / Page / Sub-Page / Tab</div>
                  <div style={{ width: '55px', textAlign: 'center', color: '#0284c7' }}>VIEW</div>
                  <div style={{ width: '55px', textAlign: 'center', color: '#16a34a' }}>ADD</div>
                  <div style={{ width: '70px', textAlign: 'center', color: '#d97706' }}>EDIT/SAVE</div>
                  <div style={{ width: '55px', textAlign: 'center', color: '#dc2626' }}>DELETE</div>
                </div>

                {['General', 'Sales', 'Purchase', 'Human Resource', 'System'].map(category => {
                  const filteredModules = MODULES_CONFIG.filter(m => {
                    if (m.category !== category) return false;
                    if (!accessSearchQuery.trim()) return true;
                    const q = accessSearchQuery.toLowerCase();
                    if (m.label.toLowerCase().includes(q)) return true;
                    if (m.subItems && m.subItems.some(sub => sub.label.toLowerCase().includes(q))) return true;
                    return false;
                  });

                  if (filteredModules.length === 0) return null;

                  return (
                    <div key={category} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ padding: '0.65rem 1rem', backgroundColor: 'var(--bg-primary)', fontWeight: 700, borderBottom: '1px solid var(--border-light)', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{category === 'General' ? 'Core Features & Dashboards' : `${category} Department`}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{filteredModules.length} Modules</span>
                      </div>

                      <div style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {filteredModules.map(module => {
                          const mAccess = accessForm[module.id] || {};
                          const mPerms = getModulePerms(accessForm, module.id);
                          const canView = mPerms.view;
                          const canAdd = mPerms.add;
                          const canEdit = mPerms.edit;
                          const canDelete = mPerms.delete;

                          const isExpanded = expandedModules[module.id] || (accessSearchQuery.trim().length > 0);
                          const hasSubItems = module.subItems && module.subItems.length > 0;

                          return (
                            <div 
                              key={module.id} 
                              style={{ 
                                border: '1px solid var(--border-light)', 
                                borderRadius: '8px', 
                                backgroundColor: canView ? 'var(--nav-active-bg)' : 'transparent',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Parent Module Row */}
                              <div style={{ display: 'flex', alignItems: 'center', padding: '0.65rem 0.75rem', gap: '0.5rem' }}>
                                {hasSubItems ? (
                                  <button
                                    onClick={() => toggleExpandModule(module.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                                    title={isExpanded ? "Collapse sub-items" : "Expand sub-items"}
                                  >
                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                  </button>
                                ) : (
                                  <div style={{ width: '22px' }} />
                                )}

                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ fontSize: '0.95rem', fontWeight: canView ? 600 : 400, color: 'var(--text-primary)' }}>{module.label}</span>
                                  {hasSubItems && (
                                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px', backgroundColor: 'var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                      {module.subItems.length} Tabs/Sub-pages
                                    </span>
                                  )}
                                </div>

                                {/* Parent 4 Checkboxes */}
                                <div style={{ width: '55px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    checked={canView}
                                    onChange={() => handleToggleModulePerm(module.id, 'view')}
                                    title="View Access"
                                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#0284c7', cursor: 'pointer' }}
                                  />
                                </div>
                                <div style={{ width: '55px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    checked={canAdd}
                                    onChange={() => handleToggleModulePerm(module.id, 'add')}
                                    title="Add Access"
                                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#16a34a', cursor: 'pointer' }}
                                  />
                                </div>
                                <div style={{ width: '70px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    checked={canEdit}
                                    onChange={() => handleToggleModulePerm(module.id, 'edit')}
                                    title="Edit/Save Access"
                                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#d97706', cursor: 'pointer' }}
                                  />
                                </div>
                                <div style={{ width: '55px', textAlign: 'center' }}>
                                  <input 
                                    type="checkbox"
                                    checked={canDelete}
                                    onChange={() => handleToggleModulePerm(module.id, 'delete')}
                                    title="Delete Access"
                                    style={{ width: '1.1rem', height: '1.1rem', accentColor: '#dc2626', cursor: 'pointer' }}
                                  />
                                </div>
                              </div>

                              {/* Special Override: Leads / Recruiter Manager Access */}
                              {(module.id === 'leads' || module.id === 'recruiter') && (
                                <div style={{ padding: '0.4rem 0.75rem 0.6rem 2.25rem', borderTop: '1px dashed var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#0369a1', fontWeight: 600, fontSize: '0.82rem' }}>
                                    <input 
                                      type="checkbox"
                                      checked={!!mAccess.is_manager}
                                      onChange={() => handleToggleManagerLevel(module.id)}
                                      style={{ accentColor: '#0369a1' }}
                                    />
                                    Full Manager / Admin Level Override (Unrestricted access to all workflow stages)
                                  </label>
                                </div>
                              )}

                              {/* Nested Sub-Items Table */}
                              {hasSubItems && (isExpanded || accessSearchQuery.trim()) && (
                                <div style={{ borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', padding: '0.5rem 0.75rem 0.75rem 2rem' }}>
                                  {/* Quick Select Actions */}
                                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Quick Sub-Tab Toggles:</span>
                                    <button type="button" onClick={() => handleSelectAllSubItems(module, 'view', true)} style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>All View ON</button>
                                    <button type="button" onClick={() => handleSelectAllSubItems(module, 'view', false)} style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fecdd3', background: '#fff1f2', color: '#be123c', cursor: 'pointer' }}>All View OFF</button>
                                    <button type="button" onClick={() => handleSelectAllSubItems(module, 'edit', true)} style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fef08a', background: '#fefce8', color: '#a16207', cursor: 'pointer' }}>All Edit ON</button>
                                    <button type="button" onClick={() => handleSelectAllSubItems(module, 'delete', true)} style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}>All Delete ON</button>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {module.subItems.map(sub => {
                                      const subAccess = getSubItemPerms(accessForm, module.id, sub.id);

                                      return (
                                        <div key={sub.id} style={{ display: 'flex', alignItems: 'center', padding: '0.35rem 0.5rem', borderRadius: '4px', backgroundColor: subAccess.view ? '#f0f9ff' : 'transparent', borderBottom: '1px solid var(--border-light)' }}>
                                          <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: subAccess.view ? 600 : 400, color: 'var(--text-primary)' }}>
                                            ↳ {sub.label}
                                          </div>

                                          <div style={{ width: '55px', textAlign: 'center' }}>
                                            <input 
                                              type="checkbox"
                                              checked={subAccess.view}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'view')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#0284c7', cursor: 'pointer' }}
                                            />
                                          </div>
                                          <div style={{ width: '55px', textAlign: 'center' }}>
                                            <input 
                                              type="checkbox"
                                              checked={subAccess.add}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'add')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#16a34a', cursor: 'pointer' }}
                                            />
                                          </div>
                                          <div style={{ width: '70px', textAlign: 'center' }}>
                                            <input 
                                              type="checkbox"
                                              checked={subAccess.edit}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'edit')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#d97706', cursor: 'pointer' }}
                                            />
                                          </div>
                                          <div style={{ width: '55px', textAlign: 'center' }}>
                                            <input 
                                              type="checkbox"
                                              checked={subAccess.delete}
                                              onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'delete')}
                                              style={{ width: '1rem', height: '1rem', accentColor: '#dc2626', cursor: 'pointer' }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fixed Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', zIndex: 10 }}>
              <button 
                onClick={() => setAccessUser(null)}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAccess}
                disabled={savingAccess}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '6px' }}
              >
                {savingAccess ? 'Saving Access...' : 'Save Granular Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            {(() => {
              const u = users.find(x => x.user_id === passwordUser);
              return u ? (
                <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{u.emp_name || 'Unknown User'}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                </div>
              ) : null;
            })()}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Change Password</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showResetPassword ? "text" : "password"} 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter minimum 6 characters"
                  style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setPasswordUser(null); setNewPassword(''); }}
                className="btn-action-secondary"
                style={{ padding: '0.5rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePassword}
                disabled={savingPassword}
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px', background: '#b91c1c', color: 'white', border: 'none', cursor: savingPassword ? 'not-allowed' : 'pointer' }}
              >
                {savingPassword ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Chat Modal */}
      {viewChatUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '650px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Team Member Chat History</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                  User: {viewChatUser.emp_name || 'Team Member'} ({viewChatUser.emp_id || '-'})
                </p>
              </div>
              <button 
                onClick={() => setViewChatUser(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>

            {/* Session selector */}
            {!loadingChat && userSessions.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Chat Session:</span>
                <select 
                  value={selectedSessionId}
                  onChange={(e) => handleSessionChange(e.target.value)}
                  style={{ 
                    padding: '0.4rem 0.75rem', 
                    borderRadius: '6px', 
                    border: '1px solid var(--border-light)', 
                    backgroundColor: 'var(--bg-surface)', 
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {userSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.id} ({s.updated_at ? new Date(s.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', minHeight: '350px', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {loadingChat ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '350px', color: 'var(--text-secondary)' }}>
                  Loading chat logs...
                </div>
              ) : chatMessages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '350px', color: 'var(--text-secondary)' }}>
                  No chat history recorded yet for this team member.
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div style={{ 
                        maxWidth: '85%', 
                        padding: '0.75rem 1rem', 
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        lineHeight: 1.45,
                        backgroundColor: isUser ? '#1e3a8a' : 'var(--th-bg)',
                        color: isUser ? '#ffffff' : 'var(--text-primary)',
                        border: isUser ? 'none' : '1px solid var(--border-light)',
                        textAlign: 'left'
                      }}>
                        <div style={{ fontSize: '0.7rem', color: isUser ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                          {isUser ? 'User' : 'Swan AI'}
                        </div>
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
              <button 
                onClick={() => setViewChatUser(null)}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
