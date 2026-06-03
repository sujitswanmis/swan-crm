import React, { useState } from 'react';
import { FileType, HardDrive, FileImage, Save } from 'lucide-react';

export default function FileMedia() {
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState('10');
  const [template, setTemplate] = useState('modern');

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileType size={24} color="var(--accent-color)" />
          File & Media Settings
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Configure attachment limits and document templates.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* Storage Limits */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <HardDrive size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Storage & Upload Limits</h3>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Maximum file size per attachment</label>
              <select 
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                style={{ width: '100%', maxWidth: '200px', padding: '0.75rem 1rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', cursor: 'pointer' }}
              >
                <option value="5">5 MB</option>
                <option value="10">10 MB</option>
                <option value="25">25 MB</option>
                <option value="50">50 MB</option>
              </select>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Limits apply to PDFs and images uploaded in Lead Profiles.</p>
            </div>
          </div>
        </div>

        {/* Invoice Templates */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <FileImage size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Document Templates</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Select the design layout for PDF Quotations and Invoices generated from the CRM.
          </p>

          <div style={{ display: 'flex', gap: '1.5rem' }}>
            
            <div 
              onClick={() => setTemplate('classic')}
              style={{ flex: 1, padding: '1rem', border: `2px solid ${template === 'classic' ? 'var(--accent-color)' : 'var(--border-light)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center', background: 'var(--bg-surface)', transition: 'border 0.2s' }}
            >
              <div style={{ width: '100%', height: '120px', background: 'var(--th-filtered-bg)', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                Classic Layout
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Classic</div>
            </div>

            <div 
              onClick={() => setTemplate('modern')}
              style={{ flex: 1, padding: '1rem', border: `2px solid ${template === 'modern' ? 'var(--accent-color)' : 'var(--border-light)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center', background: 'var(--bg-surface)', transition: 'border 0.2s' }}
            >
              <div style={{ width: '100%', height: '120px', background: 'linear-gradient(to bottom right, var(--bg-surface), var(--th-filtered-bg))', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                Modern Layout
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Modern</div>
            </div>

          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
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
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

      </div>
    </div>
  );
}
