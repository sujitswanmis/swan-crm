'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, User, Building2, Clock, CheckCircle2, AlertCircle, ArrowLeft, Send } from 'lucide-react';
import { getTenantCustomForms } from '@/app/actions/fieldFormStudio';
import { createFieldTask, getFieldTasksForUser } from '@/app/actions/fieldTasks';
import { getTeamMembers } from '@/app/actions/team';

export default function FieldTaskManager({
  company = 'TNT00001',
  branchCode = null,
  currentUser = null,
  currentUserId = null,
  tenantId = null,
  branchAccess = null,
  adminCompanyFilter = 'All'
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [forms, setForms] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Form Fields (Matching Screenshot 4)
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [selectedForm, setSelectedForm] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [dynamicFormValues, setDynamicFormValues] = useState({});
  const [additionalFields, setAdditionalFields] = useState([]);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const branchScope = branchAccess
          ? {
              scope: branchAccess.scope,
              isAllBranches: branchAccess.isAllBranches,
              allowedCompanies: branchAccess.allowedCompanies,
              allowedBranchNames: branchAccess.allowedBranchNames,
              allowedBranchCodes: branchAccess.allowedBranchCodes,
              selectedFilter: adminCompanyFilter || 'All'
            }
          : (adminCompanyFilter && adminCompanyFilter !== 'All' ? { selectedFilter: adminCompanyFilter } : null);
        const [formsData, membersData] = await Promise.all([
          getTenantCustomForms(company),
          getTeamMembers(company, tenantId, branchScope)
        ]);
        setForms(formsData || []);
        setTeamMembers(membersData || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [company, tenantId, branchAccess, adminCompanyFilter]);

  const handleTaskTypeChange = (formId) => {
    setSelectedTaskType(formId);
    const found = forms.find(f => f.id === formId);
    setSelectedForm(found || null);
    setDynamicFormValues({});
  };

  const handleAddAdditionalField = () => {
    setAdditionalFields([...additionalFields, { name: '', value: '' }]);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !assignedEmployeeId) {
      alert('Please fill Party Name and Assign to Employee');
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await createFieldTask({
        company,
        branch_code: branchCode,
        form_id: selectedForm?.id || null,
        task_type: selectedForm?.title || 'Lead Data Pipeline',
        party_name: customerName,
        party_phone: customerPhone,
        party_address: customerAddress,
        assigned_by_user_id: currentUser?.id || currentUserId || null,
        assigned_to_user_id: assignedEmployeeId,
        priority,
        scheduled_start_time: startTime || new Date().toISOString(),
        scheduled_end_time: endTime || null,
        form_details: {
          description,
          ...dynamicFormValues
        },
        additional_fields: additionalFields.filter(f => f.name.trim())
      });

      if (res.success) {
        alert('Field Task Created and Assigned Successfully!');
        setIsCreating(false);
        // Reset
        setCustomerName('');
        setCustomerAddress('');
        setDescription('');
        setSelectedTaskType('');
        setSelectedForm(null);
        setDynamicFormValues({});
        setAdditionalFields([]);
      } else {
        alert(res.error || 'Failed to create task');
      }
    } catch (err) {
      alert(err.message || 'Error creating task');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div style={{ padding: '1.25rem', background: 'var(--bg-canvas, #f8fafc)', color: 'var(--text-primary, #0f172a)', minHeight: 'calc(100vh - 120px)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
            <Calendar size={22} style={{ color: 'var(--accent-color, #2563eb)' }} />
            Field Task Manager & Visits
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            Schedule and assign ground field tasks by Task Type. Dynamic forms load automatically based on selection.
          </p>
        </div>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)} 
            style={{ padding: '0.5rem 1rem', background: 'var(--accent-color, #2563eb)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', boxShadow: '0 1px 3px rgba(37,99,235,0.2)' }}
          >
            <Plus size={16} /> Create Task
          </button>
        )}
      </div>

      {/* CREATE TASK VIEW */}
      {isCreating ? (
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
            <button 
              onClick={() => setIsCreating(false)} 
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Tasks - Create Task</h3>
          </div>

          <form onSubmit={handleCreateTask}>
            {/* Row 1: Task Type & Customer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Task Type*</label>
                <select 
                  value={selectedTaskType} 
                  onChange={e => handleTaskTypeChange(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                >
                  <option value="">-- Select Task Type --</option>
                  <option value="lead_pipeline">Lead Data Pipeline</option>
                  <option value="order_pipeline">Order to Delivery Pipeline</option>
                  <option value="complaint_pipeline">Complaint & Service Pipeline</option>
                  {forms.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Customer / Party Name*</label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Sharma Traders, Noida"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                />
              </div>
            </div>

            {/* Row 2: Customer Address & Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Party Address</label>
                <input 
                  type="text" 
                  value={customerAddress}
                  onChange={e => setCustomerAddress(e.target.value)}
                  placeholder="Street, City, PIN Code"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Contact Mobile</label>
                <input 
                  type="text" 
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
            </div>

            {/* Row 3: Priority & Assign to Employee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Priority*</label>
                <select 
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Assign to Employee*</label>
                <select 
                  value={assignedEmployeeId}
                  onChange={e => setAssignedEmployeeId(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                >
                  <option value="">-- Select Field Person --</option>
                  {teamMembers.map(m => {
                    const memberId = m.user_id || m.id;
                    return (
                      <option key={memberId} value={memberId}>
                        {m.emp_name || m.name || m.email} ({m.role || 'Field Staff'})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Row 4: Start Time & End Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Start Time*</label>
                <input 
                  type="datetime-local" 
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>End Time</label>
                <input 
                  type="datetime-local" 
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
            </div>

            {/* DYNAMIC FORM DETAILS */}
            {selectedForm && (selectedForm.fields || []).length > 0 && (
              <div style={{ marginBottom: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#2563eb' }}>
                  | Form Details ({selectedForm.title})
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {selectedForm.fields.map(f => (
                    <div key={f.id}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                        {f.label} {f.required && '*'}
                      </label>
                      {f.type === 'dropdown' ? (
                        <select 
                          value={dynamicFormValues[f.id] || ''}
                          onChange={e => setDynamicFormValues({ ...dynamicFormValues, [f.id]: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                        >
                          <option value="">Please select list</option>
                          {(f.options || []).map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type={f.type === 'number' ? 'number' : 'text'}
                          value={dynamicFormValues[f.id] || ''}
                          onChange={e => setDynamicFormValues({ ...dynamicFormValues, [f.id]: e.target.value })}
                          placeholder={f.label}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Description / Special Instructions</label>
              <textarea 
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Please enter task description for field executive..."
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' }}
              />
            </div>

            {/* Additional Fields */}
            <div style={{ marginBottom: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: '#475569' }}>| Additional Fields</h4>
                <button 
                  type="button"
                  onClick={handleAddAdditionalField}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                >
                  Add More Fields
                </button>
              </div>
              {additionalFields.map((field, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Field Name"
                    value={field.name}
                    onChange={e => {
                      const updated = [...additionalFields];
                      updated[idx].name = e.target.value;
                      setAdditionalFields(updated);
                    }}
                    style={{ padding: '0.45rem 0.65rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.825rem' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Field Value"
                    value={field.value}
                    onChange={e => {
                      const updated = [...additionalFields];
                      updated[idx].value = e.target.value;
                      setAdditionalFields(updated);
                    }}
                    style={{ padding: '0.45rem 0.65rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.825rem' }}
                  />
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)}
                style={{ padding: '0.5rem 1rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitLoading}
                style={{ padding: '0.5rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 1px 3px rgba(37,99,235,0.2)' }}
              >
                {submitLoading ? 'Creating Task...' : 'Create & Assign Task'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* TASKS LIST SUMMARY */
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
          <p style={{ margin: '0 0 1rem', fontSize: '0.95rem' }}>Click "+ Create Task" to assign a new field task using your custom forms.</p>
        </div>
      )}
    </div>
  );
}
