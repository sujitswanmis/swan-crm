'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2, AlertCircle, Clock, Calendar, CheckSquare, Plus,
  Trash2, Edit3, ShieldCheck, Filter, Search, RefreshCw, Eye,
  Sparkles, Check, ChevronRight, X, AlertTriangle, FileSpreadsheet,
  Award, TrendingUp, HelpCircle, Layers, User, Building, ExternalLink
} from 'lucide-react';
import {
  FREQUENCIES_CONFIG,
  getCurrentPeriodKey,
  getHumanPeriodLabel,
  calculateChecklistCompletion
} from '@/utils/checklistUtils';
import {
  getChecklistTemplates,
  saveChecklistTemplate,
  deleteChecklistTemplate,
  getEmployeeChecklistDashboard,
  submitChecklistResponse,
  verifyChecklistSubmission,
  getChecklistComplianceReport
} from '@/app/actions/checklist';
import { getEmployeesMaster } from '@/app/actions/employee';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';

export default function ChecklistModule({
  userRole = 'agent',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  moduleAccess = {},
  initialSubTab = 'my_checklists',
  onSubTabChange = null
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.checklist?.is_manager === true;

  // Tabs: 'my_checklists' | 'templates' | 'compliance'
  const [activeTab, setActiveTab] = useState(initialSubTab || 'my_checklists');
  const [selectedFrequency, setSelectedFrequency] = useState('DAILY');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Data states
  const [dashboardChecklists, setDashboardChecklists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [complianceLogs, setComplianceLogs] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);

  // Modals & Drawers
  const [executingChecklist, setExecutingChecklist] = useState(null);
  const [execResponses, setExecResponses] = useState({});
  const [execNotes, setExecNotes] = useState('');
  const [savingSubmission, setSavingSubmission] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    frequency: 'DAILY',
    department: 'General',
    category: 'OPERATIONS',
    assignment_mode: 'SINGLE',
    assigned_type: 'EMPLOYEE',
    assigned_employee_email: '',
    assigned_employee_name: '',
    due_time: '18:00',
    days_of_week: ['Monday'],
    day_of_month: 1,
    items: [
      { id: 'item_1', title: 'Task 1 check', type: 'checkbox', is_required: true, standard_guideline: '' }
    ],
    is_active: true
  });

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyingSubmission, setVerifyingSubmission] = useState(null);
  const [verifyRemarks, setVerifyRemarks] = useState('');

  // Initial load
  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === 'my_checklists') {
      loadEmployeeDashboard();
    } else if (activeTab === 'templates') {
      loadTemplates();
    } else if (activeTab === 'compliance') {
      loadCompliance();
    }
  }, [activeTab, selectedFrequency, userEmail]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  const loadEmployees = async () => {
    try {
      const emps = await getEmployeesMaster();
      setEmployeesList(Array.isArray(emps) ? emps : []);
    } catch (e) {
      console.warn('Could not load employees master:', e.message);
    }
  };

  const loadEmployeeDashboard = async () => {
    setLoading(true);
    try {
      const res = await getEmployeeChecklistDashboard({
        employeeEmail: userEmail,
        frequency: selectedFrequency,
        targetDate: new Date()
      });
      if (res.success) {
        setDashboardChecklists(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load checklists', true);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getChecklistTemplates({
        frequency: selectedFrequency === 'ALL' ? undefined : selectedFrequency
      });
      if (res.success) {
        setTemplates(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load checklist templates', true);
    } finally {
      setLoading(false);
    }
  };

  const loadCompliance = async () => {
    setLoading(true);
    try {
      const res = await getChecklistComplianceReport({
        frequency: selectedFrequency === 'ALL' ? undefined : selectedFrequency
      });
      if (res.success) {
        setComplianceLogs(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load compliance report', true);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // EXECUTION HANDLERS
  // ==========================================

  const handleOpenExecution = (item) => {
    setExecutingChecklist(item);
    setExecResponses(item.submission?.responses || {});
    setExecNotes(item.submission?.submission_notes || '');
  };

  const handleResponseChange = (itemId, val) => {
    setExecResponses(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  const handleSubmitExecution = async () => {
    if (!executingChecklist) return;
    setSavingSubmission(true);

    try {
      const tmpl = executingChecklist.template;
      const res = await submitChecklistResponse({
        id: executingChecklist.submission?.id,
        template_id: tmpl.id,
        template_title: tmpl.title,
        frequency: tmpl.frequency,
        period_key: executingChecklist.currentPeriodKey,
        employee_name: userName || 'Employee',
        employee_email: userEmail,
        department: tmpl.department || 'General',
        responses: execResponses,
        submission_notes: execNotes,
        items: executingChecklist.items
      });

      if (res.success) {
        showNotification('✅ Checklist completed and submitted successfully!');
        setExecutingChecklist(null);
        loadEmployeeDashboard();
      } else {
        showNotification(res.error || 'Failed to submit checklist', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    } finally {
      setSavingSubmission(false);
    }
  };

  // ==========================================
  // TEMPLATE BUILDER HANDLERS
  // ==========================================

  const handleOpenNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      title: '',
      description: '',
      frequency: selectedFrequency === 'ALL' ? 'DAILY' : selectedFrequency,
      department: 'General',
      category: 'OPERATIONS',
      assignment_mode: 'SINGLE',
      assigned_type: 'EMPLOYEE',
      assigned_employee_email: userEmail || '',
      assigned_employee_name: userName || '',
      due_time: '18:00',
      days_of_week: ['Monday'],
      day_of_month: 1,
      items: [
        { id: `item_${Date.now()}_1`, title: 'Check equipment status', type: 'checkbox', is_required: true, standard_guideline: '' },
        { id: `item_${Date.now()}_2`, title: 'Upload cleanliness photo', type: 'photo', is_required: false, standard_guideline: '' }
      ],
      is_active: true
    });
    setTemplateModalOpen(true);
  };

  const handleEditTemplate = (tmpl) => {
    setEditingTemplate(tmpl);
    let assignmentMode = 'SINGLE';
    if (tmpl.assigned_type === 'ALL') {
      assignmentMode = 'ALL';
    } else if (tmpl.assigned_employee_email && tmpl.assigned_employee_email.includes(',')) {
      assignmentMode = 'MULTI';
    }

    setTemplateForm({
      id: tmpl.id,
      title: tmpl.title,
      description: tmpl.description || '',
      frequency: tmpl.frequency || 'DAILY',
      department: tmpl.department || 'General',
      category: tmpl.category || 'OPERATIONS',
      assignment_mode: assignmentMode,
      assigned_type: tmpl.assigned_type || 'EMPLOYEE',
      assigned_employee_email: tmpl.assigned_employee_email || '',
      assigned_employee_name: tmpl.assigned_employee_name || '',
      due_time: tmpl.due_time || '18:00',
      days_of_week: tmpl.days_of_week || ['Monday'],
      day_of_month: tmpl.day_of_month || 1,
      items: tmpl.items && tmpl.items.length > 0 ? tmpl.items : [
        { id: `item_${Date.now()}_1`, title: 'Check item', type: 'checkbox', is_required: true, standard_guideline: '' }
      ],
      is_active: tmpl.is_active !== undefined ? tmpl.is_active : true
    });
    setTemplateModalOpen(true);
  };

  const handleAddItemToTemplate = () => {
    setTemplateForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item_${Date.now()}_${prev.items.length + 1}`,
          title: '',
          type: 'checkbox',
          is_required: true,
          standard_guideline: ''
        }
      ]
    }));
  };

  const handleUpdateTemplateItem = (index, field, value) => {
    setTemplateForm(prev => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleRemoveTemplateItem = (index) => {
    setTemplateForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.title.trim()) {
      showNotification('Please enter a template title', true);
      return;
    }
    if (templateForm.items.length === 0) {
      showNotification('Please add at least 1 checklist question/item', true);
      return;
    }

    try {
      const res = await saveChecklistTemplate({
        ...templateForm,
        id: editingTemplate?.id,
        created_by: userName
      });

      if (res.success) {
        showNotification('✅ Checklist template saved successfully!');
        setTemplateModalOpen(false);
        loadTemplates();
      } else {
        showNotification(res.error || 'Failed to save template', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this checklist template?')) return;
    try {
      const res = await deleteChecklistTemplate(id);
      if (res.success) {
        showNotification('Template deleted');
        loadTemplates();
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  // ==========================================
  // VERIFICATION HANDLERS
  // ==========================================

  const handleOpenVerify = (sub) => {
    setVerifyingSubmission(sub);
    setVerifyRemarks('');
    setVerifyModalOpen(true);
  };

  const handleSaveVerification = async (status) => {
    if (!verifyingSubmission) return;
    try {
      const res = await verifyChecklistSubmission({
        submissionId: verifyingSubmission.id,
        verificationStatus: status,
        verifiedBy: userName,
        verificationRemarks: verifyRemarks
      });

      if (res.success) {
        showNotification(`Checklist marked as ${status}`);
        setVerifyModalOpen(false);
        loadCompliance();
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', overflowY: 'auto' }}>
      
      {/* Toast Alert */}
      {successMsg && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#ffffff',
        padding: '1.5rem 2rem',
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.75rem' }}>📋</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Smart Checklist Management</h1>
          </div>
          <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>
            Daily, Weekly, 15-Day, Monthly, Quarterly, 6-Month, & 1-Year Recurring Operations Engine
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isManager && (
            <button
              onClick={handleOpenNewTemplate}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Plus size={18} /> Create Template
            </button>
          )}
          <button
            onClick={() => {
              if (activeTab === 'my_checklists') loadEmployeeDashboard();
              else if (activeTab === 'templates') loadTemplates();
              else loadCompliance();
            }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('my_checklists')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'my_checklists' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'my_checklists' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <CheckSquare size={18} /> My Checklists
        </button>

        {isManager && (
          <button
            onClick={() => setActiveTab('templates')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === 'templates' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'templates' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Layers size={18} /> Templates Master
          </button>
        )}

        {isManager && (
          <button
            onClick={() => setActiveTab('compliance')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === 'compliance' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'compliance' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ShieldCheck size={18} /> Compliance & Verification
          </button>
        )}
      </div>

      {/* Frequency Pill Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginRight: '0.5rem' }}>
          Schedule Frequencies:
        </span>
        {FREQUENCIES_CONFIG.map(freq => {
          const isSelected = selectedFrequency === freq.id;
          return (
            <button
              key={freq.id}
              onClick={() => setSelectedFrequency(freq.id)}
              style={{
                background: isSelected ? freq.badgeColor : 'var(--bg-secondary, #f8fafc)',
                color: isSelected ? '#ffffff' : 'var(--text-primary, #1e293b)',
                border: isSelected ? `1px solid ${freq.badgeColor}` : '1px solid var(--border-color, #e2e8f0)',
                padding: '0.45rem 0.9rem',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{freq.icon}</span>
              <span>{freq.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MY CHECKLISTS (EMPLOYEE EXECUTION STATION)                         */}
      {/* ========================================================================= */}
      {activeTab === 'my_checklists' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #64748b)' }}>
              <RefreshCw className="spin" size={32} style={{ margin: '0 auto 1rem' }} />
              <p>Loading scheduled checklists...</p>
            </div>
          )}

          {!loading && dashboardChecklists.length === 0 && (
            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px dashed var(--border-color, #cbd5e1)',
              borderRadius: '12px',
              padding: '3.5rem 2rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #64748b)'
            }}>
              <CheckSquare size={48} style={{ opacity: 0.4, margin: '0 auto 1rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>No Checklists Assigned</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                No active {selectedFrequency.toLowerCase()} checklists found for your profile in the current period.
              </p>
              {isManager && (
                <button
                  onClick={handleOpenNewTemplate}
                  style={{
                    marginTop: '1.25rem',
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Create First Checklist Template
                </button>
              )}
            </div>
          )}

          {!loading && dashboardChecklists.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {dashboardChecklists.map((item, idx) => {
                const tmpl = item.template;
                const isCompleted = item.status === 'COMPLETED';
                const percent = item.stats.percent;
                const humanPeriod = getHumanPeriodLabel(tmpl.frequency, item.currentPeriodKey);
                const freqMeta = FREQUENCIES_CONFIG.find(f => f.id === tmpl.frequency) || FREQUENCIES_CONFIG[0];
                const delayInfo = item.delayInfo || {};
                const isOverdue = delayInfo.isPastCutoff && !isCompleted;
                const isDelayedCompleted = isCompleted && delayInfo.isDelayed;

                return (
                  <div
                    key={tmpl.id || idx}
                    style={{
                      background: isOverdue ? '#fff5f5' : 'var(--card-bg, #ffffff)',
                      border: isOverdue
                        ? '1.5px solid #f87171'
                        : isCompleted
                        ? '1px solid #86efac'
                        : '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      boxShadow: isOverdue ? '0 4px 12px rgba(239,68,68,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                      position: 'relative'
                    }}
                  >
                    {/* Top status bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          background: `${freqMeta.badgeColor}15`,
                          color: freqMeta.badgeColor,
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          {freqMeta.icon} {tmpl.frequency}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                          {tmpl.department}
                        </span>
                      </div>

                      {/* Status Badges */}
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {isCompleted ? (
                          <span style={{
                            background: isDelayedCompleted ? '#fef3c7' : '#dcfce7',
                            color: isDelayedCompleted ? '#92400e' : '#166534',
                            border: isDelayedCompleted ? '1px solid #fde68a' : '1px solid #bbf7d0',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {isDelayedCompleted ? `⚠️ Done (${delayInfo.delayText || 'Delayed'})` : '✓ Completed (On Time)'}
                          </span>
                        ) : isOverdue ? (
                          <span style={{
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fca5a5',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            🚨 {delayInfo.delayText || 'Overdue'}
                          </span>
                        ) : (
                          <span style={{
                            background: percent > 0 ? '#fef3c7' : '#f1f5f9',
                            color: percent > 0 ? '#92400e' : '#475569',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {percent > 0 ? 'In Progress' : 'Pending'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Period */}
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 600 }}>{tmpl.title}</h3>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                        {tmpl.description || 'Routine operational checklist items'}
                      </p>
                    </div>

                    {/* Meta info & Cutoff tracking */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      color: isOverdue ? '#991b1b' : 'var(--text-secondary, #64748b)',
                      background: isOverdue ? '#fef2f2' : 'var(--bg-secondary, #f8fafc)',
                      border: isOverdue ? '1px solid #fecaca' : 'none',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={14} />
                        <span>{humanPeriod}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: isOverdue ? 700 : 500 }}>
                        <Clock size={14} />
                        <span>Cutoff: {tmpl.due_time || '18:00'}</span>
                        {!isCompleted && !isOverdue && delayInfo.delayText && (
                          <span style={{ color: '#2563eb', fontSize: '0.75rem' }}>({delayInfo.delayText})</span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        <span>Progress</span>
                        <span>{item.stats.completedCount} of {item.stats.totalCount} items ({percent}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--border-color, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${percent}%`,
                          height: '100%',
                          background: isCompleted ? '#22c55e' : isOverdue ? '#ef4444' : '#3b82f6',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleOpenExecution(item)}
                      style={{
                        background: isCompleted ? '#f0fdf4' : isOverdue ? '#ef4444' : '#3b82f6',
                        color: isCompleted ? '#166534' : '#ffffff',
                        border: isCompleted ? '1px solid #bbf7d0' : 'none',
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        marginTop: 'auto'
                      }}
                    >
                      {isCompleted ? (
                        <>
                          <Check size={16} /> View / Edit Submitted Checklist
                        </>
                      ) : isOverdue ? (
                        <>
                          <AlertTriangle size={16} /> Submit Delayed Checklist
                        </>
                      ) : (
                        <>
                          <CheckSquare size={16} /> Fill & Complete Checklist
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEMPLATES MASTER (FOR MANAGERS / ADMINS)                           */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Checklist Templates Repository</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                Configure multi-frequency recurring checklists and assign them to employees or departments.
              </p>
            </div>
            <button
              onClick={handleOpenNewTemplate}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Plus size={16} /> Add New Template
            </button>
          </div>

          <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Title & Description</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Frequency</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Assigned To</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Cutoff Time</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Questions / Items</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                      No templates created for {selectedFrequency} yet. Click "Add New Template" to create one.
                    </td>
                  </tr>
                )}
                {templates.map(tmpl => {
                  const freqMeta = FREQUENCIES_CONFIG.find(f => f.id === tmpl.frequency) || FREQUENCIES_CONFIG[0];
                  return (
                    <tr key={tmpl.id} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>{tmpl.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>{tmpl.description || tmpl.department}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          background: `${freqMeta.badgeColor}15`,
                          color: freqMeta.badgeColor,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {freqMeta.icon} {tmpl.frequency}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <User size={14} style={{ opacity: 0.7 }} />
                          <span>{tmpl.assigned_type === 'ALL' ? 'All Staff' : tmpl.assigned_employee_name || tmpl.assigned_employee_email}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={14} />
                          <span>{tmpl.due_time || '18:00'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}>
                          {(tmpl.items || []).length} items
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          color: tmpl.is_active ? '#166534' : '#991b1b',
                          background: tmpl.is_active ? '#dcfce7' : '#fee2e2',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {tmpl.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleEditTemplate(tmpl)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '0.25rem' }}
                            title="Edit Template"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tmpl.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}
                            title="Delete Template"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMPLIANCE & VERIFICATION AUDIT                                    */}
      {/* ========================================================================= */}
      {activeTab === 'compliance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Compliance & Sign-Off Dashboard</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                Audit employee checklist completions, check submitted photos/readings, and sign off.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Checklist</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Period</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Submitted At</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Timing & Delay</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Score</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Verification</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {complianceLogs.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                      No submissions recorded for this filter yet.
                    </td>
                  </tr>
                )}
                {complianceLogs.map(log => {
                  const humanPeriod = getHumanPeriodLabel(log.frequency, log.period_key);
                  const isApproved = log.verification_status === 'APPROVED';
                  const isDelayed = log.delayInfo?.isDelayed;
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{log.employee_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>{log.employee_email}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 500 }}>{log.template_title}</div>
                        <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>{log.frequency}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        {humanPeriod}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                        {log.submitted_at ? new Date(log.submitted_at).toLocaleString('en-IN') : 'N/A'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isDelayed ? (
                          <span style={{
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fca5a5',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ⚠️ {log.delayInfo?.delayText || 'Delayed'}
                          </span>
                        ) : (
                          <span style={{
                            background: '#dcfce7',
                            color: '#166534',
                            border: '1px solid #bbf7d0',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ✓ On Time
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          background: log.status === 'COMPLETED' ? '#dcfce7' : '#fef3c7',
                          color: log.status === 'COMPLETED' ? '#166534' : '#92400e',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          {log.items_completed_count}/{log.items_total_count} Done
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          background: isApproved ? '#dcfce7' : '#fee2e2',
                          color: isApproved ? '#166534' : '#991b1b',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {log.verification_status || 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenVerify(log)}
                          style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          Review & Verify
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CHECKLIST EXECUTION (FILL & SUBMIT)                               */}
      {/* ========================================================================= */}
      {executingChecklist && (
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
            borderRadius: '14px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{executingChecklist.template.title}</h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.2rem' }}>
                  {executingChecklist.template.frequency} • {getHumanPeriodLabel(executingChecklist.template.frequency, executingChecklist.currentPeriodKey)}
                </div>
              </div>
              <button
                onClick={() => setExecutingChecklist(null)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Questions Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Cutoff & Delay Notice Banner */}
              {(() => {
                const delayInfo = executingChecklist.delayInfo || {};
                const isOverdue = delayInfo.isPastCutoff && executingChecklist.status !== 'COMPLETED';
                return isOverdue ? (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: '#fef2f2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem'
                  }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>⚠️ Cutoff Time Missed:</strong> Scheduled cutoff was <strong>{executingChecklist.template.due_time || '18:00'}</strong>.
                      This submission will be recorded as <strong>{delayInfo.delayText || 'Delayed'}</strong>.
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '0.65rem 1rem',
                    background: '#eff6ff',
                    color: '#1e40af',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem'
                  }}>
                    <Clock size={16} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Cutoff Deadline:</strong> Today at {executingChecklist.template.due_time || '18:00'}
                      {delayInfo.delayText ? ` (${delayInfo.delayText})` : ''}
                    </div>
                  </div>
                );
              })()}
              {executingChecklist.items.map((item, idx) => {
                const val = execResponses[item.id];
                return (
                  <div
                    key={item.id || idx}
                    style={{
                      background: 'var(--bg-secondary, #f8fafc)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '8px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #1e293b)' }}>
                        {idx + 1}. {item.title} {item.is_required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                      <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {item.type}
                      </span>
                    </div>

                    {item.standard_guideline && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic' }}>
                        SOP: {item.standard_guideline}
                      </p>
                    )}

                    {/* Input based on type */}
                    {item.type === 'checkbox' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                        <input
                          type="checkbox"
                          checked={val === true || val === 'true'}
                          onChange={(e) => handleResponseChange(item.id, e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                          {val ? '✓ Completed / Verified' : 'Mark as Done'}
                        </span>
                      </label>
                    )}

                    {item.type === 'number' && (
                      <input
                        type="number"
                        placeholder="Enter measured reading / count..."
                        value={val || ''}
                        onChange={(e) => handleResponseChange(item.id, e.target.value)}
                        style={{
                          padding: '0.55rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          width: '100%',
                          fontSize: '0.9rem'
                        }}
                      />
                    )}

                    {(item.type === 'photo' || item.type === 'file') && (
                      <input
                        type="text"
                        placeholder="Paste image / attachment link or notes..."
                        value={val || ''}
                        onChange={(e) => handleResponseChange(item.id, e.target.value)}
                        style={{
                          padding: '0.55rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          width: '100%',
                          fontSize: '0.9rem'
                        }}
                      />
                    )}

                    {item.type === 'text' && (
                      <textarea
                        placeholder="Enter remarks or details..."
                        rows={2}
                        value={val || ''}
                        onChange={(e) => handleResponseChange(item.id, e.target.value)}
                        style={{
                          padding: '0.55rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          width: '100%',
                          fontSize: '0.9rem'
                        }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Overall Summary Notes */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                  Overall Remarks / Notes (optional):
                </label>
                <textarea
                  placeholder="Any general comments, observations or issues..."
                  rows={2}
                  value={execNotes}
                  onChange={(e) => setExecNotes(e.target.value)}
                  style={{
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    width: '100%',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setExecutingChecklist(null)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitExecution}
                disabled={savingSubmission}
                style={{
                  background: '#22c55e',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {savingSubmission ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                Submit & Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TEMPLATE BUILDER                                                 */}
      {/* ========================================================================= */}
      {templateModalOpen && (
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
            borderRadius: '14px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                {editingTemplate ? 'Edit Checklist Template' : 'Create Recurring Checklist Template'}
              </h3>
              <button
                onClick={() => setTemplateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Template Form Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Row 1: Title & Frequency */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Checklist Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Daily Morning Store Opening Checklist"
                    value={templateForm.title}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Recurrence Frequency *
                  </label>
                  <select
                    value={templateForm.frequency}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, frequency: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  >
                    {FREQUENCIES_CONFIG.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Department & Cutoff Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Operations / Sales"
                    value={templateForm.department}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, department: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Daily / Period Cutoff Time
                  </label>
                  <input
                    type="time"
                    value={templateForm.due_time}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>
              </div>

              {/* Row 3: Assignment Target Selector (Single, Multi, All Staff) */}
              <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #1e293b)' }}>
                    Assign Checklist To:
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'SINGLE',
                        assigned_type: 'EMPLOYEE',
                        assigned_employee_email: (prev.assigned_employee_email || '').split(',')[0] || userEmail || ''
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'SINGLE' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'SINGLE' ? '#eff6ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'SINGLE' ? '#1d4ed8' : '#64748b'
                      }}
                    >
                      👤 Single Employee
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'MULTI',
                        assigned_type: 'EMPLOYEE'
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'MULTI' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'MULTI' ? '#eff6ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'MULTI' ? '#1d4ed8' : '#64748b'
                      }}
                    >
                      👥 Multiple Employees (Select 5, 10, 15+ Staff)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'ALL',
                        assigned_type: 'ALL',
                        assigned_employee_email: '',
                        assigned_employee_name: 'All Staff'
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'ALL' ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'ALL' ? '#f5f3ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'ALL' ? '#6d28d9' : '#64748b'
                      }}
                    >
                      🏢 All Staff (Company-Wide)
                    </button>
                  </div>
                </div>

                {templateForm.assignment_mode === 'SINGLE' && (
                  <div>
                    <SearchableEmployeeSelect
                      employees={employeesList}
                      selectedEmail={templateForm.assigned_employee_email}
                      placeholder="Search & select single employee..."
                      onSelect={(emp) => {
                        setTemplateForm(prev => ({
                          ...prev,
                          assigned_employee_email: emp?.email || '',
                          assigned_employee_name: emp ? emp.name || emp.emp_name : '',
                          department: emp?.department || prev.department,
                          assigned_type: 'EMPLOYEE'
                        }));
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                      ℹ️ This checklist will appear only in this selected employee's personal dashboard.
                    </div>
                  </div>
                )}

                {templateForm.assignment_mode === 'MULTI' && (
                  <div>
                    <SearchableEmployeeSelect
                      isMulti={true}
                      employees={employeesList}
                      selectedEmails={templateForm.assigned_employee_email ? templateForm.assigned_employee_email.split(',') : []}
                      placeholder="Search & check multiple employees (e.g. 10-15 staff)..."
                      onMultiSelect={(objs, emails) => {
                        const names = objs.map(o => o.name || o.emp_name).filter(Boolean);
                        const displayName = names.length > 0
                          ? `${names.length} Employees (${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''})`
                          : '';
                        setTemplateForm(prev => ({
                          ...prev,
                          assigned_employee_email: emails.join(','),
                          assigned_employee_name: displayName,
                          assigned_type: 'EMPLOYEE'
                        }));
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '4px' }}>
                      🔒 <strong>Private & Isolated:</strong> Each selected employee gets their own private checklist instance. They cannot see other employees' responses.
                    </div>
                  </div>
                )}

                {templateForm.assignment_mode === 'ALL' && (
                  <div style={{ padding: '0.6rem 0.85rem', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '0.85rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🏢</span>
                    <span><strong>Company-Wide Assignment:</strong> Every employee in the company will receive their own individual checklist card. Responses remain strictly private to each employee.</span>
                  </div>
                )}
              </div>

              {/* Items / Questions Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Checklist Questions / Sub-items ({templateForm.items.length})
                  </label>
                  <button
                    onClick={handleAddItemToTemplate}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Plus size={14} /> Add Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {templateForm.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr auto auto',
                        gap: '0.75rem',
                        alignItems: 'center',
                        background: 'var(--bg-secondary, #f8fafc)',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #e2e8f0)'
                      }}
                    >
                      <input
                        type="text"
                        placeholder={`Question / Step #${idx + 1}...`}
                        value={item.title}
                        onChange={(e) => handleUpdateTemplateItem(idx, 'title', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                      />

                      <select
                        value={item.type}
                        onChange={(e) => handleUpdateTemplateItem(idx, 'type', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      >
                        <option value="checkbox">Checkbox (Done/Not Done)</option>
                        <option value="number">Number / Reading</option>
                        <option value="photo">Photo / Proof Required</option>
                        <option value="text">Text Remarks</option>
                      </select>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={item.is_required}
                          onChange={(e) => handleUpdateTemplateItem(idx, 'is_required', e.target.checked)}
                        />
                        Required
                      </label>

                      <button
                        onClick={() => handleRemoveTemplateItem(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove question"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setTemplateModalOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                style={{
                  background: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANAGER VERIFICATION SIGN-OFF                                    */}
      {/* ========================================================================= */}
      {verifyModalOpen && verifyingSubmission && (
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
            borderRadius: '14px',
            width: '100%',
            maxWidth: '550px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Review Checklist Submission</h3>
              <button onClick={() => setVerifyModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Employee:</span>
                <div style={{ fontWeight: 600 }}>{verifyingSubmission.employee_name} ({verifyingSubmission.employee_email})</div>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Checklist:</span>
                <div style={{ fontWeight: 600 }}>{verifyingSubmission.template_title} ({verifyingSubmission.frequency})</div>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Employee Submission Notes:</span>
                <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  {verifyingSubmission.submission_notes || 'No remarks submitted.'}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Manager Remarks / Feedback:
                </label>
                <textarea
                  placeholder="Approved / Notes..."
                  rows={2}
                  value={verifyRemarks}
                  onChange={(e) => setVerifyRemarks(e.target.value)}
                  style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => handleSaveVerification('REVISION_REQUESTED')}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.2rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Request Revision
              </button>
              <button
                onClick={() => handleSaveVerification('APPROVED')}
                style={{
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Approve & Sign Off
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
