'use client';

import React, { useState, useEffect } from 'react';
import { getTeamMembers, toggleUserApproval, updateEmployeeDetailsAdmin } from '@/app/actions/team';
import { Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PremiumProgressLoader } from './PremiumProgressLoader';

export default function PublicUserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState({
    show: false,
    userId: null,
    currentValue: null,
    userName: ''
  });

  // Edit state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_name: '', emp_mobile: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

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
      // Filter only users with 'customer' role
      const customers = (data || []).filter(u => u.role === 'customer');
      setUsers(customers);
    } catch (e) {
      console.error('Error fetching public users:', e);
    }
    setLoading(false);
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

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditForm({
      emp_name: user.emp_name || '',
      emp_mobile: user.emp_mobile || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.emp_name.trim()) {
      alert("Name is required.");
      return;
    }
    setSavingEdit(true);
    const payload = {
      emp_id: editingUser.emp_id || 'CUSTOMER',
      emp_name: editForm.emp_name,
      emp_department: editingUser.emp_department || 'Customer Support',
      emp_designation: editingUser.emp_designation || 'Customer',
      emp_mobile: editForm.emp_mobile,
      company: editingUser.company || 'Public'
    };
    const result = await updateEmployeeDetailsAdmin(editingUser.user_id, payload);
    setSavingEdit(false);
    if (result.success) {
      setEditingUser(null);
      fetchUsers();
    } else {
      alert("Error saving details: " + result.error);
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

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (
      (u.emp_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.emp_mobile || '').toLowerCase().includes(q) ||
      (u.emp_id || '').toLowerCase().includes(q)
    );
  });

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) return <PremiumProgressLoader message="Loading Public User Management" active={loading} />;

  return (
    <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Public User Management</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Maintain and monitor accounts of public customers who registered via the standalone chat interface.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search by name, email, or mobile..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', width: '100%', maxWidth: '350px' }}
        />
      </div>

      <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
        <thead style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
          <tr>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Customer ID</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Name & Contact Details</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Status</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Date Registered</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No public users found matching your search.
              </td>
            </tr>
          ) : (
            filteredUsers.map(user => (
              <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{user.emp_id || '-'}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 600 }}>{user.emp_name || 'Public User'}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.email}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.emp_mobile || '-'}</div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <button 
                    onClick={() => toggleApproval(user.user_id, user.is_approved, user.emp_name || user.email)}
                    style={{ 
                      padding: '0.3rem 0.6rem', 
                      borderRadius: '99px', 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      border: 'none', 
                      cursor: 'pointer',
                      backgroundColor: user.is_approved ? '#dcfce7' : '#fee2e2',
                      color: user.is_approved ? '#166534' : '#991b1b'
                    }}
                  >
                    {user.is_approved ? '✓ Approved' : '⏳ Pending Approval'}
                  </button>
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                  {formatDate(user.created_at)}
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => handleViewChatClick(user)}
                      style={{ padding: '0.4rem 0.8rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
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
            ))
          )}
        </tbody>
      </table>

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

      {/* Edit Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Edit Customer Details</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Full Name *</label>
                <input 
                  type="text" 
                  value={editForm.emp_name} 
                  onChange={e => setEditForm({...editForm, emp_name: e.target.value})}
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
                disabled={savingEdit || !editForm.emp_name.trim()}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Reset Password</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type={showResetPassword ? "text" : "password"} 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={{ width: '100%', padding: '0.5rem 2.5rem 0.5rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showResetPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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
                disabled={savingPassword || !newPassword || newPassword.length < 6}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
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
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Public Chat History</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                  User: {viewChatUser.emp_name || 'Public User'} ({viewChatUser.emp_id || '-'})
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
                  No chat history recorded yet for this customer.
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
                          {isUser ? 'Customer' : 'Swan AI'}
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
