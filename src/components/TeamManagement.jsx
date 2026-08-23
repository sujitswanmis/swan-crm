'use client';

import React, { useState, useEffect } from 'react';
import { getTeamMembers, updateUserRole, toggleUserApproval, toggleUserPermissions, toggleReadPermissions, toggleWritePermissions, updateEmployeeDetailsAdmin, updateModuleAccess, createAccountAdmin, bulkImportEmployeesFast, cleanupDummyImportAccounts, updateEmpStatus, deleteUserAdmin, moveToTrashUser, restoreUserFromTrash, toggleSelfPasswordReset, sendAdminPasswordResetLink } from '@/app/actions/team';
import { Eye, EyeOff, Search, ChevronDown, ChevronRight, CheckSquare, Square, Shield, Filter, Download, Upload, FileSpreadsheet, MessageSquare, Pencil, Key, Trash2, RotateCcw, Archive, RefreshCw, Send, Check, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
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
  'lead_dashboard', 'hourly_work', '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', 
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

const EMP_STATUS_OPTIONS = ['Active', 'InActive', 'Hold', 'Resigned', 'Terminated', 'Draft', 'Trash'];

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

const WORK_LOCATION_TYPES = [
  'Primary',
  'Secondary',
  'Regional',
  'Territorial',
  'Field-Based',
  'Headquarters',
  'Hybrid',
  'Temporary',
  'Group-Level',
  'National',
  'Global',
  'National/Global'
];

export default function TeamManagement({ initialUsers = [] }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [loading, setLoading] = useState(!initialUsers || initialUsers.length === 0);

  // Edit state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_sub_department: '', emp_designation: '', company: '', work_location_type: '', work_location_name: '', emp_mobile: '', emp_alt_mobile: '', email: '', primary_reporting_person: '', secondary_reporting_person: '', hod_person: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Add Account state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addForm, setAddForm] = useState({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_sub_department: '', emp_designation: '', emp_mobile: '', emp_alt_mobile: '', company: '', work_location_type: '', work_location_name: '', email: '', password: '', primary_reporting_person: '', secondary_reporting_person: '', hod_person: '' });
  const [savingAddUser, setSavingAddUser] = useState(false);
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);

  // Import / Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    percentage: 0,
    currentName: '',
    createdCount: 0,
    updatedCount: 0,
    failCount: 0,
    logs: [],
    complete: false,
    failReasons: []
  });

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

  // Status Tabs State
  const [selectedTab, setSelectedTab] = useState('All');

  const [confirmModal, setConfirmModal] = useState({
    show: false,
    userId: null,
    currentValue: null,
    userName: ''
  });

  const [roleConfirmModal, setRoleConfirmModal] = useState({
    show: false,
    userId: null,
    userName: '',
    currentRole: '',
    newRole: ''
  });
  const [changingRole, setChangingRole] = useState(false);

  const [statusConfirmModal, setStatusConfirmModal] = useState({
    show: false,
    userId: null,
    userName: '',
    currentStatus: '',
    newStatus: ''
  });
  const [changingStatus, setChangingStatus] = useState(false);

  const [deleteModal, setDeleteModal] = useState({
    show: false,
    userId: null,
    userName: ''
  });
  const [deletingUser, setDeletingUser] = useState(false);

  const [trashConfirmModal, setTrashConfirmModal] = useState({
    show: false,
    userId: null,
    userName: ''
  });
  const [movingToTrash, setMovingToTrash] = useState(false);

  const [sendResetEmailModal, setSendResetEmailModal] = useState({
    show: false,
    user: null,
    sending: false,
    successMsg: null,
    errorMsg: null
  });

  const handleConfirmMoveToTrash = async () => {
    if (!trashConfirmModal.userId) return;
    setMovingToTrash(true);
    await moveToTrashUser(trashConfirmModal.userId);
    setMovingToTrash(false);
    setTrashConfirmModal({ show: false, userId: null, userName: '' });
    fetchUsers(false);
  };

  const handleRestoreUser = async (userId) => {
    try {
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, emp_status: 'Active' } : u));
      await restoreUserFromTrash(userId, 'Active');
      fetchUsers(false);
    } catch (e) {
      alert("Error restoring user: " + e.message);
      fetchUsers(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteModal.userId) return;
    setDeletingUser(true);
    const result = await deleteUserAdmin(deleteModal.userId);
    setDeletingUser(false);
    if (result.success) {
      setDeleteModal({ show: false, userId: null, userName: '' });
      fetchUsers(false);
    } else {
      alert("Error deleting user: " + result.error);
    }
  };

  const handleToggleSelfReset = async (userId, currentStatus) => {
    const res = await toggleSelfPasswordReset(userId, currentStatus);
    if (res.success) {
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_self_reset_password: res.can_self_reset_password } : u));
    }
  };

  const handleOpenSendResetModal = (user) => {
    setSendResetEmailModal({
      show: true,
      user,
      sending: false,
      successMsg: null,
      errorMsg: null
    });
  };

  const handleConfirmSendResetEmail = async () => {
    if (!sendResetEmailModal.user) return;
    setSendResetEmailModal(prev => ({ ...prev, sending: true, errorMsg: null, successMsg: null }));
    const res = await sendAdminPasswordResetLink(sendResetEmailModal.user.user_id);
    if (res.success) {
      setSendResetEmailModal(prev => ({ ...prev, sending: false, successMsg: res.message }));
      setTimeout(() => {
        setSendResetEmailModal({ show: false, user: null, sending: false, successMsg: null, errorMsg: null });
      }, 2000);
    } else {
      setSendResetEmailModal(prev => ({ ...prev, sending: false, errorMsg: res.error }));
    }
  };

  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) {
      setUsers(initialUsers);
      setLoading(false);
    }
    fetchUsers(users.length === 0 && (!initialUsers || initialUsers.length === 0));
    fetchDepartments();

    // Safety timeout: Never stay stuck in loading state longer than 2.5 seconds
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [initialUsers]);

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

  const fetchUsers = async (showLoader = false) => {
    if (showLoader && users.length === 0) setLoading(true);
    try {
      const data = await getTeamMembers();
      if (data && Array.isArray(data)) {
        setUsers(data);
      }
    } catch (e) {
      console.error('fetchUsers error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRoleChange = (userId, userName, currentRole, newRole) => {
    if (currentRole === newRole) return;
    setRoleConfirmModal({
      show: true,
      userId,
      userName,
      currentRole,
      newRole
    });
  };

  const confirmRoleChange = async () => {
    const { userId, newRole } = roleConfirmModal;
    if (!userId || !newRole) return;
    setChangingRole(true);
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role: newRole } : u));
    try {
      await updateUserRole(userId, newRole);
    } catch (e) {
      alert("Error updating role: " + e.message);
    } finally {
      setChangingRole(false);
      setRoleConfirmModal({ show: false, userId: null, userName: '', currentRole: '', newRole: '' });
      fetchUsers(false);
    }
  };

  const handleRequestStatusChange = (userId, userName, currentStatus, newStatus) => {
    if (currentStatus === newStatus) return;
    setStatusConfirmModal({
      show: true,
      userId,
      userName,
      currentStatus,
      newStatus
    });
  };

  const confirmStatusChange = async () => {
    const { userId, newStatus } = statusConfirmModal;
    if (!userId || !newStatus) return;
    setChangingStatus(true);
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, emp_status: newStatus } : u));
    try {
      await updateEmpStatus(userId, newStatus);
    } catch (e) {
      alert("Error updating Emp Status: " + e.message);
    } finally {
      setChangingStatus(false);
      setStatusConfirmModal({ show: false, userId: null, userName: '', currentStatus: '', newStatus: '' });
      fetchUsers(false);
    }
  };

  const toggleImportExport = async (userId, currentValue) => {
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_import_export: !currentValue } : u));
    await toggleUserPermissions(userId, !currentValue);
    fetchUsers(false);
  };

  const toggleReadAccess = async (userId, currentValue) => {
    const newValue = currentValue === false ? true : false;
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_read: newValue } : u));
    await toggleReadPermissions(userId, newValue);
    fetchUsers(false);
  };

  const toggleWriteAccess = async (userId, currentValue) => {
    const newValue = currentValue === false ? true : false;
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_write: newValue } : u));
    await toggleWritePermissions(userId, newValue);
    fetchUsers(false);
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
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_approved: !currentValue } : u));
    try {
      await toggleUserApproval(userId, !currentValue);
      fetchUsers(false);
    } catch (e) {
      alert("Error toggling approval: " + e.message);
      fetchUsers(false);
    }
  };

  const toggleRead = async (userId, currentValue) => {
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_read: !currentValue } : u));
    await toggleReadPermissions(userId, !currentValue);
    fetchUsers(false);
  };

  const toggleWrite = async (userId, currentValue) => {
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, can_write: !currentValue } : u));
    await toggleWritePermissions(userId, !currentValue);
    fetchUsers(false);
  };

  const getEmpStatusStyle = (status) => {
    switch (status) {
      case 'Trash':
        return { bg: '#ffe4e6', color: '#be123c', border: '#fecdd3' };
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

  // Helper: Parse RFC-4180 compliant CSV string with quoted multi-line/comma support
  const parseCSV = (text) => {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentToken = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentToken += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentToken.trim());
        currentToken = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        row.push(currentToken.trim());
        if (row.some(cell => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    if (currentToken.length > 0 || row.length > 0) {
      row.push(currentToken.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
    }
    return lines;
  };

  const handleExportTeamCSV = () => {
    if (!filteredUsers || filteredUsers.length === 0) {
      alert("No users to export.");
      return;
    }
    const headers = [
      "Emp ID",
      "Emp Status",
      "Name",
      "Email",
      "Mobile",
      "Alternate Mobile",
      "Company",
      "Work Location Type",
      "Work Location Name",
      "Department",
      "Sub-Department",
      "Designation",
      "Primary Reporting Person",
      "Secondary Reporting Person",
      "HOD Person",
      "Role",
      "Approval Status"
    ];

    const escapeCsv = (val) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredUsers.map(u => [
      escapeCsv(u.emp_id || ''),
      escapeCsv(u.emp_status || 'Active'),
      escapeCsv(u.emp_name || ''),
      escapeCsv(u.email || ''),
      escapeCsv(u.emp_mobile || ''),
      escapeCsv(u.emp_alt_mobile || ''),
      escapeCsv(u.company || 'All'),
      escapeCsv(u.work_location_type || ''),
      escapeCsv(u.work_location_name || ''),
      escapeCsv(u.emp_department || ''),
      escapeCsv(u.emp_sub_department || ''),
      escapeCsv(u.emp_designation || ''),
      escapeCsv(u.primary_reporting_person || ''),
      escapeCsv(u.secondary_reporting_person || ''),
      escapeCsv(u.hod_person || ''),
      escapeCsv(u.role || 'agent'),
      escapeCsv(u.is_approved ? 'Approved' : 'Pending')
    ]);

    // Prepend UTF-8 BOM so Excel opens Hindi & English text without character corruption
    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), ...rows.map(e => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Team_Directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Emp ID",
      "Emp Status",
      "Name",
      "Email",
      "Password",
      "Mobile",
      "Alternate Mobile",
      "Company",
      "Work Location Type",
      "Work Location Name",
      "Department",
      "Sub-Department",
      "Designation",
      "Primary Reporting Person",
      "Secondary Reporting Person",
      "HOD Person"
    ];

    const sampleRow = [
      "EMP101",
      "Active",
      "John Doe",
      "john.doe@example.com",
      "Password@123",
      "9876543210",
      "9876543211",
      "NSMLR",
      "Headquarters",
      "Delhi Main Branch",
      "Sales",
      "Inbound Sales",
      "Sales Executive",
      "Manager Name",
      "Director Name",
      "HOD Name"
    ];

    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(','), sampleRow.map(escapeCsv).join(',')].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Team_Import_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        const parsedRows = parseCSV(text);
        if (parsedRows.length <= 1) {
          alert("CSV file is empty or missing data rows.");
          setImporting(false);
          return;
        }

        // Filter valid non-empty rows
        const validRows = [];
        for (let i = 1; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (row && row.length > 0 && !row.every(c => !c)) {
            validRows.push({ row, rowIndex: i + 1 });
          }
        }

        if (validRows.length === 0) {
          alert("No valid employee rows found in the CSV.");
          setImporting(false);
          return;
        }

        // Intelligent Exact + Priority Header mapping
        const rawHeaders = parsedRows[0].map(h => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
        const getColIdx = (aliases) => {
          // Priority 1: Exact matches
          for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const exactIdx = rawHeaders.indexOf(cleanAlias);
            if (exactIdx !== -1) return exactIdx;
          }
          // Priority 2: Substring matches
          for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
            const subIdx = rawHeaders.findIndex(h => h.includes(cleanAlias));
            if (subIdx !== -1) return subIdx;
          }
          return -1;
        };

        const idxEmpId = getColIdx(['empid', 'employeeid', 'empcode', 'id']);
        const idxStatus = getColIdx(['empstatus', 'employeestatus', 'status']);
        const idxName = getColIdx(['empname', 'employeename', 'fullname', 'name']);
        const idxEmail = getColIdx(['officialmail', 'officialmailid', 'emailid', 'email', 'mail']);
        const idxPassword = getColIdx(['password', 'pass', 'pwd']);
        const idxMobile = getColIdx(['empmobile', 'mobile', 'phonenumber', 'phone', 'contact']);
        const idxAltMobile = getColIdx(['altmobile', 'alternatephone', 'secondarymobile', 'altphone', 'alternate']);
        const idxCompany = getColIdx(['companyname', 'company', 'firm', 'org']);
        const idxLocationType = getColIdx(['worklocationtype', 'locationtype', 'worktype', 'loctype']);
        const idxLocationName = getColIdx(['worklocationname', 'locationname', 'worklocation', 'branch', 'city', 'station', 'location']);
        const idxDept = getColIdx(['empdepartment', 'department', 'dept']);
        const idxSubDept = getColIdx(['subdepartment', 'subdept', 'sub_dept']);
        const idxDesig = getColIdx(['empdesignation', 'designation', 'desig', 'role', 'title']);
        const idxPrimaryRep = getColIdx(['primaryreportingperson', 'primaryreporting', 'primaryrep', 'reportingperson', 'manager']);
        const idxSecondaryRep = getColIdx(['secondaryreportingperson', 'secondaryreporting', 'secondaryrep', 'secondrep']);
        const idxHod = getColIdx(['hodperson', 'hod', 'headofdept', 'head']);

        const preparedRecords = validRows.map(({ row, rowIndex }) => {
          let email = (idxEmail >= 0 ? row[idxEmail] : (row[3] || '')).trim();
          const emp_name = (idxName >= 0 ? row[idxName] : (row[2] || 'Team Member')).trim();
          const rawEmpId = (idxEmpId >= 0 ? row[idxEmpId] : (row[0] || `EMP-${Date.now().toString().slice(-6)}`)).trim();
          const emp_id = rawEmpId || `EMP-${Date.now().toString().slice(-6)}`;
          const emp_status = (idxStatus >= 0 ? row[idxStatus] : (row[1] || 'Active')).trim();
          const password = (idxPassword >= 0 && row[idxPassword]) ? row[idxPassword].trim() : 'Swan@12345';
          const emp_mobile = (idxMobile >= 0 ? row[idxMobile] : (row[5] || '')).trim();
          const emp_alt_mobile = (idxAltMobile >= 0 ? row[idxAltMobile] : '').trim();
          const company = (idxCompany >= 0 ? row[idxCompany] : 'NSMLR').trim();
          const work_location_type = (idxLocationType >= 0 ? row[idxLocationType] : '').trim();
          const work_location_name = (idxLocationName >= 0 ? row[idxLocationName] : '').trim();
          const emp_department = (idxDept >= 0 ? row[idxDept] : 'Sales').trim();
          const emp_sub_department = (idxSubDept >= 0 ? row[idxSubDept] : '').trim();
          const emp_designation = (idxDesig >= 0 ? row[idxDesig] : 'Executive').trim();
          const primary_reporting_person = (idxPrimaryRep >= 0 ? row[idxPrimaryRep] : '').trim();
          const secondary_reporting_person = (idxSecondaryRep >= 0 ? row[idxSecondaryRep] : '').trim();
          const hod_person = (idxHod >= 0 ? row[idxHod] : '').trim();

          return {
            rowIndex,
            emp_id,
            emp_name,
            email,
            password,
            emp_mobile,
            emp_alt_mobile,
            company,
            work_location_type,
            work_location_name,
            emp_department,
            emp_sub_department,
            emp_designation,
            emp_status,
            primary_reporting_person,
            secondary_reporting_person,
            hod_person
          };
        });

        let createdCount = 0;
        let updatedCount = 0;
        let failCount = 0;
        const failReasons = [];
        const logs = [];

        const totalRows = preparedRecords.length;
        let processedCount = 0;
        const CHUNK_SIZE = 35;

        setImportProgress({
          active: true,
          current: 0,
          total: totalRows,
          percentage: 0,
          currentName: '🚀 Starting Lightning Batch Processing...',
          createdCount: 0,
          updatedCount: 0,
          failCount: 0,
          logs: [{ type: 'info', text: `⚡ Starting high-speed batch import of ${totalRows} employees in server batches...` }],
          complete: false,
          failReasons: []
        });

        for (let i = 0; i < preparedRecords.length; i += CHUNK_SIZE) {
          const chunk = preparedRecords.slice(i, i + CHUNK_SIZE);
          const chunkRes = await bulkImportEmployeesFast(chunk);

          processedCount += chunk.length;
          const currentPct = Math.round((processedCount / totalRows) * 100);

          if (chunkRes && chunkRes.results) {
            createdCount += (chunkRes.createdCount || 0);
            updatedCount += (chunkRes.updatedCount || 0);
            failCount += (chunkRes.failCount || 0);

            chunkRes.results.forEach(r => {
              if (r.success) {
                if (r.updated) logs.unshift({ type: 'update', text: `🔄 Updated (${r.emp_id || 'Staff'}): ${r.emp_name}` });
                else logs.unshift({ type: 'success', text: `✅ Created (${r.emp_id || 'Staff'}): ${r.emp_name}` });
              } else if (r.skippedNoEmail) {
                failReasons.push(`Row ${r.rowIndex || ''} (${r.emp_name}): Skipped (No email in CSV)`);
                logs.unshift({ type: 'error', text: `⚠️ Skipped (${r.emp_id || 'Staff'}): ${r.emp_name} - Missing Email in CSV` });
              } else {
                failReasons.push(`(${r.emp_name}): ${r.error || 'Failed'}`);
                logs.unshift({ type: 'error', text: `❌ Failed (${r.emp_name}): ${r.error || 'Error'}` });
              }
            });
          }

          setImportProgress(prev => ({
            ...prev,
            current: processedCount,
            percentage: currentPct,
            currentName: `[${processedCount}/${totalRows}] High-Speed Batch: ${chunk[0]?.emp_name || 'Staff'}...`,
            createdCount,
            updatedCount,
            failCount,
            logs: [...logs].slice(0, 25),
            failReasons
          }));
        }

        setImportProgress(prev => ({
          ...prev,
          active: false,
          complete: true,
          percentage: 100,
          currentName: `🎉 All ${totalRows} records processed successfully in seconds!`
        }));

        fetchUsers(false);
      } catch (err) {
        alert("Error reading CSV file: " + err.message);
        setImportProgress(prev => ({ ...prev, active: false }));
      }
      setImporting(false);
    };
    reader.readAsText(importFile);
  };

  const handleCleanupDummyAccounts = async () => {
    const isConfirm = window.confirm("Are you sure you want to clean up all auto-generated dummy test accounts (e.g. 40121@swanagro.in, 41802@swanagro.in)? Real accounts with actual emails will NOT be affected.");
    if (!isConfirm) return;

    setLoading(true);
    const res = await cleanupDummyImportAccounts();
    setLoading(false);
    if (res.success) {
      alert(`Cleanup Complete! ${res.count} dummy test accounts were removed.`);
      fetchUsers();
    } else {
      alert(`Error during cleanup: ${res.error}`);
    }
  };

  const handleEditClick = (user) => {
    setEditingUser(user.user_id);
    setEditForm({
      emp_id: user.emp_id || '',
      emp_status: user.emp_status || 'Active',
      emp_name: user.emp_name || '',
      emp_department: user.emp_department || '',
      emp_sub_department: user.emp_sub_department || '',
      emp_designation: user.emp_designation || '',
      company: user.company || '',
      work_location_type: user.work_location_type || '',
      work_location_name: user.work_location_name || '',
      emp_mobile: user.emp_mobile || '',
      emp_alt_mobile: user.emp_alt_mobile || '',
      email: user.email || '',
      primary_reporting_person: user.primary_reporting_person || '',
      secondary_reporting_person: user.secondary_reporting_person || '',
      hod_person: user.hod_person || ''
    });
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    setUsers(prev => prev.map(u => u.user_id === editingUser ? { ...u, ...editForm } : u));
    const result = await updateEmployeeDetailsAdmin(editingUser, editForm);
    setSavingEdit(false);
    if (result.success) {
      setEditingUser(null);
      fetchUsers(false);
    } else {
      alert("Error saving details: " + result.error);
      fetchUsers(false);
    }
  };

  const handleAccessClick = (user) => {
    setAccessUser(user.user_id);
    const existingAccess = user.module_access || {};
    setAccessForm({
      ...existingAccess,
      can_import_data: existingAccess.can_import_data === true || (user.can_import_export === true && existingAccess.can_import_data !== false),
      can_export_data: existingAccess.can_export_data === true || (user.can_import_export === true && existingAccess.can_export_data !== false),
      can_import_export: user.can_import_export === true || existingAccess.can_import_export === true,
      can_assign_leads: user.can_assign_leads === true || existingAccess.can_assign_leads === true,
      can_delete_leads: user.can_delete_leads === true || existingAccess.can_delete_leads === true,
      can_view_all_companies: user.can_view_all_companies === true || existingAccess.can_view_all_companies === true,
      can_self_reset_password: user.can_self_reset_password === true || existingAccess.can_self_reset_password === true,
      can_access_audit_logs: user.can_access_audit_logs === true || existingAccess.can_access_audit_logs === true,
      can_manage_settings: user.can_manage_settings === true || existingAccess.can_manage_settings === true,
      can_claim_unassigned: user.can_claim_unassigned === true || existingAccess.can_claim_unassigned === true,
      can_bulk_actions: user.can_bulk_actions === true || existingAccess.can_bulk_actions === true
    });
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
    const moduleObj = form[moduleId] || {};
    const subItems = moduleObj.sub_items;

    // If subItems has an explicit entry for subId:
    if (subItems && subItems[subId] !== undefined) {
      const sub = subItems[subId];
      if (sub === false || sub.view === false) {
        return { view: false, add: false, edit: false, delete: false };
      }
      return {
        view: true,
        add: sub.add !== false && parentPerms.add,
        edit: sub.edit !== false && parentPerms.edit,
        delete: sub.delete === true
      };
    }

    // If module has assigned_steps (e.g. leads or recruiter), and subItems is not configured yet:
    if (Array.isArray(moduleObj.assigned_steps) && !moduleObj.is_manager) {
      const isAssigned = moduleObj.assigned_steps.includes(subId) || ((subId === 'lead_dashboard' || subId === 'hourly_work') && moduleObj.view);
      if (!isAssigned) {
        return { view: false, add: false, edit: false, delete: false };
      }
    }

    return { ...parentPerms };
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
    const hasBoth = accessForm.can_import_data === true && accessForm.can_export_data === true;
    
    // Auto-sync assigned_steps for leads & recruiter from sub_items if present
    const updatedForm = { ...accessForm };
    if (updatedForm.leads) {
      const leadsSub = updatedForm.leads.sub_items;
      if (leadsSub) {
        updatedForm.leads.assigned_steps = Object.keys(leadsSub).filter(k => k !== 'lead_dashboard' && k !== 'hourly_work' && leadsSub[k]?.view === true);
      }
    }
    if (updatedForm.recruiter) {
      const recSub = updatedForm.recruiter.sub_items;
      if (recSub) {
        updatedForm.recruiter.assigned_steps = Object.keys(recSub).filter(k => recSub[k]?.view === true);
      }
    }

    setUsers(prev => prev.map(u => u.user_id === accessUser ? {
      ...u,
      module_access: updatedForm,
      can_import_export: hasBoth,
      can_import_data: updatedForm.can_import_data === true,
      can_export_data: updatedForm.can_export_data === true,
      can_self_reset_password: updatedForm.can_self_reset_password === true,
      can_assign_leads: updatedForm.can_assign_leads === true,
      can_delete_leads: updatedForm.can_delete_leads === true,
      can_view_all_companies: updatedForm.can_view_all_companies === true,
      can_access_audit_logs: updatedForm.can_access_audit_logs === true,
      can_manage_settings: updatedForm.can_manage_settings === true,
      can_claim_unassigned: updatedForm.can_claim_unassigned === true,
      can_bulk_actions: updatedForm.can_bulk_actions === true
    } : u));

    const result = await updateModuleAccess(accessUser, updatedForm);
    setSavingAccess(false);
    if (result.success) {
      setAccessUser(null);
      fetchUsers(false);
    } else {
      alert("Error saving access: " + result.error);
      fetchUsers(false);
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
      emp_sub_department: addForm.emp_sub_department || '',
      emp_designation: addForm.emp_designation,
      emp_mobile: addForm.emp_mobile,
      emp_alt_mobile: addForm.emp_alt_mobile || '',
      company: addForm.company,
      work_location_type: addForm.work_location_type || '',
      work_location_name: addForm.work_location_name || '',
      primary_reporting_person: addForm.primary_reporting_person || '',
      secondary_reporting_person: addForm.secondary_reporting_person || '',
      hod_person: addForm.hod_person || '',
      emp_official_mail_id: addForm.email
    });
    setSavingAddUser(false);
    if (result.success) {
      setShowAddUserModal(false);
      setAddForm({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_sub_department: '', emp_designation: '', emp_mobile: '', emp_alt_mobile: '', company: '', work_location_type: '', work_location_name: '', email: '', password: '', primary_reporting_person: '', secondary_reporting_person: '', hod_person: '' });
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
      emp_sub_department: addForm.emp_sub_department || '',
      emp_designation: addForm.emp_designation || '',
      emp_mobile: addForm.emp_mobile || '',
      emp_alt_mobile: addForm.emp_alt_mobile || '',
      company: addForm.company || '',
      work_location_type: addForm.work_location_type || '',
      work_location_name: addForm.work_location_name || '',
      primary_reporting_person: addForm.primary_reporting_person || '',
      secondary_reporting_person: addForm.secondary_reporting_person || '',
      hod_person: addForm.hod_person || '',
      emp_official_mail_id: fallbackEmail
    });
    setSavingAddUser(false);
    if (result.success) {
      setShowAddUserModal(false);
      setAddForm({ emp_id: '', emp_status: 'Active', emp_name: '', emp_department: '', emp_sub_department: '', emp_designation: '', emp_mobile: '', emp_alt_mobile: '', company: '', work_location_type: '', work_location_name: '', email: '', password: '', primary_reporting_person: '', secondary_reporting_person: '', hod_person: '' });
      fetchUsers();
    } else {
      alert("Error saving draft: " + result.error);
    }
  };

  const counts = React.useMemo(() => {
    const nonCust = users.filter(u => u.role !== 'customer');
    return {
      all: nonCust.filter(u => u.emp_status !== 'Trash').length,
      active: nonCust.filter(u => (u.emp_status || 'Active') === 'Active').length,
      inActive: nonCust.filter(u => u.emp_status === 'InActive').length,
      hold: nonCust.filter(u => u.emp_status === 'Hold').length,
      resigned: nonCust.filter(u => u.emp_status === 'Resigned').length,
      terminated: nonCust.filter(u => u.emp_status === 'Terminated').length,
      draft: nonCust.filter(u => u.emp_status === 'Draft').length,
      trash: nonCust.filter(u => u.emp_status === 'Trash').length,
    };
  }, [users]);

  const filteredUsers = users.filter(u => {
    if (u.role === 'customer') return false;

    // Tab filter
    if (selectedTab === 'All') {
      if (u.emp_status === 'Trash') return false;
    } else if (selectedTab === 'Trash') {
      if (u.emp_status !== 'Trash') return false;
    } else {
      const status = u.emp_status || 'Active';
      if (status !== selectedTab) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (u.emp_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.emp_id || '').toLowerCase().includes(q) ||
        (u.emp_mobile || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading && users.length === 0) return <PremiumProgressLoader message="Loading Team Workplace" active={loading} />;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Team Roles & Permissions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        Manage what your team members can see and do within the CRM. Only Admins can access this panel.
      </p>

      {/* Emp Status Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {[
          { id: 'All', label: 'All Employees', count: counts.all, color: '#2563eb' },
          { id: 'Active', label: 'Active', count: counts.active, color: '#16a34a' },
          { id: 'InActive', label: 'InActive', count: counts.inActive, color: '#4b5563' },
          { id: 'Hold', label: 'Hold', count: counts.hold, color: '#ca8a04' },
          { id: 'Resigned', label: 'Resigned', count: counts.resigned, color: '#ea580c' },
          { id: 'Terminated', label: 'Terminated', count: counts.terminated, color: '#dc2626' },
          { id: 'Draft', label: 'Draft', count: counts.draft, color: '#d97706' },
          { id: 'Trash', label: 'Trash 🗑️', count: counts.trash, color: '#be123c' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedTab(tab.id)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: selectedTab === tab.id ? `2px solid ${tab.color}` : '1px solid var(--border-light)',
              backgroundColor: selectedTab === tab.id ? `${tab.color}15` : 'var(--bg-surface)',
              color: selectedTab === tab.id ? tab.color : 'var(--text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.label}
            <span style={{
              padding: '0.1rem 0.45rem',
              borderRadius: '99px',
              fontSize: '0.72rem',
              fontWeight: 700,
              backgroundColor: selectedTab === tab.id ? tab.color : 'var(--th-hover-bg)',
              color: selectedTab === tab.id ? '#ffffff' : 'var(--text-secondary)'
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search by name, email, ID, or mobile..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', width: '100%', maxWidth: '350px' }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {users.some(u => /^[0-9]+@swanagro\.in$/.test(u.email || '') || /^emp_?[0-9]+@swanagro\.in$/.test(u.email || '')) && (
            <button 
              onClick={handleCleanupDummyAccounts}
              className="btn-action-secondary"
              style={{ padding: '0.55rem 0.9rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: '#b91c1c', borderColor: '#fca5a5', backgroundColor: '#fef2f2', fontWeight: 600 }}
              title="Delete all auto-generated test dummy accounts"
            >
              <Trash2 size={15} /> Clean Dummy Accounts
            </button>
          )}
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
                      onChange={(e) => handleRequestStatusChange(user.user_id, user.emp_name || user.email, s, e.target.value)}
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
                {user.emp_alt_mobile && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', opacity: 0.85 }}>Alt: {user.emp_alt_mobile}</div>
                )}
              </td>
              <td style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 600 }}>{user.emp_department || '-'}</div>
                {user.emp_sub_department && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 500 }}>Sub: {user.emp_sub_department}</div>
                )}
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.emp_designation || '-'}</div>
                {(user.primary_reporting_person || user.hod_person) && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-color)', marginTop: '0.35rem', lineHeight: 1.3, background: 'var(--bg-primary)', padding: '0.25rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                    {user.primary_reporting_person && <div><span style={{ fontWeight: 600 }}>Rep:</span> {user.primary_reporting_person}</div>}
                    {user.hod_person && <div><span style={{ fontWeight: 600 }}>HOD:</span> {user.hod_person}</div>}
                  </div>
                )}
              </td>
              <td style={{ padding: '0.85rem 1rem' }}>
                <div>
                  <span style={{ 
                    padding: '0.2rem 0.55rem', 
                    backgroundColor: 'var(--th-hover-bg)', 
                    borderRadius: '4px', 
                    fontSize: '0.8rem', 
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    display: 'inline-block'
                  }}>
                    {user.company || 'NSMLR'}
                  </span>
                </div>
                {user.work_location_type && (
                  <div style={{ marginTop: '0.35rem' }}>
                    <span style={{ 
                      padding: '0.12rem 0.45rem', 
                      backgroundColor: '#eef2ff', 
                      color: '#4338ca', 
                      borderRadius: '4px', 
                      border: '1px solid #c7d2fe',
                      fontSize: '0.72rem', 
                      fontWeight: 600,
                      display: 'inline-block'
                    }}>
                      {user.work_location_type}
                    </span>
                  </div>
                )}
                {user.work_location_name && (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)', 
                    marginTop: '0.25rem',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <span>📍</span> <span>{user.work_location_name}</span>
                  </div>
                )}
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
                  onChange={(e) => handleRequestRoleChange(user.user_id, user.emp_name || user.email, user.role, e.target.value)}
                  disabled={user.role === 'admin' || user.role === 'Admin'}
                  style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.85rem', cursor: (user.role === 'admin' || user.role === 'Admin') ? 'not-allowed' : 'pointer' }}
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
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button 
                    onClick={() => handleAccessClick(user)}
                    disabled={user.role === 'admin' || user.role === 'Admin'}
                    className="btn-action-primary"
                    style={{ cursor: (user.role === 'admin' || user.role === 'Admin') ? 'not-allowed' : 'pointer' }}
                  >
                    Manage Access
                  </button>
                </div>
              </td>
              <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' }}>
                  {user.emp_status === 'Trash' ? (
                    <>
                      <HoverIconButton
                        icon={RotateCcw}
                        label="Restore Employee"
                        bg="#dcfce7"
                        hoverBg="#bbf7d0"
                        color="#15803d"
                        borderColor="#bbf7d0"
                        onClick={() => handleRestoreUser(user.user_id)}
                      />
                      <HoverIconButton
                        icon={Trash2}
                        label="Delete Permanently"
                        bg="#fee2e2"
                        hoverBg="#fecaca"
                        color="#991b1b"
                        borderColor="#fecaca"
                        onClick={() => setDeleteModal({ show: true, userId: user.user_id, userName: user.emp_name || user.email })}
                      />
                    </>
                  ) : (
                    <>
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
                        icon={Send}
                        label="Send Reset Email"
                        bg="#e0e7ff"
                        hoverBg="#c7d2fe"
                        color="#4338ca"
                        borderColor="#c7d2fe"
                        onClick={() => handleOpenSendResetModal(user)}
                      />
                      <HoverIconButton
                        icon={Trash2}
                        label="Move to Trash"
                        bg="#fff7ed"
                        hoverBg="#ffedd5"
                        color="#c2410c"
                        borderColor="#fed7aa"
                        onClick={() => setTrashConfirmModal({ show: true, userId: user.user_id, userName: user.emp_name || user.email })}
                      />
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Send Reset Email Centered Modal */}
      {sendResetEmailModal.show && sendResetEmailModal.user && (
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
          padding: '1rem',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '2rem',
            width: '90%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'center',
            color: 'var(--text-primary)'
          }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <Send size={26} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Send Password Setup Link
            </h3>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
              Send an official password activation email to <strong>{sendResetEmailModal.user.emp_name || sendResetEmailModal.user.email}</strong>?
            </p>

            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', textAlign: 'left', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Recipient:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{sendResetEmailModal.user.email || sendResetEmailModal.user.emp_official_mail_id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sender Gateway:</span>
                <span style={{ color: '#4338ca', fontWeight: 600 }}>SuPuja Creations Admin Mail</span>
              </div>
            </div>

            {sendResetEmailModal.successMsg && (
              <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Check size={16} />
                <span>{sendResetEmailModal.successMsg}</span>
              </div>
            )}

            {sendResetEmailModal.errorMsg && (
              <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
                {sendResetEmailModal.errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => setSendResetEmailModal({ show: false, user: null, sending: false, successMsg: null, errorMsg: null })}
                disabled={sendResetEmailModal.sending}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendResetEmail}
                disabled={sendResetEmailModal.sending}
                className="btn-primary"
                style={{
                  backgroundColor: '#4338ca',
                  borderColor: '#4338ca',
                  color: '#fff',
                  padding: '0.6rem 1.5rem',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 600,
                  cursor: sendResetEmailModal.sending ? 'not-allowed' : 'pointer'
                }}
              >
                {sendResetEmailModal.sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                {sendResetEmailModal.sending ? 'Sending...' : 'Send Setup Link'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div style={{ fontSize: '2.8rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem', color: '#dc2626' }}>Permanently Delete User</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to permanently delete <strong>{deleteModal.userName}</strong>? This action CANNOT be undone.
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
                {deletingUser ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {roleConfirmModal.show && (
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
            <div style={{ fontSize: '2.8rem', marginBottom: '1rem' }}>🛡️</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem', color: '#4338ca' }}>Confirm Role Change</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to change role for <strong>{roleConfirmModal.userName}</strong> from <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{roleConfirmModal.currentRole}</span> to <span style={{ fontWeight: 700, color: '#4338ca' }}>{roleConfirmModal.newRole}</span>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setRoleConfirmModal({ show: false, userId: null, userName: '', currentRole: '', newRole: '' })}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
                disabled={changingRole}
              >
                Cancel
              </button>
              <button 
                onClick={confirmRoleChange}
                disabled={changingRole}
                className="btn-primary"
                style={{ 
                  padding: '0.6rem 1.5rem', 
                  borderRadius: '8px', 
                  backgroundColor: '#4338ca',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: changingRole ? 'not-allowed' : 'pointer'
                }}
              >
                {changingRole ? 'Changing...' : 'Yes, Change Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emp Status Change Confirmation Modal */}
      {statusConfirmModal.show && (
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
            <div style={{ fontSize: '2.8rem', marginBottom: '1rem' }}>🔄</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem', color: '#0284c7' }}>Confirm Status Change</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to change status for <strong>{statusConfirmModal.userName}</strong> from <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{statusConfirmModal.currentStatus}</span> to <span style={{ fontWeight: 700, color: '#0284c7' }}>{statusConfirmModal.newStatus}</span>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setStatusConfirmModal({ show: false, userId: null, userName: '', currentStatus: '', newStatus: '' })}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
                disabled={changingStatus}
              >
                Cancel
              </button>
              <button 
                onClick={confirmStatusChange}
                disabled={changingStatus}
                className="btn-primary"
                style={{ 
                  padding: '0.6rem 1.5rem', 
                  borderRadius: '8px', 
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: changingStatus ? 'not-allowed' : 'pointer'
                }}
              >
                {changingStatus ? 'Updating...' : 'Yes, Change Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Trash Confirmation Modal */}
      {trashConfirmModal.show && (
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
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem', color: '#c2410c' }}>Move Employee to Trash</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Are you sure you want to move <strong>{trashConfirmModal.userName}</strong> to Trash? You can restore them anytime from the Trash tab.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                onClick={() => setTrashConfirmModal({ show: false, userId: null, userName: '' })}
                className="btn-secondary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmMoveToTrash}
                disabled={movingToTrash}
                style={{ 
                  padding: '0.6rem 1.5rem', 
                  borderRadius: '8px', 
                  backgroundColor: '#ea580c',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: movingToTrash ? 'not-allowed' : 'pointer'
                }}
              >
                {movingToTrash ? 'Moving...' : 'Yes, Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add User Modal */}
      {showAddUserModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Create New Account</h3>
              <button 
                type="button" 
                onClick={() => setShowAddUserModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email Address *</label>
                  <input 
                    type="email" 
                    value={addForm.email} 
                    onChange={e => setAddForm({...addForm, email: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showAddUserPassword ? "text" : "password"} 
                      value={addForm.password} 
                      onChange={e => setAddForm({...addForm, password: e.target.value})}
                      style={{ width: '100%', padding: '0.55rem 2.5rem 0.55rem 0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowAddUserPassword(prev => !prev)}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', userSelect: 'none' }}
                      title={showAddUserPassword ? "Hide password" : "Show password"}
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
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Status</label>
                  <select 
                    value={addForm.emp_status || 'Active'} 
                    onChange={e => setAddForm({...addForm, emp_status: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    {EMP_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name *</label>
                  <input 
                    type="text" 
                    value={addForm.emp_name} 
                    onChange={e => setAddForm({...addForm, emp_name: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mobile Number</label>
                  <input 
                    type="tel" 
                    value={addForm.emp_mobile} 
                    onChange={e => setAddForm({...addForm, emp_mobile: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Alternate Mobile</label>
                  <input 
                    type="tel" 
                    value={addForm.emp_alt_mobile || ''} 
                    onChange={e => setAddForm({...addForm, emp_alt_mobile: e.target.value})}
                    placeholder="Optional alternate number"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                  <select 
                    value={addForm.company} 
                    onChange={e => setAddForm({...addForm, company: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">Select Company...</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Work Location Type</label>
                  <select 
                    value={addForm.work_location_type || ''} 
                    onChange={e => setAddForm({...addForm, work_location_type: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">Select Location Type...</option>
                    {WORK_LOCATION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Work Location Name</label>
                  <input 
                    type="text" 
                    value={addForm.work_location_name || ''} 
                    onChange={e => setAddForm({...addForm, work_location_name: e.target.value})}
                    placeholder="e.g. Head Office, Delhi / Mumbai Branch"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Department</label>
                  <select 
                    value={addForm.emp_department} 
                    onChange={e => setAddForm({...addForm, emp_department: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">Select Department...</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sub-Department</label>
                  <input 
                    type="text" 
                    value={addForm.emp_sub_department || ''} 
                    onChange={e => setAddForm({...addForm, emp_sub_department: e.target.value})}
                    placeholder="Enter sub-department"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                  <input 
                    type="text"
                    list="designation_options"
                    value={addForm.emp_designation} 
                    onChange={e => setAddForm({...addForm, emp_designation: e.target.value})}
                    placeholder="Enter designation (e.g. Sales Executive)"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                  <datalist id="designation_options">
                    {DESIGNATIONS.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Primary Reporting Person</label>
                  <select
                    value={addForm.primary_reporting_person || ''}
                    onChange={e => setAddForm({ ...addForm, primary_reporting_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Select Reporting Manager --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Secondary Reporting Person</label>
                  <select
                    value={addForm.secondary_reporting_person || ''}
                    onChange={e => setAddForm({ ...addForm, secondary_reporting_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Optional Secondary --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>HOD Person (Head of Department)</label>
                  <select
                    value={addForm.hod_person || ''}
                    onChange={e => setAddForm({ ...addForm, hod_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Select HOD --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Footer Buttons - Fixed & Always Visible */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
              <button 
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="btn-action-secondary"
                style={{ padding: '0.55rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveAddUserDraft}
                disabled={savingAddUser || (!addForm.emp_name && !addForm.email && !addForm.emp_id)}
                className="btn-action-secondary"
                style={{ padding: '0.55rem 1.25rem', backgroundColor: 'var(--bg-primary)' }}
              >
                {savingAddUser ? 'Saving Draft...' : 'Save Draft'}
              </button>
              <button 
                type="button"
                onClick={handleSaveAddUser}
                disabled={savingAddUser || !addForm.email || !addForm.password || !addForm.emp_id || !addForm.emp_name}
                className="btn-primary"
                style={{ padding: '0.55rem 1.5rem', borderRadius: '6px', fontWeight: 600 }}
              >
                {savingAddUser ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal with Live Real-time Progress Dashboard */}
      {showImportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '520px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-light)' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)' }}>
                {importProgress.complete ? (
                  <CheckCircle2 size={22} style={{ color: '#16a34a' }} />
                ) : importProgress.active ? (
                  <Loader2 size={22} className="animate-spin" style={{ color: '#0284c7' }} />
                ) : (
                  <Upload size={22} style={{ color: '#0284c7' }} />
                )}
                {importProgress.complete ? 'Import Completed!' : importProgress.active ? 'Importing Team Members...' : 'Import Team Members from CSV'}
              </h3>
            </div>

            {/* If NOT active and NOT complete -> Normal Upload Form */}
            {!importProgress.active && !importProgress.complete && (
              <>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                  Upload a `.csv` file containing employee details. Download the sample CSV template first to verify column headers.
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="btn-action-secondary"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', border: '1px dashed var(--border-light)', fontSize: '0.88rem', fontWeight: 500 }}
                  >
                    <FileSpreadsheet size={18} style={{ color: '#0284c7' }} /> Download Sample CSV Template
                  </button>
                </div>

                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.5rem' }}>Select CSV File *</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={e => setImportFile(e.target.files[0])}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                  />
                  {importFile && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Check size={14} /> Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { setShowImportModal(false); setImportFile(null); }}
                    className="btn-action-secondary"
                    style={{ padding: '0.6rem 1.25rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleProcessImportCSV}
                    disabled={!importFile}
                    className="btn-primary"
                    style={{ padding: '0.6rem 1.75rem', borderRadius: '8px', backgroundColor: '#0284c7', border: 'none', color: '#fff', fontWeight: 600, cursor: !importFile ? 'not-allowed' : 'pointer', opacity: !importFile ? 0.6 : 1 }}
                  >
                    Start Import
                  </button>
                </div>
              </>
            )}

            {/* If ACTIVE or COMPLETE -> Real-time Progress Dashboard */}
            {(importProgress.active || importProgress.complete) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Status bar header */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {importProgress.complete ? '✅ All Records Processed' : `Processing record ${importProgress.current} of ${importProgress.total}`}
                    </span>
                    <span style={{ fontWeight: 700, color: '#0284c7', fontSize: '0.95rem' }}>
                      {importProgress.percentage}%
                    </span>
                  </div>

                  {/* Progress Bar Track */}
                  <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--bg-primary)', borderRadius: '99px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                    <div 
                      style={{ 
                        width: `${importProgress.percentage}%`, 
                        height: '100%', 
                        backgroundColor: importProgress.complete ? '#16a34a' : '#0284c7',
                        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} 
                    />
                  </div>
                </div>

                {/* Currently Processing Callout */}
                {importProgress.active && (
                  <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.2)', borderRadius: '8px', fontSize: '0.84rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                      {importProgress.currentName}
                    </span>
                  </div>
                )}

                {/* Real-time Counters Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#166534' }}>{importProgress.createdCount}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803d' }}>New Created</div>
                  </div>
                  <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e40af' }}>{importProgress.updatedCount}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8' }}>Auto-Updated</div>
                  </div>
                  <div style={{ backgroundColor: importProgress.failCount > 0 ? '#fef2f2' : 'var(--bg-primary)', border: `1px solid ${importProgress.failCount > 0 ? '#fecaca' : 'var(--border-light)'}`, borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: importProgress.failCount > 0 ? '#991b1b' : 'var(--text-secondary)' }}>{importProgress.failCount}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: importProgress.failCount > 0 ? '#b91c1c' : 'var(--text-secondary)' }}>Issues / Skipped</div>
                  </div>
                </div>

                {/* Live Terminal-style Log Viewer */}
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Live Import Activity:</div>
                  <div style={{ 
                    backgroundColor: '#0f172a', 
                    borderRadius: '8px', 
                    padding: '0.75rem', 
                    maxHeight: '140px', 
                    overflowY: 'auto', 
                    fontFamily: 'monospace', 
                    fontSize: '0.75rem', 
                    color: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem'
                  }}>
                    {importProgress.logs.map((l, i) => (
                      <div key={i} style={{ 
                        color: l.type === 'error' ? '#fca5a5' : l.type === 'update' ? '#93c5fd' : l.type === 'success' ? '#86efac' : '#cbd5e1' 
                      }}>
                        {l.text}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Close Button when Complete */}
                {importProgress.complete ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                      setImportProgress({
                        active: false,
                        current: 0,
                        total: 0,
                        percentage: 0,
                        currentName: '',
                        createdCount: 0,
                        updatedCount: 0,
                        failCount: 0,
                        logs: [],
                        complete: false,
                        failReasons: []
                      });
                    }}
                    className="btn-primary"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#16a34a', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}
                  >
                    ✓ Done / Close Window
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Please wait while employees are being registered...
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Edit Employee Details</h3>
              <button 
                type="button" 
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp ID</label>
                  <input 
                    type="text" 
                    value={editForm.emp_id} 
                    onChange={e => setEditForm({...editForm, emp_id: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Status</label>
                  <select 
                    value={editForm.emp_status || 'Active'} 
                    onChange={e => setEditForm({...editForm, emp_status: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    {EMP_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name</label>
                  <input 
                    type="text" 
                    value={editForm.emp_name} 
                    onChange={e => setEditForm({...editForm, emp_name: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email Address</label>
                  <input 
                    type="email" 
                    value={editForm.email || ''} 
                    onChange={e => setEditForm({...editForm, email: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Mobile Number</label>
                  <input 
                    type="tel" 
                    value={editForm.emp_mobile} 
                    onChange={e => setEditForm({...editForm, emp_mobile: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Alternate Mobile</label>
                  <input 
                    type="tel" 
                    value={editForm.emp_alt_mobile || ''} 
                    onChange={e => setEditForm({...editForm, emp_alt_mobile: e.target.value})}
                    placeholder="Optional alternate number"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                  <select 
                    value={editForm.company} 
                    onChange={e => setEditForm({...editForm, company: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">All Companies</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Work Location Type</label>
                  <select 
                    value={editForm.work_location_type || ''} 
                    onChange={e => setEditForm({...editForm, work_location_type: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">Select Location Type...</option>
                    {WORK_LOCATION_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Work Location Name</label>
                  <input 
                    type="text" 
                    value={editForm.work_location_name || ''} 
                    onChange={e => setEditForm({...editForm, work_location_name: e.target.value})}
                    placeholder="e.g. Head Office, Delhi / Mumbai Branch"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Department</label>
                  <select 
                    value={editForm.emp_department} 
                    onChange={e => setEditForm({...editForm, emp_department: e.target.value})}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">Select Department...</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sub-Department</label>
                  <input 
                    type="text" 
                    value={editForm.emp_sub_department || ''} 
                    onChange={e => setEditForm({...editForm, emp_sub_department: e.target.value})}
                    placeholder="Enter sub-department"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                  <input 
                    type="text" 
                    list="designation_options"
                    value={editForm.emp_designation} 
                    onChange={e => setEditForm({...editForm, emp_designation: e.target.value})}
                    placeholder="Enter designation (e.g. Sales Executive)"
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Primary Reporting Person</label>
                  <select
                    value={editForm.primary_reporting_person || ''}
                    onChange={e => setEditForm({ ...editForm, primary_reporting_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Select Reporting Manager --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && u.user_id !== editingUser && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Secondary Reporting Person</label>
                  <select
                    value={editForm.secondary_reporting_person || ''}
                    onChange={e => setEditForm({ ...editForm, secondary_reporting_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Optional Secondary --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && u.user_id !== editingUser && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>HOD Person (Head of Department)</label>
                  <select
                    value={editForm.hod_person || ''}
                    onChange={e => setEditForm({ ...editForm, hod_person: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                  >
                    <option value="">-- None / Select HOD --</option>
                    {users.filter(u => u.role !== 'customer' && u.emp_name && u.user_id !== editingUser && (u.emp_status === 'Active' || !u.emp_status)).map(u => (
                      <option key={u.user_id} value={u.emp_name}>
                        {u.emp_name} ({u.emp_id || 'Staff'}{u.emp_designation ? ` - ${u.emp_designation}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Footer Buttons - Fixed & Always Visible */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
              <button 
                type="button"
                onClick={() => setEditingUser(null)}
                className="btn-action-secondary"
                style={{ padding: '0.55rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="btn-primary"
                style={{ padding: '0.55rem 1.5rem', borderRadius: '6px', fontWeight: 600 }}
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
                  <div style={{ padding: '0.6rem 1rem', backgroundColor: 'var(--bg-primary)', fontWeight: 700, borderBottom: '1px solid var(--border-light)', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚡ Additional System & Operational Powers</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Global action & privilege overrides</span>
                  </div>
                  <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
                    {(() => {
                      const u = users.find(x => x.user_id === accessUser);
                      if (!u) return null;
                      const isUserAdmin = u.role === 'Admin' || u.role === 'admin';

                      const powersList = [
                        { key: 'can_import_data', label: '📥 Import Leads Power', desc: 'Allows uploading and bulk importing CSV lead files into CRM' },
                        { key: 'can_export_data', label: '📤 Export / Download Data Power', desc: 'Allows downloading CSV reports and exporting lead data' },
                        { key: 'can_assign_leads', label: '👥 Lead Assignment Power', desc: 'Allows assigning and reallocating leads to team members' },
                        { key: 'can_delete_leads', label: '🗑️ Delete Records & Leads Power', desc: 'Allows deleting leads from pipeline and report tables' },
                        { key: 'can_claim_unassigned', label: '🎯 Claim Open Leads Power', desc: 'Allows taking ownership of unassigned leads from open pool' },
                        { key: 'can_bulk_actions', label: '⚡ Bulk Operations Power', desc: 'Allows bulk status changes and multi-lead batch actions' },
                        { key: 'can_view_all_companies', label: '🏢 Multi-Company Full Access', desc: 'Allows viewing leads and data across all company entities' },
                        { key: 'can_self_reset_password', label: '🔑 Self Password Reset', desc: 'Allows self password reset via Email OTP on login screen' },
                        { key: 'can_access_audit_logs', label: '📜 View Activity Audit Logs', desc: 'Allows viewing security audit logs and event history in Settings' },
                        { key: 'can_manage_settings', label: '⚙️ Edit CRM Pipeline Config', desc: 'Allows modifying stages, sources, and system preferences' }
                      ];

                      return powersList.map(p => (
                        <label 
                          key={p.key} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'flex-start', 
                            gap: '0.65rem', 
                            padding: '0.65rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: accessForm[p.key] === true ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                            cursor: isUserAdmin ? 'default' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isUserAdmin || accessForm[p.key] === true} 
                            onChange={(e) => setAccessForm(prev => ({ ...prev, [p.key]: e.target.checked }))}
                            disabled={isUserAdmin}
                            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent-color)', marginTop: '0.15rem', flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem', lineHeight: '1.25' }}>{p.desc}</div>
                          </div>
                        </label>
                      ));
                    })()}
                  </div>
                </div>

                {/* Quick Batch Presets Toolbar */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Granular Module Access Matrix
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={() => {
                        setAccessForm(prev => {
                          const updated = { ...prev };
                          MODULES_CONFIG.forEach(m => {
                            updated[m.id] = { ...(updated[m.id] || {}), view: true };
                          });
                          return updated;
                        });
                      }}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', color: '#0284c7', fontWeight: 600 }}
                    >
                      + Grant All VIEW
                    </button>
                    <button
                      onClick={() => {
                        setAccessForm(prev => {
                          const updated = { ...prev };
                          MODULES_CONFIG.forEach(m => {
                            updated[m.id] = { ...(updated[m.id] || {}), view: true, add: true, edit: true };
                          });
                          return updated;
                        });
                      }}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', color: '#16a34a', fontWeight: 600 }}
                    >
                      + Grant Full Access
                    </button>
                    <button
                      onClick={() => {
                        setAccessForm(prev => {
                          const updated = { ...prev };
                          MODULES_CONFIG.forEach(m => {
                            if (updated[m.id]) {
                              updated[m.id] = { ...(updated[m.id] || {}), add: false, edit: false, delete: false };
                            }
                          });
                          return updated;
                        });
                      }}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', color: '#d97706', fontWeight: 600 }}
                    >
                      Set Read-Only
                    </button>
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
                                  {module.viewOnly ? (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input 
                                      type="checkbox"
                                      checked={canAdd}
                                      onChange={() => handleToggleModulePerm(module.id, 'add')}
                                      title="Add Access"
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#16a34a', cursor: 'pointer' }}
                                    />
                                  )}
                                </div>
                                <div style={{ width: '70px', textAlign: 'center' }}>
                                  {module.viewOnly ? (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input 
                                      type="checkbox"
                                      checked={canEdit}
                                      onChange={() => handleToggleModulePerm(module.id, 'edit')}
                                      title="Edit/Save Access"
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#d97706', cursor: 'pointer' }}
                                    />
                                  )}
                                </div>
                                <div style={{ width: '55px', textAlign: 'center' }}>
                                  {module.viewOnly ? (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                  ) : (
                                    <input 
                                      type="checkbox"
                                      checked={canDelete}
                                      onChange={() => handleToggleModulePerm(module.id, 'delete')}
                                      title="Delete Access"
                                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#dc2626', cursor: 'pointer' }}
                                    />
                                  )}
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
                                      const isSubViewOnly = sub.id === 'lead_dashboard' || sub.id === 'hourly_work' || module.viewOnly;

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
                                            {isSubViewOnly ? (
                                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                            ) : (
                                              <input 
                                                type="checkbox"
                                                checked={subAccess.add}
                                                onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'add')}
                                                style={{ width: '1rem', height: '1rem', accentColor: '#16a34a', cursor: 'pointer' }}
                                              />
                                            )}
                                          </div>
                                          <div style={{ width: '70px', textAlign: 'center' }}>
                                            {isSubViewOnly ? (
                                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                            ) : (
                                              <input 
                                                type="checkbox"
                                                checked={subAccess.edit}
                                                onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'edit')}
                                                style={{ width: '1rem', height: '1rem', accentColor: '#d97706', cursor: 'pointer' }}
                                              />
                                            )}
                                          </div>
                                          <div style={{ width: '55px', textAlign: 'center' }}>
                                            {isSubViewOnly ? (
                                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}>—</span>
                                            ) : (
                                              <input 
                                                type="checkbox"
                                                checked={subAccess.delete}
                                                onChange={() => handleToggleSubItemPerm(module.id, sub.id, 'delete')}
                                                style={{ width: '1rem', height: '1rem', accentColor: '#dc2626', cursor: 'pointer' }}
                                              />
                                            )}
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
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowResetPassword(prev => !prev)}
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', userSelect: 'none' }}
                  title={showResetPassword ? "Hide password" : "Show password"}
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
