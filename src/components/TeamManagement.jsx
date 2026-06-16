'use client';

import React, { useState, useEffect } from 'react';
import { getTeamMembers, updateUserRole, toggleUserApproval, toggleUserPermissions, toggleReadPermissions, toggleWritePermissions, updateEmployeeDetailsAdmin, updateModuleAccess, createAccountAdmin } from '@/app/actions/team';
import { Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MODULES_CONFIG = [
  { id: 'analytics', label: 'Analytics Dashboard', category: 'General' },
  { id: 'new_swan_ai', label: 'New Swan AI', category: 'General' },
  { id: 'callcenter', label: 'Call Center', category: 'General' },
  { id: 'registration', label: 'New Client Registration', category: 'Sales' },
  { id: 'report', label: 'Client Registered Report', category: 'Sales' },
  { id: 'leads', label: 'Lead Data', category: 'Sales' },
  { id: 'orders', label: 'Order Management', category: 'Sales' },
  { id: 'mrp', label: 'MRP System', category: 'Purchase' },
  { id: 'mrp_against', label: 'MRP Against', category: 'Purchase' },
  { id: 'recruiter', label: 'Recruiter Dashboard', category: 'Human Resource' },
  { id: 'joining', label: 'Joining Process', category: 'Human Resource' },
  { id: 'team', label: 'Team Management', category: 'System' },
  { id: 'aiadmin', label: 'User AI Usage', category: 'System' },
  { id: 'aiknowledgebase', label: 'AI Knowledge Base (RAG)', category: 'System' },
  { id: 'calladmin', label: 'Call Admin', category: 'System' },
  { id: 'aicallcenter', label: 'AI Call Center', category: 'System' },
  { id: 'whatsapp_official', label: 'WhatsApp Official', category: 'System' },
  { id: 'whatsapp_unofficial', label: 'WhatsApp UnOfficial', category: 'System' },
  { id: 'sms_config', label: 'SMS Configuration', category: 'System' },
  { id: 'rcs_config', label: 'RCS Configuration', category: 'System' },
  { id: 'email_config', label: 'Email Configuration', category: 'System' },
  { id: 'settings', label: 'Settings', category: 'System' },
];

const DEPARTMENTS = [
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

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_id: '', emp_name: '', emp_department: '', emp_designation: '', company: '', emp_mobile: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Add Account state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addForm, setAddForm] = useState({ emp_id: '', emp_name: '', emp_department: '', emp_designation: '', emp_mobile: '', company: '', email: '', password: '' });
  const [savingAddUser, setSavingAddUser] = useState(false);
  const [showAddUserPassword, setShowAddUserPassword] = useState(false);

  // Access Manage state
  const [accessUser, setAccessUser] = useState(null);
  const [accessForm, setAccessForm] = useState({});
  const [savingAccess, setSavingAccess] = useState(false);

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

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const toggleApproval = async (userId, currentValue) => {
    await toggleUserApproval(userId, !currentValue);
    fetchUsers();
  };

  const toggleRead = async (userId, currentValue) => {
    await toggleReadPermissions(userId, !currentValue);
    fetchUsers();
  };

  const toggleWrite = async (userId, currentValue) => {
    await toggleWritePermissions(userId, !currentValue);
    fetchUsers();
  };

  const handleEditClick = (user) => {
    setEditingUser(user.user_id);
    setEditForm({
      emp_id: user.emp_id || '',
      emp_name: user.emp_name || '',
      emp_department: user.emp_department || '',
      emp_designation: user.emp_designation || '',
      company: user.company || '',
      emp_mobile: user.emp_mobile || ''
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
  };

  const handleToggleModuleAccess = (moduleId) => {
    setAccessForm(prev => {
      const isCurrentlyViewable = !!prev[moduleId]?.view;
      if (isCurrentlyViewable) {
        const newState = { ...prev };
        delete newState[moduleId];
        return newState;
      } else {
        return {
          ...prev,
          [moduleId]: { 
            view: true, 
            is_manager: false, 
            assigned_steps: [] 
          }
        };
      }
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

  const handleToggleStep = (moduleId, stepName) => {
    setAccessForm(prev => {
      const currentSteps = prev[moduleId]?.assigned_steps || [];
      const isAssigned = currentSteps.includes(stepName);
      
      const newSteps = isAssigned 
        ? currentSteps.filter(s => s !== stepName)
        : [...currentSteps, stepName];

      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          assigned_steps: newSteps
        }
      };
    });
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
      setAddForm({ emp_id: '', emp_name: '', emp_department: '', emp_designation: '', emp_mobile: '', company: '', email: '', password: '' });
      fetchUsers();
    } else {
      alert("Error adding user: " + result.error);
    }
  };

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      (u.emp_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.emp_id || '').toLowerCase().includes(q) ||
      (u.emp_mobile || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div style={{ padding: '2rem' }}>Loading team members...</div>;

  return (
    <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
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
        <button 
          onClick={() => setShowAddUserModal(true)}
          className="btn-primary"
          style={{ padding: '0.6rem 1.5rem', borderRadius: '6px' }}
        >
          Add New User
        </button>
      </div>

      <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
        <thead style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
          <tr>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Emp ID</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Name, Email & Mobile</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Dept / Desig</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Company</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Status</th>
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
                  onClick={() => toggleApproval(user.user_id, user.is_approved)}
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
                    style={{ padding: '0.4rem 0.8rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: (user.role === 'admin' || user.role === 'Admin') ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    Manage Access
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.25rem' }}>
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
              <td style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button 
                    onClick={() => handleViewChatClick(user)}
                    style={{ padding: '0.4rem 0.8rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                  >
                    View Chat
                  </button>
                  <button 
                    onClick={() => handleEditClick(user)}
                    style={{ padding: '0.4rem 0.8rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                  >
                    Edit User
                  </button>
                  <button 
                    onClick={() => setPasswordUser(user.user_id)}
                    style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                  >
                    Change Password
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                <input 
                  type="text" 
                  value={addForm.emp_designation} 
                  onChange={e => setAddForm({...addForm, emp_designation: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowAddUserModal(false)}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
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
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                <input 
                  type="text" 
                  value={editForm.emp_designation} 
                  onChange={e => setEditForm({...editForm, emp_designation: e.target.value})}
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
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            
            {/* Fixed Header */}
            <div style={{ padding: '1.5rem 1.5rem 1rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', zIndex: 10 }}>
              {(() => {
                const u = users.find(x => x.user_id === accessUser);
                return u ? (
                  <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px dashed var(--border-light)' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{u.emp_name || 'Unknown User'}</h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                  </div>
                ) : null;
              })()}
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Assign Processes</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Select which modules this user is allowed to access.
              </p>
            </div>
            
            {/* Scrollable Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {['General', 'Sales', 'Purchase', 'Human Resource', 'System'].map(category => (
                  <div key={category} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
                      {category === 'General' ? 'Core Features' : `${category} Department`}
                    </div>
                    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {MODULES_CONFIG.filter(m => m.category === category).map(module => (
                        <div key={module.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: accessForm[module.id]?.view ? '#f8fafc' : 'transparent', padding: '0.75rem', borderRadius: '6px', border: '1px solid', borderColor: accessForm[module.id]?.view ? '#cbd5e1' : 'transparent' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox"
                              checked={!!accessForm[module.id]?.view}
                              onChange={() => handleToggleModuleAccess(module.id)}
                              style={{ width: '1.2rem', height: '1.2rem' }}
                            />
                            <span style={{ fontSize: '1rem', fontWeight: accessForm[module.id]?.view ? 600 : 400 }}>{module.label}</span>
                          </label>

                          {/* Expand options if view is enabled and it's the leads module (or others later) */}
                          {accessForm[module.id]?.view && module.id === 'leads' && (
                            <div style={{ paddingLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#0369a1', fontWeight: 600 }}>
                                <input 
                                  type="checkbox"
                                  checked={!!accessForm[module.id]?.is_manager}
                                  onChange={() => handleToggleManagerLevel(module.id)}
                                />
                                Manager Access (See All Workflow Steps)
                              </label>

                              {!accessForm[module.id]?.is_manager && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem', paddingLeft: '1.5rem', borderLeft: '2px solid #e2e8f0' }}>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Assign specific steps to this user:</div>
                                  {LEAD_STAGES.map(stage => (
                                    <label key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                      <input 
                                        type="checkbox"
                                        checked={(accessForm[module.id]?.assigned_steps || []).includes(stage)}
                                        onChange={() => handleToggleStep(module.id, stage)}
                                      />
                                      {stage}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fixed Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', zIndex: 10 }}>
              <button 
                onClick={() => setAccessUser(null)}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAccess}
                disabled={savingAccess}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingAccess ? 'Saving...' : 'Save Access'}
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
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
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
