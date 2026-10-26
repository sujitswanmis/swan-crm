'use client';

import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Download, Upload, Filter, User, Shield, Key, Pencil, 
  Trash2, RotateCcw, LogIn, ChevronLeft, ChevronRight, CheckSquare, Square, 
  MoreVertical, RefreshCw, AlertCircle, Users, Building, Mail, Phone, MapPin,
  MessageSquare, Send, Settings
} from 'lucide-react';
import { 
  getStatusBadgeStyle, HoverIconButton, isMasterAdmin, EMP_STATUS_OPTIONS 
} from '../utils/userManagementUtils';
import { ROLE_PRESETS } from '../utils/rolePresets';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import ColumnSelectorModal from '@/components/TableControls/ColumnSelectorModal';
import MultiColumnFilterModal from '@/components/TableControls/MultiColumnFilterModal';
import ErrorBoundary from '@/components/ErrorBoundary';
import orgStructureConfig from '@/config/org_structure_config.json';

const DEFAULT_USER_MANAGE_COL_WIDTHS = {
  user_employee: 210,
  dept_role: 140,
  location: 110,
  reporting: 130,
  status: 100,
  approval_status: 105,
  role: 140,
  actions: 140
};

const USER_MANAGE_COL_MIN_WIDTHS = {
  user_employee: 150,
  dept_role: 100,
  location: 80,
  reporting: 100,
  status: 80,
  approval_status: 85,
  role: 110,
  actions: 90
};

const ALL_USER_MANAGE_COLUMNS = [
  { key: 'user_employee', label: 'User / Employee' },
  { key: 'dept_role', label: 'Department & Designation' },
  { key: 'location', label: 'Location' },
  { key: 'reporting', label: 'Reporting Structure' },
  { key: 'status', label: 'Status' },
  { key: 'approval_status', label: 'Approval Status' },
  { key: 'role', label: 'Role' },
  { key: 'actions', label: 'Actions' }
];

const DEFAULT_VISIBLE_COLUMNS = [
  'user_employee', 'dept_role', 'location', 'reporting', 'status', 'approval_status', 'role', 'actions'
];

const USER_FILTER_COLUMNS = [
  { key: 'emp_name', label: 'Employee Name' },
  { key: 'emp_id', label: 'Employee Code / ID' },
  { key: 'email', label: 'Email Address' },
  { key: 'emp_mobile', label: 'Mobile Number' },
  { key: 'emp_department', label: 'Department' },
  { key: 'emp_sub_department', label: 'Sub-Department' },
  { key: 'emp_designation', label: 'Designation' },
  { key: 'assigned_shift', label: 'Shift' },
  { key: 'work_location_name', label: 'Work Location' },
  { key: 'company', label: 'Company' },
  { key: 'primary_reporting_person', label: 'Reporting Manager' },
  { key: 'hod_person', label: 'HOD' },
  { key: 'emp_status', label: 'Status' },
  { key: 'approval_status', label: 'Approval Status' },
  { key: 'role', label: 'Role / Template' }
];

