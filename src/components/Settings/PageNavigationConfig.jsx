import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';

export default function PageNavigationConfig() {
  const [settings, setSettings] = useState({
    pageNumberingJump: 7,
    defaultPageSize: '15',
    availablePageSizes: '3, 5, 10, 15, 20, 50, 100'
  });
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const savedSettings = localStorage.getItem('crmPageNavSettings');
    if (savedSettings) {
      try {
        setSettings({ ...settings, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error("Failed to parse settings");
      }
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'pageNumberingJump') {
      const parsed = parseInt(value, 10);
      setSettings(prev => ({ ...prev, [name]: isNaN(parsed) ? '' : parsed }));
    } else {
      // For defaultPageSize, we allow text (so they can type 'All' or a number)
      setSettings(prev => ({ ...prev, [name]: value }));
    }
    setIsSaved(false);
  };

  const handleSave = () => {
    let size = settings.defaultPageSize;
    if (String(size).toLowerCase() !== 'all') {
       size = parseInt(size, 10);
       if (isNaN(size) || size < 1) size = 15;
    } else {
       size = 'All';
    }
    
    const finalSettings = {
      pageNumberingJump: settings.pageNumberingJump || 7,
      defaultPageSize: size,
      availablePageSizes: settings.availablePageSizes || '3, 5, 10, 15, 20, 50, 100'
    };
    setSettings(finalSettings);
    localStorage.setItem('crmPageNavSettings', JSON.stringify(finalSettings));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Page Navigation Settings</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Configure how table pagination behaves across the CRM.</p>
      </div>

      <div className="card" style={{ padding: '1.5rem', border: '1px solid var(--border-light)', borderRadius: '8px', marginBottom: '1.5rem' }}>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Page Numbering Jump (Pages to show)
          </label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Determines how many page numbers to show before and after the current page. For example, a jump of 3 shows [1 2 3 (4) 5 6 7].
          </p>
          <input 
            type="number" 
            name="pageNumberingJump"
            min="1"
            max="10"
            value={settings.pageNumberingJump}
            onChange={handleChange}
            style={{ width: '150px', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Available Page Sizes (Dropdown Options)
          </label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Enter comma-separated numbers (e.g. 3, 5, 10, 15). These will appear in the table dropdowns. "All" is automatically added at the end.
          </p>
          <input 
            type="text"
            name="availablePageSizes"
            value={settings.availablePageSizes}
            onChange={handleChange}
            placeholder="e.g. 3, 5, 10, 15"
            style={{ width: '300px', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Default Records Per Page
          </label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            The default number of rows shown per page when you first load the data tables.
          </p>
          <input 
            type="text"
            name="defaultPageSize"
            value={settings.defaultPageSize}
            onChange={handleChange}
            placeholder="e.g. 15, 50, or All"
            style={{ width: '150px', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}
          />
        </div>

      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button 
          onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
        >
          <Save size={18} /> Save Settings
        </button>
        {isSaved && <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', fontWeight: '500' }}><AlertCircle size={16} /> Saved Successfully (Refresh table to apply)</span>}
      </div>

    </div>
  );
}
