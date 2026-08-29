'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, User, Users, Building, Shield, CheckSquare, Square } from 'lucide-react';

export default function SearchableEmployeeSelect({
  employees = [],
  selectedEmail = '',
  selectedEmails = [], // Used when isMulti is true (array of email strings or comma-separated)
  onSelect = () => {},
  onMultiSelect = () => {},
  isMulti = false,
  placeholder = 'Search employee by name, email...',
  allowAllStaff = false,
  allStaffLabel = '-- All Staff / General --',
  disabled = false,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Auto focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Normalized list of selected emails in multi-select mode
  const currentMultiEmails = useMemo(() => {
    if (!isMulti) return [];
    if (Array.isArray(selectedEmails)) {
      return selectedEmails.map(e => (typeof e === 'string' ? e : e?.email || '').trim().toLowerCase()).filter(Boolean);
    }
    if (typeof selectedEmails === 'string' && selectedEmails.trim() !== '') {
      return selectedEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    }
    if (typeof selectedEmail === 'string' && selectedEmail.trim() !== '') {
      return selectedEmail.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }, [isMulti, selectedEmails, selectedEmail]);

  // Single select employee
  const selectedEmployee = useMemo(() => {
    if (isMulti) return null;
    if (!selectedEmail) return null;
    if (selectedEmail === 'ALL' && allowAllStaff) {
      return { email: 'ALL', name: allStaffLabel, department: 'All Staff' };
    }
    return employees.find(e => (e.email || '').toLowerCase() === selectedEmail.toLowerCase()) || null;
  }, [isMulti, selectedEmail, employees, allowAllStaff, allStaffLabel]);

  // Multi selected objects
  const selectedMultiEmployees = useMemo(() => {
    if (!isMulti) return [];
    return employees.filter(e => currentMultiEmails.includes((e.email || '').toLowerCase()));
  }, [isMulti, employees, currentMultiEmails]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return employees;
    const q = searchTerm.trim().toLowerCase();
    return employees.filter(e => {
      const name = (e.name || e.emp_name || '').toLowerCase();
      const email = (e.email || '').toLowerCase();
      const dept = (e.department || e.emp_department || '').toLowerCase();
      const desig = (e.designation || e.emp_designation || '').toLowerCase();
      const code = (e.emp_code || '').toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q) || desig.includes(q) || code.includes(q);
    });
  }, [employees, searchTerm]);

  const handleToggleMulti = (emp) => {
    const targetEmail = (emp.email || '').trim().toLowerCase();
    let updated;
    if (currentMultiEmails.includes(targetEmail)) {
      updated = currentMultiEmails.filter(e => e !== targetEmail);
    } else {
      updated = [...currentMultiEmails, targetEmail];
    }
    const updatedObjs = employees.filter(e => updated.includes((e.email || '').toLowerCase()));
    onMultiSelect(updatedObjs, updated);
  };

  const handleSelectAllFiltered = () => {
    const allFilteredEmails = filteredEmployees.map(e => (e.email || '').trim().toLowerCase()).filter(Boolean);
    const combined = Array.from(new Set([...currentMultiEmails, ...allFilteredEmails]));
    const updatedObjs = employees.filter(e => combined.includes((e.email || '').toLowerCase()));
    onMultiSelect(updatedObjs, combined);
  };

  const handleClearAllMulti = () => {
    onMultiSelect([], []);
  };

  const handleSingleSelect = (emp) => {
    if (!emp) {
      onSelect(null);
    } else {
      onSelect(emp);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const getInitials = (name = '') => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name[0] || 'U').toUpperCase();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          border: isOpen ? '1.5px solid #3b82f6' : '1px solid var(--border-color, #cbd5e1)',
          background: disabled ? 'var(--bg-secondary, #f8fafc)' : 'var(--card-bg, #ffffff)',
          borderRadius: '8px',
          padding: '0.45rem 0.65rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: '40px',
          boxShadow: isOpen ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {isMulti ? (
            selectedMultiEmployees.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '12px'
                }}>
                  {selectedMultiEmployees.length} Assigned
                </span>
                {selectedMultiEmployees.slice(0, 2).map(emp => (
                  <span
                    key={emp.email}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <span>{emp.name || emp.emp_name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleMulti(emp);
                      }}
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {selectedMultiEmployees.length > 2 && (
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                    +{selectedMultiEmployees.length - 2} more
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                {placeholder}
              </span>
            )
          ) : selectedEmployee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: selectedEmployee.email === 'ALL' ? '#8b5cf6' : '#3b82f6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                flexShrink: 0
              }}>
                {selectedEmployee.email === 'ALL' ? '👥' : getInitials(selectedEmployee.name || selectedEmployee.emp_name)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary, #1e293b)' }}>
                    {selectedEmployee.name || selectedEmployee.emp_name}
                  </span>
                  {selectedEmployee.department && selectedEmployee.email !== 'ALL' && (
                    <span style={{ fontSize: '0.68rem', background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 500 }}>
                      {selectedEmployee.department}
                    </span>
                  )}
                </div>
                {selectedEmployee.email !== 'ALL' && (
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary, #64748b)' }}>
                    {selectedEmployee.email}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              {placeholder}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, marginLeft: '0.35rem' }}>
          {((isMulti && selectedMultiEmployees.length > 0) || (!isMulti && selectedEmployee)) && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMulti) handleClearAllMulti();
                else handleSingleSelect(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px'
              }}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} style={{ color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </div>
      </div>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '360px',
            maxWidth: '460px',
            width: 'max(100%, 360px)',
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color, #cbd5e1)',
            borderRadius: '10px',
            boxShadow: '0 12px 28px -4px rgba(0,0,0,0.22)',
            zIndex: 99999,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Search Box Header */}
          <div style={{ padding: '0.65rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--card-bg, #ffffff)',
              border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '6px',
              padding: '0.4rem 0.65rem',
              gap: '0.4rem'
            }}>
              <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={isMulti ? "Search & check multiple employees..." : "Search by name, email, department..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none',
                  background: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary, #1e293b)'
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Multi select quick action buttons */}
            {isMulti && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>
                  {selectedMultiEmployees.length} of {employees.length} selected
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Select All
                  </button>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  <button
                    type="button"
                    onClick={handleClearAllMulti}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results List */}
          <div style={{ maxHeight: '270px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Optional All Staff option (for single mode) */}
            {!isMulti && allowAllStaff && !searchTerm && (
              <div
                onClick={() => handleSingleSelect({ email: 'ALL', name: allStaffLabel, department: 'General' })}
                style={{
                  padding: '0.7rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color, #f1f5f9)',
                  background: selectedEmail === 'ALL' ? '#f5f3ff' : 'transparent',
                  transition: 'background 0.15s ease'
                }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                  👥
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#6d28d9' }}>{allStaffLabel}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>Assign to everyone in the company</div>
                </div>
                {selectedEmail === 'ALL' && <Check size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />}
              </div>
            )}

            {filteredEmployees.length === 0 && (
              <div style={{ padding: '1.75rem 1rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem' }}>
                No employees found matching "<strong>{searchTerm}</strong>"
              </div>
            )}

            {filteredEmployees.map((emp) => {
              const emailLower = (emp.email || '').trim().toLowerCase();
              const isSelected = isMulti
                ? currentMultiEmails.includes(emailLower)
                : selectedEmail && emailLower === selectedEmail.toLowerCase();
              const name = emp.name || emp.emp_name || emp.email;

              return (
                <div
                  key={emp.id || emp.email}
                  onClick={() => {
                    if (isMulti) handleToggleMulti(emp);
                    else handleSingleSelect(emp);
                  }}
                  style={{
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color, #f1f5f9)',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    transition: 'background 0.12s ease'
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Multi-select Checkbox or Single Avatar */}
                  {isMulti ? (
                    <div style={{ marginTop: '3px', color: isSelected ? '#3b82f6' : '#94a3b8', flexShrink: 0 }}>
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>
                  ) : (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      {getInitials(name)}
                    </div>
                  )}

                  {/* Info Stack */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Line 1: Full Employee Name */}
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary, #1e293b)', lineHeight: '1.25' }}>
                      {name}
                    </div>

                    {/* Line 2: Email */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
                      {emp.email} {emp.emp_code ? `• ${emp.emp_code}` : ''}
                    </div>

                    {/* Line 3: Department & Designation Badges */}
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '3px', flexWrap: 'wrap' }}>
                      {emp.department && (
                        <span style={{ fontSize: '0.68rem', background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 500 }}>
                          🏢 {emp.department}
                        </span>
                      )}
                      {emp.designation && emp.designation !== 'Staff' && (
                        <span style={{ fontSize: '0.68rem', background: '#e0e7ff', color: '#3730a3', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 500 }}>
                          💼 {emp.designation}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Single mode selected tick */}
                  {!isMulti && isSelected && <Check size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '4px' }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
