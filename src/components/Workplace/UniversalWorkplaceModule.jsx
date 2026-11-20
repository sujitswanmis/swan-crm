'use client';

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import { GitMerge, Plus, Clock, CheckSquare, Settings, Trash2, RotateCcw, ArrowUp, ArrowDown, PlayCircle, FileText, ListPlus, Tag, XCircle, RefreshCw, Search, Check, Square, Users, X, Building2, MapPin } from 'lucide-react';
import { getDesignations } from '@/app/actions/designation';
import { getEmployeesMaster } from '@/app/actions/employee';
import { getWorkflowDefinitions, createWorkflowDefinition, addWorkflowStage, deleteWorkflowDefinition, restoreWorkflowDefinition, mapStageField, purgeWorkflowDefinition, getWorkflowInstances, startWorkflowInstance, advanceWorkflowInstance, setWorkflowPlanningMode, importWorkflowDefinition, reorderWorkflowStages, updateWorkflowStageField } from '@/app/actions/workflowEngine';
import { CRMTabs } from '@/components/common/CRMDesignSystem';
import UniversalBranchSelect from '@/components/common/UniversalBranchSelect';
import { formatBranchStandard } from '@/utils/branchAccess';
import { tatHours, formatWorkflowIST, workflowVariance } from '@/utils/workflowTiming.mjs';

const isUUID = val => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(val || ''));

