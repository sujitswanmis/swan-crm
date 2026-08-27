import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function PageNavigationConfig() {
  const [settings, setSettings] = useState({
    pageNumberingJump: 7,
    defaultPageSize: '15',
    availablePageSizes: '3, 5, 10, 15, 20, 50, 100'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [statusMessage, setStatusMessage] = useState('');

  // Load settings on mount from API + LocalStorage fallback
  useEffect(() => {
    let isMounted = true;
    
    // First load from localStorage for instant display
    try {
      const cached = localStorage.getItem('crmPageNavSettings');
      if (cached) {
        setSettings(prev => ({ ...prev, ...JSON.parse(cached) }));
      }
    } catch (e) {}

    // Then fetch from database via API
    fetch('/api/settings/page-navigation')
      .then(res => res.json())
      .then(data => {
        if (isMounted && data?.settings) {
          setSettings(prev => ({
            ...prev,
            pageNumberingJump: data.settings.pageNumberingJump ?? 7,
            defaultPageSize: String(data.settings.defaultPageSize ?? '15'),
            availablePageSizes: data.settings.availablePageSizes ?? '3, 5, 10, 15, 20, 50, 100'
          }));
          localStorage.setItem('crmPageNavSettings', JSON.stringify(data.settings));
        }
      })
      .catch(err => {
        console.error('Failed to load page navigation settings from server:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'pageNumberingJump') {
      const parsed = parseInt(value, 10);
      setSettings(prev => ({ ...prev, [name]: isNaN(parsed) ? '' : parsed }));
    } else {
      setSettings(prev => ({ ...prev, [name]: value }));
    }
    setSaveStatus(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

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

    setSettings(prev => ({ ...prev, ...finalSettings }));

    // 1. Save to LocalStorage immediately
    try {
      localStorage.setItem('crmPageNavSettings', JSON.stringify(finalSettings));
      
      const crmConfigRaw = localStorage.getItem('crm_config');
      const crmConfig = crmConfigRaw ? JSON.parse(crmConfigRaw) : {};
      crmConfig.pageNavSettings = finalSettings;
      localStorage.setItem('crm_config', JSON.stringify(crmConfig));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }

    // 2. Dispatch global events so open tables update live
    window.dispatchEvent(new Event('crm_page_nav_updated'));
    window.dispatchEvent(new Event('crm_config_updated'));

    // 3. Save to Database via API
    try {
      const res = await fetch('/api/settings/page-navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalSettings)
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Server returned an error');
      }

      setSaveStatus('success');
      setStatusMessage('Settings saved permanently to database & applied!');
    } catch (err) {
      console.error('Error saving settings to server:', err);
      setSaveStatus('warning');
      setStatusMessage('Saved to browser locally. Server sync failed: ' + err.message);
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        setSaveStatus(null);
      }, 5000);
    }
  };

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Page Navigation Settings</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Configure how table pagination behaves across the CRM permanently.</p>
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
            max="15"
            value={settings.pageNumberingJump}
            onChange={handleChange}
            style={{ width: '150px', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Available Page Sizes (Dropdown Options)
          </label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Enter comma-separated numbers (e.g. 3, 5, 10, 15, 20, 50, 100). These will appear in the table dropdowns. "All" is automatically added at the end.
          </p>
          <input 
            type="text"
            name="availablePageSizes"
            value={settings.availablePageSizes}
            onChange={handleChange}
            placeholder="e.g. 3, 5, 10, 15, 20, 50, 100"
            style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
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
            style={{ width: '150px', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
          />
        </div>

      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'var(--accent-color)', 
            color: 'white', 
            border: 'none', 
            padding: '0.75rem 1.5rem', 
            borderRadius: '6px', 
            fontWeight: '600', 
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.7 : 1
          }}
        >
          {isSaving ? <Loader2 size={18} className="spin" /> : <Save size={18} />} 
          {isSaving ? 'Saving to Database...' : 'Save Settings'}
        </button>

        {saveStatus === 'success' && (
          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', fontWeight: '600' }}>
            <CheckCircle2 size={18} /> {statusMessage}
          </span>
        )}

        {saveStatus === 'warning' && (
          <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', fontWeight: '500' }}>
            <AlertCircle size={18} /> {statusMessage}
          </span>
        )}
      </div>

    </div>
  );
}
