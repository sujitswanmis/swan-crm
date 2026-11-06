'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Plus, RefreshCw, Search, Edit3, Trash2, X, Building, MapPin,
  CheckCircle2, AlertCircle, Clock, ShieldCheck, Tag, Info
} from 'lucide-react';
import {
  getCompanyHolidays,
  saveCompanyHoliday,
  deleteCompanyHoliday,
  resetCompanyHolidaysToDefault
} from '@/app/actions/checklist';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import StandardTablePagination from '@/components/common/StandardTablePagination';

const KNOWN_TENANTS = [
  { id: '00000000-0000-0000-0000-000000000001', code: 'TNT00002', name: 'New Swan Group' },
  { id: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', code: 'TNT00001', name: 'SuPuja Creations' },
  { id: '922d3e72-6588-457f-a562-4f1bdbf10d98', code: 'TNT00003', name: 'Testing New Swan Group' }
];

const HOLIDAY_TYPES = [
  { id: 'NATIONAL', label: 'National Holiday', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { id: 'FESTIVAL', label: 'Festival / Religious', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { id: 'COMPANY', label: 'Company Holiday', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  { id: 'PLANT_SHUTDOWN', label: 'Plant / Branch Shutdown', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { id: 'OPTIONAL', label: 'Restricted / Optional', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
];

export default function HolidaysConfig({ userCompany = '', isMasterAdmin = false, userRole = '' }) {
  // 1. Dual Scope Selection: Company (Tenant) & Branch (Plant)
  const [selectedCompany, setSelectedCompany] = useState(() => {
    const raw = String(userCompany || '').trim().toLowerCase();
    if (raw.includes('supuja') || raw === 'tnt00001') return 'SuPuja Creations';
    if (raw.includes('testing') || raw === 'tnt00003') return 'Testing New Swan Group';
    return 'New Swan Group';
  });

  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [availableBranches, setAvailableBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // 2. Holidays Data
  const [holidaysList, setHolidaysList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'UPCOMING' | 'PAST'

  // 3. Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Form State
  const [form, setForm] = useState({
    id: null,
    date: '',
    name: '',
    type: 'COMPANY',
    branch_name: 'All Branches',
    description: ''
  });

  // 4. Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Resolved Tenant Metadata
  const currentTenantMeta = useMemo(() => {
    const nameLow = selectedCompany.toLowerCase();
    return KNOWN_TENANTS.find(t => nameLow.includes(t.name.toLowerCase()) || nameLow.includes(t.code.toLowerCase())) || KNOWN_TENANTS[0];
  }, [selectedCompany]);

  // Load Branches when selectedCompany changes
  useEffect(() => {
    let isCancelled = false;
    (async () => {
      setLoadingBranches(true);
      try {
        const res = await getTenantBranches(selectedCompany);
        if (!isCancelled) {
          const list = Array.isArray(res) ? res : (res?.branches || []);
          setAvailableBranches(list);
        }
      } catch (err) {
        console.warn('Failed to load branches:', err);
      } finally {
        if (!isCancelled) setLoadingBranches(false);
      }
    })();
    return () => { isCancelled = true; };
  }, [selectedCompany]);

  // Load Holidays when Company or Branch changes
  const loadHolidays = async () => {
    setLoading(true);
    try {
      const res = await getCompanyHolidays(currentTenantMeta.id, selectedBranch);
      if (res.success) {
        setHolidaysList(res.data || []);
      } else {
        showToast('error', res.error || 'Failed to fetch holidays');
      }
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
    setCurrentPage(1);
  }, [currentTenantMeta.id, selectedBranch]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Filter & Pagination Calculations
  const filteredHolidays = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    return holidaysList.filter(h => {
      // Type Filter
      if (selectedTypeFilter !== 'ALL' && (h.type || 'COMPANY') !== selectedTypeFilter) {
        return false;
      }
      // Time Filter
      if (timeFilter === 'UPCOMING' && h.date < todayStr) return false;
      if (timeFilter === 'PAST' && h.date >= todayStr) return false;

      // Search Query
      if (query) {
        const nameMatch = (h.name || '').toLowerCase().includes(query);
        const dateMatch = (h.date || '').includes(query);
        const typeMatch = (h.type || '').toLowerCase().includes(query);
        const branchMatch = (h.branch_name || '').toLowerCase().includes(query);
        const descMatch = (h.description || '').toLowerCase().includes(query);
        return nameMatch || dateMatch || typeMatch || branchMatch || descMatch;
      }
      return true;
    });
  }, [holidaysList, searchQuery, selectedTypeFilter, timeFilter]);

  const totalRecords = filteredHolidays.length;
  const effectivePageSize = pageSize === 'All' ? 100000 : Number(pageSize || 20);
  const totalPages = Math.max(1, Math.ceil(totalRecords / effectivePageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalRecords);
  const paginatedHolidays = filteredHolidays.slice(startIndex, endIndex);

  // Modal Handlers
  const handleOpenAdd = () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    setEditingHoliday(null);
    setForm({
      id: null,
      date: todayStr,
      name: '',
      type: 'COMPANY',
      branch_name: selectedBranch === 'All Branches' ? 'All Branches' : selectedBranch,
      description: ''
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (h) => {
    setEditingHoliday(h);
    setForm({
      id: h.id || h.date,
      date: h.date,
      name: h.name,
      type: h.type || 'COMPANY',
      branch_name: h.branch_name || 'All Branches',
      description: h.description || ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!form.date || !form.name.trim()) {
      showToast('error', 'Please enter both holiday date and holiday name');
      return;
    }
    setSaving(true);
    try {
      const res = await saveCompanyHoliday(form, currentTenantMeta.id, selectedBranch);
      if (res.success) {
        setHolidaysList(res.data || []);
        setModalOpen(false);
        showToast('success', `🎉 Holiday "${form.name}" saved successfully!`);
      } else {
        showToast('error', res.error || 'Failed to save holiday');
      }
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h) => {
    if (!window.confirm(`Are you sure you want to delete holiday "${h.name}" on ${h.date}?`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await deleteCompanyHoliday(h.id || h.date, currentTenantMeta.id, selectedBranch);
      if (res.success) {
        setHolidaysList(res.data || []);
        showToast('success', `🗑️ Holiday "${h.name}" deleted.`);
      } else {
        showToast('error', res.error || 'Failed to delete holiday');
      }
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`Reset holidays calendar for ${selectedCompany} (${currentTenantMeta.code}) back to standard National gazetted holidays? This will restore standard national holidays.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await resetCompanyHolidaysToDefault(currentTenantMeta.id, selectedBranch);
      if (res.success) {
        setHolidaysList(res.data || []);
        showToast('success', '✅ Restored default national holidays successfully.');
      } else {
        showToast('error', res.error || 'Failed to reset holidays');
      }
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%', padding: '0.5rem 0' }}>
      
      {/* Toast Alert */}
      {toast && (
        <div style={{
          padding: '0.65rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: toast.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: toast.type === 'success' ? '#065f46' : '#991b1b',
          border: toast.type === 'success' ? '1px solid #a7f3d0' : '1px solid #fecaca',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner & Dual Scope Selectors (Tenant & Branch) */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.85rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.35rem' }}>🎉</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
              Holidays Calendar Config
            </h2>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '6px',
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe'
            }}>
              {currentTenantMeta.code}
            </span>
          </div>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
            Configure organization-wide holidays, regional festivals, and plant shutdown schedules per tenant & branch. Checklists and Attendance policies respect these dates.
          </p>
        </div>

        {/* Dual Selectors: Company & Branch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Company Selector (Master Admin only / Locked Badge for Tenant Admin) */}
          {isMasterAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Building size={15} style={{ color: 'var(--text-secondary, #64748b)' }} />
              <select
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setSelectedBranch('All Branches');
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '8px',
                  border: '1.5px solid #3b82f6',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Select Tenant / Company"
              >
                {KNOWN_TENANTS.map(t => (
                  <option key={t.code} value={t.name}>{t.name} ({t.code})</option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--bg-secondary, #f8fafc)',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--text-primary, #0f172a)'
            }}>
              <Building size={15} style={{ color: '#2563eb' }} />
              <span>{selectedCompany} ({currentTenantMeta.code})</span>
            </div>
          )}

          {/* Branch / Plant Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <MapPin size={15} style={{ color: 'var(--text-secondary, #64748b)' }} />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #cbd5e1)',
                background: 'var(--card-bg, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Select Branch / Plant Scope"
            >
              <option value="All Branches">All Branches (Tenant-wide Default)</option>
              {availableBranches.map((b) => {
                const bName = typeof b === 'string' ? b : (b.name || b.branch_name || b.code);
                const bCode = b?.branch_code || '';
                return (
                  <option key={b.id || bName} value={bName}>
                    {bName} {bCode ? `(${bCode})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <button
            type="button"
            onClick={loadHolidays}
            title="Refresh Holidays List"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--card-bg, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter & Action Card */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '10px',
        padding: '0.65rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {/* Row 1: Search Bar, Status Timing & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: '1 1 auto' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search holiday name / date / branch..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.38rem 1.8rem 0.38rem 1.9rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  fontSize: '0.82rem',
                  background: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-primary, #0f172a)'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Time Filter Dropdown (Upcoming vs Past) */}
            <select
              value={timeFilter}
              onChange={(e) => {
                setTimeFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '0.38rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'var(--bg-secondary, #f8fafc)',
                color: 'var(--text-primary, #1e293b)',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Dates (Calendar Year)</option>
              <option value="UPCOMING">🟢 Upcoming Holidays</option>
              <option value="PAST">📜 Passed Holidays</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
              }}
            >
              <Plus size={15} /> Add Holiday
            </button>

            <button
              type="button"
              onClick={handleReset}
              title="Restore standard 10 National Gazetted Holidays"
              style={{
                background: 'var(--bg-secondary, #f1f5f9)',
                color: 'var(--text-secondary, #475569)',
                border: '1px solid var(--border-color, #cbd5e1)',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RefreshCw size={13} /> Reset Default
            </button>
          </div>
        </div>

        {/* Row 2: Type Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-color, #f1f5f9)', paddingTop: '0.45rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginRight: '0.25rem' }}>
            Category Filter:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('ALL')}
            style={{
              padding: '0.22rem 0.65rem',
              borderRadius: '20px',
              border: selectedTypeFilter === 'ALL' ? '1.5px solid #2563eb' : '1px solid var(--border-color, #e2e8f0)',
              background: selectedTypeFilter === 'ALL' ? '#2563eb' : 'var(--bg-secondary, #f8fafc)',
              color: selectedTypeFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary, #475569)',
              fontSize: '0.75rem',
              fontWeight: selectedTypeFilter === 'ALL' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            All Types ({holidaysList.length})
          </button>

          {HOLIDAY_TYPES.map(t => {
            const count = holidaysList.filter(h => (h.type || 'COMPANY') === t.id).length;
            const isSelected = selectedTypeFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTypeFilter(t.id)}
                style={{
                  padding: '0.22rem 0.65rem',
                  borderRadius: '20px',
                  border: isSelected ? `1.5px solid ${t.color}` : '1px solid var(--border-color, #e2e8f0)',
                  background: isSelected ? t.color : 'var(--bg-secondary, #f8fafc)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary, #475569)',
                  fontSize: '0.75rem',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Holidays Table Container with Sticky Frozen Header */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 365px)',
        minHeight: '260px',
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '12px',
        position: 'relative'
      }}>
        <table style={{ width: '100%', minWidth: '850px', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary, #f8fafc)' }}>
            <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '60px', padding: '0.75rem 0.5rem', textAlign: 'center', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                #
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '180px', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Holiday Date & Day
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '240px', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Holiday Name & Notes
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '170px', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Holiday Category
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '180px', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Branch / Plant Scope
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '120px', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Timeline
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, width: '120px', padding: '0.75rem 1rem', textAlign: 'right', background: 'var(--bg-secondary, #f8fafc)', boxShadow: 'inset 0 -1px 0 var(--border-color, #e2e8f0)' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedHolidays.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                  <Calendar size={38} style={{ opacity: 0.35, margin: '0 auto 0.5rem' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary, #0f172a)' }}>No Holidays Found</div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                    {searchQuery ? `No holidays match "${searchQuery}".` : 'No holidays registered for this branch scope.'}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    style={{
                      marginTop: '0.85rem',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.45rem 1.1rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    Add Holiday
                  </button>
                </td>
              </tr>
            )}

            {paginatedHolidays.map((h, idx) => {
              const isPast = h.date < todayStr;
              const isToday = h.date === todayStr;
              const d = new Date(`${h.date}T12:00:00+05:30`);
              const dayName = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' });
              const dateFormatted = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
              const meta = HOLIDAY_TYPES.find(t => t.id === h.type) || HOLIDAY_TYPES[2];

              return (
                <tr
                  key={h.id || `${h.date}_${idx}`}
                  style={{
                    borderBottom: '1px solid var(--border-color, #e2e8f0)',
                    background: isToday ? '#f0fdf4' : isPast ? '#fafafa' : 'transparent',
                    opacity: isPast ? 0.82 : 1
                  }}
                >
                  {/* Sr No */}
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary, #64748b)', fontSize: '0.8rem' }}>
                    {startIndex + idx + 1}
                  </td>

                  {/* Holiday Date & Day */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                      <Calendar size={14} color="#f59e0b" />
                      <span>{dateFormatted}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.15rem' }}>
                      {dayName}
                    </div>
                  </td>

                  {/* Holiday Name & Notes */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                      {h.name}
                    </div>
                    {h.description && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.2rem', fontStyle: 'italic', wordBreak: 'break-word' }}>
                        "{h.description}"
                      </div>
                    )}
                  </td>

                  {/* Category Badge */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                    <span style={{
                      background: meta.bg,
                      color: meta.color,
                      border: `1px solid ${meta.border}`,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <Tag size={11} /> {meta.label}
                    </span>
                  </td>

                  {/* Branch Scope */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                    <span style={{
                      background: (h.branch_name || 'All Branches') === 'All Branches' ? '#f1f5f9' : '#eff6ff',
                      color: (h.branch_name || 'All Branches') === 'All Branches' ? '#475569' : '#1d4ed8',
                      border: `1px solid ${(h.branch_name || 'All Branches') === 'All Branches' ? '#cbd5e1' : '#bfdbfe'}`,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      wordBreak: 'break-word'
                    }}>
                      <MapPin size={11} /> {h.branch_name || 'All Branches'}
                    </span>
                  </td>

                  {/* Timeline Badge */}
                  <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                    {isToday ? (
                      <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '0.2rem 0.55rem', borderRadius: '10px', fontSize: '0.74rem', fontWeight: 800 }}>
                        🟢 Today
                      </span>
                    ) : isPast ? (
                      <span style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.2rem 0.55rem', borderRadius: '10px', fontSize: '0.74rem', fontWeight: 600 }}>
                        Passed
                      </span>
                    ) : (
                      <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '0.2rem 0.55rem', borderRadius: '10px', fontSize: '0.74rem', fontWeight: 700 }}>
                        Upcoming
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', verticalAlign: 'top' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(h)}
                        title="Edit Holiday"
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          padding: '0.28rem 0.55rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        <Edit3 size={12} /> Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(h)}
                        title="Delete Holiday"
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          padding: '0.28rem 0.55rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unified Standard Table Pagination */}
      <StandardTablePagination
        currentPage={activePage}
        totalRecords={totalRecords}
        pageSize={pageSize === 'All' ? 100000 : Number(pageSize || 20)}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        style={{ marginTop: '0.35rem', borderRadius: '10px', paddingRight: '7rem' }}
      />

      {/* Modal: Add / Edit Holiday */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color, #e2e8f0)'
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#fff',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.35rem' }}>🎉</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                    {editingHoliday ? 'Edit Holiday' : 'Add New Company Holiday'}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#93c5fd', marginTop: '0.15rem' }}>
                    🏢 {selectedCompany} ({currentTenantMeta.code})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Date & Type Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>
                    📅 Holiday Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--text-primary, #0f172a)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700, fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>
                    🏷️ Category / Type
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {HOLIDAY_TYPES.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Holiday Name */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>
                  🎉 Holiday Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali, Republic Day, Founder's Day..."
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Branch Scope */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>
                  📍 Branch / Plant Scope
                </label>
                <select
                  value={form.branch_name}
                  onChange={(e) => setForm(prev => ({ ...prev, branch_name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <option value="All Branches">All Branches (Tenant-wide Default)</option>
                  {availableBranches.map((b) => {
                    const bName = typeof b === 'string' ? b : (b.name || b.branch_name || b.code);
                    const bCode = b?.branch_code || '';
                    return (
                      <option key={b.id || bName} value={bName}>
                        {bName} {bCode ? `(${bCode})` : ''}
                      </option>
                    );
                  })}
                </select>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Choose "All Branches" for company-wide holidays, or target a specific manufacturing unit/plant.
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>
                  📝 Notes / Description (Optional)
                </label>
                <textarea
                  placeholder="Optional details, shutdown guidelines, or circular notice..."
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    fontSize: '0.82rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: 'none',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '0.5rem 1.1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? <RefreshCw size={14} className="spin" /> : <ShieldCheck size={14} />}
                  {saving ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
