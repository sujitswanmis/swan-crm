'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Network, ShieldCheck, UserCheck, Plus, History, ArrowRightLeft, Layers, MapPin, RefreshCw, CheckCircle2, ChevronRight, GitMerge, FileCode, Clock, CheckSquare, Settings, Trash2, RotateCcw, ArrowUp, ArrowDown, User, PlayCircle, FileText, ListPlus, Tag, XCircle } from 'lucide-react';
import { getCompanies, createCompany, getWmsDepartments, createWmsDepartment, createSubDepartment, getWorkLocations, createWorkLocation } from '@/app/actions/organization';
import { getDesignations, createDesignation } from '@/app/actions/designation';
import { getEmployeesMaster, createEmployeeMaster, transferEmployeeDesignation, getEmployeeHistory } from '@/app/actions/employee';
import { getAccessProfiles } from '@/app/actions/accessControl';
import { getRecursiveSubordinatesTree } from '@/app/actions/hierarchy';
import { getWorkflowDefinitions, createWorkflowDefinition, addWorkflowStage, deleteWorkflowDefinition, restoreWorkflowDefinition, mapStageField, purgeWorkflowDefinition } from '@/app/actions/workflowEngine';
import LocationTerritoryModule from './LocationTerritoryModule';

const DESIGNATION_CATEGORIES = [
  'Management', 'Head of Department', 'Senior Manager', 'Manager',
  'Assistant Manager', 'Team Leader', 'Coordinator', 'Executive',
  'Telecaller', 'Operator', 'Worker', 'Trainee', 'Consultant', 'Contract Employee'
];

const DESIGNATION_LEVELS = [
  { level: 'L01', title: 'Top Management' },
  { level: 'L02', title: 'Senior Management' },
  { level: 'L03', title: 'Department Head' },
  { level: 'L04', title: 'Manager' },
  { level: 'L05', title: 'Assistant Manager' },
  { level: 'L06', title: 'Team Leader' },
  { level: 'L07', title: 'Senior Executive' },
  { level: 'L08', title: 'Executive' },
  { level: 'L09', title: 'Coordinator' },
  { level: 'L10', title: 'Operator / Trainee' }
];

