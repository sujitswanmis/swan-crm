'use client';

import React, { useState, useMemo } from 'react';
import { 
  Users, Search, CheckCircle2, XCircle, Key, Pencil, MessageSquare, 
  RefreshCw, AlertCircle, Eye, EyeOff, ShieldCheck, UserCheck 
} from 'lucide-react';
import { toggleUserApproval, updateEmployeeDetailsAdmin } from '@/app/actions/team';
import { HoverIconButton, formatISTDateTime } from '../utils/userManagementUtils';

export default function PublicUsersTab({
  users = [],
  onRefresh = () => {},
  onResetPassword = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterApproved, setFilterApproved] = useState('All'); // 'All' | 'Approved' | 'Pending'
  const [togglingId, setTogglingId] = useState(null);

  // Edit Public User Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_name: '', emp_mobile: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Filter only customers
  const customerUsers = useMemo(() => {
    return (users || []).filter(u => u.role === 'customer');
  }, [users]);

  const filteredCustomers = useMemo(() => {
    let result = customerUsers;

    if (filterApproved === 'Approved') {
      result = result.filter(u => u.is_approved === true);
    } else if (filterApproved === 'Pending') {
      result = result.filter(u => !u.is_approved);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => {
        const name = (u.emp_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const mobile = (u.emp_mobile || '').toLowerCase();
        return name.includes(q) || email.includes(q) || mobile.includes(q);
      });
    }

    return result;
  }, [customerUsers, filterApproved, searchQuery]);

  const handleToggleApproval = async (user) => {
    setTogglingId(user.user_id);
    try {
      await toggleUserApproval(user.user_id, !user.is_approved);
      onRefresh();
    } catch (err) {
      alert("Error updating approval status: " + err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleEditClick = (u) => {
    setEditingUser(u);
    setEditForm({
      emp_name: u.emp_name || '',
      emp_mobile: u.emp_mobile || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.emp_name.trim()) {
      alert("Name is required.");
      return;
    }
    setSavingEdit(true);
    try {
      const payload = {
        emp_id: editingUser.emp_id || 'CUSTOMER',
        emp_name: editForm.emp_name,
        emp_department: editingUser.emp_department || 'Customer Support',
        emp_designation: editingUser.emp_designation || 'Customer',
        emp_mobile: editForm.emp_mobile,
        company: editingUser.company || 'Public'
      };
      const res = await updateEmployeeDetailsAdmin(editingUser.user_id, payload);
      if (res && res.success) {
        setEditingUser(null);
        onRefresh();
      } else {
        alert(res?.error || "Failed to update public user details");
      }
    } catch (e) {
      alert("Failed to update user: " + e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Intro Header */}
      <div style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} style={{ color: '#0891b2' }} />
            External & Customer Users Directory
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Manage client and vendor portal registrations, access verification, and credentials
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onRefresh}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-surface)',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-light)'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search customer by name, email, mobile..."
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2.1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['All', 'Approved', 'Pending'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterApproved(f)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: filterApproved === f ? '1px solid var(--primary-color, #2563eb)' : '1px solid var(--border-light)',
                backgroundColor: filterApproved === f ? 'var(--primary-color, #2563eb)' : 'var(--bg-surface)',
                color: filterApproved === f ? '#ffffff' : 'var(--text-primary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--bg-primary, #f1f5f9)',
                borderBottom: '1px solid var(--border-light)',
                zIndex: 2,
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <th style={{ padding: '0.75rem 1rem' }}>Customer / Client</th>
                <th style={{ padding: '0.75rem 1rem' }}>Contact</th>
                <th style={{ padding: '0.75rem 1rem' }}>Registered Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Portal Approval</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No customer accounts found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((u, idx) => (
                  <tr
                    key={u.user_id || idx}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))'
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {u.emp_name || 'Unnamed Client'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        {u.email}
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                        {u.emp_mobile ? `📞 ${u.emp_mobile}` : 'No phone'}
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {formatISTDateTime(u.created_at)}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        disabled={togglingId === u.user_id}
                        onClick={() => handleToggleApproval(u)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          border: u.is_approved ? '1px solid #a7f3d0' : '1px solid #fde68a',
                          backgroundColor: u.is_approved ? '#ecfdf5' : '#fffbeb',
                          color: u.is_approved ? '#059669' : '#d97706',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {u.is_approved ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {u.is_approved ? 'Approved' : 'Pending Approval'}
                      </button>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        <HoverIconButton
                          icon={Pencil}
                          label="Edit Client Details"
                          bg="#eff6ff"
                          color="#2563eb"
                          borderColor="#bfdbfe"
                          onClick={() => handleEditClick(u)}
                        />
                        <HoverIconButton
                          icon={Key}
                          label="Reset Password"
                          bg="#fffbeb"
                          color="#d97706"
                          borderColor="#fde68a"
                          onClick={() => onResetPassword(u)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Public User Modal */}
      {editingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1060,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '440px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '16px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border-light)',
            padding: '1.5rem'
          }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Edit Customer Info
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={editForm.emp_name}
                  onChange={e => setEditForm(prev => ({ ...prev, emp_name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={editForm.emp_mobile}
                  onChange={e => setEditForm(prev => ({ ...prev, emp_mobile: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'var(--primary-color, #2563eb)',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: savingEdit ? 'not-allowed' : 'pointer'
                }}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
