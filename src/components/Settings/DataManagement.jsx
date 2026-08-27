import React from 'react';
import { Database, Download, Upload, Trash2, AlertTriangle } from 'lucide-react';

export default function DataManagement() {
  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={24} color="var(--accent-color)" />
          Data Management & Backup
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Import, export, and clean up your CRM database.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* Export / Import */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Data Portability</h3>
          
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ flex: 1, padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', textAlign: 'center' }}>
              <Download size={32} color="var(--accent-color)" style={{ marginBottom: '1rem' }} />
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Export Database</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Download a complete CSV backup of all leads, contacts, and stages.</p>
              <button style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                Generate Full Backup
              </button>
            </div>

            <div style={{ flex: 1, padding: '1.5rem', background: 'var(--bg-surface)', border: '1px dashed var(--border-light)', borderRadius: '8px', textAlign: 'center' }}>
              <Upload size={32} color="#94a3b8" style={{ marginBottom: '1rem' }} />
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Import Leads</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Upload an Excel or CSV file to bulk add leads into the CRM.</p>
              <button style={{ padding: '0.6rem 1.5rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                Choose CSV File
              </button>
            </div>
          </div>
        </div>

        {/* Data Cleanup */}
        <div style={{ background: '#fef2f2', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <AlertTriangle size={20} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#b91c1c' }}>Data Cleanup (Danger Zone)</h3>
          </div>
          <p style={{ color: '#991b1b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            These actions are irreversible. Deleted data cannot be recovered unless you have a recent backup.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#7f1d1d', fontSize: '0.95rem' }}>Delete Junk Leads</div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b' }}>Permanently remove all leads marked as "Junk" or "Dead".</div>
              </div>
              <button style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                <Trash2 size={16} /> Delete Now
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#7f1d1d', fontSize: '0.95rem' }}>Delete Old Leads (1+ Year)</div>
                <div style={{ fontSize: '0.8rem', color: '#991b1b' }}>Remove leads that haven't been updated in over a year.</div>
              </div>
              <button style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                <Trash2 size={16} /> Delete Now
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
