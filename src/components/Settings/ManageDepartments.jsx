'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Trash2, Plus, Search, Building2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function ManageDepartments() {
  const supabase = useMemo(() => createClient(), []);
  
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadDepartments = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setDepartments(data || []);
    } catch (err) {
      console.error(err);
      const isMissingTable = err.message && (
        err.message.includes('public.departments') || 
        err.message.includes('"departments" does not exist') ||
        err.message.includes('relation "departments" does not exist')
      );
      if (isMissingTable) {
        setErrorMsg('Setup Required: The "departments" table does not exist in your Supabase database. Please execute the SQL script in your Supabase SQL Editor to create and pre-populate the table.');
      } else {
        setErrorMsg('Failed to load departments: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleAddDept = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const trimmed = newDeptName.trim();
    if (!trimmed) return;

    // Check client-side duplicate
    if (departments.some(d => d.name.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg('Department already exists!');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('departments')
        .insert([{ name: trimmed }]);
      if (error) throw error;

      setNewDeptName('');
      setSuccessMsg(`Department "${trimmed}" added successfully!`);
      loadDepartments();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to add department: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDept = async (deptId, deptName) => {
    if (!confirm(`Are you sure you want to delete the department "${deptName}"? This might affect users or requirements assigned to this department.`)) {
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', deptId);
      if (error) throw error;

      setSuccessMsg(`Department "${deptName}" deleted successfully.`);
      loadDepartments();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to delete department: ' + err.message);
    }
  };

  const filteredDepts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return departments;
    return departments.filter(d => d.name.toLowerCase().includes(q));
  }, [departments, searchQuery]);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={22} style={{ color: 'var(--accent-color)' }} /> Manage Departments
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Configure CRM-wide company departments. Syncs instantly with recruitment requirements and team creation.
          </p>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', fontSize: '0.85rem' }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', color: '#166534', fontSize: '0.85rem' }}>
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {/* Control Panel: Add & Filter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {/* Add Form */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Add New Department</h3>
          <form onSubmit={handleAddDept} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="e.g. Finance, PPC, Tool Room..."
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              required
              disabled={saving}
              style={{
                flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px',
                border: '1px solid var(--border-light)', fontSize: '0.85rem',
                backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)'
              }}
            />
            <button
              type="submit"
              disabled={saving || !newDeptName.trim()}
              className="btn-primary"
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px',
                fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem'
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </form>
        </div>

        {/* Filter Input */}
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Filter Departments</h3>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search department by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem',
                backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="card" style={{ flex: 1, border: '1px solid var(--border-light)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--th-filtered-bg)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <span>Department Name</span>
          <span>Action</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '200px', color: 'var(--text-secondary)' }}>
              <Loader2 size={24} className="animate-spin" style={{ marginRight: '0.5rem' }} /> Loading departments...
            </div>
          ) : filteredDepts.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '200px', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
              No departments found.
            </div>
          ) : (
            filteredDepts.map(dept => (
              <div
                key={dept.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)',
                  transition: 'background-color 0.1s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--bg-primary)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{dept.name}</span>
                <button
                  onClick={() => handleDeleteDept(dept.id, dept.name)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#dc2626', padding: '0.25rem', borderRadius: '4px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.1s'
                  }}
                  onMouseOver={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                  onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  title={`Delete ${dept.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      
    </div>
  );
}
