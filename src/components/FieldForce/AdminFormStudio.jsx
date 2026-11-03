'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Check, X, ArrowLeft, Download, Eye, FileText,
  MapPin, Camera, PenTool, List, Type, Hash, Calendar, CheckSquare, Layers,
  Save, RefreshCw, Settings, Layout, Search, Clock, Tag, User, Users,
  Building, Shield, Phone, Mail, FileCheck, CheckCircle2, AlertTriangle,
  Move, Copy, Sliders, ChevronDown, ChevronRight, Bell, Filter, GitBranch, History
} from 'lucide-react';
import { getTenantCustomForms, saveCustomForm, getFormSubmissions } from '@/app/actions/fieldFormStudio';
import { getTeamMembers } from '@/app/actions/team';

// Complete 36 Predefined Custom Field Types (Identical to TrackWick Specification)
export const PREDEFINED_FIELD_TYPES = [
  { type: 'barcode', label: 'Barcode', icon: '║▌' },
  { type: 'boolean', label: 'Boolean', icon: '⚯' },
  { type: 'city', label: 'City', icon: '🏙️' },
  { type: 'country', label: 'Country', icon: '🌐' },
  { type: 'custom_entity', label: 'Custom Entity', icon: '📦' },
  { type: 'customer', label: 'Customer', icon: '👥' },
  { type: 'customer_user', label: 'Customer User', icon: '👤' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'date_range', label: 'Date Range', icon: '↔️' },
  { type: 'date_time', label: 'Date Time', icon: '🕒' },
  { type: 'day', label: 'Day', icon: '🗓️' },
  { type: 'distance', label: 'Distance', icon: '📏' },
  { type: 'district', label: 'District', icon: '📍' },
  { type: 'doc', label: 'Doc', icon: '📄' },
  { type: 'duration', label: 'Duration', icon: '⏱️' },
  { type: 'email', label: 'Email', icon: '✉️' },
  { type: 'employee', label: 'Employee', icon: '👔' },
  { type: 'employee_entity', label: 'Employee Entity', icon: '🏷️' },
  { type: 'form', label: 'Form', icon: '📋' },
  { type: 'form_table', label: 'Form Table', icon: '▦' },
  { type: 'geo', label: 'Geo', icon: '📍' },
  { type: 'list', label: 'List', icon: '☰' },
  { type: 'mobile', label: 'Mobile', icon: '📱' },
  { type: 'multiple_selection', label: 'Multiple Selection', icon: '☑️' },
  { type: 'number', label: 'Number', icon: '123' },
  { type: 'picture', label: 'Picture', icon: '🖼️' },
  { type: 'picture_geo', label: 'Picture with Geo', icon: '📷' },
  { type: 'pictures', label: 'Pictures', icon: '🖼️🖼️' },
  { type: 'pictures_geo', label: 'Pictures with Geo', icon: '📷📷' },
  { type: 'product', label: 'Product', icon: '⚙️' },
  { type: 'rating', label: 'Rating', icon: '⭐' },
  { type: 'signature', label: 'Signature', icon: '✍️' },
  { type: 'sound', label: 'Sound', icon: '🔊' },
  { type: 'state', label: 'State', icon: '🗺️' },
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'textarea', label: 'Textarea', icon: '¶' },
  { type: 'time', label: 'Time', icon: '⏰' },
  { type: 'url', label: 'Url', icon: '🔗' },
  { type: 'label', label: 'label', icon: '🏷️' },
  { type: 'field_area', label: 'Field Area', icon: '📐' }
];

