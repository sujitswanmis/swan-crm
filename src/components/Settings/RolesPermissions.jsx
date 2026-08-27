import React, { useState, useEffect } from 'react';
import { Shield, Save, Users, Key, AlertTriangle } from 'lucide-react';

export default function RolesPermissions() {
  const [loading, setLoading] = useState(false);
  const [activeRole, setActiveRole] = useState('sales');

  const [permissions, setPermissions] = useState({
    admin: { export: true, delete: true, viewAll: true, assign: true, editSettings: true },
    manager: { export: true, delete: false, viewAll: true, assign: true, editSettings: false },
    sales: { export: false, delete: false, viewAll: false, assign: false, editSettings: false },
    agent: { export: false, delete: false, viewAll: false, assign: false, editSettings: false },
  });

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      const res = await fetch('/api/settings/permissions');
      if (res.ok) {
        const data = await res.json();
        if (data.permissions && Object.keys(data.permissions).length > 0) {
          setPermissions(prev => ({ ...prev, ...data.permissions }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = (perm) => {
    setPermissions({
      ...permissions,
      [activeRole]: {
        ...permissions[activeRole],
        [perm]: !permissions[activeRole][perm]
      }
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Save for both 'sales' and 'agent' to handle older role naming
      const rolesToUpdate = activeRole === 'sales' ? ['sales', 'agent'] : [activeRole];
      
      for (const role of rolesToUpdate) {
        const res = await fetch('/api/settings/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId: role, permissions: permissions[activeRole] })
        });
        if (!res.ok) throw new Error(`Failed to save for role ${role}`);
      }
      
      window.dispatchEvent(new Event('global_permissions_updated'));
      alert('Permissions saved successfully!');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const PermissionRow = ({ id, label, desc, critical }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid var(--border-light)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{label}</span>
          {critical && <span style={{ padding: '0.1rem 0.4rem', background: '#fee2e2', color: '#ef4444', fontSize: '0.65rem', borderRadius: '4px', fontWeight: 'bold' }}>CRITICAL</span>}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{desc}</div>
      </div>
      <input 
        type="checkbox" 
        checked={permissions[activeRole][id]}
        onChange={() => handleToggle(id)}
        disabled={activeRole === 'admin'}
        style={{ cursor: activeRole === 'admin' ? 'not-allowed' : 'pointer', width: '18px', height: '18px', marginTop: '0.25rem' }}
      />
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Shield size={24} color="var(--accent-color)" />
          Roles & Permissions
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Control what different user roles can see and do within the CRM.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Role Selector */}
        <div style={{ width: '250px', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Select Role</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button 
              onClick={() => setActiveRole('admin')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: activeRole === 'admin' ? 'var(--accent-color)' : 'transparent', color: activeRole === 'admin' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeRole === 'admin' ? 600 : 400 }}
            >
              <Key size={16} /> Admin
            </button>
            <button 
              onClick={() => setActiveRole('manager')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: activeRole === 'manager' ? 'var(--accent-color)' : 'transparent', color: activeRole === 'manager' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeRole === 'manager' ? 600 : 400 }}
            >
              <Users size={16} /> Team Manager
            </button>
            <button 
              onClick={() => setActiveRole('sales')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: activeRole === 'sales' ? 'var(--accent-color)' : 'transparent', color: activeRole === 'sales' ? 'white' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: activeRole === 'sales' ? 600 : 400 }}
            >
              <Users size={16} /> Sales Executive
            </button>
          </div>
        </div>

        {/* Permissions Editor */}
        <div style={{ flex: 1, background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', background: 'var(--th-filtered-bg)', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{activeRole} Permissions</h3>
            {activeRole === 'admin' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                <AlertTriangle size={14} /> Admin permissions cannot be restricted.
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <PermissionRow 
              id="viewAll" 
              label="View All Leads" 
              desc="Allow user to see leads assigned to other team members." 
            />
            <PermissionRow 
              id="export" 
              label="Export Data (CSV/Excel)" 
              desc="Allow user to download lead databases to their local device." 
              critical
            />
            <PermissionRow 
              id="delete" 
              label="Delete Leads" 
              desc="Allow user to permanently delete leads from the system." 
              critical
            />
            <PermissionRow 
              id="assign" 
              label="Reassign Leads" 
              desc="Allow user to change the assignee of a lead." 
            />
            <PermissionRow 
              id="editSettings" 
              label="Access CRM Settings" 
              desc="Allow user to open this Settings panel and change configurations." 
              critical
            />
          </div>

          <div style={{ padding: '1.5rem', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={handleSave}
              disabled={loading || activeRole === 'admin'}
              style={{ 
                padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', 
                border: 'none', borderRadius: '8px', cursor: (loading || activeRole === 'admin') ? 'not-allowed' : 'pointer', 
                fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: (loading || activeRole === 'admin') ? 0.7 : 1
              }}
            >
              <Save size={18} />
              {loading ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
