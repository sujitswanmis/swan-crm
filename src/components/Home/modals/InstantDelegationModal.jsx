'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, Users, AlertCircle, Plus, Trash2, Calendar, Clock, Flag, Folder } from 'lucide-react';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';
import { getEmployeesMaster } from '@/app/actions/employee';
import { createDelegationTask } from '@/app/actions/delegationTask';

const CATEGORIES = [
  'OPERATIONS',
  'SALES & CRM',
  'ACCOUNTS & FINANCE',
  'HUMAN RESOURCE',
  'TECHNICAL & IT',
  'ADMINISTRATION',
  'CUSTOMER SUPPORT',
  'OTHER'
];

export default function InstantDelegationModal({
  isOpen,
  onClose,
  tenantId = '',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  userCompany = '',
  teamMembers = [],
  onTaskCreated = null
}) {
  const [employeesList, setEmployeesList] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const getTomorrowIST = () => {
    try {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    } catch (_e) {
      return '';
    }
  };

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'OPERATIONS',
    assigned_to_email: '',
    assigned_to_name: '',
    assigned_to_department: 'General',
    deadlineDate: '',
    deadlineTime: '18:00',
    subtasks: []
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load employees list on open
  useEffect(() => {
    if (!isOpen) {
      setForm({
        title: '',
        description: '',
        priority: 'MEDIUM',
        category: 'OPERATIONS',
        assigned_to_email: '',
        assigned_to_name: '',
        assigned_to_department: 'General',
        deadlineDate: getTomorrowIST(),
        deadlineTime: '18:00',
        subtasks: []
      });
      setErrorMsg('');
      setSuccessMsg('');
      return;
    }

    setForm(prev => ({ ...prev, deadlineDate: getTomorrowIST() }));

    let active = true;
    if (Array.isArray(teamMembers) && teamMembers.length > 0) {
      setEmployeesList(teamMembers);
    } else {
      setLoadingEmployees(true);
      getEmployeesMaster(tenantId || undefined, userCompany || undefined)
        .then(emps => {
          if (active && Array.isArray(emps)) {
            setEmployeesList(emps);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoadingEmployees(false);
        });
    }

    return () => { active = false; };
  }, [isOpen, tenantId, userCompany, teamMembers]);

  const handleAddSubtask = () => {
    setForm(prev => ({
      ...prev,
      subtasks: [...prev.subtasks, { id: Date.now(), title: '', is_completed: false }]
    }));
  };

  const handleSubtaskChange = (index, value) => {
    setForm(prev => {
      const updated = [...prev.subtasks];
      updated[index] = { ...updated[index], title: value };
      return { ...prev, subtasks: updated };
    });
  };

  const handleRemoveSubtask = (index) => {
    setForm(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!form.title.trim()) {
      setErrorMsg('Please enter a task title.');
      return;
    }
    if (!form.assigned_to_email) {
      setErrorMsg('Please select a colleague to assign this task to.');
      return;
    }
    if (!form.deadlineDate) {
      setErrorMsg('Please select a due deadline date.');
      return;
    }

    setSubmitting(true);
    try {
      const deadlineIso = new Date(`${form.deadlineDate}T${form.deadlineTime || '18:00'}:00+05:30`).toISOString();
      const cleanSubtasks = form.subtasks.filter(s => s.title && s.title.trim() !== '');

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        category: form.category,
        delegated_by_id: userId || null,
        delegated_by_name: userName || 'Delegator',
        delegated_by_email: userEmail || '',
        assigned_to_name: form.assigned_to_name || 'Assignee',
        assigned_to_email: form.assigned_to_email,
        assigned_to_department: form.assigned_to_department || 'General',
        deadline: deadlineIso,
        subtasks: cleanSubtasks
      };

      const res = await createDelegationTask(payload, tenantId || undefined);
      if (res?.success) {
        setSuccessMsg(`✅ Task successfully delegated to ${form.assigned_to_name}!`);
        window.dispatchEvent(new CustomEvent('delegation_task_updated'));
        if (onTaskCreated) onTaskCreated(res.data);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res?.error || 'Failed to create task. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Error assigning task. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border-light, #e2e8f0)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.15rem 1.4rem',
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Users size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 750, color: '#ffffff' }}>
                Assign New Delegation Task
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                Delegate work directly to any colleague with deadlines & checkpoints
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.35rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#16a34a',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 650
            }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Colleague Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Assign To Colleague *
            </label>
            <SearchableEmployeeSelect
              employees={employeesList}
              selectedEmail={form.assigned_to_email}
              placeholder="Search colleague by name, email, department..."
              onSelect={(emp) => {
                if (!emp) {
                  setForm(prev => ({
                    ...prev,
                    assigned_to_email: '',
                    assigned_to_name: '',
                    assigned_to_department: 'General'
                  }));
                } else {
                  setForm(prev => ({
                    ...prev,
                    assigned_to_email: emp.email,
                    assigned_to_name: emp.name || emp.emp_name,
                    assigned_to_department: emp.department || 'General'
                  }));
                }
              }}
            />
            {form.assigned_to_name && (
              <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.74rem', color: '#0284c7', fontWeight: 600 }}>
                ✓ Selected: {form.assigned_to_name} ({form.assigned_to_email}) — {form.assigned_to_department}
              </p>
            )}
          </div>

          {/* Task Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Task Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Prepare GST reconciliation & file return"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                fontSize: '0.86rem',
                color: 'var(--text-primary, #0f172a)',
                background: 'var(--bg-surface, #ffffff)',
                outline: 'none'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Instructions & Deliverables (SOP)
            </label>
            <textarea
              rows={3}
              placeholder="Provide context, required actions, expected outcome..."
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                fontSize: '0.84rem',
                color: 'var(--text-primary, #0f172a)',
                background: 'var(--bg-surface, #ffffff)',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Priority & Category Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                <Flag size={13} color="#f59e0b" />
                <span>Priority Level *</span>
              </label>
              <select
                value={form.priority}
                onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.58rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary, #0f172a)',
                  background: 'var(--bg-surface, #ffffff)'
                }}
              >
                <option value="URGENT">🔥 Urgent (Top Priority)</option>
                <option value="HIGH">⚡ High Priority</option>
                <option value="MEDIUM">📌 Medium Priority</option>
                <option value="LOW">☕ Low Priority</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                <Folder size={13} color="#0284c7" />
                <span>Category</span>
              </label>
              <select
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.58rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary, #0f172a)',
                  background: 'var(--bg-surface, #ffffff)'
                }}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Deadline Date & Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                <Calendar size={13} color="#0284c7" />
                <span>Due Date (IST) *</span>
              </label>
              <input
                type="date"
                required
                value={form.deadlineDate}
                onChange={e => setForm(prev => ({ ...prev, deadlineDate: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.58rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary, #0f172a)',
                  background: 'var(--bg-surface, #ffffff)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                <Clock size={13} color="#0284c7" />
                <span>Cutoff Time (IST)</span>
              </label>
              <input
                type="time"
                value={form.deadlineTime}
                onChange={e => setForm(prev => ({ ...prev, deadlineTime: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.58rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary, #0f172a)',
                  background: 'var(--bg-surface, #ffffff)'
                }}
              />
            </div>
          </div>

          {/* Subtasks / Milestones */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                Checkpoints / Steps ({form.subtasks.length})
              </label>
              <button
                type="button"
                onClick={handleAddSubtask}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#0284c7',
                  fontSize: '0.76rem',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                <Plus size={13} />
                <span>Add Step</span>
              </button>
            </div>
            {form.subtasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {form.subtasks.map((st, idx) => (
                  <div key={st.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', width: '18px' }}>
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      placeholder={`Step ${idx + 1}...`}
                      value={st.title}
                      onChange={e => handleSubtaskChange(idx, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.7rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Submit */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.65rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)',
            marginTop: '0.5rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                background: 'none',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--text-secondary, #64748b)',
                fontWeight: 650,
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.84rem',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
              }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{submitting ? 'Assigning...' : 'Assign Task Now'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