export default function AdminFormStudio({ company = 'TNT00001', branchCode = null }) {
  // Navigation Views
  const [viewMode, setViewMode] = useState('list'); // 'list', 'designer', 'data_table'
  const [activeForm, setActiveForm] = useState(null);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  // Submissions Data Table
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Top Studio Mode: 'setting' vs 'designer'
  const [topStudioMode, setTopStudioMode] = useState('designer'); // 'setting', 'designer'

  // Designer Stages: 'complete', 'start', 'assignee'
  const [designerStage, setDesignerStage] = useState('complete'); // 'complete', 'start', 'assignee'

  // Setting Sub-Nav: 'details', 'reminders', 'filters', 'workflow', 'audit_history'
  const [settingTab, setSettingTab] = useState('details');

  // Palette Search
  const [paletteSearch, setPaletteSearch] = useState('');

  // Drag-and-drop state
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Selected Field Index in the active stage
  const [selectedFieldIdx, setSelectedFieldIdx] = useState(null);

  // Form Metadata & Settings State
  const [formTitle, setFormTitle] = useState('');
  const [dataType, setDataType] = useState('CUSTOMER'); // 'CUSTOMER', 'LEAD', 'NONE'
  const [labelColor, setLabelColor] = useState('#036DCE');
  const [formComment, setFormComment] = useState('');
  const [formStatus, setFormStatus] = useState('PUBLISHED'); // 'PUBLISHED', 'DRAFT', 'ARCHIVED'

  // Form Features (Exact TrackWick 12 Checkboxes)
  const [formFeatures, setFormFeatures] = useState({
    create: false,
    follow_up: false,
    task_start_restriction: false,
    self_create: true,
    form_table: true,
    contact: false,
    start: true,
    task_title: false,
    restrict_assign_by_manager: false,
    start_geo: true,
    only_mobile_app: false,
    in_progress_reassign: false
  });

  // Reminders Configuration
  const [reminders, setReminders] = useState({
    appliesTo: 'ALL_TASKS', // 'ALL_TASKS', 'FOLLOW_UP_ONLY'
    frequencyMins: 0,
    repeatCount: 0,
    audience: '',
    channelPush: true,
    channelEmail: false,
    priority: 'MEDIUM'
  });

  // Filters / Assignee Assignment Rules
  const [filtersConfig, setFiltersConfig] = useState({
    designations: [],
    departments: [],
    workLocations: [],
    employmentTypes: [],
    selectedEmployees: []
  });

  // Workflow Link
  const [workflowId, setWorkflowId] = useState('');

  // Audit History Log
  const [auditHistory, setAuditHistory] = useState([]);

  // Separate Field Arrays for each of the 3 Stages
  const [completeFields, setCompleteFields] = useState([]);
  const [startFields, setStartFields] = useState([]);
  const [assigneeFields, setAssigneeFields] = useState([]);

  // Load Forms & Team on Mount
  useEffect(() => {
    loadForms();
    loadTeam();
  }, [company]);

  const loadForms = async () => {
    setLoading(true);
    try {
      const data = await getTenantCustomForms(company);
      setForms(data || []);
    } catch (err) {
      console.error('Failed to load forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async () => {
    try {
      const staff = await getTeamMembers(company);
      setTeamMembers(staff || []);
    } catch (err) {
      console.error('Failed to load staff:', err);
    }
  };

  // Helper to open Designer for New or Existing Form
  const handleOpenDesigner = (form = null) => {
    if (form) {
      setActiveForm(form);
      setFormTitle(form.title || '');
      setDataType(form.data_type || 'CUSTOMER');
      setLabelColor(form.stages_config?.label_color || '#036DCE');
      setFormComment(form.description || '');
      setFormStatus(form.status || 'PUBLISHED');

      // Hydrate features
      if (form.stages_config?.features) {
        setFormFeatures(form.stages_config.features);
      }

      // Hydrate Reminders
      if (form.stages_config?.reminders) {
        setReminders(form.stages_config.reminders);
      }

      // Hydrate Filters
      if (form.stages_config?.filters) {
        setFiltersConfig(form.stages_config.filters);
      }

      // Hydrate Fields per stage
      const allFields = form.fields || [];
      const stageComplete = allFields.filter(f => f.stage === 'complete' || !f.stage);
      const stageStart = allFields.filter(f => f.stage === 'start');
      const stageAssignee = allFields.filter(f => f.stage === 'assignee');

      setCompleteFields(stageComplete.length > 0 ? stageComplete : getDefaultCompleteFields());
      setStartFields(stageStart.length > 0 ? stageStart : getDefaultStartFields());
      setAssigneeFields(stageAssignee.length > 0 ? stageAssignee : getDefaultAssigneeFields());

      setAuditHistory(form.stages_config?.audit_history || [
        { action: 'Form Created', oldValue: '-', newValue: form.title, by: 'Admin', date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) }
      ]);
    } else {
      setActiveForm(null);
      setFormTitle('');
      setDataType('CUSTOMER');
      setLabelColor('#036DCE');
      setFormComment('');
      setFormStatus('PUBLISHED');
      setFormFeatures({
        create: false,
        follow_up: false,
        task_start_restriction: false,
        self_create: true,
        form_table: true,
        contact: false,
        start: true,
        task_title: false,
        restrict_assign_by_manager: false,
        start_geo: true,
        only_mobile_app: false,
        in_progress_reassign: false
      });
      setCompleteFields(getDefaultCompleteFields());
      setStartFields(getDefaultStartFields());
      setAssigneeFields(getDefaultAssigneeFields());
      setAuditHistory([
        { action: 'Draft Created', oldValue: '-', newValue: 'Untitled Form', by: 'Admin', date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) }
      ]);
    }

    setTopStudioMode('designer');
    setDesignerStage('complete');
    setSelectedFieldIdx(0);
    setViewMode('designer');
  };

  const getDefaultCompleteFields = () => [
    { id: 'location', label: 'Location*', placeholder: 'Please select geo', type: 'geo', required: true, stage: 'complete' },
    { id: 'status', label: 'Material Status*', placeholder: 'Please select list', type: 'list', options: ['Open', 'In-Progress', 'Resolved', 'Closed'], required: true, stage: 'complete' },
    { id: 'solved_proof', label: 'Material Picture', placeholder: 'Please select picture', type: 'picture_geo', required: false, stage: 'complete' },
    { id: 'received_qty', label: 'Received Quantity*', placeholder: 'Please enter Number', type: 'number', required: true, stage: 'complete', conditional: true },
    { id: 'comment', label: 'Comment*', placeholder: 'Please enter Text', type: 'text', required: true, stage: 'complete', conditional: true }
  ];

  const getDefaultStartFields = () => [
    { id: 'start_geo', label: 'Start Location (GPS)*', placeholder: 'Acquiring GPS coordinates...', type: 'geo', required: true, stage: 'start' },
    { id: 'start_photo', label: 'Initial Site / Meter Photo', placeholder: 'Watermarked photo capture', type: 'picture_geo', required: false, stage: 'start' },
    { id: 'start_notes', label: 'Opening Remarks', placeholder: 'Enter initial notes on arrival', type: 'text', required: false, stage: 'start' }
  ];

  const getDefaultAssigneeFields = () => [
    { id: 'material_check', label: 'Material Check & Receive*', placeholder: 'Please select list', type: 'list', options: ['Checking', 'Receiving'], required: true, stage: 'assignee' },
    { id: 'variant_type', label: 'Type of variants*', placeholder: 'Please select list', type: 'list', options: ['Regular Stock', 'Urgent Batch'], required: true, stage: 'assignee' },
    { id: 'po_number', label: 'PO NUMBER*', placeholder: 'Please enter Number', type: 'number', required: true, stage: 'assignee' },
    { id: 'total_qty', label: 'Total Quantity*', placeholder: 'Please enter Number', type: 'number', required: true, stage: 'assignee' },
    { id: 'pending_qty', label: 'Pending Quantity*', placeholder: 'Please enter Number', type: 'number', required: false, stage: 'assignee' }
  ];

  // Get and Set active stage fields
  const getActiveStageFields = () => {
    if (designerStage === 'start') return startFields;
    if (designerStage === 'assignee') return assigneeFields;
    return completeFields;
  };

  const setActiveStageFields = (updater) => {
    if (designerStage === 'start') {
      setStartFields(updater);
    } else if (designerStage === 'assignee') {
      setAssigneeFields(updater);
    } else {
      setCompleteFields(updater);
    }
  };

  // Add field to active stage
  const handleAddFieldFromPalette = (fieldDef) => {
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      label: fieldDef.label,
      placeholder: `Please enter / select ${fieldDef.label}`,
      type: fieldDef.type,
      required: false,
      stage: designerStage,
      options: ['Option 1', 'Option 2'],
      readAccess: true,
      writeAccess: true,
      conditional: false
    };

    setActiveStageFields(prev => {
      const updated = [...prev, newField];
      setSelectedFieldIdx(updated.length - 1);
      return updated;
    });
  };

  // Drag-and-drop from Palette to Canvas
  const handleDropFromPalette = (e) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const fieldDef = JSON.parse(dataStr);
      if (fieldDef && fieldDef.type) {
        handleAddFieldFromPalette(fieldDef);
      }
    } catch (_) {}
  };

  // Canvas internal drag-reorder handlers
  const handleDragStartField = (idx) => {
    setDraggingIdx(idx);
  };

  const handleDragOverField = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDropFieldReorder = (dropIdx) => {
    if (draggingIdx === null || draggingIdx === dropIdx) {
      setDraggingIdx(null);
      setDragOverIdx(null);
      return;
    }
    setActiveStageFields(prev => {
      const copy = [...prev];
      const [removed] = copy.splice(draggingIdx, 1);
      copy.splice(dropIdx, 0, removed);
      return copy;
    });
    setSelectedFieldIdx(dropIdx);
    setDraggingIdx(null);
    setDragOverIdx(null);
  };

  // Remove field from active stage
  const handleRemoveField = (idx) => {
    setActiveStageFields(prev => prev.filter((_, i) => i !== idx));
    setSelectedFieldIdx(null);
  };

  // Update properties of selected field
  const handleUpdateSelectedField = (key, value) => {
    if (selectedFieldIdx === null) return;
    setActiveStageFields(prev => {
      const copy = [...prev];
      if (copy[selectedFieldIdx]) {
        copy[selectedFieldIdx] = { ...copy[selectedFieldIdx], [key]: value };
      }
      return copy;
    });
  };

  // Save Form Handler
  const handleSaveForm = async () => {
    if (!formTitle.trim()) {
      alert('Please enter a Form Title');
      return;
    }

    setSaveLoading(true);
    try {
      // Consolidate fields across all 3 stages
      const consolidatedFields = [
        ...assigneeFields.map(f => ({ ...f, stage: 'assignee' })),
        ...startFields.map(f => ({ ...f, stage: 'start' })),
        ...completeFields.map(f => ({ ...f, stage: 'complete' }))
      ];

      const newAuditItem = {
        action: activeForm ? 'Form Updated' : 'Form Created',
        oldValue: activeForm?.title || '-',
        newValue: formTitle,
        by: 'Admin User',
        date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

      const stagesConfig = {
        label_color: labelColor,
        features: formFeatures,
        reminders,
        filters: filtersConfig,
        workflow_id: workflowId,
        audit_history: [newAuditItem, ...auditHistory]
      };

      const res = await saveCustomForm({
        id: activeForm?.id,
        company,
        branch_code: branchCode,
        title: formTitle,
        description: formComment,
        data_type: dataType,
        status: formStatus,
        fields: consolidatedFields,
        stages_config: stagesConfig
      });

      if (res.success) {
        alert('Form published & saved successfully!');
        await loadForms();
        setViewMode('list');
      } else {
        alert(res.error || 'Failed to save form');
      }
    } catch (err) {
      alert(err.message || 'Error saving form');
    } finally {
      setSaveLoading(false);
    }
  };

  // Open Dynamic Submissions Table
  const handleOpenDataTable = async (form) => {
    setActiveForm(form);
    setViewMode('data_table');
    setLoadingSubs(true);
    try {
      const data = await getFormSubmissions(form.id);
      setSubmissions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSubs(false);
    }
  };

  // Filtered palette based on search query
  const filteredPalette = PREDEFINED_FIELD_TYPES.filter(p =>
    p.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    p.type.toLowerCase().includes(paletteSearch.toLowerCase())
  );

  const activeStageFields = getActiveStageFields();
  const currentSelectedField = selectedFieldIdx !== null ? activeStageFields[selectedFieldIdx] : null;

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 120px)', background: '#f8fafc', color: '#0f172a' }}>

      {/* VIEW MODE 1: FORMS CATALOG LIST */}
      {viewMode === 'list' && (
        <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={22} color="#2563eb" />
                Custom Form Studio & Dynamic Data Tables
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                TrackWick-compatible multi-stage form designer (Assignee, Start, Complete) with 36 predefined field types.
              </p>
            </div>
            <button
              onClick={() => handleOpenDesigner(null)}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
              }}
            >
              <Plus size={16} /> + Create New Form
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Loading custom forms...</div>
            </div>
          ) : forms.length === 0 ? (
            <div style={{ background: '#ffffff', borderRadius: 12, padding: '40px 20px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <FileText size={48} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>No Custom Forms Created Yet</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Design customized field visit inspection, verification, or service checklists.
              </div>
              <button
                onClick={() => handleOpenDesigner(null)}
                style={{
                  marginTop: 16,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Create Your First Form
              </button>
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                    <th style={{ padding: '12px 16px' }}>Form Title</th>
                    <th style={{ padding: '12px 16px' }}>Code</th>
                    <th style={{ padding: '12px 16px' }}>Target Data Type</th>
                    <th style={{ padding: '12px 16px' }}>Total Fields</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map(form => (
                    <tr key={form.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>{form.title}</td>
                      <td style={{ padding: '14px 16px', color: '#64748b', fontFamily: 'monospace' }}>{form.form_code}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 600 }}>
                          {form.data_type}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#334155' }}>
                        {form.field_count || form.fields?.length || 0} fields
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: form.status === 'PUBLISHED' ? '#dcfce7' : '#fef3c7',
                          color: form.status === 'PUBLISHED' ? '#15803d' : '#b45309'
                        }}>
                          {form.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleOpenDataTable(form)}
                            style={{
                              padding: '5px 10px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#334155',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <FileText size={13} /> Submissions
                          </button>
                          <button
                            onClick={() => handleOpenDesigner(form)}
                            style={{
                              padding: '5px 10px',
                              background: '#2563eb',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Edit2 size={13} /> Edit Designer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: TRACKWICK IDENTICAL FORM DESIGNER */}
      {viewMode === 'designer' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>

          {/* Top Form Header */}
          <header style={{
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                style={{
                  background: 'none',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#475569'
                }}
                title="Back to Form List"
              >
                <ArrowLeft size={16} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: labelColor || '#036DCE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Form</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                    {formTitle || 'Untitled Form'}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 12,
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a'
                }}
              >
                <option value="PUBLISHED">Status: Published</option>
                <option value="DRAFT">Status: Draft</option>
                <option value="ARCHIVED">Status: Archived</option>
              </select>

              <button
                type="button"
                onClick={handleSaveForm}
                disabled={saveLoading}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '7px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 4px rgba(22,163,74,0.2)'
                }}
              >
                <Save size={15} />
                {saveLoading ? 'Saving...' : 'Save & Publish Form'}
              </button>
            </div>
          </header>

          {/* STUDIO BODY (3 Columns in Designer Mode, 2 Columns in Setting Mode) */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* LEFT COLUMN: PALETTE (DESIGNER) OR SETTINGS MENU */}
            <div style={{
              width: 270,
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}>
              {/* TOP MODE SWITCHER TABS: [⚙️ Setting] | [📐 Designer] */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc'
              }}>
                <button
                  type="button"
                  onClick={() => setTopStudioMode('setting')}
                  style={{
                    padding: '11px 0',
                    border: 'none',
                    borderBottom: topStudioMode === 'setting' ? '2.5px solid #036DCE' : '2.5px solid transparent',
                    background: topStudioMode === 'setting' ? '#ffffff' : 'transparent',
                    color: topStudioMode === 'setting' ? '#036DCE' : '#64748b',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Settings size={15} /> Setting
                </button>

                <button
                  type="button"
                  onClick={() => setTopStudioMode('designer')}
                  style={{
                    padding: '11px 0',
                    border: 'none',
                    borderBottom: topStudioMode === 'designer' ? '2.5px solid #036DCE' : '2.5px solid transparent',
                    background: topStudioMode === 'designer' ? '#ffffff' : 'transparent',
                    color: topStudioMode === 'designer' ? '#036DCE' : '#64748b',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Layout size={15} /> Designer
                </button>
              </div>

              {/* IF IN SETTING MODE: LEFT NAVIGATION LIST (Details, Reminders, Filters, Workflow, Audit) */}
              {topStudioMode === 'setting' && (
                <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: '4px 10px' }}>
                    FORM TYPE: <b>Task</b>
                  </div>
                  {[
                    { id: 'details', label: 'Details', icon: FileText },
                    { id: 'reminders', label: 'Reminders', icon: Bell },
                    { id: 'filters', label: 'Filters', icon: Filter },
                    { id: 'workflow', label: 'Workflow', icon: GitBranch },
                    { id: 'audit_history', label: 'Form Audit History', icon: History }
                  ].map(tab => {
                    const isSel = settingTab === tab.id;
                    const IconComp = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSettingTab(tab.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: isSel ? '#e0f2fe' : 'transparent',
                          color: isSel ? '#036DCE' : '#475569',
                          fontWeight: isSel ? 700 : 500,
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <IconComp size={16} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* IF IN DESIGNER MODE: 36 PREDEFINED FIELDS PALETTE WITH REALTIME SEARCH */}
              {topStudioMode === 'designer' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  {/* Search input */}
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                    <Search size={14} color="#94a3b8" style={{ position: 'absolute', right: 20, top: 18 }} />
                    <input
                      type="text"
                      value={paletteSearch}
                      onChange={(e) => setPaletteSearch(e.target.value)}
                      placeholder="Search field here.."
                      style={{
                        width: '100%',
                        padding: '7px 28px 7px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* 2-Column Predefined Palette Grid (Draggable & Clickable) */}
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '10px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    alignContent: 'start'
                  }}>
                    {filteredPalette.map(fieldDef => (
                      <button
                        key={fieldDef.type}
                        type="button"
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify(fieldDef));
                          e.dataTransfer.setData('text/plain', JSON.stringify(fieldDef));
                        }}
                        onClick={() => handleAddFieldFromPalette(fieldDef)}
                        title={`Click or drag to add ${fieldDef.label} to ${designerStage.toUpperCase()} stage`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '7px 8px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          cursor: 'grab',
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#334155',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#036DCE';
                          e.currentTarget.style.background = '#f0f9ff';
                          e.currentTarget.style.color = '#036DCE';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.background = '#ffffff';
                          e.currentTarget.style.color = '#334155';
                        }}
                      >
                        <span style={{ fontSize: 13, flexShrink: 0 }}>{fieldDef.icon}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fieldDef.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ================================================================= */}
            {/* CENTER COLUMN: CANVAS (DESIGNER) OR SETTING DETAIL VIEW */}
            {/* ================================================================= */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: 20 }}>

              {/* A. DESIGNER MODE */}
              {topStudioMode === 'designer' && (
                <div style={{ maxWidth: 800, margin: '0 auto', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 20px' }}>

                  {/* 3 STAGE TABS: Complete | Start | Assignee */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 24,
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: 8,
                    marginBottom: 16
                  }}>
                    {[
                      { id: 'complete', label: 'Complete', count: completeFields.length },
                      { id: 'start', label: 'Start', count: startFields.length },
                      { id: 'assignee', label: 'Assignee', count: assigneeFields.length }
                    ].map(st => {
                      const isAct = designerStage === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            setDesignerStage(st.id);
                            setSelectedFieldIdx(0);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '4px 6px 8px',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: isAct ? 700 : 500,
                            color: isAct ? '#036DCE' : '#64748b',
                            borderBottom: isAct ? '2.5px solid #036DCE' : '2.5px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <span>{st.label}</span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 10,
                            background: isAct ? '#e0f2fe' : '#f1f5f9',
                            color: isAct ? '#036DCE' : '#64748b',
                            fontWeight: 700
                          }}>
                            {st.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Drag-and-Drop Target Canvas Dropzone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropFromPalette}
                    style={{
                      minHeight: 350,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '4px 0'
                    }}
                  >
                    {activeStageFields.length === 0 ? (
                      <div style={{
                        border: '2px dashed #cbd5e1',
                        borderRadius: 8,
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#94a3b8'
                      }}>
                        <Move size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                          Drop fields here from the left palette
                        </div>
                        <div style={{ fontSize: 11, marginTop: 4 }}>
                          Adding fields for the <b>{designerStage.toUpperCase()}</b> stage.
                        </div>
                      </div>
                    ) : (
                      activeStageFields.map((field, idx) => {
                        const isSelected = selectedFieldIdx === idx;
                        const isDragging = draggingIdx === idx;
                        const isDragOver = dragOverIdx === idx;

                        return (
                          <div
                            key={field.id}
                            draggable={true}
                            onDragStart={() => handleDragStartField(idx)}
                            onDragOver={(e) => handleDragOverField(e, idx)}
                            onDrop={() => handleDropFieldReorder(idx)}
                            onClick={() => setSelectedFieldIdx(idx)}
                            style={{
                              padding: '10px 14px',
                              background: isSelected ? '#f0f9ff' : '#ffffff',
                              border: isSelected ? '1.5px solid #036DCE' : isDragOver ? '2px dashed #036DCE' : '1px solid #e2e8f0',
                              borderRadius: 8,
                              cursor: 'pointer',
                              boxShadow: isSelected ? '0 2px 6px rgba(3,109,206,0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
                              opacity: isDragging ? 0.4 : 1,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ cursor: 'grab', color: '#94a3b8' }} title="Drag to re-order">
                                  ⋮⋮
                                </span>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                                  {field.label}
                                </span>
                                {field.required && (
                                  <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 700 }}>*</span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {field.conditional && (
                                  <span style={{ fontSize: 10, color: '#036DCE', background: '#e0f2fe', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                    Conditional
                                  </span>
                                )}
                                <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                                  {field.type}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveField(idx);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: 2
                                  }}
                                  title="Delete Field"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Simulated Field Input Box */}
                            <div style={{
                              padding: '8px 12px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#64748b'
                            }}>
                              {field.placeholder || `Please select / enter ${field.label}`}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* B. SETTING MODE PANELS */}
              {topStudioMode === 'setting' && (
                <div style={{ maxWidth: 900, margin: '0 auto', background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 24 }}>

                  {/* 1. DETAILS PANEL */}
                  {settingTab === 'details' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Form Details & Features</h3>

                      {/* Title & Status */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Form Title*
                        </label>
                        <input
                          type="text"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="e.g. Material Checking and Receiving"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            fontSize: 13,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Data Type & Label Color */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Data Type*
                          </label>
                          <select
                            value={dataType}
                            onChange={(e) => setDataType(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              fontSize: 13
                            }}
                          >
                            <option value="CUSTOMER">Customer / Party Master</option>
                            <option value="LEAD">Lead Data</option>
                            <option value="NONE">None</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Label Color
                          </label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="color"
                              value={labelColor}
                              onChange={(e) => setLabelColor(e.target.value)}
                              style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            />
                            <input
                              type="text"
                              value={labelColor}
                              onChange={(e) => setLabelColor(e.target.value)}
                              style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontFamily: 'monospace' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Comment */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Comment / Instructions
                        </label>
                        <textarea
                          value={formComment}
                          onChange={(e) => setFormComment(e.target.value)}
                          rows={3}
                          placeholder="Enter instructions for the executive..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            fontSize: 13,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Form Features (TrackWick Checkbox Matrix) */}
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                          Form Features
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                          {[
                            { key: 'create', label: 'Create' },
                            { key: 'follow_up', label: 'Follow Up' },
                            { key: 'task_start_restriction', label: 'Task Start Restriction' },
                            { key: 'self_create', label: 'Self Create' },
                            { key: 'form_table', label: 'Form Table' },
                            { key: 'contact', label: 'Contact' },
                            { key: 'start', label: 'Start' },
                            { key: 'task_title', label: 'Task Title' },
                            { key: 'restrict_assign_by_manager', label: 'Restrict Assign by Manager' },
                            { key: 'start_geo', label: 'Start Geo' },
                            { key: 'only_mobile_app', label: 'Only Mobile App' },
                            { key: 'in_progress_reassign', label: 'In-Progress Re-assign' }
                          ].map(item => (
                            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                              <input
                                type="checkbox"
                                checked={!!formFeatures[item.key]}
                                onChange={(e) => setFormFeatures(prev => ({ ...prev, [item.key]: e.target.checked }))}
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. REMINDERS PANEL */}
                  {settingTab === 'reminders' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Task Reminders</h3>

                      <div style={{ display: 'flex', gap: 8 }}>
                        {['ALL_TASKS', 'FOLLOW_UP_ONLY'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setReminders(r => ({ ...r, appliesTo: mode }))}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              border: reminders.appliesTo === mode ? '1.5px solid #036DCE' : '1px solid #cbd5e1',
                              background: reminders.appliesTo === mode ? '#e0f2fe' : '#ffffff',
                              color: reminders.appliesTo === mode ? '#036DCE' : '#475569'
                            }}
                          >
                            {mode === 'ALL_TASKS' ? 'All Tasks' : 'Follow Up Tasks Only'}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Frequency in minutes
                          </label>
                          <input
                            type="number"
                            value={reminders.frequencyMins}
                            onChange={(e) => setReminders(r => ({ ...r, frequencyMins: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Repeat Count
                          </label>
                          <input
                            type="number"
                            value={reminders.repeatCount}
                            onChange={(e) => setReminders(r => ({ ...r, repeatCount: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Priority
                          </label>
                          <select
                            value={reminders.priority}
                            onChange={(e) => setReminders(r => ({ ...r, priority: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                          >
                            <option value="URGENT">Urgent</option>
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 16 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={reminders.channelPush}
                            onChange={(e) => setReminders(r => ({ ...r, channelPush: e.target.checked }))}
                          />
                          <span>🔔 Push Notification</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={reminders.channelEmail}
                            onChange={(e) => setReminders(r => ({ ...r, channelEmail: e.target.checked }))}
                          />
                          <span>✉️ Email</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* 3. FILTERS (ASSIGNEE & AUDIENCE) PANEL */}
                  {settingTab === 'filters' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Employee & Customer Filters</h3>

                      {/* Additional Employee Filters */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                          Assignee & Department Access
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                          Choose which departments and staff members are authorized to view and execute this form.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                              Target Departments
                            </label>
                            <select
                              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !filtersConfig.departments.includes(val)) {
                                  setFiltersConfig(f => ({ ...f, departments: [...f.departments, val] }));
                                }
                              }}
                            >
                              <option value="">-- Add Department --</option>
                              <option value="Sales">Sales</option>
                              <option value="Field Support">Field Support</option>
                              <option value="Quality Inspection">Quality Inspection</option>
                              <option value="Service & Maintenance">Service & Maintenance</option>
                            </select>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {filtersConfig.departments.map(d => (
                                <span key={d} style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {d}
                                  <button
                                    type="button"
                                    onClick={() => setFiltersConfig(f => ({ ...f, departments: f.departments.filter(x => x !== d) }))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                              Specific Field Executives
                            </label>
                            <select
                              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val && !filtersConfig.selectedEmployees.includes(val)) {
                                  setFiltersConfig(f => ({ ...f, selectedEmployees: [...f.selectedEmployees, val] }));
                                }
                              }}
                            >
                              <option value="">-- Select Employee --</option>
                              {teamMembers.map(m => (
                                <option key={m.id || m.user_id} value={m.name || m.emp_name}>
                                  {m.name || m.emp_name} ({m.role || 'Staff'})
                                </option>
                              ))}
                            </select>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {filtersConfig.selectedEmployees.map(emp => (
                                <span key={emp} style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {emp}
                                  <button
                                    type="button"
                                    onClick={() => setFiltersConfig(f => ({ ...f, selectedEmployees: f.selectedEmployees.filter(x => x !== emp) }))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. WORKFLOW PANEL */}
                  {settingTab === 'workflow' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Attach Workflow</h3>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Select Linked Workflow
                        </label>
                        <select
                          value={workflowId}
                          onChange={(e) => setWorkflowId(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        >
                          <option value="">-- None / Standalone Task --</option>
                          <option value="LEAD_DATA_CONVERSION">Lead Data Conversion Workflow</option>
                          <option value="ORDER_DELIVERY_DISPATCH">Order to Delivery Dispatch Workflow</option>
                          <option value="COMPLAINT_SLA_RESOLVE">Complaint SLA & Service Workflow</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* 5. AUDIT HISTORY PANEL */}
                  {settingTab === 'audit_history' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>Form Audit History</h3>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                            <th style={{ padding: '8px 12px' }}>Action</th>
                            <th style={{ padding: '8px 12px' }}>Old Value</th>
                            <th style={{ padding: '8px 12px' }}>New Value</th>
                            <th style={{ padding: '8px 12px' }}>Action by</th>
                            <th style={{ padding: '8px 12px' }}>Date / Time (IST)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditHistory.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.action}</td>
                              <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.oldValue}</td>
                              <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600 }}>{item.newValue}</td>
                              <td style={{ padding: '10px 12px' }}>{item.by}</td>
                              <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* ================================================================= */}
            {/* RIGHT COLUMN: FIELD PROPERTIES SETTER (DESIGNER MODE) */}
            {/* ================================================================= */}
            {topStudioMode === 'designer' && (
              <div style={{
                width: 320,
                background: '#ffffff',
                borderLeft: '1px solid #e2e8f0',
                padding: '16px',
                overflowY: 'auto',
                flexShrink: 0
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Field Properties</span>
                  <Sliders size={16} color="#64748b" />
                </div>

                {!currentSelectedField ? (
                  <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8', fontSize: 12 }}>
                    Click any field on the center canvas to edit its properties.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* GENERAL SECTION */}
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        General
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                          Field Name*
                        </label>
                        <input
                          type="text"
                          value={currentSelectedField.label || ''}
                          onChange={(e) => handleUpdateSelectedField('label', e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                          Placeholder
                        </label>
                        <input
                          type="text"
                          value={currentSelectedField.placeholder || ''}
                          onChange={(e) => handleUpdateSelectedField('placeholder', e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Permissions */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                          Field Permission
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateSelectedField('readAccess', !currentSelectedField.readAccess)}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              borderRadius: 4,
                              border: currentSelectedField.readAccess ? '1px solid #036DCE' : '1px solid #cbd5e1',
                              background: currentSelectedField.readAccess ? '#e0f2fe' : '#ffffff',
                              color: currentSelectedField.readAccess ? '#036DCE' : '#64748b',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Read Access All
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateSelectedField('writeAccess', !currentSelectedField.writeAccess)}
                            style={{
                              flex: 1,
                              padding: '5px 8px',
                              borderRadius: 4,
                              border: currentSelectedField.writeAccess ? '1px solid #036DCE' : '1px solid #cbd5e1',
                              background: currentSelectedField.writeAccess ? '#e0f2fe' : '#ffffff',
                              color: currentSelectedField.writeAccess ? '#036DCE' : '#64748b',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Write Access All
                          </button>
                        </div>
                      </div>

                      {/* Checkboxes: Required, Disabled, etc. */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!currentSelectedField.required}
                            onChange={(e) => handleUpdateSelectedField('required', !e.target.checked)}
                          />
                          <span>Optional</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!currentSelectedField.disabled}
                            onChange={(e) => handleUpdateSelectedField('disabled', e.target.checked)}
                          />
                          <span>Disabled</span>
                        </label>
                      </div>
                    </div>

                    {/* FIELD SPECIFIC (Options / Tags Builder) */}
                    {(currentSelectedField.type === 'list' || currentSelectedField.type === 'dropdown' || currentSelectedField.type === 'multiple_selection') && (
                      <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                          Field Specific (Values / Options)
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {(currentSelectedField.options || []).map((opt, i) => (
                            <span key={i} style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: 4, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {opt}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (currentSelectedField.options || []).filter((_, idx) => idx !== i);
                                  handleUpdateSelectedField('options', updated);
                                }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add Option Input */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            id="new_opt_input"
                            placeholder="Add value (e.g. Checking)"
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 11 }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = e.currentTarget.value.trim();
                                if (val) {
                                  const updated = [...(currentSelectedField.options || []), val];
                                  handleUpdateSelectedField('options', updated);
                                  e.currentTarget.value = '';
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById('new_opt_input');
                              if (input && input.value.trim()) {
                                const updated = [...(currentSelectedField.options || []), input.value.trim()];
                                handleUpdateSelectedField('options', updated);
                                input.value = '';
                              }
                            }}
                            style={{ padding: '5px 10px', background: '#036DCE', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    )}

                    {/* APPLY CONDITION */}
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Apply Condition
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!currentSelectedField.conditional}
                          onChange={(e) => handleUpdateSelectedField('conditional', e.target.checked)}
                        />
                        <span>Conditional (Show only on condition)</span>
                      </label>
                    </div>

                    {/* DELETE FIELD */}
                    <button
                      type="button"
                      onClick={() => handleRemoveField(selectedFieldIdx)}
                      style={{
                        padding: '8px',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Trash2 size={14} /> Delete This Field
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>
      )}

      {/* VIEW MODE 3: DATA TABLE (SUBMISSIONS & CSV EXPORT) */}
      {viewMode === 'data_table' && (
        <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  {activeForm?.title} — Data Table & Audit
                </h1>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Live dynamic responses submitted by field executives from ground
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!submissions || submissions.length === 0) {
                  alert('No data to export.');
                  return;
                }
                const headers = ['Date', 'Party', 'Mode', 'Distance (m)', 'Geofence Flag'];
                const rows = submissions.map(s => [
                  new Date(s.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                  `"${s.party_name || ''}"`,
                  s.connectivity_mode,
                  s.distance_from_party_meters || 0,
                  s.is_geofence_flagged ? 'FLAGGED' : 'VERIFIED'
                ]);
                const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                const uri = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                const a = document.createElement('a');
                a.href = uri;
                a.download = `${activeForm?.title}_Data_${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Download size={14} /> Export to CSV
            </button>
          </div>

          {loadingSubs ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Loading submissions...</div>
            </div>
          ) : submissions.length === 0 ? (
            <div style={{ background: '#ffffff', padding: 40, textAlign: 'center', borderRadius: 8, border: '1px solid #e2e8f0', color: '#64748b' }}>
              No submissions recorded yet for this form.
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <th style={{ padding: '10px 14px' }}>Date (IST)</th>
                    <th style={{ padding: '10px 14px' }}>Party / Client</th>
                    <th style={{ padding: '10px 14px' }}>Connectivity Mode</th>
                    <th style={{ padding: '10px 14px' }}>Geofence</th>
                    <th style={{ padding: '10px 14px' }}>GPS Lat / Lng</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(sub => (
                    <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px' }}>
                        {new Date(sub.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{sub.party_name}</td>
                      <td style={{ padding: '10px 14px' }}>{sub.connectivity_mode}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          background: sub.is_geofence_flagged ? '#fee2e2' : '#dcfce7',
                          color: sub.is_geofence_flagged ? '#dc2626' : '#15803d'
                        }}>
                          {sub.is_geofence_flagged ? 'FLAGGED' : 'VERIFIED'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#64748b' }}>
                        {sub.check_in_lat ? `${Number(sub.check_in_lat).toFixed(4)}, ${Number(sub.check_in_lng).toFixed(4)}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
