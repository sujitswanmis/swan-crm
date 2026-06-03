'use client';

import React, { useState, useEffect } from 'react';
import { getTeamMembers, updateUserRole, toggleUserApproval, toggleUserPermissions, toggleReadPermissions, toggleWritePermissions, updateEmployeeDetailsAdmin, updateModuleAccess } from '@/app/actions/team';

const MODULES_CONFIG = [
  { id: 'registration', label: 'New Client Registration', category: 'Sales' },
  { id: 'report', label: 'Client Registered Report', category: 'Sales' },
  { id: 'leads', label: 'Lead Data', category: 'Sales' },
  { id: 'orders', label: 'Order Management', category: 'Sales' },
  { id: 'mrp', label: 'MRP System', category: 'Purchase' },
  { id: 'mrp_against', label: 'MRP Against', category: 'Purchase' },
  { id: 'recruiter', label: 'Recruiter Dashboard', category: 'Human Resource' },
  { id: 'joining', label: 'Joining Process', category: 'Human Resource' },
];

const DEPARTMENTS = [
  "Accounts & Finance", "Administration", "Audit", "Dispatch", "Director",
  "Corporate Strategy and Planning", "Electrical & Maintenance", "Human Resource",
  "Human Resource & Administration", "Information Technology", "Logistics",
  "Manufacturing Engineering", "Marketing", "Operations", "Production",
  "Purchase", "Quality Assurance", "Research & Development", "Sales",
  "Sales & Marketing", "Service", "Store", "Tool Room", "Training and Development",
  "Transport", "Security", "Production Planning and Control", "Vendor Development"
];

