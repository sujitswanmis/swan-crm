'use client';

import React, { useState, useMemo } from 'react';
import { Network, Users, ChevronDown, ChevronRight, UserCheck, AlertTriangle, Search, Building, Shield } from 'lucide-react';
import { isMasterAdmin } from '../utils/userManagementUtils';

export default function OrgHierarchyTab({
  users = [],
  departments = [],
  onEditUser = () => {}
}) {
  const [selectedDept, setSelectedDept] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedManagers, setExpandedManagers] = useState({});

  // Filter internal staff
  const staff = useMemo(() => {
    return (users || []).filter(u => u.role !== 'customer');
  }, [users]);

  // Find unmapped staff (missing primary manager or HOD)
  const unmappedStaff = useMemo(() => {
    return staff.filter(u => {
      if (isMasterAdmin(u)) return false;
      return !u.primary_reporting_person || !u.hod_person;
    });
  }, [staff]);

  // Group staff by Department
  const departmentGroups = useMemo(() => {
    const groups = {};
    staff.forEach(u => {
      const dept = u.emp_department || 'Unassigned Department';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(u);
    });
    return groups;
  }, [staff]);

  // Identify Managers and their Direct Reports
  const managerHierarchy = useMemo(() => {
    const managersMap = {};

    staff.forEach(u => {
      const mgrName = (u.primary_reporting_person || '').trim();
      if (mgrName) {
        if (!managersMap[mgrName]) {
          managersMap[mgrName] = [];
        }
        managersMap[mgrName].push(u);
      }
    });

    return managersMap;
  }, [staff]);

  const toggleManager = (mgrName) => {
    setExpandedManagers(prev => ({ ...prev, [mgrName]: !prev[mgrName] }));
  };

  // Filtered managers
  const filteredManagers = useMemo(() => {
    const mgrNames = Object.keys(managerHierarchy);
    if (!searchQuery.trim()) return mgrNames;
    const q = searchQuery.toLowerCase().trim();
    return mgrNames.filter(mgr => {
      const matchesMgr = mgr.toLowerCase().includes(q);
      const matchesReports = managerHierarchy[mgr]?.some(sub => 
        (sub.emp_name || '').toLowerCase().includes(q) || (sub.emp_id || '').toLowerCase().includes(q)
      );
      return matchesMgr || matchesReports;
    });
  }, [managerHierarchy, searchQuery]);

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
            <Network size={20} style={{ color: '#2563eb' }} />
            Organizational Reporting Hierarchy
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Supervise reporting managers, HOD approvals, department chains and resolve unassigned subordinates
          </p>
        </div>

        {/* Unassigned Warning Banner */}
        {unmappedStaff.length > 0 && (
          <div style={{
            padding: '0.5rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#b45309',
            fontSize: '0.78rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertTriangle size={16} />
            <span>{unmappedStaff.length} employees have incomplete manager/HOD mapping</span>
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search reporting manager or team member..."
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
      </div>

      {/* Reporting Hierarchy Tree */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Left: Manager Trees */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Reporting Chains by Manager ({filteredManagers.length})
          </span>

          {filteredManagers.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              No manager chains found matching search query
            </div>
          ) : (
            filteredManagers.map(mgrName => {
              const directReports = managerHierarchy[mgrName] || [];
              const isOpen = expandedManagers[mgrName] !== false; // open by default

              return (
                <div
                  key={mgrName}
                  style={{
                    borderRadius: '12px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Manager Header */}
                  <div
                    onClick={() => toggleManager(mgrName)}
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: 'var(--bg-primary, #f8fafc)',
                      borderBottom: isOpen ? '1px solid var(--border-light)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isOpen ? <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />}
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{mgrName}</span>
                    </div>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '12px',
                      border: '1px solid #bfdbfe'
                    }}>
                      {directReports.length} Direct Reports
                    </span>
                  </div>

                  {/* Subordinates List */}
                  {isOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {directReports.map((sub, idx) => (
                        <div
                          key={sub.user_id || idx}
                          style={{
                            padding: '0.65rem 1rem 0.65rem 2rem',
                            borderBottom: idx === directReports.length - 1 ? 'none' : '1px solid var(--border-light)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8rem'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sub.emp_name || sub.email}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {sub.emp_id ? `#${sub.emp_id} • ` : ''}{sub.emp_designation || sub.emp_department || 'Staff'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onEditUser(sub)}
                            style={{
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Edit Mapping
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Department Overview & Unmapped Staff */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Department Breakdown */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Building size={16} style={{ color: 'var(--primary-color, #2563eb)' }} />
              Department Headcounts
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '260px', overflowY: 'auto' }}>
              {Object.entries(departmentGroups).map(([dept, members]) => (
                <div
                  key={dept}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-primary, #f8fafc)',
                    fontSize: '0.78rem'
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dept}</span>
                  <span style={{ fontSize: '0.72rem', backgroundColor: 'var(--border-light)', padding: '0.1rem 0.45rem', borderRadius: '10px', color: 'var(--text-secondary)' }}>
                    {members.length} members
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Unmapped Staff Card */}
          {unmappedStaff.length > 0 && (
            <div style={{
              padding: '1.25rem 1.5rem',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid #fde68a',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={16} />
                  Unmapped Staff ({unmappedStaff.length})
                </h4>
                <span style={{ fontSize: '0.72rem', color: '#b45309' }}>Requires Manager/HOD Setup</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                {unmappedStaff.map(u => (
                  <div
                    key={u.user_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      backgroundColor: '#fffbeb',
                      fontSize: '0.76rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#92400e' }}>{u.emp_name || u.email}</div>
                      <div style={{ fontSize: '0.68rem', color: '#b45309' }}>
                        {!u.primary_reporting_person ? 'Missing Manager' : 'Missing HOD'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditUser(u)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #fde68a',
                        backgroundColor: '#ffffff',
                        color: '#b45309',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
