'use client';

import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Download, Upload, Filter, User, Shield, Key, Pencil, 
  Trash2, RotateCcw, LogIn, ChevronLeft, ChevronRight, CheckSquare, Square, 
  MoreVertical, RefreshCw, AlertCircle, Users, Building, Mail, Phone, MapPin
} from 'lucide-react';
import { 
  getStatusBadgeStyle, HoverIconButton, isMasterAdmin, EMP_STATUS_OPTIONS 
} from '../utils/userManagementUtils';

export default function UserManageTab({
  users = [],
  loading = false,
  departments = [],
  onRefresh = () => {},
  onAddUser = () => {},
  onEditUser = () => {},
  onManagePermissions = () => {},
  onResetPassword = () => {},
  onImpersonate = () => {},
  onChangeStatus = () => {},
  onMoveToTrash = () => {},
  onRestoreFromTrash = () => {},
  onHardDelete = () => {},
  onOpenBulkImport = () => {},
  onExportCSV = () => {}
}) {
  const [selectedStatusTab, setSelectedStatusTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Status Counts
  const statusCounts = useMemo(() => {
    const counts = { All: 0, Active: 0, InActive: 0, Hold: 0, Resigned: 0, Terminated: 0, Trash: 0 };
    (users || []).forEach(u => {
      // Exclude public/customer role from internal User Manage
      if (u.role === 'customer') return;

      counts.All++;
      const st = u.emp_status || (u.module_access?.emp_status) || 'Active';
      if (counts[st] !== undefined) {
        counts[st]++;
      }
    });
    return counts;
  }, [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    let result = (users || []).filter(u => u.role !== 'customer');

    // Status filter
    if (selectedStatusTab !== 'All') {
      result = result.filter(u => {
        const st = u.emp_status || (u.module_access?.emp_status) || 'Active';
        return st.toLowerCase() === selectedStatusTab.toLowerCase();
      });
    }

    // Department filter
    if (selectedDepartment !== 'All') {
      result = result.filter(u => (u.emp_department || '').toLowerCase() === selectedDepartment.toLowerCase());
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => {
        const name = (u.emp_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const empId = (u.emp_id || '').toLowerCase();
        const mobile = (u.emp_mobile || '').toLowerCase();
        const dept = (u.emp_department || '').toLowerCase();
        const desig = (u.emp_designation || '').toLowerCase();
        return name.includes(q) || email.includes(q) || empId.includes(q) || mobile.includes(q) || dept.includes(q) || desig.includes(q);
      });
    }

    return result;
  }, [users, selectedStatusTab, selectedDepartment, searchQuery]);

  // Pagination calculation
  const totalRows = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredUsers.slice(start, start + rowsPerPage);
  }, [filteredUsers, currentPage, rowsPerPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Top Header & Actions */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-light)'
      }}>
        {/* Status Filter Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          {['All', 'Active', 'InActive', 'Hold', 'Resigned', 'Terminated', 'Trash'].map(st => {
            const isSelected = selectedStatusTab === st;
            const count = statusCounts[st] || 0;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setSelectedStatusTab(st);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid var(--primary-color, #2563eb)' : '1px solid var(--border-light)',
                  backgroundColor: isSelected ? 'var(--primary-color, #2563eb)' : 'var(--bg-surface)',
                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{st === 'Hold' ? 'On Hold' : st}</span>
                <span style={{
                  fontSize: '0.7rem',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.05rem 0.45rem',
                  borderRadius: '10px'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh Users"
            style={{
              padding: '0.45rem 0.75rem',
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
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={onOpenBulkImport}
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
            <Upload size={14} />
            Import CSV
          </button>

          <button
            type="button"
            onClick={onExportCSV}
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
            <Download size={14} />
            Export CSV
          </button>

          <button
            type="button"
            onClick={onAddUser}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--primary-color, #2563eb)',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            <Plus size={16} />
            Add User
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
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
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, employee code, email, mobile, department..."
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

        {/* Department Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Dept:</span>
          <select
            value={selectedDepartment}
            onChange={e => {
              setSelectedDepartment(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem'
            }}
          >
            <option value="All">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Data Table */}
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
                <th style={{ padding: '0.75rem 1rem', width: '260px' }}>User / Employee</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Department & Role</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Location</th>
                <th style={{ padding: '0.75rem 1rem', width: '180px' }}>Reporting Structure</th>
                <th style={{ padding: '0.75rem 1rem', width: '110px' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', width: '180px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No users found</span>
                      <span style={{ fontSize: '0.78rem' }}>Try clearing filters or search query</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u, idx) => {
                  const statusStyle = getStatusBadgeStyle(u.emp_status);
                  const isMaster = isMasterAdmin(u);
                  const isTrash = (u.emp_status || '').toLowerCase() === 'trash';
                  const initials = (u.emp_name || u.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <tr
                      key={u.user_id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* User Column */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            backgroundColor: isMaster ? '#fee2e2' : '#e0e7ff',
                            color: isMaster ? '#dc2626' : '#4338ca',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {initials}
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              <span>{u.emp_name || 'Unnamed Employee'}</span>
                              {isMaster && (
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#dc2626', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                              {u.emp_id && <span>#{u.emp_id}</span>}
                              {u.email && <span>{u.email}</span>}
                            </div>
                            {u.emp_mobile && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                📞 {u.emp_mobile}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {u.emp_department || 'General'}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          {u.emp_designation || u.role || 'Staff'}
                        </div>
                      </td>

                      {/* Location */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {u.work_location_name || u.work_location_type || 'Headquarters'}
                        </div>
                        {u.company && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            {u.company}
                          </div>
                        )}
                      </td>

                      {/* Reporting Structure */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Mgr: </span>
                          <strong>{u.primary_reporting_person || 'None'}</strong>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          <span>HOD: </span>
                          <strong>{u.hod_person || 'None'}</strong>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          type="button"
                          onClick={() => onChangeStatus(u)}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            border: `1px solid ${statusStyle.border}`,
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusStyle.dot }} />
                          {statusStyle.label}
                        </button>
                      </td>

                      {/* Action Icons */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                          {/* Permissions */}
                          <HoverIconButton
                            icon={Shield}
                            label="Permissions Matrix"
                            bg="#f5f3ff"
                            color="#7c3aed"
                            borderColor="#ddd6fe"
                            onClick={() => onManagePermissions(u)}
                          />

                          {/* Edit */}
                          <HoverIconButton
                            icon={Pencil}
                            label="Edit Profile"
                            bg="#eff6ff"
                            color="#2563eb"
                            borderColor="#bfdbfe"
                            onClick={() => onEditUser(u)}
                          />

                          {/* Reset Password */}
                          <HoverIconButton
                            icon={Key}
                            label="Reset Password"
                            bg="#fffbeb"
                            color="#d97706"
                            borderColor="#fde68a"
                            onClick={() => onResetPassword(u)}
                          />

                          {/* Impersonate */}
                          <HoverIconButton
                            icon={LogIn}
                            label="Login as User"
                            bg="#ecfeff"
                            color="#0891b2"
                            borderColor="#a5f3fc"
                            onClick={() => onImpersonate(u)}
                          />

                          {/* Trash or Restore */}
                          {isTrash ? (
                            <>
                              <HoverIconButton
                                icon={RotateCcw}
                                label="Restore User"
                                bg="#ecfdf5"
                                color="#059669"
                                borderColor="#a7f3d0"
                                onClick={() => onRestoreFromTrash(u)}
                              />
                              <HoverIconButton
                                icon={Trash2}
                                label="Delete Permanently"
                                bg="#fef2f2"
                                color="#dc2626"
                                borderColor="#fecaca"
                                onClick={() => onHardDelete(u)}
                              />
                            </>
                          ) : (
                            <HoverIconButton
                              icon={Trash2}
                              label="Move to Trash"
                              bg="#fef2f2"
                              color="#dc2626"
                              borderColor="#fecaca"
                              onClick={() => onMoveToTrash(u)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary, #f8fafc)',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div>
            Showing <strong>{totalRows > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}</strong> to <strong>{Math.min(currentPage * rowsPerPage, totalRows)}</strong> of <strong>{totalRows}</strong> records
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Rows per page selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={e => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem'
                }}
              >
                {[10, 25, 50, 100].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Page navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.5 : 1
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontWeight: 600, padding: '0 0.5rem' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.5 : 1
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
