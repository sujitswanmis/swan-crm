'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Network, ShieldCheck, UserCheck, Plus, History, ArrowRightLeft, Layers, MapPin, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react';
import { getCompanies, createCompany, getWmsDepartments, createWmsDepartment, createSubDepartment, getWorkLocations, createWorkLocation } from '@/app/actions/organization';
import { getDesignations, createDesignation } from '@/app/actions/designation';
import { getEmployeesMaster, createEmployeeMaster, transferEmployeeDesignation, getEmployeeHistory } from '@/app/actions/employee';
import { getAccessProfiles } from '@/app/actions/accessControl';
import { getRecursiveSubordinatesTree } from '@/app/actions/hierarchy';
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

export default function UniversalWorkplaceModule() {
  const [activeSubTab, setActiveSubTab] = useState('employees');
  const [loading, setLoading] = useState(false);

  // Data states
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [accessProfiles, setAccessProfiles] = useState([]);

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

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [cmpData, deptData, desigData, empData, locData, accessData] = await Promise.all([
        getCompanies(),
        getWmsDepartments(),
        getDesignations(),
        getEmployeesMaster(),
        getWorkLocations(),
        getAccessProfiles()
      ]);
      setCompanies(cmpData || []);
      setDepartments(deptData || []);
      setDesignations(desigData || []);
      setEmployees(empData || []);
      setLocations(locData || []);
      setAccessProfiles(accessData || []);
    } catch (e) {
      console.error('Error loading workplace data:', e);
    }
    setLoading(false);
  };

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

      await createEmployeeMaster({
        ...empForm,
        designation_name: selectedDesig?.designation_name || '',
        department_name: selectedDept?.name || '',
        reporting_manager_name: selectedMgr?.emp_name || '',
        company_name: selectedCmp?.name || 'Swan Agro'
      });

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
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveSubTab('employees')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'employees' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <UserCheck size={18} />
          Employee Master ({employees.length})
        </button>
        <button
          onClick={() => setActiveSubTab('designations')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'designations' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ShieldCheck size={18} />
          Designation Master ({designations.length})
        </button>
        <button
          onClick={() => setActiveSubTab('org')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'org' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Network size={18} />
          Organization Hierarchy
        </button>
        <button
          onClick={() => setActiveSubTab('access')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'access' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ShieldCheck size={18} />
          Access Profiles ({accessProfiles.length})
        </button>
        <button
          onClick={() => setActiveSubTab('location_territory')}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'location_territory' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <MapPin size={18} />
          Location & Territory Master
        </button>
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

          <div style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
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
                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      No employee master records found. Click "Add Employee" to create one.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#38bdf8' }}>{emp.emp_code}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{emp.emp_name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                          {emp.designation_name || 'Not Set'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{emp.department_name || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>{emp.reporting_manager_name || emp.reporting_manager?.emp_name || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        <div>{emp.mobile || '-'}</div>
                        <div style={{ color: '#64748b' }}>{emp.email || '-'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: emp.emp_status === 'Active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: emp.emp_status === 'Active' ? '#34d399' : '#f87171' }}>
                          {emp.emp_status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => { setTransferEmp(emp); setTransferForm({ new_designation_id: emp.designation_id || '', new_department_id: emp.department_id || '', new_reporting_manager_id: emp.reporting_manager_id || '', change_type: 'Promotion', change_reason: '' }); }}
                            style={{ padding: '0.35rem 0.6rem', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#a5b4fc', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <ArrowRightLeft size={14} /> Transfer/Promote
                          </button>
                          <button
                            onClick={() => openHistory(emp)}
                            style={{ padding: '0.35rem 0.6rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
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

      {/* MODAL: ADD EMPLOYEE */}
      {showAddEmpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem' }}>Create Employee Master Record</h2>
            <form onSubmit={handleCreateEmployee}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Emp Code</label>
                  <input type="text" required value={empForm.emp_code} onChange={e => setEmpForm({ ...empForm, emp_code: e.target.value })} placeholder="e.g. EMP-1001" style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Employee Name</label>
                  <input type="text" required value={empForm.emp_name} onChange={e => setEmpForm({ ...empForm, emp_name: e.target.value })} placeholder="Full Name" style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Email</label>
                  <input type="email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="email@swanagro.in" style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Mobile</label>
                  <input type="text" value={empForm.mobile} onChange={e => setEmpForm({ ...empForm, mobile: e.target.value })} placeholder="10-digit mobile" style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Designation</label>
                  <select value={empForm.designation_id} onChange={e => setEmpForm({ ...empForm, designation_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="">-- Select Designation --</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.designation_name} ({d.designation_level})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Department</label>
                  <select value={empForm.department_id} onChange={e => setEmpForm({ ...empForm, department_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="">-- Select Department --</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Primary Reporting Manager</label>
                  <select value={empForm.reporting_manager_id} onChange={e => setEmpForm({ ...empForm, reporting_manager_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                    <option value="">-- None (Top Level) --</option>
                    {employees.map(m => <option key={m.id} value={m.id}>{m.emp_name} ({m.emp_code} - {m.designation_name})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setShowAddEmpModal(false)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#cbd5e1', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.2rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Create Employee</button>
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