export default function UserManageTab({
  users = [],
  loading = false,
  departments = [],
  roleTemplates = [],
  onRefresh = () => {},
  onAddUser = () => {},
  onEditUser = () => {},
  onManagePermissions = () => {},
  onChangeRole = () => {},
  onAssignRole = () => {},
  onAssignPreset = () => {},
  onResetPassword = () => {},
  onSendResetEmail = () => {},
  onViewChat = () => {},
  onImpersonate = () => {},
  onChangeStatus = () => {},
  onToggleApproval = () => {},
  onMoveToTrash = () => {},
  onRestoreFromTrash = () => {},
  onHardDelete = () => {},
  onOpenBulkImport = () => {},
  onExportCSV = () => {},
  hasChatbot = false
}) {
  const [selectedStatusTab, setSelectedStatusTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [selectedSubDepartment, setSelectedSubDepartment] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Table vs Tiles view preference
  const [tableView, setTableView] = useTableViewPreference('UserManagement/tabs/UserManageTab-1');

  // Modal toggles for Column Filter and Advanced Multi-Column Filter
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('user_mgmt_tab_column_visibility_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_) {}
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  // Column order state
  const [columnOrder, setColumnOrder] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('user_mgmt_tab_column_order_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_) {}
    }
    return ALL_USER_MANAGE_COLUMNS;
  });

  // Advanced multi-column filter rules & condition type
  const [filterRules, setFilterRules] = useState({});
  const [filterConditionType, setFilterConditionType] = useState('AND');

  // Column resizing hook for User Manage Table
  const {
    columnWidths: userColWidths,
    isResizing: isUserResizing,
    handleMouseDown: handleUserResizeStart,
    handleTouchStart: handleUserTouchStart,
    handleDoubleClickReset: handleUserReset,
    getTableTotalWidth: getUserTotalWidth
  } = useTableColumnResize(DEFAULT_USER_MANAGE_COL_WIDTHS, 'user_mgmt_tab_col_widths_v2', USER_MANAGE_COL_MIN_WIDTHS);

  // Ordered visible columns
  const orderedVisibleColumns = useMemo(() => {
    const list = columnOrder.length ? columnOrder : ALL_USER_MANAGE_COLUMNS;
    const filtered = list.filter(c => visibleColumns.includes(c.key));
    return filtered.length > 0 ? filtered : ALL_USER_MANAGE_COLUMNS;
  }, [columnOrder, visibleColumns]);

  // Total width of visible columns
  const getVisibleTableTotalWidth = () => {
    return orderedVisibleColumns.reduce((sum, col) => {
      return sum + (userColWidths[col.key] || DEFAULT_USER_MANAGE_COL_WIDTHS[col.key] || 120);
    }, 0);
  };

  const handleApplyColumnSettings = (newVisKeys, newOrderedCols) => {
    const safeVisKeys = newVisKeys.includes('actions') ? newVisKeys : [...newVisKeys, 'actions'];
    setVisibleColumns(safeVisKeys);
    setColumnOrder(newOrderedCols);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('user_mgmt_tab_column_visibility_v1', JSON.stringify(safeVisKeys));
        localStorage.setItem('user_mgmt_tab_column_order_v1', JSON.stringify(newOrderedCols));
      } catch (_) {}
    }
  };

  const handleResetColumnSettings = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    setColumnOrder(ALL_USER_MANAGE_COLUMNS);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('user_mgmt_tab_column_visibility_v1');
        localStorage.removeItem('user_mgmt_tab_column_order_v1');
      } catch (_) {}
    }
  };

  // Status Counts
  const statusCounts = useMemo(() => {
    const counts = { All: 0, Active: 0, InActive: 0, Hold: 0, Resigned: 0, Terminated: 0, Draft: 0, Trash: 0 };
    (users || []).forEach(u => {
      if (u.role === 'customer') return;

      counts.All++;
      const st = u.emp_status || (u.module_access?.emp_status) || 'Active';
      if (counts[st] !== undefined) {
        counts[st]++;
      }
    });
    return counts;
  }, [users]);

  // Dynamically resolve available sub-departments based on selected department
  const availableSubDepartments = useMemo(() => {
    const subDeptSet = new Set();
    
    if (selectedDepartment === 'All') {
      // From org structure config
      (orgStructureConfig?.departments || []).forEach(d => {
        (d.sub_departments || []).forEach(sd => {
          if (sd && typeof sd === 'string' && sd.trim()) subDeptSet.add(sd.trim());
        });
      });
      // From users
      (users || []).forEach(u => {
        const sd = u.emp_sub_department || u.module_access?.emp_sub_department;
        if (sd && typeof sd === 'string' && sd.trim()) subDeptSet.add(sd.trim());
      });
    } else {
      // Find matching dept in config
      const matched = (orgStructureConfig?.departments || []).find(
        d => d.name?.toLowerCase() === selectedDepartment.toLowerCase()
      );
      if (matched?.sub_departments) {
        matched.sub_departments.forEach(sd => {
          if (sd && typeof sd === 'string' && sd.trim()) subDeptSet.add(sd.trim());
        });
      }
      // Also collect from actual users in this department
      (users || []).forEach(u => {
        const uDept = u.emp_department || u.module_access?.emp_department || '';
        if (uDept.toLowerCase() === selectedDepartment.toLowerCase()) {
          const sd = u.emp_sub_department || u.module_access?.emp_sub_department;
          if (sd && typeof sd === 'string' && sd.trim()) subDeptSet.add(sd.trim());
        }
      });
    }

    return Array.from(subDeptSet).sort((a, b) => a.localeCompare(b));
  }, [selectedDepartment, users]);

  const handleDepartmentChange = (dept) => {
    setSelectedDepartment(dept);
    setSelectedSubDepartment('All');
    setCurrentPage(1);
  };

  // Active Multi-Column Filter Rules Count
  const activeRuleCount = useMemo(() => {
    return Object.keys(filterRules).filter(k => filterRules[k]?.value && String(filterRules[k].value).trim() !== '').length;
  }, [filterRules]);

  // Unique values generator for categorical columns in MultiColumnFilterModal
  const getFilterUniqueValues = (colKey) => {
    const vals = new Set();
    (users || []).forEach(u => {
      let v = '';
      if (colKey === 'role') {
        const matched = roleTemplates.find(rt => rt.id === (u.role_template_id || u.module_access?.role_template_id));
        const presetMatched = ROLE_PRESETS.find(p => p.key === u.module_access?.role_preset_key);
        v = matched?.name || presetMatched?.name || (isMasterAdmin(u) ? 'Master Admin' : (u.role || 'Staff'));
      } else if (colKey === 'approval_status') {
        const isApproved = u.is_approved === true || u.is_approved === 'true' || u.module_access?.is_approved === true;
        v = isApproved ? 'Approved' : 'Pending';
      } else if (colKey === 'emp_status') {
        v = u.emp_status || u.module_access?.emp_status || 'Active';
      } else {
        v = u[colKey] || u.module_access?.[colKey] || '';
      }
      if (v && typeof v === 'string' && v.trim()) vals.add(v.trim());
    });
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    let result = (users || []).filter(u => u.role !== 'customer');

    // 1. Status filter
    if (selectedStatusTab !== 'All') {
      result = result.filter(u => {
        const st = u.emp_status || (u.module_access?.emp_status) || 'Active';
        return st.toLowerCase() === selectedStatusTab.toLowerCase();
      });
    }

    // 2. Department filter
    if (selectedDepartment !== 'All') {
      result = result.filter(u => {
        const dept = u.emp_department || u.module_access?.emp_department || '';
        return dept.toLowerCase() === selectedDepartment.toLowerCase();
      });
    }

    // 3. Sub-Department filter
    if (selectedSubDepartment !== 'All') {
      result = result.filter(u => {
        const subDept = u.emp_sub_department || u.module_access?.emp_sub_department || '';
        return subDept.toLowerCase() === selectedSubDepartment.toLowerCase();
      });
    }

    // 4. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => {
        const name = (u.emp_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const empId = (u.emp_id || '').toLowerCase();
        const mobile = (u.emp_mobile || '').toLowerCase();
        const dept = (u.emp_department || '').toLowerCase();
        const subDept = (u.emp_sub_department || '').toLowerCase();
        const desig = (u.emp_designation || '').toLowerCase();
        const roleName = (roleTemplates.find(rt => rt.id === (u.role_template_id || u.module_access?.role_template_id))?.name || u.role || '').toLowerCase();
        return name.includes(q) || email.includes(q) || empId.includes(q) || mobile.includes(q) || dept.includes(q) || subDept.includes(q) || desig.includes(q) || roleName.includes(q);
      });
    }

    // 5. Advanced Multi-Column Filter Rules (AND / OR)
    const ruleKeys = Object.keys(filterRules).filter(k => filterRules[k]?.value && String(filterRules[k].value).trim() !== '');
    if (ruleKeys.length > 0) {
      const compiledRules = ruleKeys.map(k => ({
        key: k,
        condition: filterRules[k].condition || 'contains',
        targetVal: String(filterRules[k].value || '').toLowerCase().trim()
      }));
      const isOR = filterConditionType === 'OR';

      result = result.filter(u => {
        const isApproved = u.is_approved === true || u.is_approved === 'true' || u.module_access?.is_approved === true;
        const matchedRole = roleTemplates.find(rt => rt.id === (u.role_template_id || u.module_access?.role_template_id));
        const presetMatched = ROLE_PRESETS.find(p => p.key === u.module_access?.role_preset_key);
        const roleLabel = matchedRole?.name || presetMatched?.name || (isMasterAdmin(u) ? 'Master Admin' : (u.role || 'Staff'));

        for (let i = 0; i < compiledRules.length; i++) {
          const { key, condition, targetVal } = compiledRules[i];
          let cellVal = '';
          if (key === 'role') {
            cellVal = String(roleLabel).toLowerCase().trim();
          } else if (key === 'approval_status') {
            cellVal = isApproved ? 'approved' : 'pending';
          } else if (key === 'emp_status') {
            cellVal = String(u.emp_status || u.module_access?.emp_status || 'Active').toLowerCase().trim();
          } else {
            cellVal = String(u[key] || u.module_access?.[key] || '').toLowerCase().trim();
          }

          let matches = false;
          switch (condition) {
            case 'start_with': matches = cellVal.startsWith(targetVal); break;
            case 'equal':      matches = cellVal === targetVal; break;
            case 'not_equal':  matches = cellVal !== targetVal; break;
            default:           matches = cellVal.includes(targetVal); break;
          }

          if (isOR) {
            if (matches) return true;
          } else {
            if (!matches) return false;
          }
        }
        return !isOR;
      });
    }

    return result;
  }, [users, selectedStatusTab, selectedDepartment, selectedSubDepartment, searchQuery, filterRules, filterConditionType, roleTemplates]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedDepartment !== 'All' || selectedSubDepartment !== 'All' || activeRuleCount > 0 || selectedStatusTab !== 'All';

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('All');
    setSelectedSubDepartment('All');
    setSelectedStatusTab('All');
    setFilterRules({});
    setCurrentPage(1);
  };

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

  // Helper to render table header cell
  const renderUserHeaderCell = (colKey) => {
    const width = `${userColWidths[colKey] || DEFAULT_USER_MANAGE_COL_WIDTHS[colKey] || 120}px`;

    switch (colKey) {
      case 'user_employee':
        return (
          <th key="user_employee" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>User / Employee</div>
            <ColumnResizer columnKey="user_employee" isResizing={isUserResizing('user_employee')} onMouseDown={(e) => handleUserResizeStart('user_employee', e)} onTouchStart={(e) => handleUserTouchStart('user_employee', e)} onDoubleClick={() => handleUserReset('user_employee')} />
          </th>
        );
      case 'dept_role':
        return (
          <th key="dept_role" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Department & Designation</div>
            <ColumnResizer columnKey="dept_role" isResizing={isUserResizing('dept_role')} onMouseDown={(e) => handleUserResizeStart('dept_role', e)} onTouchStart={(e) => handleUserTouchStart('dept_role', e)} onDoubleClick={() => handleUserReset('dept_role')} />
          </th>
        );
      case 'location':
        return (
          <th key="location" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Location</div>
            <ColumnResizer columnKey="location" isResizing={isUserResizing('location')} onMouseDown={(e) => handleUserResizeStart('location', e)} onTouchStart={(e) => handleUserTouchStart('location', e)} onDoubleClick={() => handleUserReset('location')} />
          </th>
        );
      case 'reporting':
        return (
          <th key="reporting" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Reporting Structure</div>
            <ColumnResizer columnKey="reporting" isResizing={isUserResizing('reporting')} onMouseDown={(e) => handleUserResizeStart('reporting', e)} onTouchStart={(e) => handleUserTouchStart('reporting', e)} onDoubleClick={() => handleUserReset('reporting')} />
          </th>
        );
      case 'status':
        return (
          <th key="status" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Status</div>
            <ColumnResizer columnKey="status" isResizing={isUserResizing('status')} onMouseDown={(e) => handleUserResizeStart('status', e)} onTouchStart={(e) => handleUserTouchStart('status', e)} onDoubleClick={() => handleUserReset('status')} />
          </th>
        );
      case 'approval_status':
        return (
          <th key="approval_status" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Approval Status</div>
            <ColumnResizer columnKey="approval_status" isResizing={isUserResizing('approval_status')} onMouseDown={(e) => handleUserResizeStart('approval_status', e)} onTouchStart={(e) => handleUserTouchStart('approval_status', e)} onDoubleClick={() => handleUserReset('approval_status')} />
          </th>
        );
      case 'role':
        return (
          <th key="role" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Role</div>
            <ColumnResizer columnKey="role" isResizing={isUserResizing('role')} onMouseDown={(e) => handleUserResizeStart('role', e)} onTouchStart={(e) => handleUserTouchStart('role', e)} onDoubleClick={() => handleUserReset('role')} />
          </th>
        );
      case 'actions':
        return (
          <th key="actions" style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.75rem 1rem', width, textAlign: 'center', backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Actions</div>
            <ColumnResizer columnKey="actions" isResizing={isUserResizing('actions')} onMouseDown={(e) => handleUserResizeStart('actions', e)} onTouchStart={(e) => handleUserTouchStart('actions', e)} onDoubleClick={() => handleUserReset('actions')} />
          </th>
        );
      default:
        return null;
    }
  };

  // Helper to render table body cell
  const renderUserCell = (u, colKey, idx) => {
    const isMaster = isMasterAdmin(u);
    const isTrash = (u.emp_status || '').toLowerCase() === 'trash';
    const initials = (u.emp_name || u.email || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    switch (colKey) {
      case 'user_employee':
        return (
          <td key="user_employee" style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
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
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                  <span>{u.emp_name || 'Unnamed Employee'}</span>
                  {isMaster && (
                    <span style={{ fontSize: '0.66rem', backgroundColor: '#dc2626', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                      ADMIN
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3 }}>
                  {u.emp_id && <span>#{u.emp_id}</span>}
                  {u.email && <span>{u.email}</span>}
                </div>
                {u.emp_mobile && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    📞 {u.emp_mobile}
                  </div>
                )}
              </div>
            </div>
          </td>
        );

      case 'dept_role':
        return (
          <td key="dept_role" style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {u.emp_department || 'General'}
            </div>
            {u.emp_sub_department && (
              <div style={{ fontSize: '0.72rem', color: '#6366f1', marginTop: '0.1rem', fontWeight: 600 }}>
                Sub: {u.emp_sub_department}
              </div>
            )}
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {u.emp_designation || 'Staff'}
            </div>
            {u.assigned_shift && (
              <div style={{ fontSize: '0.68rem', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'inline-block', marginTop: '0.2rem', fontWeight: 600 }}>
                ⏰ {u.assigned_shift}
              </div>
            )}
            {u.salary_amount !== null && u.salary_amount !== undefined && u.salary_amount !== '' && (
              <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span>💰 ₹{Number(u.salary_amount).toLocaleString('en-IN')}/mo</span>
              </div>
            )}
          </td>
        );

      case 'location':
        return (
          <td key="location" style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
              {u.work_location_name || u.work_location_type || 'Headquarters'}
            </div>
            {u.company && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                {u.company}
              </div>
            )}
          </td>
        );

      case 'reporting':
        return (
          <td key="reporting" style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Mgr: </span>
              <strong>{u.primary_reporting_person || 'None'}</strong>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
              <span>HOD: </span>
              <strong>{u.hod_person || 'None'}</strong>
            </div>
          </td>
        );

      case 'status':
        return (
          <td key="status" style={{ padding: '0.75rem 0.65rem' }}>
            {(() => {
              const currentStatus = u.emp_status || (u.module_access?.emp_status) || 'Active';
              const style = getStatusBadgeStyle(currentStatus);
              return (
                <select
                  value={currentStatus}
                  onChange={(e) => onChangeStatus(u, e.target.value)}
                  style={{
                    padding: '0.28rem 0.55rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: style.bg,
                    color: style.color,
                    border: `1px solid ${style.border}`,
                    cursor: 'pointer',
                    outline: 'none',
                    width: '100%',
                    maxWidth: '115px'
                  }}
                >
                  {EMP_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt} style={{ background: '#fff', color: '#000' }}>{opt}</option>
                  ))}
                </select>
              );
            })()}
          </td>
        );

      case 'approval_status':
        return (
          <td key="approval_status" style={{ padding: '0.75rem 0.65rem' }}>
            <button
              type="button"
              onClick={() => onToggleApproval(u)}
              disabled={isMaster}
              title={isMaster ? 'Master Admin approval is permanent' : (u.is_approved ? 'Click to mark as Pending' : 'Click to Approve user')}
              style={{
                padding: '0.28rem 0.65rem',
                borderRadius: '99px',
                fontSize: '0.74rem',
                fontWeight: 700,
                border: 'none',
                cursor: isMaster ? 'not-allowed' : 'pointer',
                backgroundColor: u.is_approved ? '#dcfce7' : '#fee2e2',
                color: u.is_approved ? '#166534' : '#991b1b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                whiteSpace: 'nowrap'
              }}
            >
              {u.is_approved ? '✓ Approved' : '⏳ Pending'}
            </button>
          </td>
        );

      case 'role': {
        const resolveUserRoleValue = (member) => {
          if (member.module_access?.role_template_id) return `custom:${member.module_access.role_template_id}`;
          if (member.module_access?.role_preset_key) return `preset:${member.module_access.role_preset_key}`;
          const r = String(member.role || '').toLowerCase().trim();
          if (r === 'crm') return 'preset:crm';
          if (r === 'telecaller') return 'preset:telecaller';
          if (r === 'sales coordinator' || r === 'sales_coordinator') return 'preset:sales_coordinator';
          if (r === 'process coordinator' || r === 'process_coordinator') return 'preset:process_coordinator';
          if (r === 'sales') return 'preset:sales_executive';
          if (r === 'recruiter') return 'preset:hr_recruiter';
          if (r === 'manager') return 'preset:sales_manager';
          if (r === 'admin') return 'Admin';
          return member.role || 'agent';
        };

        const activeValue = resolveUserRoleValue(u);

        return (
          <td key="role" style={{ padding: '0.75rem 0.65rem', verticalAlign: 'middle' }}>
            {isMaster ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.55rem',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                background: '#fef9c3',
                color: '#854d0e',
                border: '1px solid #fde047',
                whiteSpace: 'nowrap'
              }}>
                👑 Master Admin
              </span>
            ) : (
              <select
                value={activeValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('custom:')) {
                    const tId = val.replace('custom:', '');
                    const template = (roleTemplates || []).find(r => r.id === tId);
                    if (template) onAssignRole(u, template);
                  } else if (val.startsWith('preset:')) {
                    const pKey = val.replace('preset:', '');
                    const preset = (ROLE_PRESETS || []).find(p => p.key === pKey);
                    if (preset) onAssignPreset(u, preset);
                  } else {
                    onChangeRole(u, val);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.32rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="Change System Role or Assign Role Template"
              >
                <optgroup label="Roles & Permissions Presets">
                  {ROLE_PRESETS.filter(p => p.key !== 'master_admin').map(preset => (
                    <option key={preset.key} value={`preset:${preset.key}`}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
                {roleTemplates && roleTemplates.length > 0 && (
                  <optgroup label="Custom Role Templates (RBAC)">
                    {roleTemplates.map(rt => (
                      <option key={rt.id} value={`custom:${rt.id}`}>
                        {rt.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="System Base Fallback">
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Sales">Sales</option>
                  <option value="Recruiter">Recruiter</option>
                  <option value="Purchase">Purchase</option>
                  <option value="agent">Agent (Standard Staff)</option>
                </optgroup>
              </select>
            )}
          </td>
        );
      }

      case 'actions':
        return (
          <td key="actions" style={{ padding: '0.5rem 0.35rem', textAlign: 'center', verticalAlign: 'middle' }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              maxWidth: '100%'
            }}>
              {/* Permissions */}
              <HoverIconButton
                icon={Shield}
                label="Permissions Matrix"
                bg="#f5f3ff"
                color="#7c3aed"
                borderColor="#ddd6fe"
                onClick={() => onManagePermissions(u)}
              />

              {/* View Chat - Rendered only when tenant has Chatbot entitled */}
              {hasChatbot && (
                <HoverIconButton
                  icon={MessageSquare}
                  label="View Chat"
                  bg="#dcfce7"
                  hoverBg="#bbf7d0"
                  color="#15803d"
                  borderColor="#bbf7d0"
                  onClick={() => onViewChat(u)}
                />
              )}

              {/* Edit */}
              <HoverIconButton
                icon={Pencil}
                label="Edit Profile"
                bg="#eff6ff"
                color="#2563eb"
                borderColor="#bfdbfe"
                onClick={() => onEditUser(u)}
              />

              {/* Reset Password (Direct) */}
              <HoverIconButton
                icon={Key}
                label="Reset Password"
                bg="#fffbeb"
                color="#d97706"
                borderColor="#fde68a"
                onClick={() => onResetPassword(u)}
              />

              {/* Send Reset Email */}
              <HoverIconButton
                icon={Send}
                label="Send Reset Email"
                bg="#e0e7ff"
                hoverBg="#c7d2fe"
                color="#4338ca"
                borderColor="#c7d2fe"
                onClick={() => onSendResetEmail(u)}
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
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Top Row: Status Badges (Left) & Action Controls (Right) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
        paddingBottom: '0.25rem'
      }}>
        {/* Status Filter Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          {['All', 'Active', 'InActive', 'Hold', 'Resigned', 'Terminated', 'Draft', 'Trash'].map(st => {
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

        {/* Action Controls: [Advance Filter] [Column Filter] [Import CSV] [Export CSV] [TableViewToggle] [Refresh] [+ Add User] */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          flexWrap: 'wrap',
          flexShrink: 0
        }}>
          {/* 1. Advance Multi-Column Filter */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => { setShowFilterModal(!showFilterModal); setShowColumnModal(false); }}
              style={{
                padding: '0.42rem 0.65rem',
                borderRadius: '8px',
                border: activeRuleCount > 0 ? '1px solid #0284c7' : '1px solid var(--border-light)',
                backgroundColor: showFilterModal ? '#0284c7' : (activeRuleCount > 0 ? '#eff6ff' : 'var(--bg-surface)'),
                color: showFilterModal ? '#ffffff' : (activeRuleCount > 0 ? '#0284c7' : 'var(--text-primary)'),
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                position: 'relative',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Advanced Multi-Column Filter (AND / OR conditions)"
            >
              <Filter size={15} />
              <span>Filter</span>
              {activeRuleCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }}>
                  {activeRuleCount}
                </span>
              )}
            </button>

            <ErrorBoundary fallback={null}>
              <MultiColumnFilterModal
                isOpen={showFilterModal}
                onClose={() => setShowFilterModal(false)}
                columns={USER_FILTER_COLUMNS}
                filterRules={filterRules}
                conditionType={filterConditionType}
                onApply={(newRules, newCond) => {
                  setFilterRules(newRules);
                  setFilterConditionType(newCond);
                  setCurrentPage(1);
                }}
                onResetAll={() => {
                  setFilterRules({});
                  setCurrentPage(1);
                }}
                getUniqueValues={getFilterUniqueValues}
              />
            </ErrorBoundary>
          </div>

          {/* 2. Column Filter (ColumnSelectorModal) */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => { setShowColumnModal(!showColumnModal); setShowFilterModal(false); }}
              style={{
                padding: '0.42rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: showColumnModal ? '#0284c7' : 'var(--bg-surface)',
                color: showColumnModal ? '#ffffff' : 'var(--text-primary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Column Filter & Visibility (Show/Hide & Reorder Columns)"
            >
              <Settings size={15} />
              <span>Columns</span>
            </button>

            <ErrorBoundary fallback={null}>
              <ColumnSelectorModal
                isOpen={showColumnModal}
                onClose={() => setShowColumnModal(false)}
                columns={ALL_USER_MANAGE_COLUMNS}
                visibleColumns={visibleColumns}
                onApply={handleApplyColumnSettings}
                onReset={handleResetColumnSettings}
              />
            </ErrorBoundary>
          </div>

          {/* 3. Import CSV */}
          <button
            type="button"
            onClick={onOpenBulkImport}
            style={{
              padding: '0.42rem 0.75rem',
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
            <span>Import CSV</span>
          </button>

          {/* 4. Export CSV */}
          <button
            type="button"
            onClick={onExportCSV}
            style={{
              padding: '0.42rem 0.75rem',
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
            <span>Export CSV</span>
          </button>

          {/* 5. TableViewToggle (right next to Export CSV) */}
          <TableViewToggle view={tableView} onChange={setTableView} />

          {/* 6. Refresh (right next to Add User) */}
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh Users"
            style={{
              padding: '0.42rem 0.75rem',
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
            <span>Refresh</span>
          </button>

          {/* 7. Add User */}
          <button
            type="button"
            onClick={onAddUser}
            style={{
              padding: '0.42rem 0.95rem',
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
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Row 2: Filter Toolbar (1. Search Bar -> 2. Department Selector -> 3. Sub-department Selector) */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        backgroundColor: 'var(--bg-surface)',
        padding: '0.65rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-light)'
      }}>
        {/* 1. Search Bar */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px', maxWidth: '300px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, employee code, email, mobile..."
            style={{
              width: '100%',
              padding: '0.42rem 0.75rem 0.42rem 2.1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          />
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

        {/* 2. Department Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Dept:</span>
          <select
            value={selectedDepartment}
            onChange={e => handleDepartmentChange(e.target.value)}
            style={{
              padding: '0.42rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <option value="All">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-light)', flexShrink: 0 }} />

        {/* 3. Sub-department Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Sub-Dept:</span>
          <select
            value={selectedSubDepartment}
            onChange={e => {
              setSelectedSubDepartment(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: '0.42rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <option value="All">All Sub-Departments</option>
            {availableSubDepartments.map(sd => (
              <option key={sd} value={sd}>{sd}</option>
            ))}
          </select>
        </div>

        {/* Reset All Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearAllFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.65rem',
              borderRadius: '6px',
              border: '1px dashed #ef4444',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
            title="Reset Search, Department, Sub-Department, and Multi-Column Filters"
          >
            <RotateCcw size={13} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Users Data Table / Tiles */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
          <MobileTableView id="UserManagement/tabs/UserManageTab-1" view={tableView} hideToggle={true}>
            <table style={{ width: '100%', minWidth: `${getVisibleTableTotalWidth()}px`, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
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
                  {orderedVisibleColumns.map(col => renderUserHeaderCell(col.key))}
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={orderedVisibleColumns.length || 8} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={36} style={{ opacity: 0.35 }} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No users found</span>
                        <span style={{ fontSize: '0.78rem' }}>Try clearing filters or search query</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u, idx) => (
                    <tr
                      key={u.user_id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {orderedVisibleColumns.map(col => renderUserCell(u, col.key, idx))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </MobileTableView>
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
