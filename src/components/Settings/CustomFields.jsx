import React, { useState } from 'react';
import { FormInput, Plus, Trash2, GripVertical, Save } from 'lucide-react';
import { logAuditAction } from '@/app/actions/audit';

export default function CustomFields() {
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState([
    { id: 1, name: 'Expected Budget', type: 'Number', required: false },
    { id: 2, name: 'Priority', type: 'Dropdown', required: true }
  ]);

  const handleAddField = () => {
    setFields([...fields, { id: Date.now(), name: '', type: 'Text', required: false }]);
  };

  const handleRemoveField = (id) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id, key, value) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const handleSave = () => {
    setLoading(true);
    try {
      logAuditAction('Update Custom Fields', `Updated custom form fields (${fields.length} fields configured)`);
    } catch(e) { console.error('Audit Log failed', e); }
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FormInput size={24} color="var(--accent-color)" />
          Custom Fields (Form Builder)
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Add custom data fields to your Lead Registration form without coding.</p>
      </div>

      <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Lead Data Fields</h3>
          <button onClick={handleAddField} style={{ padding: '0.5rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.85rem' }}>
            <Plus size={16} /> Add Custom Field
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {fields.map((field, index) => (
            <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <GripVertical size={18} color="#94a3b8" style={{ cursor: 'grab' }} />
              
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Field Name</label>
                <input 
                  type="text" 
                  value={field.name}
                  onChange={(e) => updateField(field.id, 'name', e.target.value)}
                  placeholder="e.g. Budget"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ width: '150px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Field Type</label>
                <select 
                  value={field.type}
                  onChange={(e) => updateField(field.id, 'type', e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem', cursor: 'pointer' }}
                >
                  <option value="Text">Short Text</option>
                  <option value="Number">Number</option>
                  <option value="Dropdown">Dropdown</option>
                  <option value="Date">Date</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                <input 
                  type="checkbox" 
                  checked={field.required}
                  onChange={(e) => updateField(field.id, 'required', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Required</span>
              </div>

              <button onClick={() => handleRemoveField(field.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#ef4444', marginTop: '1.25rem', display: 'flex', borderRadius: '4px' }} onMouseOver={e => e.currentTarget.style.background='#fee2e2'} onMouseOut={e => e.currentTarget.style.background='transparent'}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          
          {fields.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'var(--th-filtered-bg)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
              No custom fields added yet. Click "Add Custom Field" to create one.
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem' }}>
          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Form Schema'}
          </button>
        </div>
      </div>
    </div>
  );
}
