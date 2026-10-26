'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Building, MapPin, Shield, Key, Eye, EyeOff, Save, Loader2, CheckCircle2, AlertCircle, Users, FileText } from 'lucide-react';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';
import { getReportingEmail, getReportingFields } from '@/utils/reportingHierarchy';
import { DEFAULT_DEPARTMENTS, DESIGNATIONS, WORK_LOCATION_TYPES, EMP_STATUS_OPTIONS } from '../utils/userManagementUtils';
import { ROLE_PRESETS } from '../utils/rolePresets';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { getTenantAttendancePolicy } from '@/app/actions/attendance';

export default function AddEditUserModal({
  isOpen,
  onClose,
  onSave,
  onSaveDraft = () => {},
  user = null, // if null -> Add Mode, if object -> Edit Mode
  departments = DEFAULT_DEPARTMENTS,
  allEmployees = [],
  roleTemplates = [],
  saving = false
}) {
  const isEdit = Boolean(user);
  const [activeStep, setActiveStep] = useState('personal'); // 'personal' | 'job' | 'reporting' | 'auth'
  const [availableBranches, setAvailableBranches] = useState([]);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [customBranchInput, setCustomBranchInput] = useState(false);
  
  const [formData, setFormData] = useState({
    emp_id: '',
    emp_status: 'Active',
    emp_name: '',
    emp_department: '',
    emp_sub_department: '',
    emp_designation: '',
    role: 'agent',
    role_template_id: '',
    company: 'SuPuja Creations',
    work_location_type: 'Headquarters',
    work_location_name: '',
    assigned_shift: '',
    salary_amount: '',
    emp_mobile: '',
    emp_alt_mobile: '',
    email: '',
    password: '',
    primary_reporting_person: '',
    secondary_reporting_person: '',
    hod_person: '',
    can_self_reset_password: true
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        emp_id: user.emp_id || '',
        emp_status: user.emp_status || (user.module_access?.emp_status) || 'Active',
        emp_name: user.emp_name || '',
        emp_department: user.emp_department || '',
        emp_sub_department: user.emp_sub_department || (user.module_access?.emp_sub_department) || '',
        emp_designation: user.emp_designation || '',
        role: user.role || 'agent',
        role_template_id: user.module_access?.role_template_id || '',
        company: user.company || 'SuPuja Creations',
        work_location_type: user.work_location_type || (user.module_access?.work_location_type) || 'Headquarters',
        work_location_name: user.work_location_name || (user.module_access?.work_location_name) || '',
        assigned_shift: user.assigned_shift || (user.module_access?.assigned_shift) || '',
        salary_amount: (user.salary_amount !== null && user.salary_amount !== undefined) ? user.salary_amount : ((user.module_access && user.module_access.salary_amount !== undefined) ? user.module_access.salary_amount : ''),
        emp_mobile: user.emp_mobile || '',
        emp_alt_mobile: user.emp_alt_mobile || (user.module_access?.emp_alt_mobile) || '',
        email: user.email || '',
        password: '',
        ...getReportingFields(user),
        can_self_reset_password: user.can_self_reset_password === true || (user.module_access?.can_self_reset_password === true)
      });
    } else {
      setFormData({
        emp_id: '',
        emp_status: 'Active',
        emp_name: '',
        emp_department: departments[0] || 'Sales',
        emp_sub_department: '',
        emp_designation: 'Sales Executive',
        role: 'agent',
        role_template_id: '',
        company: 'SuPuja Creations',
        work_location_type: 'Headquarters',
        work_location_name: '',
        assigned_shift: '',
        salary_amount: '',
        emp_mobile: '',
        emp_alt_mobile: '',
        email: '',
        password: '',
        primary_reporting_person: '',
        secondary_reporting_person: '',
        hod_person: '',
        can_self_reset_password: true
      });
    }
    setActiveStep('personal');
    setErrorMsg('');
  }, [user, isOpen, departments]);

  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      getTenantBranches(formData.company || 'Swan Hosting').then(res => {
        if (isMounted && res.success && Array.isArray(res.branches)) {
          setAvailableBranches(res.branches);
        }
      }).catch(() => {});
    }
    return () => { isMounted = false; };
  }, [isOpen, formData.company]);

  // Load tenant/branch attendance shifts dynamically
  useEffect(() => {
    let isMounted = true;
    if (isOpen && formData.company) {
      getTenantAttendancePolicy(null, formData.company, formData.work_location_name || '').then(res => {
        if (isMounted && res?.success && res.data) {
          const pol = res.data;
          let shifts = [];
          if (Array.isArray(pol.shifts) && pol.shifts.length > 0) {
            shifts = pol.shifts;
          } else if (pol.shift_name) {
            shifts = [{
              id: 'shift_default',
              shift_name: pol.shift_name,
              start_time: pol.start_time || '09:00',
              end_time: pol.end_time || '18:30',
              is_default: true
            }];
          }
          setAvailableShifts(shifts);
        }
      }).catch(() => {});
    }
    return () => { isMounted = false; };
  }, [isOpen, formData.company, formData.work_location_name]);

  if (!isOpen) return null;

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.emp_name.trim()) {
      setActiveStep('personal');
      setErrorMsg('Full Name is required');
      return;
    }
    if (!isEdit && !formData.email.trim()) {
      setActiveStep('personal');
      setErrorMsg('Email address is required for new accounts');
      return;
    }
    if (!isEdit && (!formData.password || formData.password.length < 6)) {
      setActiveStep('auth');
      setErrorMsg('Password must be at least 6 characters');
      return;
    }

    const payload = {
      ...formData,
      emp_id: formData.emp_id?.trim() || (isEdit ? (user?.emp_id || '') : `EMP-${Date.now().toString().slice(-5)}`)
    };

    onSave(payload);
  };

  const handleDraftClick = () => {
    if (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim()) {
      setErrorMsg('Please enter at least an Emp Name, Email, or Emp ID to save as Draft.');
      return;
    }
    const fallbackId = formData.emp_id?.trim() || `DRAFT-${Date.now().toString().slice(-6)}`;
    const fallbackEmail = formData.email?.trim() || `${fallbackId.toLowerCase()}@draft.local`;
    const fallbackPassword = formData.password || 'DraftPass@123';
    onSaveDraft({
      ...formData,
      emp_id: fallbackId,
      email: fallbackEmail,
      password: fallbackPassword,
      emp_status: 'Draft',
      emp_name: formData.emp_name?.trim() || 'Draft Employee'
    });
  };

  const steps = [
    { id: 'personal', label: '1. Personal & Contact', icon: User },
    { id: 'job', label: '2. Job & Location', icon: Building },
    { id: 'reporting', label: '3. Reporting & HOD', icon: Users },
    ...(!isEdit ? [{ id: 'auth', label: '4. Login Credentials', icon: Key }] : [])
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '740px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={22} style={{ color: 'var(--primary-color, #2563eb)' }} />
              {isEdit ? `Edit User: ${user.emp_name || user.email}` : 'Add New User'}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isEdit ? 'Update employee profile, organizational mapping and status' : 'Create a new user account with employee details and credentials'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Wizard Step Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary, rgba(0,0,0,0.02))',
          padding: '0 1rem',
          overflowX: 'auto'
        }}>
          {steps.map(s => {
            const Icon = s.icon;
            const isActive = activeStep === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(s.id)}
                style={{
                  padding: '0.75rem 1.25rem',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: isActive ? '2px solid var(--primary-color, #2563eb)' : '2px solid transparent',
                  color: isActive ? 'var(--primary-color, #2563eb)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Error Notice */}
        {errorMsg && (
          <div style={{
            margin: '1rem 1.75rem 0',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
            
            {/* Step 1: Personal & Contact */}
            {activeStep === 'personal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Full Name *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        required
                        value={formData.emp_name}
                        onChange={e => handleChange('emp_name', e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Email Address *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => handleChange('email', e.target.value)}
                        placeholder="e.g. rahul@supujacreations.com"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Primary Mobile Number
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="tel"
                        value={formData.emp_mobile}
                        onChange={e => handleChange('emp_mobile', e.target.value)}
                        placeholder="10-digit mobile"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Alternate Mobile Number
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="tel"
                        value={formData.emp_alt_mobile}
                        onChange={e => handleChange('emp_alt_mobile', e.target.value)}
                        placeholder="Emergency / alternate mobile"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Company Name
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Building size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type="text"
                        value={formData.company}
                        onChange={e => handleChange('company', e.target.value)}
                        placeholder="SuPuja Creations"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Job & Location */}
            {activeStep === 'job' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Employee Code / ID
                    </label>
                    <input
                      type="text"
                      value={formData.emp_id}
                      onChange={e => handleChange('emp_id', e.target.value)}
                      placeholder="e.g. EMP-0104"
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Status
                    </label>
                    <select
                      value={formData.emp_status}
                      onChange={e => handleChange('emp_status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {EMP_STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Department
                    </label>
                    <select
                      value={formData.emp_department}
                      onChange={e => handleChange('emp_department', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Select Department --</option>
                      {departments.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Sub-Department
                    </label>
                    <input
                      type="text"
                      value={formData.emp_sub_department}
                      onChange={e => handleChange('emp_sub_department', e.target.value)}
                      placeholder="e.g. North Region / Key Accounts"
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Designation
                    </label>
                    <select
                      value={formData.emp_designation}
                      onChange={e => handleChange('emp_designation', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Select Designation --</option>
                      {DESIGNATIONS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      System Role & Access Template
                    </label>
                    <select
                      value={
                        formData.role_template_id 
                          ? `custom:${formData.role_template_id}` 
                          : (formData.role_preset_key ? `preset:${formData.role_preset_key}` : (formData.role || 'agent'))
                      }
                      onChange={e => {
                        const val = e.target.value;
                        if (val.startsWith('custom:')) {
                          const tId = val.replace('custom:', '');
                          handleChange('role_template_id', tId);
                          handleChange('role_preset_key', '');
                          handleChange('role', 'agent');
                        } else if (val.startsWith('preset:')) {
                          const pKey = val.replace('preset:', '');
                          handleChange('role_template_id', '');
                          handleChange('role_preset_key', pKey);
                          const systemRoleMap = {
                            crm: 'Admin',
                            telecaller: 'agent',
                            sales_coordinator: 'Sales',
                            process_coordinator: 'Supervisor',
                            hod_dept_head: 'Manager',
                            sales_manager: 'Manager',
                            sales_executive: 'Sales',
                            hr_recruiter: 'Recruiter',
                            read_only_viewer: 'agent'
                          };
                          handleChange('role', systemRoleMap[pKey] || 'agent');
                        } else {
                          handleChange('role_template_id', '');
                          handleChange('role_preset_key', '');
                          handleChange('role', val);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <optgroup label="Roles & Permissions Presets">
                        {ROLE_PRESETS.filter(p => p.key !== 'master_admin').map(preset => (
                          <option key={preset.key} value={`preset:${preset.key}`}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                      {roleTemplates && roleTemplates.length > 0 && (
                        <optgroup label="Custom Role Templates (RBAC)">
                          {roleTemplates.map(rt => (
                            <option key={rt.id} value={`custom:${rt.id}`}>
                              {rt.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="System Base Fallback">
                        <option value="Admin">Admin</option>
                        <option value="Manager">Manager</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Sales">Sales</option>
                        <option value="Recruiter">Recruiter</option>
                        <option value="Purchase">Purchase</option>
                        <option value="agent">Agent (Standard Staff)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Work Location Type
                    </label>
                    <select
                      value={formData.work_location_type}
                      onChange={e => handleChange('work_location_type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      {WORK_LOCATION_TYPES.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Location / Branch / Plant Name
                      </label>
                      {availableBranches.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomBranchInput(!customBranchInput)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          {customBranchInput ? '← Select from Created Branches' : '+ Type Custom Location'}
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <MapPin size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      {!customBranchInput && availableBranches.length > 0 ? (
                        <select
                          value={formData.work_location_name}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setCustomBranchInput(true);
                            } else {
                              handleChange('work_location_name', val);
                              const matched = availableBranches.find(b => b.branch_name === val);
                              if (matched?.location_type) {
                                handleChange('work_location_type', matched.location_type);
                              }
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="">-- Select Branch Office / Plant --</option>
                          {availableBranches.map(br => (
                            <option key={br.id || br.branch_code} value={br.branch_name}>
                              {br.branch_name} ({br.branch_code}) - {br.location_type}
                            </option>
                          ))}
                          <option value="__custom__">+ Enter Custom Location...</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formData.work_location_name}
                          onChange={e => handleChange('work_location_name', e.target.value)}
                          placeholder="e.g. Head Office Delhi / Factory Unit 1"
                          style={{
                            width: '100%',
                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Assigned Attendance Shift (Default)
                    </label>
                    <select
                      value={formData.assigned_shift || ''}
                      onChange={e => handleChange('assigned_shift', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Auto-Detect Shift (Recommended) --</option>
                      {availableShifts.length > 0 ? (
                        <>
                          {availableShifts.map((s, idx) => (
                            <option key={s.id || s.shift_code || idx} value={s.shift_name}>
                              {s.shift_name} ({s.start_time} - {s.end_time}){s.is_default ? ' (Default)' : ''}
                            </option>
                          ))}
                          {formData.assigned_shift && !availableShifts.some(s => s.shift_name === formData.assigned_shift) && (
                            <option value={formData.assigned_shift}>
                              {formData.assigned_shift} (Assigned)
                            </option>
                          )}
                        </>
                      ) : (
                        <>
                          <option value="Regular Shift">Regular / General Shift (09:00 - 18:30)</option>
                          <option value="Shift A (Morning Production)">Shift A (Morning, 06:00 - 14:30)</option>
                          <option value="Shift B (Evening Production)">Shift B (Evening, 14:30 - 23:00)</option>
                          <option value="Shift C (Night Production)">Shift C (Night, 23:00 - 07:30)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Monthly Salary Amount (₹ / Month)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={formData.salary_amount !== undefined && formData.salary_amount !== null ? formData.salary_amount : ''}
                        onChange={e => handleChange('salary_amount', e.target.value)}
                        placeholder="e.g. 35000"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem 0.55rem 1.9rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Reporting & HOD */}
            {activeStep === 'reporting' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Assign organizational reporting hierarchy. This links Smart Attendance punch approvals, delegation task routing, and lead assignment.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Primary Reporting Manager (Daily Work / Tasks)
                    </label>
                    <SearchableEmployeeSelect
                      employees={allEmployees}
                      selectedEmail={formData.primary_reporting_person}
                      onSelect={(employee) => handleChange('primary_reporting_person', getReportingEmail(employee, allEmployees))}
                      placeholder="Select Primary Reporting Manager..."
                      allowAllStaff={false}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Secondary Reporting Manager (Backup / Operational)
                    </label>
                    <SearchableEmployeeSelect
                      employees={allEmployees}
                      selectedEmail={formData.secondary_reporting_person}
                      onSelect={(employee) => handleChange('secondary_reporting_person', getReportingEmail(employee, allEmployees))}
                      placeholder="Select Secondary Manager (Optional)..."
                      allowAllStaff={false}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Head of Department (HOD) - For Attendance & Leave Approvals
                    </label>
                    <SearchableEmployeeSelect
                      employees={allEmployees}
                      selectedEmail={formData.hod_person}
                      onSelect={(employee) => handleChange('hod_person', getReportingEmail(employee, allEmployees))}
                      placeholder="Select Department HOD..."
                      allowAllStaff={false}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Login Credentials (Only for Add Mode) */}
            {!isEdit && activeStep === 'auth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                      Initial Password * (Minimum 6 characters)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Key size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={!isEdit}
                        value={formData.password}
                        onChange={e => handleChange('password', e.target.value)}
                        placeholder="Set user password"
                        style={{
                          width: '100%',
                          padding: '0.55rem 2.5rem 0.55rem 2.2rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="selfResetCheck"
                      checked={formData.can_self_reset_password}
                      onChange={e => handleChange('can_self_reset_password', e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="selfResetCheck" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Allow employee to change or reset their own password
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-light)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem'
              }}
            >
              Cancel
            </button>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {!isEdit && (
                <button
                  type="button"
                  onClick={handleDraftClick}
                  disabled={saving || (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim())}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#475569',
                    cursor: (saving || (!formData.emp_name.trim() && !formData.email.trim() && !formData.emp_id.trim())) ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <FileText size={15} />
                  {saving ? 'Saving Draft...' : 'Save Draft'}
                </button>
              )}

              {activeStep !== 'personal' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === 'job') setActiveStep('personal');
                    else if (activeStep === 'reporting') setActiveStep('job');
                    else if (activeStep === 'auth') setActiveStep('reporting');
                  }}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem'
                  }}
                >
                  Previous
                </button>
              )}

              {activeStep !== (!isEdit ? 'auth' : 'reporting') ? (
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === 'personal') setActiveStep('job');
                    else if (activeStep === 'job') setActiveStep('reporting');
                    else if (activeStep === 'reporting' && !isEdit) setActiveStep('auth');
                  }}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--primary-color, #2563eb)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem'
                  }}
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.55rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'var(--primary-color, #2563eb)',
                    color: '#ffffff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  {isEdit ? 'Save Changes' : 'Create User'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