const LEAD_STAGES = [
  '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', 
  '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage'
];

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ emp_id: '', emp_name: '', emp_department: '', emp_designation: '', company: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Access Manage state
  const [accessUser, setAccessUser] = useState(null);
  const [accessForm, setAccessForm] = useState({});
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getTeamMembers();
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const updateRole = async (userId, newRole) => {
    await updateUserRole(userId, newRole);
    fetchUsers();
  };

  const toggleImportExport = async (userId, currentValue) => {
    await toggleUserPermissions(userId, !currentValue);
    fetchUsers();
  };

  const toggleApproval = async (userId, currentValue) => {
    await toggleUserApproval(userId, !currentValue);
    fetchUsers();
  };

  const toggleRead = async (userId, currentValue) => {
    await toggleReadPermissions(userId, !currentValue);
    fetchUsers();
  };

  const toggleWrite = async (userId, currentValue) => {
    await toggleWritePermissions(userId, !currentValue);
    fetchUsers();
  };

  const handleEditClick = (user) => {
    setEditingUser(user.user_id);
    setEditForm({
      emp_id: user.emp_id || '',
      emp_name: user.emp_name || '',
      emp_department: user.emp_department || '',
      emp_designation: user.emp_designation || '',
      company: user.company || ''
    });
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    const result = await updateEmployeeDetailsAdmin(editingUser, editForm);
    setSavingEdit(false);
    if (result.success) {
      setEditingUser(null);
      fetchUsers();
    } else {
      alert("Error saving details: " + result.error);
    }
  };

  const handleAccessClick = (user) => {
    setAccessUser(user.user_id);
    setAccessForm(user.module_access || {});
  };

  const handleToggleModuleAccess = (moduleId) => {
    setAccessForm(prev => {
      const isCurrentlyViewable = !!prev[moduleId]?.view;
      if (isCurrentlyViewable) {
        const newState = { ...prev };
        delete newState[moduleId];
        return newState;
      } else {
        return {
          ...prev,
          [moduleId]: { 
            view: true, 
            is_manager: false, 
            assigned_steps: [] 
          }
        };
      }
    });
  };

  const handleToggleManagerLevel = (moduleId) => {
    setAccessForm(prev => ({
      ...prev,
      [moduleId]: {
        ...prev[moduleId],
        is_manager: !prev[moduleId]?.is_manager
      }
    }));
  };

  const handleToggleStep = (moduleId, stepName) => {
    setAccessForm(prev => {
      const currentSteps = prev[moduleId]?.assigned_steps || [];
      const isAssigned = currentSteps.includes(stepName);
      
      const newSteps = isAssigned 
        ? currentSteps.filter(s => s !== stepName)
        : [...currentSteps, stepName];

      return {
        ...prev,
        [moduleId]: {
          ...prev[moduleId],
          assigned_steps: newSteps
        }
      };
    });
  };

  const handleSaveAccess = async () => {
    setSavingAccess(true);
    const result = await updateModuleAccess(accessUser, accessForm);
    setSavingAccess(false);
    if (result.success) {
      setAccessUser(null);
      fetchUsers();
    } else {
      alert("Error saving access: " + result.error);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading team members...</div>;

  return (
    <div className="card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Team Roles & Permissions</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Manage what your team members can see and do within the CRM. Only Admins can access this panel.
      </p>

      <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
        <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
          <tr>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Emp ID</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Name & Email</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Dept / Desig</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Company</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Status</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Role</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Permissions</th>
            <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '1rem', fontWeight: 500 }}>{user.emp_id || '-'}</td>
              <td style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 600 }}>{user.emp_name || '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.email}</div>
              </td>
              <td style={{ padding: '1rem' }}>
                <div>{user.emp_department || '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.emp_designation || '-'}</div>
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--th-hover-bg)', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{user.company || 'All'}</span>
              </td>
              <td style={{ padding: '1rem' }}>
                <button 
                  onClick={() => toggleApproval(user.user_id, user.is_approved)}
                  disabled={user.role === 'admin'}
                  style={{ 
                    padding: '0.3rem 0.6rem', 
                    borderRadius: '99px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    border: 'none', 
                    cursor: user.role === 'admin' ? 'not-allowed' : 'pointer',
                    backgroundColor: user.is_approved ? '#dcfce7' : '#fee2e2',
                    color: user.is_approved ? '#166534' : '#991b1b'
                  }}
                >
                  {user.is_approved ? '✓ Approved' : '⏳ Pending'}
                </button>
              </td>
              <td style={{ padding: '1rem' }}>
                <select 
                  value={user.role} 
                  onChange={(e) => updateRole(user.user_id, e.target.value)}
                  disabled={user.role === 'admin'}
                  style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Sales">Sales</option>
                  <option value="Recruiter">Recruiter</option>
                  <option value="Purchase">Purchase</option>
                  <option value="agent">Agent (Legacy)</option>
                </select>
              </td>
              <td style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button 
                    onClick={() => handleAccessClick(user)}
                    disabled={user.role === 'admin' || user.role === 'Admin'}
                    style={{ padding: '0.4rem 0.8rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: (user.role === 'admin' || user.role === 'Admin') ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    Manage Access
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    <input 
                      type="checkbox" 
                      checked={user.can_import_export} 
                      onChange={() => toggleImportExport(user.user_id, user.can_import_export)}
                      disabled={user.role === 'Admin' || user.role === 'admin'}
                    />
                    Import/Export Power
                  </label>
                </div>
              </td>
              <td style={{ padding: '1rem' }}>
                <button 
                  onClick={() => handleEditClick(user)}
                  style={{ padding: '0.4rem 0.8rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
                >
                  Edit User
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem' }}>Edit Employee Details</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp ID</label>
                <input 
                  type="text" 
                  value={editForm.emp_id} 
                  onChange={e => setEditForm({...editForm, emp_id: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Emp Name</label>
                <input 
                  type="text" 
                  value={editForm.emp_name} 
                  onChange={e => setEditForm({...editForm, emp_name: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Department</label>
                <select 
                  value={editForm.emp_department} 
                  onChange={e => setEditForm({...editForm, emp_department: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">Select Department...</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Designation</label>
                <input 
                  type="text" 
                  value={editForm.emp_designation} 
                  onChange={e => setEditForm({...editForm, emp_designation: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company</label>
                <select 
                  value={editForm.company} 
                  onChange={e => setEditForm({...editForm, company: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">All Companies</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setEditingUser(null)}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Modal */}
      {accessUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Assign Processes</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Select which modules this user is allowed to access.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {['Sales', 'Purchase', 'Human Resource'].map(category => (
                <div key={category} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-primary)', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
                    {category} Department
                  </div>
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {MODULES_CONFIG.filter(m => m.category === category).map(module => (
                      <div key={module.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: accessForm[module.id]?.view ? '#f8fafc' : 'transparent', padding: '0.75rem', borderRadius: '6px', border: '1px solid', borderColor: accessForm[module.id]?.view ? '#cbd5e1' : 'transparent' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox"
                            checked={!!accessForm[module.id]?.view}
                            onChange={() => handleToggleModuleAccess(module.id)}
                            style={{ width: '1.2rem', height: '1.2rem' }}
                          />
                          <span style={{ fontSize: '1rem', fontWeight: accessForm[module.id]?.view ? 600 : 400 }}>{module.label}</span>
                        </label>

                        {/* Expand options if view is enabled and it's the leads module (or others later) */}
                        {accessForm[module.id]?.view && module.id === 'leads' && (
                          <div style={{ paddingLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#0369a1', fontWeight: 600 }}>
                              <input 
                                type="checkbox"
                                checked={!!accessForm[module.id]?.is_manager}
                                onChange={() => handleToggleManagerLevel(module.id)}
                              />
                              Manager Access (See All Workflow Steps)
                            </label>

                            {!accessForm[module.id]?.is_manager && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem', paddingLeft: '1.5rem', borderLeft: '2px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Assign specific steps to this user:</div>
                                {LEAD_STAGES.map(stage => (
                                  <label key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <input 
                                      type="checkbox"
                                      checked={(accessForm[module.id]?.assigned_steps || []).includes(stage)}
                                      onChange={() => handleToggleStep(module.id, stage)}
                                    />
                                    {stage}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setAccessUser(null)}
                style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAccess}
                disabled={savingAccess}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', borderRadius: '4px' }}
              >
                {savingAccess ? 'Saving...' : 'Save Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