export default function UniversalWorkplaceModule({ moduleAccess = {}, userRole = '' }) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const workplaceAccess = moduleAccess['workplace'];

  const canViewTab = (tabId) => {
    if (isAdmin) return true;
    if (!workplaceAccess || workplaceAccess.view === false) return false;
    if (workplaceAccess.sub_items && workplaceAccess.sub_items[tabId]) {
      return workplaceAccess.sub_items[tabId].view !== false;
    }
    return true;
  };

  const [activeSubTab, setActiveSubTab] = useState(() => {
    const tabs = ['employees', 'designations', 'org', 'access', 'location_territory', 'workflow'];
    const firstAllowed = tabs.find(t => canViewTab(t));
    return firstAllowed || 'employees';
  });
  const [loading, setLoading] = useState(false);

  // Data states
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [accessProfiles, setAccessProfiles] = useState([]);
  const [workflows, setWorkflows] = useState([]);

  // Modals
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({ code: '', name: '', legal_name: '', gstin: '', pan: '' });

  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ code: '', name: '' });

  const [showAddDesigModal, setShowAddDesigModal] = useState(false);
  const [desigForm, setDesigForm] = useState({
    designation_code: '',
    designation_name: '',
    category: 'Executive',
    designation_level: 'L08',
    hierarchy_rank: 50,
    is_manager_eligible: false,
    is_approval_authority: false
  });

  const [showAddWorkflowModal, setShowAddWorkflowModal] = useState(false);
  const [workflowForm, setWorkflowForm] = useState({
    workflow_name: '',
    workflow_code: '',
    category: 'PRODUCTION',
    description: ''
  });

  // Stage Planner Modal & Trash State
  const [workflowFilter, setWorkflowFilter] = useState('active'); // 'active' | 'trash' | 'tracker'
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

  const handleSaveStage = async (e) => {
    e.preventDefault();
    if (!selectedWfForStages) return;
    try {
      const verId = selectedWfForStages.workflow_versions?.[0]?.id || `ver-${selectedWfForStages.id}`;
      const approverDesig = designations.find(d => d.id === stageForm.approver_designation_id);
      const workerDesig = designations.find(d => d.id === stageForm.assigned_designation_id);
      const workerEmp = employees.find(e => e.id === stageForm.assigned_employee_id);

      const stageIndex = (selectedWfForStages.stages || []).length;
      const canonicalCode = `S${String(stageIndex).padStart(2, '0')}`; // S00, S01, S02, S03...

      // Calculate TAT display and hours
      const val = stageForm.tat_value || 1;
      const unit = stageForm.tat_unit || 'HOURS';
      let hours = val;
      let displayStr = `${val} Hours`;

      if (unit === 'MINUTES') {
        hours = parseFloat((val / 60).toFixed(2));
        displayStr = `${val} Mins`;
      } else if (unit === 'DAYS') {
        hours = val * 24;
        displayStr = `${val} Days`;
      } else {
        displayStr = `${val} Hours`;
      }

      // Default fields based on S00 / S01 stage type
      let defaultFields = [];
      if (stageIndex === 0) { // S00 Initial Entry
        defaultFields = [
          { id: `fld-${Date.now()}-1`, field_name: 'Item & Material Name', field_key: 'item_name', data_type: 'TEXT', is_required: true, snapshot_mode: 'STAGE_SNAPSHOT' },
          { id: `fld-${Date.now()}-2`, field_name: 'Required Quantity', field_key: 'req_qty', data_type: 'NUMBER', is_required: true, snapshot_mode: 'LIVE_REFERENCE' },
          { id: `fld-${Date.now()}-3`, field_name: 'Target Priority', field_key: 'priority', data_type: 'TEXT', is_required: false, snapshot_mode: 'LIVE_REFERENCE' }
        ];
      } else if (stageIndex === 1) { // S01 Processing / Inspection
        defaultFields = [
          { id: `fld-${Date.now()}-4`, field_name: 'Quality Inspection Verdict', field_key: 'quality_verdict', data_type: 'TEXT', is_required: true, snapshot_mode: 'STAGE_SNAPSHOT' },
          { id: `fld-${Date.now()}-5`, field_name: 'Inspector Remarks', field_key: 'inspector_remarks', data_type: 'TEXT', is_required: false, snapshot_mode: 'LIVE_REFERENCE' }
        ];
      }

      const createdStage = await addWorkflowStage(verId, {
        ...stageForm,
        planned_tat_hours: hours,
        tat_formatted_display: displayStr,
        stage_code: canonicalCode,
        stage_order: stageIndex + 1,
        approver_designation_name: approverDesig?.designation_name || '',
        assigned_designation_name: workerDesig?.designation_name || '',
        assigned_employee_name: workerEmp?.emp_name || ''
      });

      createdStage.stage_code = canonicalCode;
      createdStage.fields = defaultFields;
      createdStage.tat_formatted_display = displayStr;
      createdStage.planned_tat_hours = hours;

      const updatedStages = [...(selectedWfForStages.stages || []), createdStage];
      const updatedWf = { ...selectedWfForStages, stages: updatedStages };

      setSelectedWfForStages(updatedWf);
      setWorkflows(prev => {
        const exists = prev.some(w => String(w.id) === String(updatedWf.id));
        const next = exists
          ? prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w)
          : [updatedWf, ...prev];
        try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
        return next;
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
      const newFld = await mapStageField(stageId, fieldForm);
      const updatedStages = selectedWfForStages.stages.map(stg => {
        if (stg.id === stageId) {
          const existingFlds = stg.fields || [];
          return { ...stg, fields: [...existingFlds, newFld] };
        }
        return stg;
      });

      const updatedWf = { ...selectedWfForStages, stages: updatedStages };
      setSelectedWfForStages(updatedWf);
      setWorkflows(prev => {
        const next = prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w);
        try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
        return next;
      });

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

  const [editingField, setEditingField] = useState(null); // { stageId, fieldId, field_name, data_type, is_required }

  const handleDeleteStageField = (stageId, fieldId) => {
    if (!selectedWfForStages) return;
    const updatedStages = selectedWfForStages.stages.map(stg => {
      if (stg.id === stageId) {
        const remainingFlds = (stg.fields || []).filter(f => (f.id || f.field_key) !== fieldId);
        return { ...stg, fields: remainingFlds };
      }
      return stg;
    });

    const updatedWf = { ...selectedWfForStages, stages: updatedStages };
    setSelectedWfForStages(updatedWf);
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
  };

  const handleUpdateStageField = (e) => {
    e.preventDefault();
    if (!editingField || !selectedWfForStages) return;

    const { stageId, fieldId, field_name, data_type, is_required } = editingField;
    const updatedStages = selectedWfForStages.stages.map(stg => {
      if (stg.id === stageId) {
        const updatedFlds = (stg.fields || []).map(f => {
          if ((f.id || f.field_key) === fieldId) {
            return { ...f, field_name, data_type, is_required };
          }
          return f;
        });
        return { ...stg, fields: updatedFlds };
      }
      return stg;
    });

    const updatedWf = { ...selectedWfForStages, stages: updatedStages };
    setSelectedWfForStages(updatedWf);
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });

    setEditingField(null);
    alert(`Field "${field_name}" updated successfully!`);
  };

  const handleMoveStageUp = (index) => {
    if (index === 0 || !selectedWfForStages?.stages) return;
    const stagesCopy = [...selectedWfForStages.stages];
    const temp = stagesCopy[index - 1];
    stagesCopy[index - 1] = stagesCopy[index];
    stagesCopy[index] = temp;

    const updatedWf = { ...selectedWfForStages, stages: stagesCopy };
    setSelectedWfForStages(updatedWf);
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
  };

  const handleMoveStageDown = (index) => {
    if (!selectedWfForStages?.stages || index >= selectedWfForStages.stages.length - 1) return;
    const stagesCopy = [...selectedWfForStages.stages];
    const temp = stagesCopy[index + 1];
    stagesCopy[index + 1] = stagesCopy[index];
    stagesCopy[index] = temp;

    const updatedWf = { ...selectedWfForStages, stages: stagesCopy };
    setSelectedWfForStages(updatedWf);
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(updatedWf.id) ? updatedWf : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
  };

  // Centered Delete Modal States
  const [deleteConfirmWf, setDeleteConfirmWf] = useState(null);
  const [purgeConfirmWf, setPurgeConfirmWf] = useState(null);

  // Live Workflow Instance Execution State
  const [liveInstances, setLiveInstances] = useState([]);
  const [liveLaunchWf, setLiveLaunchWf] = useState(null);
  const [liveForm, setLiveForm] = useState({ reference_no: '', customer_name: '', notes: '' });

  useEffect(() => {
    try {
      const rawInst = localStorage.getItem('crm_live_workflow_instances');
      if (rawInst) setLiveInstances(JSON.parse(rawInst));
    } catch (e) {}
  }, []);

  const handleStartLiveExecution = (e) => {
    e.preventDefault();
    if (!liveLaunchWf) return;

    const stages = liveLaunchWf.stages || [];
    const firstStage = stages[0] || { stage_name: 'Initial Entry', stage_code: 'S00', planned_tat_hours: 24 };

    const newInst = {
      id: `inst-${Date.now()}`,
      workflow_id: liveLaunchWf.id,
      workflow_name: liveLaunchWf.workflow_name,
      workflow_code: liveLaunchWf.workflow_code,
      category: liveLaunchWf.category,
      reference_no: liveForm.reference_no || `REF-${Date.now().toString().slice(-6)}`,
      customer_name: liveForm.customer_name || 'Internal Order',
      notes: liveForm.notes || '',
      current_stage_index: 0,
      total_stages: stages.length || 1,
      current_stage: firstStage,
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
      history: [{
        stage_code: firstStage.stage_code || 'S00',
        stage_name: firstStage.stage_name,
        entered_at: new Date().toISOString(),
        status: 'CURRENT'
      }]
    };

    const updatedInsts = [newInst, ...liveInstances];
    setLiveInstances(updatedInsts);
    try {
      localStorage.setItem('crm_live_workflow_instances', JSON.stringify(updatedInsts));
    } catch (err) {}

    setLiveLaunchWf(null);
    setLiveForm({ reference_no: '', customer_name: '', notes: '' });
    setWorkflowFilter('tracker');
    alert(`🚀 Live Execution Started for ${newInst.workflow_name} (${newInst.reference_no})!\nCurrently at Stage [${firstStage.stage_code || 'S00'}]: ${firstStage.stage_name}`);
  };

  const handleAdvanceStage = (instId) => {
    const updatedInsts = liveInstances.map(inst => {
      if (inst.id === instId) {
        const wf = workflows.find(w => String(w.id) === String(inst.workflow_id));
        const stages = wf?.stages || [];
        const nextIndex = inst.current_stage_index + 1;

        if (nextIndex >= stages.length) {
          return {
            ...inst,
            status: 'COMPLETED',
            completed_at: new Date().toISOString()
          };
        } else {
          const nextStage = stages[nextIndex];
          return {
            ...inst,
            current_stage_index: nextIndex,
            current_stage: nextStage,
            history: [
              ...inst.history,
              {
                stage_code: nextStage.stage_code || `S${String(nextIndex).padStart(2, '0')}`,
                stage_name: nextStage.stage_name,
                entered_at: new Date().toISOString(),
                status: 'CURRENT'
              }
            ]
          };
        }
      }
      return inst;
    });

    setLiveInstances(updatedInsts);
    try {
      localStorage.setItem('crm_live_workflow_instances', JSON.stringify(updatedInsts));
    } catch (err) {}
  };

  const confirmSoftDelete = async () => {
    if (!deleteConfirmWf) return;
    const targetId = deleteConfirmWf.id;
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(targetId) ? { ...w, status: 'DELETED' } : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
    setDeleteConfirmWf(null);
    try {
      await deleteWorkflowDefinition(targetId);
    } catch (err) { console.error('Error soft deleting workflow:', err); }
  };

  const confirmPurgeDelete = async () => {
    if (!purgeConfirmWf) return;
    const targetId = purgeConfirmWf.id;
    setWorkflows(prev => {
      const next = prev.filter(w => String(w.id) !== String(targetId));
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
    setPurgeConfirmWf(null);
    try {
      await purgeWorkflowDefinition(targetId);
    } catch (err) { console.error('Error purging workflow:', err); }
  };

  const handleRestoreWorkflow = async (id) => {
    setWorkflows(prev => {
      const next = prev.map(w => String(w.id) === String(id) ? { ...w, status: 'ACTIVE' } : w);
      try { localStorage.setItem('crm_custom_workflows', JSON.stringify(next)); } catch (err) {}
      return next;
    });
    try {
      await restoreWorkflowDefinition(id);
    } catch (err) { console.error('Error restoring workflow:', err); }
  };

  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState({
    emp_code: '',
    emp_name: '',
    email: '',
    mobile: '',
    user_type: 'Internal Employee',
    employment_type: 'Permanent',
    emp_status: 'Active',
    designation_id: '',
    department_id: '',
    company_id: '',
    reporting_manager_id: ''
  });

  // Transfer modal
  const [transferEmp, setTransferEmp] = useState(null);
  const [transferForm, setTransferForm] = useState({
    new_designation_id: '',
    new_department_id: '',
    new_reporting_manager_id: '',
    change_type: 'Promotion',
    change_reason: ''
  });
  const [empHistory, setEmpHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [cmpData, deptData, desigData, empData, locData, accessData, wfData] = await Promise.all([
        getCompanies(),
        getWmsDepartments(),
        getDesignations(),
        getEmployeesMaster(),
        getWorkLocations(),
        getAccessProfiles(),
        getWorkflowDefinitions()
      ]);
      setCompanies(cmpData || []);
      setDepartments(deptData || []);
      setDesignations(desigData || []);
      setEmployees(empData || []);
      setLocations(locData || []);
      setAccessProfiles(accessData || []);

      // Load client-side local persisted workflows
      let savedLocalWfs = [];
      try {
        const rawLocal = localStorage.getItem('crm_custom_workflows');
        if (rawLocal) savedLocalWfs = JSON.parse(rawLocal);
      } catch (err) { console.error('Error reading local workflows:', err); }

      // Merge local workflows WITH priority for locally configured stages
      let localMap = new Map();
      savedLocalWfs.forEach(lw => {
        if (lw && lw.id) localMap.set(String(lw.id), lw);
      });

      let finalWorkflows = [];
      // 1. Process server/demo workflows: if local version exists and has stages, use local version!
      (wfData || []).forEach(sw => {
        const swId = String(sw.id);
        if (localMap.has(swId)) {
          const lw = localMap.get(swId);
          finalWorkflows.push({
            ...sw,
            ...lw,
            stages: (lw.stages && lw.stages.length > 0) ? lw.stages : (sw.stages || [])
          });
          localMap.delete(swId);
        } else {
          finalWorkflows.push(sw);
        }
      });

      // 2. Add remaining local workflows that weren't in server data
      localMap.forEach(lw => {
        finalWorkflows.unshift(lw);
      });

      setWorkflows(finalWorkflows);
      try {
        localStorage.setItem('crm_custom_workflows', JSON.stringify(finalWorkflows));
      } catch (e) {}
    } catch (e) {
      console.error('Error loading workplace data:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      await createCompany(companyForm);
      setShowAddCompanyModal(false);
      setCompanyForm({ code: '', name: '', legal_name: '', gstin: '', pan: '' });
      loadAllData();
    } catch (err) {
      alert('Error creating company: ' + err.message);
    }
  };

  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      await createWmsDepartment(deptForm);
      setShowAddDeptModal(false);
      setDeptForm({ code: '', name: '' });
      loadAllData();
    } catch (err) {
      alert('Error creating department: ' + err.message);
    }
  };

  const handleCreateDesig = async (e) => {
    e.preventDefault();
    try {
      await createDesignation(desigForm);
      setShowAddDesigModal(false);
      setDesigForm({
        designation_code: '',
        designation_name: '',
        category: 'Executive',
        designation_level: 'L08',
        hierarchy_rank: 50,
        is_manager_eligible: false,
        is_approval_authority: false
      });
      loadAllData();
    } catch (err) {
      alert('Error creating designation: ' + err.message);
    }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      const selectedDesig = designations.find(d => d.id === empForm.designation_id);
      const selectedDept = departments.find(d => d.id === empForm.department_id);
      const selectedMgr = employees.find(e => e.id === empForm.reporting_manager_id);
      const selectedCmp = companies.find(c => c.id === empForm.company_id);

      const createdEmp = await createEmployeeMaster({
        ...empForm,
        designation_name: selectedDesig?.designation_name || '',
        department_name: selectedDept?.name || '',
        reporting_manager_name: selectedMgr?.emp_name || '',
        company_name: selectedCmp?.name || 'Swan Agro'
      });

      if (createdEmp) {
        setEmployees(prev => [createdEmp, ...prev]);
      }

      setShowAddEmpModal(false);
      setEmpForm({
        emp_code: '',
        emp_name: '',
        email: '',
        mobile: '',
        user_type: 'Internal Employee',
        employment_type: 'Permanent',
        emp_status: 'Active',
        designation_id: '',
        department_id: '',
        company_id: '',
        reporting_manager_id: ''
      });
      alert('Employee Master Record Created Successfully!');
      loadAllData();
    } catch (err) {
      alert('Error creating employee: ' + err.message);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferEmp) return;
    try {
      const selectedDesig = designations.find(d => d.id === transferForm.new_designation_id);
      const selectedDept = departments.find(d => d.id === transferForm.new_department_id);
      const selectedMgr = employees.find(e => e.id === transferForm.new_reporting_manager_id);

      await transferEmployeeDesignation(transferEmp.id, {
        ...transferForm,
        new_designation_name: selectedDesig?.designation_name || transferEmp.designation_name,
        new_department_name: selectedDept?.name || transferEmp.department_name,
        new_reporting_manager_name: selectedMgr?.emp_name || transferEmp.reporting_manager_name
      });

      setTransferEmp(null);
      loadAllData();
      alert('Employee designation/department transfer processed successfully! Audit log saved.');
    } catch (err) {
      alert('Transfer failed: ' + err.message);
    }
  };

  const openHistory = async (emp) => {
    setTransferEmp(emp);
    const history = await getEmployeeHistory(emp.id);
    setEmpHistory(history);
    setShowHistoryModal(true);
  };

  const handleCreateWorkflow = async (e) => {
    e.preventDefault();
    try {
      const res = await createWorkflowDefinition(workflowForm);
      if (res && res.workflow) {
        setWorkflows(prev => {
          const filtered = prev.filter(w => w.id !== res.workflow.id);
          const updated = [res.workflow, ...filtered];
          // Save to localStorage for permanent client-side persistence across refreshes
          try {
            localStorage.setItem('crm_custom_workflows', JSON.stringify(updated));
          } catch (err) { console.error('Error saving to localStorage:', err); }
          return updated;
        });
      }
      setShowAddWorkflowModal(false);
      setWorkflowForm({
        workflow_name: '',
        workflow_code: '',
        category: 'PRODUCTION',
        description: ''
      });
      alert('Workflow Created Successfully!');
      loadAllData();
    } catch (err) {
      alert('Error creating workflow: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '1.5rem', color: 'var(--text-primary, #f8fafc)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Building2 className="text-blue-500" size={28} />
            Universal Workplace Management
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Manage Enterprise Hierarchy, Designation Levels (L01-L10), Employee Masters & Transfer Audit Logs
          </p>
        </div>
        <button
          onClick={loadAllData}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Sub Navigation Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {canViewTab('employees') && (
          <button
            onClick={() => setActiveSubTab('employees')}
            className={`sub-tab-btn ${activeSubTab === 'employees' ? 'active' : ''}`}
          >
            <UserCheck size={18} />
            Employee Master ({employees.length})
          </button>
        )}
        {canViewTab('designations') && (
          <button
            onClick={() => setActiveSubTab('designations')}
            className={`sub-tab-btn ${activeSubTab === 'designations' ? 'active' : ''}`}
          >
            <ShieldCheck size={18} />
            Designation Master ({designations.length})
          </button>
        )}
        {canViewTab('org') && (
          <button
            onClick={() => setActiveSubTab('org')}
            className={`sub-tab-btn ${activeSubTab === 'org' ? 'active' : ''}`}
          >
            <Network size={18} />
            Organization Hierarchy
          </button>
        )}
        {canViewTab('access') && (
          <button
            onClick={() => setActiveSubTab('access')}
            className={`sub-tab-btn ${activeSubTab === 'access' ? 'active' : ''}`}
          >
            <ShieldCheck size={18} />
            Access Profiles ({accessProfiles.length})
          </button>
        )}
        {canViewTab('location_territory') && (
          <button
            onClick={() => setActiveSubTab('location_territory')}
            className={`sub-tab-btn ${activeSubTab === 'location_territory' ? 'active' : ''}`}
          >
            <MapPin size={18} />
            Location & Territory Master
          </button>
        )}
        {canViewTab('workflow') && (
          <button
            onClick={() => setActiveSubTab('workflow')}
            className={`sub-tab-btn ${activeSubTab === 'workflow' ? 'active' : ''}`}
          >
            <GitMerge size={18} />
            Workflow Builder ({workflows.length})
          </button>
        )}
      </div>

      {/* SUB-TAB 1: EMPLOYEES */}
      {activeSubTab === 'employees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Active Employee Directory</h2>
            <button
              onClick={() => setShowAddEmpModal(true)}
              style={{ padding: '0.6rem 1.2rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={18} /> Add Employee
            </button>
          </div>

          <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Emp Code</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Designation</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Department</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Reporting Manager</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mobile / Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No employee master records found. Click "Add Employee" to create one.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)' }}>{emp.emp_code}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{emp.emp_name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ background: 'var(--nav-active-bg)', color: 'var(--accent-color)', border: '1px solid var(--border-light)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                          {emp.designation_name || 'Not Set'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>{emp.department_name || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{emp.reporting_manager_name || emp.reporting_manager?.emp_name || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        <div style={{ color: 'var(--text-primary)' }}>{emp.mobile || '-'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{emp.email || '-'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: emp.emp_status === 'Active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: emp.emp_status === 'Active' ? '#10b981' : '#ef4444', border: `1px solid ${emp.emp_status === 'Active' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                          {emp.emp_status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => { setTransferEmp(emp); setTransferForm({ new_designation_id: emp.designation_id || '', new_department_id: emp.department_id || '', new_reporting_manager_id: emp.reporting_manager_id || '', change_type: 'Promotion', change_reason: '' }); }}
                            className="btn-action-primary"
                          >
                            <ArrowRightLeft size={14} /> Transfer/Promote
                          </button>
                          <button
                            onClick={() => openHistory(emp)}
                            className="btn-action-secondary"
                          >
                            <History size={14} /> Audit Log
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DESIGNATIONS */}
      {activeSubTab === 'designations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Designation Master (L01 - L10 Ranks)</h2>
            <button
              onClick={() => setShowAddDesigModal(true)}
              style={{ padding: '0.6rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={18} /> Create Designation
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {designations.map((desig) => (
              <div key={desig.id} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                      {desig.designation_level}
                    </span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.4rem 0 0 0' }}>{desig.designation_name}</h3>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Rank #{desig.hierarchy_rank}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1', spaceY: '0.4rem' }}>
                  <div>Category: <strong style={{ color: '#f1f5f9' }}>{desig.category}</strong></div>
                  <div>Default Access: <span style={{ color: '#a7f3d0' }}>{desig.default_access_profile}</span></div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {desig.is_manager_eligible && <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Manager Eligible</span>}
                    {desig.is_approval_authority && <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Approval Authority</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ORGANIZATION HIERARCHY */}
      {activeSubTab === 'org' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {/* Companies */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Building2 size={20} className="text-blue-400" /> Companies ({companies.length})
                </h3>
                <button onClick={() => setShowAddCompanyModal(true)} style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>
                  + Add Company
                </button>
              </div>
              {companies.map(c => (
                <div key={c.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Code: {c.code}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', height: 'fit-content' }}>Active</span>
                </div>
              ))}
            </div>

            {/* Departments */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={20} className="text-emerald-400" /> Centralized Departments ({departments.length})
                </h3>
                <button onClick={() => setShowAddDeptModal(true)} style={{ padding: '0.4rem 0.8rem', background: '#10b981', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>
                  + Add Dept
                </button>
              </div>
              {departments.map(d => (
                <div key={d.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  {d.sub_departments && d.sub_departments.length > 0 && (
                    <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {d.sub_departments.map(sd => (
                        <span key={sd.id} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: '#cbd5e1' }}>
                          {sd.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ACCESS PROFILES & 4-TIER PERMISSIONS */}
      {activeSubTab === 'access' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>4-Tier Permission & Access Profile Engine</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Effective Access = Designation Default + Access Profile + User Additional - User Restrictions (Restrictions have highest priority)
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {accessProfiles.map((prof) => (
              <div key={prof.id} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}>
                      {prof.profile_code}
                    </span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.4rem 0 0 0' }}>{prof.profile_name}</h3>
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <div style={{ marginBottom: '0.4rem' }}>Data Scope: <strong style={{ color: '#38bdf8' }}>{prof.data_visibility_scope}</strong></div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {prof.can_import_export && <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Import/Export</span>}
                    {prof.can_approve && <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Approver</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: LOCATION & TERRITORY MASTER */}
      {activeSubTab === 'location_territory' && (
        <LocationTerritoryModule />
      )}

      {/* SUB-TAB 6: UNIVERSAL WORKFLOW BUILDER */}
      {activeSubTab === 'workflow' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Universal Workflow Builder, Stage Assignment & Live Tracker</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Build dynamic multi-stage process flows, assign designated workers & approvers, and manage trash bin records.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '0.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => setWorkflowFilter('active')}
                  style={{ padding: '0.4rem 0.8rem', background: workflowFilter === 'active' ? '#3b82f6' : 'transparent', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Active ({workflows.filter(w => w.status !== 'DELETED').length})
                </button>
                <button
                  onClick={() => setWorkflowFilter('tracker')}
                  style={{ padding: '0.4rem 0.8rem', background: workflowFilter === 'tracker' ? '#3b82f6' : 'transparent', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <PlayCircle size={14} /> Live Working Tracker
                </button>
                <button
                  onClick={() => setWorkflowFilter('trash')}
                  style={{ padding: '0.4rem 0.8rem', background: workflowFilter === 'trash' ? '#ef4444' : 'transparent', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Trash2 size={14} /> Trash Bin ({workflows.filter(w => w.status === 'DELETED').length})
                </button>
              </div>

              {workflowFilter === 'active' && (
                <button
                  onClick={() => setShowAddWorkflowModal(true)}
                  style={{ padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                >
                  <Plus size={16} /> Create Workflow
                </button>
              )}
            </div>
          </div>

          {/* LIVE WORKING TRACKER VIEW */}
          {workflowFilter === 'tracker' && (
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <PlayCircle size={24} className="text-blue-400" />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Live Working Execution & Operational Integration</h3>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0.2rem 0 0 0' }}>
                    Where do published workflows appear for daily execution?
                  </p>
                </div>
              </div>

              {/* ACTIVE RUNNING LIVE INSTANCES LIST */}
              <div style={{ marginTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <PlayCircle size={16} /> Active Live Operational Instances ({liveInstances.length})
                </h4>

                {liveInstances.length === 0 ? (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    No live workflow instances launched yet. Go to <strong>Active Workflows</strong> and click <strong>"🚀 Start Live Instance"</strong> on any workflow (e.g. NSMLR-O2D) to launch live execution!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {liveInstances.map(inst => {
                      const progressPct = Math.round(((inst.current_stage_index + 1) / (inst.total_stages || 1)) * 100);
                      const isDone = inst.status === 'COMPLETED';

                      return (
                        <div key={inst.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>{inst.category}</span>
                              <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.2rem 0 0 0', color: '#f8fafc' }}>{inst.workflow_name} ({inst.reference_no})</h4>
                              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Order / Customer: {inst.customer_name} {inst.notes && `• ${inst.notes}`}</div>
                            </div>

                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '6px', background: isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: isDone ? '#34d399' : '#fbbf24' }}>
                              {isDone ? '✓ COMPLETED' : `IN PROGRESS (Stage ${inst.current_stage_index + 1}/${inst.total_stages})`}
                            </span>
                          </div>

                          {/* Stage Progress Bar */}
                          <div style={{ background: 'rgba(255,255,255,0.08)', height: '6px', borderRadius: '3px', overflow: 'hidden', margin: '0.6rem 0' }}>
                            <div style={{ background: isDone ? '#10b981' : '#3b82f6', height: '100%', width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                              Current Stage: <strong style={{ color: '#38bdf8' }}>[{inst.current_stage?.stage_code || 'S00'}] {inst.current_stage?.stage_name}</strong>
                              <span style={{ marginLeft: '0.6rem', color: '#94a3b8', fontSize: '0.75rem' }}>Worker: <strong>{inst.current_stage?.assigned_designation_name || inst.current_stage?.assigned_employee_name || 'Assigned Worker'}</strong></span>
                            </div>

                            {!isDone && (
                              <button
                                type="button"
                                onClick={() => handleAdvanceStage(inst.id)}
                                style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                ▶ Proceed to Next Stage ({inst.current_stage_index + 2}/{inst.total_stages})
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

          {/* WORKFLOW CARDS GRID */}
          {workflowFilter !== 'tracker' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
              {workflows.filter(w => workflowFilter === 'trash' ? w.status === 'DELETED' : w.status !== 'DELETED').length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <GitMerge size={40} className="text-blue-400" style={{ margin: '0 auto 1rem auto' }} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                    {workflowFilter === 'trash' ? 'Trash Bin is Empty' : 'No Workflows Defined Yet'}
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.4rem 0 1rem 0' }}>
                    {workflowFilter === 'trash' ? 'No deleted workflows in trash.' : 'Click "Create Workflow" to build custom stage-by-stage workflows.'}
                  </p>
                  {workflowFilter === 'active' && (
                    <button onClick={() => setShowAddWorkflowModal(true)} style={{ padding: '0.5rem 1rem', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>+ Add First Workflow</button>
                  )}
                </div>
              ) : (
                workflows.filter(w => workflowFilter === 'trash' ? w.status === 'DELETED' : w.status !== 'DELETED').map(wf => (
                  <div key={wf.id} style={{ background: 'rgba(15, 23, 42, 0.6)', border: wf.status === 'DELETED' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                          {wf.category || 'WORKFLOW'}
                        </span>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.4rem 0 0 0' }}>{wf.workflow_name}</h3>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Code: {wf.workflow_code}</div>
                      </div>
                      <span style={{ fontSize: '0.75rem', background: wf.status === 'DELETED' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: wf.status === 'DELETED' ? '#f87171' : '#34d399', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        {wf.status || 'ACTIVE'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                      {wf.description || 'Universal business process workflow'}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Active Version: <strong style={{ color: '#38bdf8' }}>v1.0</strong></span>
                      <span style={{ fontSize: '0.75rem', color: '#34d399' }}>{wf.stages?.length || 0} Stages</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      {wf.status !== 'DELETED' ? (
                        <>
                          <button
                            onClick={() => setLiveLaunchWf(wf)}
                            style={{ padding: '0.5rem 0.8rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                            title="Launch Live Workflow Order Instance"
                          >
                            <PlayCircle size={15} /> Start Live Instance
                          </button>
                          <button
                            onClick={() => setSelectedWfForStages(wf)}
                            style={{ flex: 1, padding: '0.5rem', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
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
                            title="Permanently Delete Workflow"
                          >
                            <XCircle size={15} /> Delete Forever
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* CENTERED MODAL: LAUNCH LIVE WORKFLOW INSTANCE */}
      {liveLaunchWf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlayCircle size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>Launch Live Workflow Execution</h3>
                  <div style={{ fontSize: '0.8rem', color: '#60a5fa' }}>{liveLaunchWf.workflow_name} ({liveLaunchWf.stages?.length || 0} Stages)</div>
                </div>
              </div>
              <button onClick={() => setLiveLaunchWf(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleStartLiveExecution}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Order / Reference Number</label>
                <input
                  type="text"
                  required
                  value={liveForm.reference_no}
                  onChange={e => setLiveForm({ ...liveForm, reference_no: e.target.value })}
                  placeholder="e.g. SO-2026-001 / PO-9812 / PR-004"
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Customer / Department Name</label>
                <input
                  type="text"
                  required
                  value={liveForm.customer_name}
                  onChange={e => setLiveForm({ ...liveForm, customer_name: e.target.value })}
                  placeholder="e.g. Swan Agro / Punjab Dealer Indent"
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Execution Instructions / Notes (Optional)</label>
                <textarea
                  value={liveForm.notes}
                  onChange={e => setLiveForm({ ...liveForm, notes: e.target.value })}
                  placeholder="e.g. Priority Rotavator delivery - Stage S00 Entry required"
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setLiveLaunchWf(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '460px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <Trash2 size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#f8fafc' }}>
              Move Workflow to Trash Bin?
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              Are you sure you want to move <strong style={{ color: '#38bdf8' }}>{deleteConfirmWf.workflow_name}</strong> ({deleteConfirmWf.workflow_code}) to Trash Bin? You can restore it anytime from Trash Bin.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmWf(null)}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '460px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <XCircle size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#f8fafc' }}>
              Permanently Delete Workflow?
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              Are you sure you want to permanently purge <strong style={{ color: '#f87171' }}>{purgeConfirmWf.workflow_name}</strong>? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setPurgeConfirmWf(null)}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPurgeDelete}
                style={{ flex: 1, padding: '0.6rem 1.2rem', background: '#dc2626', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <XCircle size={16} /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STAGE CONFIGURATOR */}
      {selectedWfForStages && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', background: 'rgba(59,130,246,0.15)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{selectedWfForStages.category}</span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.4rem 0 0 0' }}>{selectedWfForStages.workflow_name}</h2>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Code: {selectedWfForStages.workflow_code}</div>
              </div>
              <button onClick={() => setSelectedWfForStages(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {/* Daily Working Indicator Info */}
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem', color: '#93c5fd', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlayCircle size={16} className="text-blue-400" />
              <span><strong>Operational Location:</strong> Stages configured here will automatically execute when creating Work Orders / Purchase Indents in MRP & Sales System.</span>
            </div>

            {/* Configured Stages List with Reordering */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.75rem' }}>
                Configured Stages ({selectedWfForStages.stages?.length || 0})
              </h3>
              {(!selectedWfForStages.stages || selectedWfForStages.stages.length === 0) ? (
                <p style={{ fontSize: '0.85rem', color: '#64748b', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>No stages added yet. Fill out the assignment form below to add Stage #1.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {selectedWfForStages.stages.map((stg, idx) => {
                    const stageCode = stg.stage_code || `S${String(idx).padStart(2, '0')}`;
                    const isExpanded = expandedStageId === (stg.id || idx);

                    return (
                      <div key={stg.id || idx} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {/* Up Down Reorder Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveStageUp(idx)}
                                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: idx === 0 ? '#475569' : '#38bdf8', cursor: idx === 0 ? 'not-allowed' : 'pointer', padding: '1px 3px' }}
                                title="Move Stage Up"
                              >
                                <ArrowUp size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === selectedWfForStages.stages.length - 1}
                                onClick={() => handleMoveStageDown(idx)}
                                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '3px', color: idx === selectedWfForStages.stages.length - 1 ? '#475569' : '#38bdf8', cursor: idx === selectedWfForStages.stages.length - 1 ? 'not-allowed' : 'pointer', padding: '1px 3px' }}
                                title="Move Stage Down"
                              >
                                <ArrowDown size={12} />
                              </button>
                            </div>

                            {/* Canonical Stage Numbering Badge (S00, S01, S02) */}
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '6px', background: '#3b82f6', color: '#fff', letterSpacing: '0.5px' }}>
                              {stageCode}
                            </span>

                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{stg.stage_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '0.6rem', marginTop: '0.2rem' }}>
                                <span>Type: <strong>{stg.execution_type}</strong></span>
                                <span>| Worker: <strong style={{ color: '#38bdf8' }}>{stg.assigned_designation_name || stg.assigned_employee_name || 'Unassigned'}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '0.2rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Clock size={12} /> TAT {stg.tat_formatted_display || `${stg.planned_tat_hours || 24}h`}
                            </span>
                            {stg.approval_required && (
                              <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '0.2rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckSquare size={12} /> Sign-off: {stg.approver_designation_name || 'Designation Required'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedStageId(isExpanded ? null : (stg.id || idx))}
                              style={{ padding: '0.3rem 0.6rem', background: isExpanded ? '#6366f1' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <FileText size={12} /> Stage Fields ({(stg.fields || []).length})
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED STAGE FIELDS MAPPING CONFIGURATOR */}
                        {isExpanded && (
                          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <ListPlus size={14} /> Stage [{stageCode}] Input & Validation Fields:
                              </h4>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Snapshot Mode: LIVE_REFERENCE vs STAGE_SNAPSHOT</span>
                            </div>

                            {/* Existing Stage Fields */}
                            {(!stg.fields || stg.fields.length === 0) ? (
                              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.4rem 0' }}>No specific fields mapped for this stage yet.</p>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                {stg.fields.map((fld, fIdx) => {
                                  const fldId = fld.id || fld.field_key || `fld-${fIdx}`;
                                  const isEditing = editingField?.fieldId === fldId && editingField?.stageId === stg.id;

                                  if (isEditing) {
                                    return (
                                      <form key={fldId} onSubmit={handleUpdateStageField} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', padding: '0.3rem 0.5rem', borderRadius: '6px' }}>
                                        <input
                                          type="text"
                                          required
                                          value={editingField.field_name}
                                          onChange={e => setEditingField({ ...editingField, field_name: e.target.value })}
                                          style={{ padding: '0.2rem 0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', width: '120px' }}
                                        />
                                        <select
                                          value={editingField.data_type}
                                          onChange={e => setEditingField({ ...editingField, data_type: e.target.value })}
                                          style={{ padding: '0.2rem 0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}
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
                                          style={{ padding: '0.2rem 0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}
                                        >
                                          <option value="REQ">Required*</option>
                                          <option value="OPT">Optional</option>
                                        </select>
                                        <button type="submit" style={{ padding: '0.2rem 0.5rem', background: '#10b981', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                                          Save
                                        </button>
                                        <button type="button" onClick={() => setEditingField(null)} style={{ padding: '0.2rem 0.4rem', background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}>
                                          Cancel
                                        </button>
                                      </form>
                                    );
                                  }

                                  return (
                                    <div key={fldId} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <Tag size={10} className="text-blue-400" />
                                      <strong style={{ color: '#f1f5f9' }}>{fld.field_name}</strong>
                                      <span style={{ color: '#94a3b8' }}>({fld.data_type})</span>
                                      {fld.is_required && <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>}

                                      <button
                                        type="button"
                                        onClick={() => setEditingField({ stageId: stg.id, fieldId: fldId, field_name: fld.field_name, data_type: fld.data_type || 'TEXT', is_required: !!fld.is_required })}
                                        style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '0 2px', fontSize: '0.7rem' }}
                                        title="Edit Field"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteStageField(stg.id, fldId)}
                                        style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0 2px', fontSize: '0.7rem' }}
                                        title="Remove Field"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Add New Field Form */}
                            <form onSubmit={(e) => handleAddStageField(stg.id, e)} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px auto', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                required
                                value={fieldForm.field_name}
                                onChange={e => setFieldForm({ ...fieldForm, field_name: e.target.value })}
                                placeholder={`e.g. ${stageCode === 'S00' ? 'Item Spec / Indent Quantity' : 'Inspection Remarks / Verdict'}`}
                                style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}
                              />
                              <select
                                value={fieldForm.data_type}
                                onChange={e => setFieldForm({ ...fieldForm, data_type: e.target.value })}
                                style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}
                              >
                                <option value="TEXT">TEXT</option>
                                <option value="NUMBER">NUMBER</option>
                                <option value="SELECT">SELECT</option>
                                <option value="FILE">FILE UPLOAD</option>
                                <option value="DATE">DATE</option>
                              </select>
                              <select
                                value={fieldForm.is_required ? 'REQ' : 'OPT'}
                                onChange={e => setFieldForm({ ...fieldForm, is_required: e.target.value === 'REQ' })}
                                style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}
                              >
                                <option value="REQ">Required *</option>
                                <option value="OPT">Optional</option>
                              </select>
                              <button type="submit" style={{ padding: '0.4rem 0.8rem', background: '#10b981', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
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
            <form onSubmit={handleSaveStage} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#38bdf8', marginTop: 0, marginBottom: '0.75rem' }}>
                + Add Stage #{(selectedWfForStages.stages?.length || 0) + 1} & Assign Work Roles
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Stage Name</label>
                  <input type="text" required value={stageForm.stage_name} onChange={e => setStageForm({ ...stageForm, stage_name: e.target.value })} placeholder="e.g. Cutting / Welding / Quality Test" style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Execution Type</label>
                  <select value={stageForm.execution_type} onChange={e => setStageForm({ ...stageForm, execution_type: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                    <option value="SEQUENTIAL">SEQUENTIAL (Step by Step)</option>
                    <option value="PARALLEL">PARALLEL (Simultaneous Execution)</option>
                    <option value="CONDITIONAL_BRANCH">CONDITIONAL BRANCH</option>
                  </select>
                </div>
              </div>

              {/* Work Assignment Rules (Who performs the work?) */}
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#60a5fa', display: 'block', marginBottom: '0.4rem' }}>
                  👷 Who Will Perform The Work At This Stage? (Work Assignment)
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Assignee Rule</label>
                    <select value={stageForm.assignee_type} onChange={e => setStageForm({ ...stageForm, assignee_type: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                      <option value="BY_DESIGNATION">Assign By Designation (All employees of designation)</option>
                      <option value="SPECIFIC_EMPLOYEE">Assign Specific Employee</option>
                      <option value="REPORTING_MANAGER">Reporting Manager</option>
                    </select>
                  </div>

                  {stageForm.assignee_type === 'BY_DESIGNATION' && (
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Assigned Worker Designation</label>
                      <select value={stageForm.assigned_designation_id} onChange={e => setStageForm({ ...stageForm, assigned_designation_id: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                        <option value="">-- Select Worker Designation --</option>
                        {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                      </select>
                    </div>
                  )}

                  {stageForm.assignee_type === 'SPECIFIC_EMPLOYEE' && (
                    <div>
                      <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Assigned Employee</label>
                      <select value={stageForm.assigned_employee_id} onChange={e => setStageForm({ ...stageForm, assigned_employee_id: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                        <option value="">-- Select Specific Employee --</option>
                        {employees.map(m => <option key={m.id} value={m.id}>{m.emp_name} ({m.emp_code} - {m.designation_name})</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* TAT & Sign-off */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Target TAT (Turnaround Time)</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="number"
                      min="1"
                      required
                      value={stageForm.tat_value || ''}
                      onChange={e => setStageForm({ ...stageForm, tat_value: Number(e.target.value) })}
                      placeholder="e.g. 15, 30, 24"
                      style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    />
                    <select
                      value={stageForm.tat_unit || 'HOURS'}
                      onChange={e => setStageForm({ ...stageForm, tat_unit: e.target.value })}
                      style={{ padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      <option value="MINUTES">Minutes (Mins)</option>
                      <option value="HOURS">Hours (Hrs)</option>
                      <option value="DAYS">Days</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Approval Sign-off Required?</label>
                  <select value={stageForm.approval_required ? 'YES' : 'NO'} onChange={e => setStageForm({ ...stageForm, approval_required: e.target.value === 'YES' })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                    <option value="NO">NO (Direct Completion)</option>
                    <option value="YES">YES (Requires Manager/Quality Sign-off)</option>
                  </select>
                </div>
              </div>

              {stageForm.approval_required && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Approver Designation (Sign-off Authority)</label>
                  <select value={stageForm.approver_designation_id} onChange={e => setStageForm({ ...stageForm, approver_designation_id: e.target.value })} style={{ width: '100%', padding: '0.5rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}>
                    <option value="">-- Select Approver Designation --</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
                    <option value="LOGISTICS">Logistics & Dispatch</option>
                    <option value="SALES">Sales & Billing</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Description</label>
                  <textarea value={workflowForm.description} onChange={e => setWorkflowForm({ ...workflowForm, description: e.target.value })} placeholder="Brief workflow purpose" style={{ width: '100%', minHeight: '60px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddWorkflowModal(false)} className="btn-action-secondary">Cancel</button>
                <button type="submit" className="btn-primary" style={{ borderRadius: '8px' }}>Publish Workflow (v1.0)</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD EMPLOYEE */}
      {showAddEmpModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Create Employee Master Record</h2>
            <form onSubmit={handleCreateEmployee}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Emp Code</label>
                  <input type="text" required value={empForm.emp_code} onChange={e => setEmpForm({ ...empForm, emp_code: e.target.value })} placeholder="e.g. EMP-1001" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Employee Name</label>
                  <input type="text" required value={empForm.emp_name} onChange={e => setEmpForm({ ...empForm, emp_name: e.target.value })} placeholder="Full Name" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Email</label>
                  <input type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="email@swanagro.in" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Mobile</label>
                  <input type="text" value={empForm.mobile} onChange={e => setEmpForm({ ...empForm, mobile: e.target.value })} placeholder="10-digit mobile" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Designation</label>
                  <select value={empForm.designation_id} onChange={e => setEmpForm({ ...empForm, designation_id: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- Select Designation --</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Department</label>
                  <select value={empForm.department_id} onChange={e => setEmpForm({ ...empForm, department_id: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- Select Department --</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Primary Reporting Manager</label>
                  <select value={empForm.reporting_manager_id} onChange={e => setEmpForm({ ...empForm, reporting_manager_id: e.target.value })} style={{ width: '100%' }}>
                    <option value="">-- None (Top Level) --</option>
                    {employees.map(m => <option key={m.id} value={m.id}>{m.emp_name} ({m.emp_code} - {m.designation_name})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddEmpModal(false)} className="btn-action-secondary">Cancel</button>
                <button type="submit" className="btn-primary" style={{ borderRadius: '8px' }}>Create Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFER / PROMOTE */}
      {transferEmp && !showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '550px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Transfer / Promote Employee</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Employee: <strong style={{ color: '#38bdf8' }}>{transferEmp.emp_name}</strong> ({transferEmp.emp_code})
            </p>
            <form onSubmit={handleTransferSubmit}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Change Type</label>
                  <select value={transferForm.change_type} onChange={e => setTransferForm({ ...transferForm, change_type: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="Promotion">Promotion</option>
                    <option value="Transfer">Department Transfer</option>
                    <option value="Designation Correction">Designation Correction</option>
                    <option value="Reporting Change">Reporting Manager Change</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>New Designation</label>
                  <select value={transferForm.new_designation_id} onChange={e => setTransferForm({ ...transferForm, new_designation_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="">-- Keep Current --</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>New Reporting Manager</label>
                  <select value={transferForm.new_reporting_manager_id} onChange={e => setTransferForm({ ...transferForm, new_reporting_manager_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="">-- Keep Current --</option>
                    {employees.filter(m => m.id !== transferEmp.id).map(m => <option key={m.id} value={m.id}>{m.emp_name} ({m.emp_code})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Reason / Approval Reference</label>
                  <textarea value={transferForm.change_reason} onChange={e => setTransferForm({ ...transferForm, change_reason: e.target.value })} placeholder="e.g. Annual Appraisal Promotion" style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', minHeight: '60px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setTransferEmp(null)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.2rem', background: '#6366f1', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Submit Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUDIT HISTORY */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Employee Transfer & Designation Audit Log</h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>Historical designation changes are preserved for compliance.</p>
            {empHistory.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No transfer history recorded for this employee yet.</p>
            ) : (
              <div style={{ spaceY: '0.75rem' }}>
                {empHistory.map(h => (
                  <div key={h.id} style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600 }}>
                      <span>{h.change_type}</span>
                      <span>{new Date(h.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.3rem', color: '#e2e8f0' }}>Reason: {h.change_reason || 'N/A'}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setShowHistoryModal(false)} style={{ padding: '0.6rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