function StageEmployeeMultiSelect({ employees = [], selectedIds = [], onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeEmployees = useMemo(() => {
    return (employees || []).filter(e => {
      const status = String(e.emp_status || e.status || 'Active').toLowerCase();
      return !['inactive', 'terminated', 'resigned', 'trash'].includes(status);
    });
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return activeEmployees;
    const q = searchQuery.toLowerCase().trim();
    return activeEmployees.filter(e => {
      const name = String(e.emp_name || e.name || '').toLowerCase();
      const code = String(e.emp_code || '').toLowerCase();
      const desig = String(e.designation_name || e.designation || '').toLowerCase();
      const email = String(e.email || e.work_email || '').toLowerCase();
      return name.includes(q) || code.includes(q) || desig.includes(q) || email.includes(q);
    });
  }, [activeEmployees, searchQuery]);

  const selectedEmployees = useMemo(() => {
    return (employees || []).filter(e => selectedIds.includes(e.id));
  }, [employees, selectedIds]);

  const toggleEmployee = (emp) => {
    let nextIds;
    if (selectedIds.includes(emp.id)) {
      nextIds = selectedIds.filter(id => id !== emp.id);
    } else {
      nextIds = [...selectedIds, emp.id];
    }
    const nextObjs = (employees || []).filter(e => nextIds.includes(e.id));
    onChange(nextIds, nextObjs);
  };

  const removeEmployee = (empId, e) => {
    e.stopPropagation();
    const nextIds = selectedIds.filter(id => id !== empId);
    const nextObjs = (employees || []).filter(e => nextIds.includes(e.id));
    onChange(nextIds, nextObjs);
  };

  const handleSelectAllFiltered = (e) => {
    e.preventDefault();
    const filteredIds = filteredEmployees.map(emp => emp.id);
    const mergedIds = Array.from(new Set([...selectedIds, ...filteredIds]));
    const nextObjs = (employees || []).filter(e => mergedIds.includes(e.id));
    onChange(mergedIds, nextObjs);
  };

  const handleClearAll = (e) => {
    e.preventDefault();
    onChange([], []);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {/* Selected Employee Badges / Chips */}
      {selectedEmployees.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.4rem', padding: '0.35rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', width: '100%', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: 'rgba(37, 99, 235, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
              {selectedEmployees.length} Employee{selectedEmployees.length > 1 ? 's' : ''} Selected
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleClearAll}
                style={{ fontSize: '0.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Clear All
              </button>
            </div>
          </div>
          {selectedEmployees.map(emp => (
            <span
              key={emp.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '5px',
                padding: '0.15rem 0.45rem',
                fontSize: '0.75rem',
                color: '#1e40af',
                fontWeight: 600
              }}
            >
              <span>{emp.emp_name || emp.name} {emp.emp_code ? `(${emp.emp_code})` : ''}</span>
              <button
                type="button"
                onClick={(e) => removeEmployee(emp.id, e)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                title="Remove"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search Input Box */}
      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'var(--bg-surface, #ffffff)',
          border: isOpen ? '1.5px solid #2563eb' : '1px solid var(--border-strong, #cbd5e1)',
          borderRadius: '6px',
          padding: '0.45rem 0.65rem',
          cursor: 'text',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedIds.length > 0 ? "Search more employees by name / code..." : "Search & Select employee by name, code (e.g. 50775)..."}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '0.85rem',
            color: 'var(--text-primary, #0f172a)'
          }}
        />
        {selectedIds.length > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#dbeafe', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
            {selectedIds.length}
          </span>
        )}
      </div>

      {/* Floating Dropdown List */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-strong, #cbd5e1)',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          maxHeight: '260px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.4rem 0.75rem',
            background: 'var(--bg-primary, #f8fafc)',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            fontSize: '0.72rem',
            color: 'var(--text-secondary, #64748b)'
          }}>
            <span>Showing {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}</span>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {filteredEmployees.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Select All
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List Items */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {filteredEmployees.length === 0 ? (
              <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.8rem' }}>
                No employees matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredEmployees.map(emp => {
                const isSelected = selectedIds.includes(emp.id);
                return (
                  <div
                    key={emp.id}
                    onClick={() => toggleEmployee(emp)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.75rem',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-primary, #f8fafc)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isSelected ? '#2563eb' : '#e2e8f0',
                      color: isSelected ? '#ffffff' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      flexShrink: 0
                    }}>
                      {(emp.emp_name || emp.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.emp_name || emp.name}
                        {emp.emp_code && (
                          <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            ({emp.emp_code})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.designation_name || emp.designation || 'Staff'}
                        {emp.department && ` • ${emp.department}`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Done Button */}
          <div style={{ padding: '0.35rem 0.75rem', background: 'var(--bg-primary, #f8fafc)', borderTop: '1px solid var(--border-light, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Done ({selectedIds.length} Selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UniversalWorkplaceModule({ moduleAccess = {}, userRole = '', initialSubTab = 'active', onSubTabChange = null }) {
  const [workflowFilter, setWorkflowFilter] = useState(initialSubTab || 'active'); // 'active' | 'tracker' | 'trash'

  // Data states
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [workflowPending, startWorkflowTransition] = useTransition();
  const workflowBusy = useRef(false);
  const [workflowError, setWorkflowError] = useState('');
  const [legacyWorkflowNotice, setLegacyWorkflowNotice] = useState(false);
  const [stageInputs, setStageInputs] = useState({});
  const [stageApprovals, setStageApprovals] = useState({});
  const launchRequestKey = useRef(null);

  // Modals
  const [showAddWorkflowModal, setShowAddWorkflowModal] = useState(false);
  const [workflowForm, setWorkflowForm] = useState({
    workflow_name: '',
    workflow_code: '',
    category: 'PRODUCTION',
    description: '',
    planning_mode: 'ACTUAL_PLUS_TAT',
    company_tenant: 'TNT00002',
    branch_code: 'All'
  });

  // Stage Planner Modal & Trash State
  const [selectedWfForStages, setSelectedWfForStages] = useState(null);
  const [stageForm, setStageForm] = useState({
    stage_name: '',
    execution_type: 'SEQUENTIAL',
    tat_value: 24,
    tat_unit: 'HOURS',
    planned_tat_hours: 24,
    assignee_type: 'BY_DESIGNATION',
    assigned_designation_id: '',
    assigned_employee_id: '',
    assigned_employee_ids: [],
    assigned_employees: [],
    approval_required: false,
    approver_designation_id: ''
  });

  // Stage Field Mapping State
  const [expandedStageId, setExpandedStageId] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    field_name: '',
    data_type: 'TEXT',
    is_required: true,
    snapshot_mode: 'LIVE_REFERENCE'
  });
  const [editingField, setEditingField] = useState(null);

  // Centered Delete Modal States
  const [deleteConfirmWf, setDeleteConfirmWf] = useState(null);
  const [purgeConfirmWf, setPurgeConfirmWf] = useState(null);

  // Live Workflow Instance Execution State
  const [liveInstances, setLiveInstances] = useState([]);
  const [liveLaunchWf, setLiveLaunchWf] = useState(null);
  const [liveForm, setLiveForm] = useState({ reference_no: '', customer_name: '', notes: '' });

  useEffect(() => {
    if (initialSubTab && ['active', 'tracker', 'trash'].includes(initialSubTab)) {
      setWorkflowFilter(initialSubTab);
    }
  }, [initialSubTab]);

  const handleFilterChange = (filter) => {
    setWorkflowFilter(filter);
    if (typeof onSubTabChange === 'function') {
      onSubTabChange(filter);
    }
  };

  const workflowRequest = async (operation) => {
    if (workflowBusy.current) throw new Error('A workflow operation is still running');
    workflowBusy.current = true;
    setWorkflowError('');
    try {
      return await new Promise((resolve, reject) => {
        startWorkflowTransition(async () => {
          try { resolve(await operation()); }
          catch (err) { setWorkflowError(err.message); reject(err); }
        });
      });
    } finally { workflowBusy.current = false; }
  };

  const acceptWorkflow = (wf) => {
    setWorkflows(prev => prev.map(w => (w.id === wf.id || w.workflow_code === wf.workflow_code) ? wf : w));
    setSelectedWfForStages(prev => (prev?.id === wf.id || prev?.workflow_code === wf.workflow_code) ? wf : prev);
  };

  const loadWorkflowData = async () => {
    try {
      const [serverWorkflows, instances] = await Promise.all([
        getWorkflowDefinitions(),
        getWorkflowInstances()
      ]);
      setWorkflows(prev => {
        const swList = serverWorkflows || [];
        const nonPersisted = prev.filter(w => !w.persisted && !swList.some(sw => sw.workflow_code === w.workflow_code));
        return [...swList, ...nonPersisted];
      });
      setLiveInstances(instances || []);
    } catch (err) {
      setWorkflowError(err.message || 'Could not load workflows');
    }
  };

  useEffect(() => {
    let isMounted = true;

    // 1. Instantly merge cached/local workflows so page has data from millisecond 0
    try {
      const stored = JSON.parse(localStorage.getItem('crm_custom_workflows') || '[]');
      if (Array.isArray(stored) && isMounted) {
        setLegacyWorkflowNotice(stored.some(w => w?.stages?.length));
        setWorkflows(prev => [...prev, ...stored.filter(w => w?.id && !prev.some(p => p.id === w.id))
          .map(w => ({ ...w, persisted: false }))]);
      }
    } catch {}

    // 2. Fetch server workflows and instances in parallel immediately without blocking UI
    loadWorkflowData();

    // 3. Fetch designations & employees asynchronously in the background for stage configurator modal
    Promise.all([
      getDesignations(),
      getEmployeesMaster()
    ]).then(([desigData, empData]) => {
      if (isMounted) {
        setDesignations(desigData || []);
        setEmployees(empData || []);
      }
    }).catch(e => {
      console.warn('Background role assignments load:', e?.message);
    });

    return () => { isMounted = false; };
  }, []);

  const handleOpenConfigureStages = async (wf) => {
    const existingPersisted = workflows.find(w => w.persisted && (w.workflow_code === wf.workflow_code || (isUUID(wf.id) && w.id === wf.id)));
    const targetWf = existingPersisted || wf;
    setSelectedWfForStages(targetWf);

    if (!targetWf.persisted || !targetWf.workflow_versions?.[0]?.id || !isUUID(targetWf.workflow_versions?.[0]?.id)) {
      try {
        const res = await workflowRequest(() => importWorkflowDefinition(targetWf));
        if (res?.workflow) {
          setSelectedWfForStages(res.workflow);
          setWorkflows(prev => [res.workflow, ...prev.filter(w => w.id !== res.workflow.id && w.workflow_code !== res.workflow.workflow_code)]);
        }
      } catch (err) {
        console.warn('Auto-save workflow on open configure stages:', err?.message);
      }
    }
  };

  const handleSaveStage = async (e) => {
    e.preventDefault();
    if (!selectedWfForStages) return;
    try {
      let currentWf = selectedWfForStages;
      if (!currentWf.persisted || !currentWf.workflow_versions?.[0]?.id || !isUUID(currentWf.workflow_versions?.[0]?.id)) {
        const existingPersisted = workflows.find(w => w.persisted && (w.workflow_code === currentWf.workflow_code || (isUUID(currentWf.id) && w.id === currentWf.id)));
        if (existingPersisted && existingPersisted.workflow_versions?.[0]?.id) {
          currentWf = existingPersisted;
          setSelectedWfForStages(currentWf);
        } else {
          try {
            const importRes = await workflowRequest(() => importWorkflowDefinition(currentWf));
            if (importRes?.workflow) {
              currentWf = importRes.workflow;
              setSelectedWfForStages(currentWf);
              setWorkflows(prev => [currentWf, ...prev.filter(w => w.id !== currentWf.id && w.workflow_code !== currentWf.workflow_code)]);
            }
          } catch (e) {
            console.warn('Auto-save before stage creation:', e?.message);
          }
        }
      }
      const verId = currentWf.workflow_versions?.[0]?.id;
      if (!verId || !isUUID(verId)) {
        throw new Error('Unable to resolve a valid workflow version. Please refresh the page and try again.');
      }
      const approverDesig = designations.find(d => d.id === stageForm.approver_designation_id);
      const workerDesig = designations.find(d => d.id === stageForm.assigned_designation_id);

      const selectedEmpIds = Array.isArray(stageForm.assigned_employee_ids) && stageForm.assigned_employee_ids.length > 0
        ? stageForm.assigned_employee_ids
        : (stageForm.assigned_employee_id ? [stageForm.assigned_employee_id] : []);
      const selectedEmpObjs = employees.filter(e => selectedEmpIds.includes(e.id));
      const firstWorkerEmp = selectedEmpObjs[0] || employees.find(e => e.id === stageForm.assigned_employee_id);
      const combinedWorkerNames = selectedEmpObjs.length > 0
        ? selectedEmpObjs.map(e => (e.emp_name || e.name || '') + (e.emp_code ? ` (${e.emp_code})` : '')).filter(Boolean).join(', ')
        : (firstWorkerEmp?.emp_name || '');

      if (stageForm.assignee_type === 'SPECIFIC_EMPLOYEE' && selectedEmpIds.length === 0) {
        alert('Please select at least one assigned employee for this stage.');
        return;
      }

      const stageIndex = (selectedWfForStages.stages || []).length;
      const canonicalCode = `S${String(stageIndex).padStart(2, '0')}`;

      const val = stageForm.tat_value;
      const unit = stageForm.tat_unit || 'HOURS';
      let hours = tatHours(val, unit);
      let displayStr = `${val} Hours`;

      if (unit === 'MINUTES') {
        hours = tatHours(val, unit);
        displayStr = `${val} Mins`;
      } else if (unit === 'DAYS') {
        hours = val * 24;
        displayStr = `${val} Days`;
      } else {
        displayStr = `${val} Hours`;
      }

      let defaultFields = [];
      if (stageIndex === 0) {
        defaultFields = [
          { field_name: 'Item & Material Name', field_key: 'item_name', data_type: 'TEXT', is_required: true, snapshot_mode: 'STAGE_SNAPSHOT' },
          { field_name: 'Required Quantity', field_key: 'req_qty', data_type: 'NUMBER', is_required: true, snapshot_mode: 'LIVE_REFERENCE' },
          { field_name: 'Target Priority', field_key: 'priority', data_type: 'TEXT', is_required: false, snapshot_mode: 'LIVE_REFERENCE' }
        ];
      } else if (stageIndex === 1) {
        defaultFields = [
          { field_name: 'Quality Inspection Verdict', field_key: 'quality_verdict', data_type: 'TEXT', is_required: true, snapshot_mode: 'STAGE_SNAPSHOT' },
          { field_name: 'Inspector Remarks', field_key: 'inspector_remarks', data_type: 'TEXT', is_required: false, snapshot_mode: 'LIVE_REFERENCE' }
        ];
      }

      const createdStage = await workflowRequest(() => addWorkflowStage(verId, {
        ...stageForm,
        planned_tat_hours: hours,
        tat_formatted_display: displayStr,
        stage_code: canonicalCode,
        stage_order: stageIndex + 1,
        fields: defaultFields,
        approver_designation_name: approverDesig?.designation_name || '',
        assigned_designation_name: workerDesig?.designation_name || '',
        assigned_employee_id: firstWorkerEmp?.id || selectedEmpIds[0] || null,
        assigned_employee_name: combinedWorkerNames,
        assigned_employee_ids: selectedEmpIds,
        assigned_employees: selectedEmpObjs.map(e => ({
          id: e.id,
          emp_name: e.emp_name || e.name,
          emp_code: e.emp_code,
          designation_name: e.designation_name || e.designation
        }))
      }));

      createdStage.stage_code = canonicalCode;
      createdStage.tat_formatted_display = displayStr;
      createdStage.planned_tat_hours = hours;
      createdStage.assigned_employee_ids = selectedEmpIds;
      createdStage.assigned_employees = selectedEmpObjs.map(e => ({
        id: e.id,
        emp_name: e.emp_name || e.name,
        emp_code: e.emp_code,
        designation_name: e.designation_name || e.designation
      }));
      createdStage.assigned_employee_name = combinedWorkerNames;

      const updatedStages = [...(currentWf.stages || []), createdStage];
      const updatedWf = { ...currentWf, stages: updatedStages, persisted: true };

      setSelectedWfForStages(updatedWf);
      setWorkflows(prev => {
        const filtered = prev.filter(w => String(w.id) !== String(updatedWf.id) && w.workflow_code !== updatedWf.workflow_code);
        return [updatedWf, ...filtered];
      });

      setStageForm({
        stage_name: '',
        execution_type: 'SEQUENTIAL',
        tat_value: 24,
        tat_unit: 'HOURS',
        planned_tat_hours: 24,
        assignee_type: 'BY_DESIGNATION',
        assigned_designation_id: '',
        assigned_employee_id: '',
        assigned_employee_ids: [],
        assigned_employees: [],
        approval_required: false,
        approver_designation_id: ''
      });

      alert(`Stage ${canonicalCode} ("${createdStage.stage_name}") added with TAT ${displayStr}!`);
    } catch (err) {
      alert('Error adding stage: ' + err.message);
    }
  };

  const handleAddStageField = async (stageId, e) => {
    e.preventDefault();
    if (!fieldForm.field_name || !selectedWfForStages) return;
    try {
      const newFld = await workflowRequest(() => mapStageField(stageId, fieldForm));
      const updatedStages = selectedWfForStages.stages.map(stg => {
        if (stg.id === stageId) {
          const existingFlds = stg.fields || [];
          return { ...stg, fields: [...existingFlds, newFld] };
        }
        return stg;
      });

      const updatedWf = { ...selectedWfForStages, stages: updatedStages };
      setSelectedWfForStages(updatedWf);
      setWorkflows(prev => prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w));

      setFieldForm({
        field_name: '',
        data_type: 'TEXT',
        is_required: true,
        snapshot_mode: 'LIVE_REFERENCE'
      });

      alert(`Field "${newFld.field_name}" added to Stage!`);
    } catch (err) {
      alert('Error mapping field: ' + err.message);
    }
  };

  const handleDeleteStageField = async (stageId, fieldId) => {
    try { acceptWorkflow(await workflowRequest(() => updateWorkflowStageField(stageId, fieldId, {}, true))); }
    catch (err) { setWorkflowError(err.message); }
  };

  const handleUpdateStageField = async (e) => {
    e.preventDefault();
    if (!editingField) return;
    try {
      acceptWorkflow(await workflowRequest(() => updateWorkflowStageField(editingField.stageId, editingField.fieldId, editingField)));
      setEditingField(null);
    } catch (err) { setWorkflowError(err.message); }
  };

  const moveStage = async (index, direction) => {
    if (!selectedWfForStages || workflowBusy.current) return;
    const stages = [...selectedWfForStages.stages];
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    [stages[index], stages[target]] = [stages[target], stages[index]];
    try { acceptWorkflow(await workflowRequest(() => reorderWorkflowStages(selectedWfForStages.workflow_versions?.[0]?.id, stages.map(s => s.id)))); }
    catch (err) { setWorkflowError(err.message); }
  };
  const handleMoveStageUp = index => moveStage(index, -1);
  const handleMoveStageDown = index => moveStage(index, 1);

  const handleStartLiveExecution = async (e) => {
    e.preventDefault();
    if (!liveLaunchWf) return;
    try {
      launchRequestKey.current ||= crypto.randomUUID();
      const instance = await workflowRequest(() => startWorkflowInstance(liveLaunchWf.workflow_versions?.[0]?.id,
        { ...liveForm, request_key: launchRequestKey.current }));
      setLiveInstances(prev => [instance, ...prev.filter(i => i.id !== instance.id)]);
      setLiveLaunchWf(null);
      launchRequestKey.current = null;
      setLiveForm({ reference_no: '', customer_name: '', notes: '' });
      handleFilterChange('tracker');
    } catch (err) { setWorkflowError(err.message); }
  };

  const handleAdvanceStage = async (instId) => {
    const instance = liveInstances.find(i => i.id === instId);
    if (!instance?.current_stage?.stage_instance_id) return;
    const stageId = instance.current_stage.stage_instance_id;
    try {
      const saved = await workflowRequest(() => advanceWorkflowInstance(instId, stageId,
        stageInputs[stageId] || {}, !!stageApprovals[stageId]));
      setLiveInstances(prev => prev.map(i => i.id === saved.id ? saved : i));
    } catch (err) { setWorkflowError(err.message); }
  };

  const confirmSoftDelete = async () => {
    if (!deleteConfirmWf) return;
    try {
      await workflowRequest(() => deleteWorkflowDefinition(deleteConfirmWf.id));
      setWorkflows(prev => prev.map(w => w.id === deleteConfirmWf.id ? { ...w, status: 'DELETED' } : w));
      setDeleteConfirmWf(null);
    } catch (err) { setWorkflowError(err.message); }
  };

  const confirmPurgeDelete = async () => {
    if (!purgeConfirmWf) return;
    try {
      await workflowRequest(() => purgeWorkflowDefinition(purgeConfirmWf.id));
      setWorkflows(prev => prev.filter(w => w.id !== purgeConfirmWf.id));
      setPurgeConfirmWf(null);
    } catch (err) { setWorkflowError(err.message); }
  };

  const handleRestoreWorkflow = async (id) => {
    try {
      await workflowRequest(() => restoreWorkflowDefinition(id));
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: 'ACTIVE' } : w));
    } catch (err) { setWorkflowError(err.message); }
  };

  const handlePlanningMode = async (wf, mode) => {
    try { acceptWorkflow(await workflowRequest(() => setWorkflowPlanningMode(wf.id, mode))); }
    catch (err) { setWorkflowError(err.message); }
  };

  const handleImportWorkflow = async (wf) => {
    try {
      const result = await workflowRequest(() => importWorkflowDefinition(wf));
      setWorkflows(prev => [result.workflow, ...prev.filter(w => w.id !== wf.id)]);
    } catch (err) { setWorkflowError(err.message); }
  };

  const handleCreateWorkflow = async (e) => {
    e.preventDefault();
    try {
      const code = workflowForm.workflow_code.trim() || `WF-${workflowForm.category.slice(0, 4)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const payload = {
        ...workflowForm,
        workflow_code: code,
        company_tenant: workflowForm.company_tenant || 'TNT00002',
        branch_code: workflowForm.branch_code || 'All'
      };
      const res = await workflowRequest(() => createWorkflowDefinition(payload));
      if (res && res.workflow) {
        setWorkflows(prev => {
          const filtered = prev.filter(w => w.id !== res.workflow.id);
          return [{ ...res.workflow, company_tenant: payload.company_tenant, branch_code: payload.branch_code }, ...filtered];
        });
      }
      setShowAddWorkflowModal(false);
      setWorkflowForm({
        workflow_name: '',
        workflow_code: '',
        category: 'PRODUCTION',
        description: '',
        planning_mode: 'ACTUAL_PLUS_TAT',
        company_tenant: 'TNT00002',
        branch_code: 'All'
      });
      alert('Workflow Created Successfully!');
      await loadWorkflowData();
    } catch (err) {
      alert('Error creating workflow: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '1.5rem', color: 'var(--text-primary, #f8fafc)' }}>
      {workflowError && <div role="alert" style={{ padding: '0.75rem', marginBottom: '1rem', color: '#b91c1c', background: '#fee2e2', borderRadius: '8px' }}>{workflowError}</div>}
      {workflowPending && <p role="status">Loading / saving workflow…</p>}
      {legacyWorkflowNotice && <p style={{ fontSize: '0.85rem' }}>Older local stage settings remain preserved in this browser. Supabase records are shown as the saved source.</p>}

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary, #0f172a)' }}>
            <GitMerge size={26} style={{ color: 'var(--accent-color, #2563eb)' }} />
            Universal Workflow Builder
          </h1>
          <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
            Build dynamic multi-stage process flows, assign designated workers & approvers, and track live executions in real-time.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            disabled={workflowPending}
            onClick={() => startWorkflowTransition(loadWorkflowData)}
            className="btn-action-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={15} /> Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowAddWorkflowModal(true)}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--accent-color, #2563eb)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Plus size={16} /> Create Workflow
          </button>
        </div>
      </div>

      {/* Enterprise B2B SaaS Segmented Sub-Tab Navigation (WhatsApp Official Style) */}
      <CRMTabs
        id="workflow-builder-tabs"
        label="Workflow Builder pages"
        items={[
          {
            id: 'active',
            label: 'Active Workflows',
            icon: GitMerge,
            count: workflows.filter(w => w.status !== 'DELETED').length
          },
          {
            id: 'tracker',
            label: 'Live Working Tracker',
            icon: PlayCircle,
            count: liveInstances.length
          },
          {
            id: 'trash',
            label: 'Trash Bin',
            icon: Trash2,
            count: workflows.filter(w => w.status === 'DELETED').length
          }
        ]}
        value={workflowFilter}
        onChange={handleFilterChange}
      />

      {/* SUB-PAGE 2: LIVE WORKING TRACKER VIEW */}
      {workflowFilter === 'tracker' && (
        <div style={{ color: 'var(--text-primary, #0f172a)', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <PlayCircle size={24} style={{ color: 'var(--accent-color, #2563eb)' }} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #0f172a)' }}>Live Working Execution & Operational Integration</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: '0.2rem 0 0 0' }}>
                Track real-time workflow orders, review completed stages, and advance pending operational handovers.
              </p>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-color, #2563eb)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <PlayCircle size={16} /> Active Live Operational Instances ({liveInstances.length})
            </h4>

            {liveInstances.length === 0 ? (
              <div style={{ background: 'var(--bg-primary, #f8fafc)', border: '1px dashed var(--border-strong, #cbd5e1)', borderRadius: '8px', padding: '1.75rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem' }}>
                No live workflow instances launched yet. Go to <strong style={{ color: 'var(--accent-color, #2563eb)' }}>Active Workflows</strong> and click <strong>&quot;🚀 Start Live Instance&quot;</strong> on any workflow to launch live execution!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {liveInstances.map(inst => {
                  const progressPct = Math.round((inst.history.filter(s => s.status === 'COMPLETED').length / (inst.total_stages || 1)) * 100);
                  const isDone = inst.status === 'COMPLETED';

                  return (
                    <div key={inst.id} style={{ background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-color, #2563eb)' }}>{inst.category}</span>
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.2rem 0 0 0', color: 'var(--text-primary, #0f172a)' }}>{inst.workflow_name} ({inst.reference_no})</h4>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Order / Customer: {inst.customer_name} {inst.notes && `• ${inst.notes}`}</div>
                        </div>

                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '6px', background: isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: isDone ? '#10b981' : '#f59e0b' }}>
                          {isDone ? '✓ COMPLETED' : `IN PROGRESS (Stage ${inst.current_stage_index + 1}/${inst.total_stages})`}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', marginTop: '0.6rem' }}>
                        Planning rule: <strong>{inst.planning_mode === 'PLANNED_PLUS_TAT' ? 'Planned + TAT' : 'Actual + TAT'}</strong>
                      </div>
                      <div style={{ display: 'grid', gap: '0.6rem', margin: '0.75rem 0' }}>
                        {inst.history.map(stage => (
                          <div key={stage.stage_instance_id || stage.stage_id} style={{ border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--bg-surface, #ffffff)', borderRadius: '6px', padding: '0.65rem', color: 'var(--text-primary, #0f172a)' }}>
                            <strong>[{stage.stage_code}] {stage.stage_name} — {stage.status || 'PENDING'}</strong>
                            <div style={{ fontSize: '0.8rem', marginTop: '0.3rem', color: 'var(--text-secondary, #64748b)' }}>Planned completion: {formatWorkflowIST(stage.planned_end)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Actual start: {formatWorkflowIST(stage.actual_start)}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Actual completion: {formatWorkflowIST(stage.actual_end)}</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{workflowVariance(stage.planned_end, stage.actual_end)}</div>
                            {stage.status === 'IN_PROGRESS' && (stage.fields || []).map(field => (
                              <label key={field.field_key} style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                                {field.field_name}{field.is_required ? ' *' : ''}
                                {field.data_type === 'BOOLEAN' ? (
                                  <select disabled={workflowPending} value={stageInputs[stage.stage_instance_id]?.[field.field_key] ?? ''}
                                    onChange={e => setStageInputs(prev => ({ ...prev, [stage.stage_instance_id]: { ...prev[stage.stage_instance_id], [field.field_key]: e.target.value } }))}
                                    style={{ display: 'block', width: '100%', padding: '0.4rem', color: 'var(--text-primary, #0f172a)', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '4px' }}>
                                    <option value="">Select</option><option value="true">Yes</option><option value="false">No</option>
                                  </select>
                                ) : (
                                  <input type={field.data_type === 'NUMBER' ? 'number' : field.data_type === 'DATE' ? 'date' : 'text'}
                                    step={field.data_type === 'NUMBER' ? 'any' : undefined} disabled={workflowPending}
                                    value={stageInputs[stage.stage_instance_id]?.[field.field_key] ?? ''}
                                    onChange={e => setStageInputs(prev => ({ ...prev, [stage.stage_instance_id]: { ...prev[stage.stage_instance_id], [field.field_key]: e.target.value } }))}
                                    style={{ display: 'block', width: '100%', padding: '0.4rem', color: 'var(--text-primary, #0f172a)', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '4px' }} />
                                )}
                              </label>
                            ))}
                            {stage.status === 'IN_PROGRESS' && stage.approval_required && (
                              <label style={{ display: 'block', marginTop: '0.6rem', color: 'var(--text-primary, #0f172a)' }}>
                                <input type="checkbox" disabled={workflowPending} checked={!!stageApprovals[stage.stage_instance_id]}
                                  onChange={e => setStageApprovals(prev => ({ ...prev, [stage.stage_instance_id]: e.target.checked }))} />
                                Confirm approval ({stage.approver_designation_name || 'configured approver / admin'})
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ background: 'var(--border-light, #e2e8f0)', height: '6px', borderRadius: '3px', overflow: 'hidden', margin: '0.6rem 0' }}>
                        <div style={{ background: isDone ? '#10b981' : 'var(--accent-color, #2563eb)', height: '100%', width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                          Current Stage: <strong style={{ color: 'var(--accent-color, #2563eb)' }}>[{inst.current_stage?.stage_code || 'S00'}] {inst.current_stage?.stage_name}</strong>
                          <span style={{ marginLeft: '0.6rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.75rem' }}>Worker: <strong>{inst.current_stage?.assigned_designation_name || inst.current_stage?.assigned_employee_name || 'Assigned Worker'}</strong></span>
                        </div>

                        {!isDone && inst.status === 'IN_PROGRESS' && (
                          <button
                            type="button"
                            disabled={workflowPending}
                            onClick={() => handleAdvanceStage(inst.id)}
                            style={{ padding: '0.4rem 0.8rem', background: 'var(--accent-color, #2563eb)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            {inst.current_stage_index + 1 >= inst.total_stages ? 'Complete Workflow' : `Complete Stage & Start Next (${inst.current_stage_index + 2}/${inst.total_stages})`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-PAGES 1 & 3: ACTIVE WORKFLOWS OR TRASH BIN VIEW */}
      {workflowFilter !== 'tracker' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
          {workflows.filter(w => workflowFilter === 'trash' ? w.status === 'DELETED' : w.status !== 'DELETED').length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', background: 'var(--bg-surface, #ffffff)', borderRadius: '12px', border: '1px dashed var(--border-light, #e2e8f0)', boxShadow: 'var(--shadow-sm)' }}>
              <GitMerge size={40} style={{ color: 'var(--accent-color, #2563eb)', margin: '0 auto 1rem auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                {workflowFilter === 'trash' ? 'Trash Bin is Empty' : 'No Workflows Defined Yet'}
              </h3>
              <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem', margin: '0.4rem 0 1rem 0' }}>
                {workflowFilter === 'trash' ? 'No deleted workflows in trash.' : 'Click "Create Workflow" to build custom stage-by-stage workflows.'}
              </p>
              {workflowFilter === 'active' && (
                <button onClick={() => setShowAddWorkflowModal(true)} style={{ padding: '0.5rem 1rem', background: 'var(--accent-color, #2563eb)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>+ Add First Workflow</button>
              )}
            </div>
          ) : (
            workflows.filter(w => workflowFilter === 'trash' ? w.status === 'DELETED' : w.status !== 'DELETED').map(wf => (
              <div key={wf.id} style={{ color: 'var(--text-primary, #0f172a)', background: 'var(--bg-surface, #ffffff)', border: wf.status === 'DELETED' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-light, #e2e8f0)', borderRadius: '12px', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-color, #2563eb)' }}>
                        {wf.category || 'WORKFLOW'}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'var(--bg-primary, #f1f5f9)', color: 'var(--text-secondary, #475569)', fontWeight: 600, border: '1px solid var(--border-light, #e2e8f0)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Building2 size={11} /> {wf.company_tenant || wf.tenant_code || 'TNT00002'}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: (wf.branch_code && wf.branch_code !== 'All') ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: (wf.branch_code && wf.branch_code !== 'All') ? '#2563eb' : '#059669', fontWeight: 600, border: '1px solid var(--border-light, #e2e8f0)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <MapPin size={11} /> {wf.branch_code && wf.branch_code !== 'All' ? formatBranchStandard(wf.branch_code) : 'All Branches'}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.4rem 0 0 0', color: 'var(--text-primary, #0f172a)' }}>{wf.workflow_name}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Code: {wf.workflow_code}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: wf.status === 'DELETED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: wf.status === 'DELETED' ? '#ef4444' : '#10b981', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {wf.status || 'ACTIVE'}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', marginBottom: '0.75rem' }}>
                  {wf.description || 'Universal business process workflow'}
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', borderTop: '1px solid var(--border-light, #e2e8f0)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{wf.persisted ? 'Saved in Supabase' : 'Local — not saved'} · Version <strong style={{ color: 'var(--accent-color, #2563eb)' }}>{wf.workflow_versions?.[0]?.version_number || 1}</strong></span>
                  <span style={{ fontSize: '0.75rem', color: '#10b981' }}>{wf.stages?.length || 0} Stages</span>
                </div>

                <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                  Next stage planning rule
                  <select aria-label={`Planning rule for ${wf.workflow_name}`} disabled={workflowPending}
                    value={wf.planning_mode || 'ACTUAL_PLUS_TAT'} onChange={e => handlePlanningMode(wf, e.target.value)}
                    style={{ display: 'block', width: '100%', padding: '0.5rem', marginTop: '0.3rem', color: 'var(--text-primary, #0f172a)', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px' }}>
                    <option value="ACTUAL_PLUS_TAT">Previous Actual Completion + TAT</option>
                    <option value="PLANNED_PLUS_TAT">Previous Planned Completion + TAT</option>
                  </select>
                </label>
                {!wf.persisted && (
                  <button
                    disabled={workflowPending}
                    onClick={() => handleImportWorkflow(wf)}
                    style={{ marginTop: '0.5rem', width: '100%', padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px dashed var(--accent-color, #2563eb)', borderRadius: '6px', color: 'var(--accent-color, #2563eb)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ☁️ Save Local Workflow to Supabase
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {wf.status !== 'DELETED' ? (
                    <>
                      <button
                        disabled={workflowPending || !wf.stages?.length}
                        onClick={async () => {
                          let targetWf = wf;
                          if (!targetWf.persisted || !targetWf.workflow_versions?.[0]?.id) {
                            try {
                              const res = await workflowRequest(() => importWorkflowDefinition(targetWf));
                              if (res?.workflow) {
                                targetWf = res.workflow;
                                setWorkflows(prev => [res.workflow, ...prev.filter(w => w.id !== wf.id && w.workflow_code !== wf.workflow_code)]);
                              }
                            } catch (e) {
                              console.warn('Auto-save on launch:', e?.message);
                            }
                          }
                          launchRequestKey.current = crypto.randomUUID();
                          setLiveLaunchWf(targetWf);
                        }}
                        style={{ padding: '0.5rem 0.8rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                        title="Launch Live Workflow Order Instance"
                      >
                        <PlayCircle size={15} /> Start Live Instance
                      </button>
                      <button
                        disabled={workflowPending}
                        onClick={() => handleOpenConfigureStages(wf)}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', color: 'var(--accent-color, #2563eb)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <Settings size={15} /> Configure Stages ({wf.stages?.length || 0})
                      </button>
                      <button
                        onClick={() => setDeleteConfirmWf(wf)}
                        title="Move to Trash Bin"
                        style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <button
                        onClick={() => handleRestoreWorkflow(wf.id)}
                        style={{ flex: 1, padding: '0.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', color: '#34d399', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <RotateCcw size={15} /> Restore
                      </button>
                      <button
                        onClick={() => setPurgeConfirmWf(wf)}
                        style={{ padding: '0.5rem 0.8rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', color: '#f87171', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        title="Hide Workflow and Preserve History"
                      >
                        <XCircle size={15} /> Hide Workflow
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CENTERED MODAL: LAUNCH LIVE WORKFLOW INSTANCE */}
      {liveLaunchWf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlayCircle size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #0f172a)' }}>Launch Live Workflow Execution</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-color, #2563eb)' }}>{liveLaunchWf.workflow_name} ({liveLaunchWf.stages?.length || 0} Stages)</div>
                </div>
              </div>
              <button onClick={() => setLiveLaunchWf(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {workflowError && <p role="alert" style={{ color: '#ef4444' }}>{workflowError}</p>}
            <form onSubmit={handleStartLiveExecution}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.3rem' }}>Order / Reference Number</label>
                <input
                  type="text"
                  required
                  value={liveForm.reference_no}
                  onChange={e => setLiveForm({ ...liveForm, reference_no: e.target.value })}
                  placeholder="e.g. SO-2026-001 / PO-9812 / PR-004"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.3rem' }}>Customer / Department Name</label>
                <input
                  type="text"
                  required
                  value={liveForm.customer_name}
                  onChange={e => setLiveForm({ ...liveForm, customer_name: e.target.value })}
                  placeholder="e.g. Swan Agro / Punjab Dealer Indent"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.3rem' }}>Operational Branch / Plant *</label>
                <UniversalBranchSelect
                  value={liveForm.branch_code || (liveLaunchWf.branch_code && liveLaunchWf.branch_code !== 'All' ? liveLaunchWf.branch_code : 'TNT00002-B0002')}
                  onChange={val => setLiveForm({ ...liveForm, branch_code: val })}
                  allValue="All"
                  allLabel="All Branches (Tenant-wide)"
                  placeholder="Select Branch"
                  mode="form"
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.3rem' }}>Execution Instructions / Notes (Optional)</label>
                <textarea
                  value={liveForm.notes}
                  onChange={e => setLiveForm({ ...liveForm, notes: e.target.value })}
                  placeholder="e.g. Priority Rotavator delivery - Stage S00 Entry required"
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setLiveLaunchWf(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '8px', color: 'var(--text-secondary, #64748b)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={workflowPending}
                  style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <PlayCircle size={16} /> 🚀 Launch Live Instance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CENTERED MODAL: MOVE TO TRASH CONFIRMATION */}
      {deleteConfirmWf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '460px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <Trash2 size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary, #0f172a)' }}>
              Move Workflow to Trash Bin?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #64748b)', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              Are you sure you want to move <strong style={{ color: 'var(--accent-color, #2563eb)' }}>{deleteConfirmWf.workflow_name}</strong> ({deleteConfirmWf.workflow_code}) to Trash Bin? You can restore it anytime from Trash Bin.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmWf(null)}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '8px', color: 'var(--text-secondary, #64748b)', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSoftDelete}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: '#ef4444', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <Trash2 size={16} /> Yes, Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CENTERED MODAL: PERMANENT PURGE CONFIRMATION */}
      {purgeConfirmWf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '460px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <XCircle size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary, #0f172a)' }}>
              Permanently Delete Workflow?
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #64748b)', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              Are you sure you want to hide <strong style={{ color: '#ef4444' }}>{purgeConfirmWf.workflow_name}</strong>? Historical execution records will be preserved.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setPurgeConfirmWf(null)}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '8px', color: 'var(--text-secondary, #64748b)', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPurgeDelete}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: '#dc2626', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <XCircle size={16} /> Hide Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STAGE CONFIGURATOR */}
      {selectedWfForStages && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ color: 'var(--text-primary, #0f172a)', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-color, #2563eb)', background: 'rgba(59,130,246,0.12)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{selectedWfForStages.category}</span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.4rem 0 0 0', color: 'var(--text-primary, #0f172a)' }}>{selectedWfForStages.workflow_name}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Code: {selectedWfForStages.workflow_code}</div>
              </div>
              <button onClick={() => setSelectedWfForStages(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {workflowError && <p role="alert" style={{ color: '#ef4444' }}>{workflowError}</p>}
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-primary, #0f172a)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlayCircle size={16} style={{ color: 'var(--accent-color, #2563eb)' }} />
              <span><strong>Operational Location:</strong> Launch an instance from Workflow Builder to track planned and actual completion. Running instances retain their stage settings.</span>
            </div>

            {/* Configured Stages List with Reordering */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '0.75rem' }}>
                Configured Stages ({selectedWfForStages.stages?.length || 0})
              </h3>
              {(!selectedWfForStages.stages || selectedWfForStages.stages.length === 0) ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', background: 'var(--bg-primary, #f8fafc)', padding: '1rem', borderRadius: '8px', textAlign: 'center', border: '1px dashed var(--border-light, #e2e8f0)' }}>No stages added yet. Fill out the assignment form below to add Stage #1.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {selectedWfForStages.stages.map((stg, idx) => {
                    const stageCode = stg.stage_code || `S${String(idx).padStart(2, '0')}`;
                    const isExpanded = expandedStageId === (stg.id || idx);

                    return (
                      <div key={stg.id || idx} style={{ background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveStageUp(idx)}
                                style={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '3px', color: idx === 0 ? 'var(--text-secondary, #94a3b8)' : 'var(--accent-color, #2563eb)', cursor: idx === 0 ? 'not-allowed' : 'pointer', padding: '1px 3px' }}
                                title="Move Stage Up"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === selectedWfForStages.stages.length - 1}
                                onClick={() => handleMoveStageDown(idx)}
                                style={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '3px', color: idx === selectedWfForStages.stages.length - 1 ? 'var(--text-secondary, #94a3b8)' : 'var(--accent-color, #2563eb)', cursor: idx === selectedWfForStages.stages.length - 1 ? 'not-allowed' : 'pointer', padding: '1px 3px' }}
                                title="Move Stage Down"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>

                            <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'var(--accent-color, #2563eb)', color: '#fff', letterSpacing: '0.5px' }}>
                              {stageCode}
                            </span>

                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #0f172a)' }}>{stg.stage_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', display: 'flex', gap: '0.6rem', marginTop: '0.2rem' }}>
                                <span>Type: <strong>{stg.execution_type}</strong></span>
                                <span>| Worker: <strong style={{ color: 'var(--accent-color, #2563eb)' }}>
                                  {stg.assigned_designation_name ||
                                   (Array.isArray(stg.assigned_employees) && stg.assigned_employees.length > 1
                                     ? `${stg.assigned_employees.map(e => e.emp_name || e.name).join(', ')} (${stg.assigned_employees.length} assigned)`
                                     : (stg.assigned_employee_name || 'Unassigned'))}
                                </strong></span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-color, #2563eb)', padding: '0.2rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Clock size={12} /> TAT {stg.tat_formatted_display || `${stg.planned_tat_hours || 24}h`}
                            </span>
                            {stg.approval_required && (
                              <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '0.2rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckSquare size={12} /> Sign-off: {stg.approver_designation_name || 'Designation Required'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedStageId(isExpanded ? null : (stg.id || idx))}
                              style={{ padding: '0.3rem 0.6rem', background: isExpanded ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: isExpanded ? '#fff' : 'var(--text-primary, #0f172a)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <FileText size={12} /> Stage Fields ({(stg.fields || []).length})
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED STAGE FIELDS MAPPING CONFIGURATOR */}
                        {isExpanded && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-strong, #cbd5e1)', background: 'var(--bg-surface, #ffffff)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-color, #2563eb)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <ListPlus size={14} /> Stage [{stageCode}] Input & Validation Fields:
                              </h4>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>Snapshot Mode: LIVE_REFERENCE vs STAGE_SNAPSHOT</span>
                            </div>

                            {(!stg.fields || stg.fields.length === 0) ? (
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', margin: '0.4rem 0' }}>No specific fields mapped for this stage yet.</p>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                {stg.fields.map((fld, fIdx) => {
                                  const fldId = fld.id || fld.field_key || `fld-${fIdx}`;
                                  const isEditing = editingField?.fieldId === fldId && editingField?.stageId === stg.id;

                                  if (isEditing) {
                                    return (
                                      <form key={fldId} onSubmit={handleUpdateStageField} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--accent-color, #2563eb)', padding: '0.3rem 0.5rem', borderRadius: '6px' }}>
                                        <input
                                          type="text"
                                          required
                                          value={editingField.field_name}
                                          onChange={e => setEditingField({ ...editingField, field_name: e.target.value })}
                                          style={{ padding: '0.2rem 0.4rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '4px', color: 'var(--text-primary, #0f172a)', fontSize: '0.75rem', width: '120px' }}
                                        />
                                        <select
                                          value={editingField.data_type}
                                          onChange={e => setEditingField({ ...editingField, data_type: e.target.value })}
                                          style={{ padding: '0.2rem 0.4rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '4px', color: 'var(--text-primary, #0f172a)', fontSize: '0.75rem' }}
                                        >
                                          <option value="TEXT">TEXT</option>
                                          <option value="NUMBER">NUMBER</option>
                                          <option value="SELECT">SELECT</option>
                                          <option value="FILE">FILE</option>
                                          <option value="DATE">DATE</option>
                                        </select>
                                        <select
                                          value={editingField.is_required ? 'REQ' : 'OPT'}
                                          onChange={e => setEditingField({ ...editingField, is_required: e.target.value === 'REQ' })}
                                          style={{ padding: '0.2rem 0.4rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '4px', color: 'var(--text-primary, #0f172a)', fontSize: '0.75rem' }}
                                        >
                                          <option value="REQ">Required*</option>
                                          <option value="OPT">Optional</option>
                                        </select>
                                        <button type="submit" style={{ padding: '0.2rem 0.5rem', background: '#10b981', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                                          Save
                                        </button>
                                        <button type="button" onClick={() => setEditingField(null)} style={{ padding: '0.2rem 0.4rem', background: 'transparent', border: 'none', color: 'var(--text-secondary, #64748b)', fontSize: '0.7rem', cursor: 'pointer' }}>
                                          Cancel
                                        </button>
                                      </form>
                                    );
                                  }

                                  return (
                                    <div key={fldId} style={{ background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <Tag size={10} style={{ color: 'var(--accent-color, #2563eb)' }} />
                                      <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{fld.field_name}</strong>
                                      <span style={{ color: 'var(--text-secondary, #64748b)' }}>({fld.data_type})</span>
                                      {fld.is_required && <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>}

                                      <button
                                        type="button"
                                        onClick={() => setEditingField({ stageId: stg.id, fieldId: fldId, field_name: fld.field_name, data_type: fld.data_type || 'TEXT', is_required: !!fld.is_required })}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--accent-color, #2563eb)', cursor: 'pointer', padding: '0 2px', fontSize: '0.7rem' }}
                                        title="Edit Field"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteStageField(stg.id, fld.id || fldId)}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '0.7rem' }}
                                        title="Delete Field"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Add New Field to Stage */}
                            <form onSubmit={(e) => handleAddStageField(stg.id, e)} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                placeholder="+ Field Name (e.g. Batch Code, Heat No)"
                                value={fieldForm.field_name}
                                onChange={e => setFieldForm({ ...fieldForm, field_name: e.target.value })}
                                style={{ padding: '0.3rem 0.6rem', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.75rem', minWidth: '180px' }}
                              />
                              <select
                                value={fieldForm.data_type}
                                onChange={e => setFieldForm({ ...fieldForm, data_type: e.target.value })}
                                style={{ padding: '0.3rem 0.5rem', background: 'var(--bg-primary, #f8fafc)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.75rem' }}
                              >
                                <option value="TEXT">TEXT Input</option>
                                <option value="NUMBER">NUMBER Value</option>
                                <option value="SELECT">SELECT Dropdown</option>
                                <option value="FILE">FILE / Document Upload</option>
                                <option value="DATE">DATE Selector</option>
                              </select>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={fieldForm.is_required}
                                  onChange={e => setFieldForm({ ...fieldForm, is_required: e.target.checked })}
                                />
                                Mandatory / Required*
                              </label>
                              <button
                                type="submit"
                                style={{ padding: '0.3rem 0.75rem', background: 'var(--accent-color, #2563eb)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                + Add Field
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add New Stage & Assignment Form */}
            <form onSubmit={handleSaveStage} style={{ background: 'var(--bg-primary, #f8fafc)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light, #e2e8f0)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-color, #2563eb)', marginTop: 0, marginBottom: '0.75rem' }}>
                + Add Stage #{(selectedWfForStages.stages?.length || 0) + 1} & Assign Work Roles
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Stage Name</label>
                  <input type="text" required value={stageForm.stage_name} onChange={e => setStageForm({ ...stageForm, stage_name: e.target.value })} placeholder="e.g. Cutting / Welding / Quality Test" style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Execution Type</label>
                  <select value={stageForm.execution_type} onChange={e => setStageForm({ ...stageForm, execution_type: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}>
                    <option value="SEQUENTIAL">SEQUENTIAL (Step by Step)</option>
                    <option value="PARALLEL">PARALLEL (Simultaneous Execution)</option>
                    <option value="CONDITIONAL_BRANCH">CONDITIONAL BRANCH</option>
                  </select>
                </div>
              </div>

              {/* Work Assignment Rules */}
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed var(--border-strong, #cbd5e1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-color, #2563eb)', display: 'block', marginBottom: '0.4rem' }}>
                  👷 Who Will Perform The Work At This Stage? (Work Assignment)
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Assignee Rule</label>
                    <select value={stageForm.assignee_type} onChange={e => setStageForm({ ...stageForm, assignee_type: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}>
                      <option value="BY_DESIGNATION">Assign By Designation (All employees of designation)</option>
                      <option value="SPECIFIC_EMPLOYEE">Assign Specific Employee</option>
                      <option value="REPORTING_MANAGER">Reporting Manager</option>
                    </select>
                  </div>

                  {stageForm.assignee_type === 'BY_DESIGNATION' && (
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Assigned Worker Designation</label>
                      <select value={stageForm.assigned_designation_id} onChange={e => setStageForm({ ...stageForm, assigned_designation_id: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}>
                        <option value="">-- Select Worker Designation --</option>
                        {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                      </select>
                    </div>
                  )}

                  {stageForm.assignee_type === 'SPECIFIC_EMPLOYEE' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>
                        Assigned Employee(s) — Search & Select (Multiple Selection Allowed)
                      </label>
                      <StageEmployeeMultiSelect
                        employees={employees}
                        selectedIds={stageForm.assigned_employee_ids || (stageForm.assigned_employee_id ? [stageForm.assigned_employee_id] : [])}
                        onChange={(newIds, newObjs) => {
                          setStageForm({
                            ...stageForm,
                            assigned_employee_ids: newIds,
                            assigned_employees: newObjs,
                            assigned_employee_id: newIds[0] || ''
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* TAT & Sign-off */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Target TAT (Turnaround Time)</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="1"
                      required
                      value={stageForm.tat_value || ''}
                      onChange={e => setStageForm({ ...stageForm, tat_value: Number(e.target.value) })}
                      placeholder="e.g. 15, 30, 24"
                      style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}
                    />
                    <select
                      value={stageForm.tat_unit || 'HOURS'}
                      onChange={e => setStageForm({ ...stageForm, tat_unit: e.target.value })}
                      style={{ padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--accent-color, #2563eb)', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      <option value="MINUTES">Minutes (Mins)</option>
                      <option value="HOURS">Hours (Hrs)</option>
                      <option value="DAYS">Days</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Approval Sign-off Required?</label>
                  <select value={stageForm.approval_required ? 'YES' : 'NO'} onChange={e => setStageForm({ ...stageForm, approval_required: e.target.value === 'YES' })} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}>
                    <option value="NO">NO (Direct Completion)</option>
                    <option value="YES">YES (Requires Manager/Quality Sign-off)</option>
                  </select>
                </div>
              </div>

              {stageForm.approval_required && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', display: 'block', marginBottom: '0.2rem' }}>Approver Designation (Sign-off Authority)</label>
                  <select value={stageForm.approver_designation_id} onChange={e => setStageForm({ ...stageForm, approver_designation_id: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}>
                    <option value="">-- Select Approver Designation --</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="submit" style={{ padding: '0.5rem 1.2rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                  + Save Stage & Work Assignment
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setSelectedWfForStages(null)} className="btn-action-secondary">Done / Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD WORKFLOW */}
      {showAddWorkflowModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Create Enterprise Workflow</h2>
            {workflowError && <p role="alert" style={{ color: '#b91c1c' }}>{workflowError}</p>}
            <form onSubmit={handleCreateWorkflow}>
              <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Workflow Name *</label>
                  <input type="text" required value={workflowForm.workflow_name} onChange={e => setWorkflowForm({ ...workflowForm, workflow_name: e.target.value })} placeholder="e.g. Quality Inspection Process" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Workflow Code (Prefix)</label>
                  <input type="text" required value={workflowForm.workflow_code} onChange={e => setWorkflowForm({ ...workflowForm, workflow_code: e.target.value.toUpperCase() })} placeholder="e.g. WF-QUAL" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Category</label>
                  <select value={workflowForm.category} onChange={e => setWorkflowForm({ ...workflowForm, category: e.target.value })} style={{ width: '100%' }}>
                    <option value="PRODUCTION">Production</option>
                    <option value="QUALITY">Quality & Testing</option>
                    <option value="PURCHASE">Purchase & Procurement</option>
                    <option value="DISPATCH">Logistics & Dispatch</option>
                    <option value="SALES">Sales & Billing</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Target Company / Tenant *</label>
                    <select
                      value={workflowForm.company_tenant || 'TNT00002'}
                      onChange={e => setWorkflowForm({ ...workflowForm, company_tenant: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-strong, #cbd5e1)', borderRadius: '6px', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem' }}
                    >
                      <option value="TNT00002">TNT00002 — New Swan Group</option>
                      <option value="TNT00001">TNT00001 — SuPuja Creations</option>
                      <option value="TNT00003">TNT00003 — Testing New Swan Group</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Assigned Branch / Plant *</label>
                    <UniversalBranchSelect
                      value={workflowForm.branch_code || 'All'}
                      onChange={val => setWorkflowForm({ ...workflowForm, branch_code: val })}
                      allValue="All"
                      allLabel="All Branches (Tenant-wide)"
                      placeholder="Select Branch"
                      mode="form"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Planning Rule</label>
                  <select value={workflowForm.planning_mode} disabled={workflowPending} onChange={e => setWorkflowForm({ ...workflowForm, planning_mode: e.target.value })} style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <option value="ACTUAL_PLUS_TAT">Actual Completion + TAT</option>
                    <option value="PLANNED_PLUS_TAT">Planned Completion + TAT</option>
                  </select>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Description</label>
                  <textarea value={workflowForm.description} onChange={e => setWorkflowForm({ ...workflowForm, description: e.target.value })} placeholder="Brief workflow purpose" style={{ width: '100%', minHeight: '60px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddWorkflowModal(false)} className="btn-action-secondary">Cancel</button>
                <button type="submit" disabled={workflowPending} className="btn-primary" style={{ borderRadius: '8px' }}>Publish Workflow (v1.0)</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
