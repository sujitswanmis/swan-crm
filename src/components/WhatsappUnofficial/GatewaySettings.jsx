'use client';

import React, { useState, useEffect } from 'react';
import { 
  getAdminMessageConfig, 
  saveAdminMessageConfig, 
  testAdminChannel 
} from '@/app/actions/adminMessageConfig';
import { 
  Phone, Settings, Save, RefreshCw, Send, 
  CheckCircle2, AlertCircle, Shield, Globe, Key, HelpCircle 
} from 'lucide-react';

const BSP_PROVIDERS = [
  { 
    id: 'aknexus', 
    label: 'AK Nexus Gateway', 
    url: 'https://app.aknexus.in/api', 
    description: 'High-speed WhatsApp Web gateway with instant QR generation and media dispatch.' 
  },
  { 
    id: 'saasyto', 
    label: 'Saasyto Gateway', 
    url: 'https://web.saasyto.com/api', 
    description: 'Multi-device WhatsApp SaaS automation platform with webhook callbacks.' 
  },
  { 
    id: 'mytapi', 
    label: 'MyTAPI Gateway', 
    url: 'https://api.mytapi.com/api', 
    description: 'Unofficial WhatsApp REST API for CRM integration and automated notifications.' 
  },
  { 
    id: 'custom', 
    label: 'Custom / Self-Hosted Gateway', 
    url: '', 
    description: 'Use your own Baileys, Evolution API, or custom WhatsApp HTTP server.' 
  }
];

export default function GatewaySettings({ isAdmin = true, onNavigateToInstances }) {
  const [config, setConfig] = useState({
    enabled: true,
    provider: 'aknexus',
    server_url: 'https://app.aknexus.in/api',
    api_token: '6abe519e92b26',
    instance_id: '6AD37D9D501B2',
    max_scanned_instances: 5
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test Dispatch State
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState(null);

  useEffect(() => {
    loadGatewayConfig();
  }, []);

  const loadGatewayConfig = async () => {
    setLoading(true);
    const res = await getAdminMessageConfig();
    if (res.success && res.data?.wa_unofficial) {
      const wa = res.data.wa_unofficial;
      setConfig({
        enabled: wa.enabled !== false,
        provider: wa.provider || 'aknexus',
        server_url: wa.server_url || 'https://app.aknexus.in/api',
        api_token: wa.api_token || '6abe519e92b26',
        instance_id: wa.instance_id || '6AD37D9D501B2',
        max_scanned_instances: typeof wa.max_scanned_instances === 'number' ? wa.max_scanned_instances : 5
      });
    }
    setLoading(false);
  };

  const handleProviderChange = (newProvider) => {
    const prov = BSP_PROVIDERS.find(p => p.id === newProvider);
    setConfig(prev => ({
      ...prev,
      provider: newProvider,
      server_url: prov && prov.url ? prov.url : prev.server_url
    }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const res = await saveAdminMessageConfig('wa_unofficial', config);
    setSaving(false);

    if (res.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } else {
      alert(`Failed to save configuration: ${res.error}`);
    }
  };

  const handleTest = async () => {
    if (!testNumber.trim()) {
      alert('Please enter a recipient mobile number (e.g. 917261902348).');
      return;
    }

    setTesting(true);
    setTestResponse(null);

    const cleanNum = testNumber.replace(/[^0-9]/g, '');
    const res = await testAdminChannel('wa_unofficial', { wa_unofficial: config }, cleanNum);
    
    setTesting(false);
    setTestResponse(res);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
        <p>Loading WhatsApp BSP settings...</p>
      </div>
    );
  }

  const currentProviderObj = BSP_PROVIDERS.find(p => p.id === config.provider) || BSP_PROVIDERS[0];

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Settings size={22} style={{ color: '#059669' }} />
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
              WhatsApp Unofficial &bull; BSP &amp; API Setup
            </h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.3rem 0 0 0' }}>
            One-time gateway setup for unofficial WhatsApp providers (AK Nexus, Saasyto, MyTAPI) and Master Admin account limits.
          </p>
        </div>

        {onNavigateToInstances && (
          <button 
            type="button"
            onClick={onNavigateToInstances}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px' }}
          >
            Go to Instance Management &rarr;
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(450px, 1.4fr) minmax(300px, 0.8fr)', gap: '1.5rem' }}>
        
        {/* Left Column: Settings Form */}
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px' }}>
          
          <form onSubmit={handleSave}>
            
            {/* Top Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Enable Unofficial WhatsApp Service</span>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                  Enable or temporarily pause automated WhatsApp sending across the CRM.
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer' }}
                />
                {config.enabled ? <span style={{ color: '#059669' }}>Active</span> : <span style={{ color: '#94a3b8' }}>Inactive</span>}
              </label>
            </div>

            {/* Provider Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Select BSP Provider *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {BSP_PROVIDERS.map(prov => {
                  const isSelected = config.provider === prov.id;
                  return (
                    <div
                      key={prov.id}
                      onClick={() => handleProviderChange(prov.id)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #059669' : '1px solid var(--border-light)',
                        background: isSelected ? '#f0fdf4' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isSelected ? '#047857' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {isSelected && <CheckCircle2 size={14} color="#059669" />}
                        {prov.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: '1.3' }}>
                        {prov.url || 'Self-hosted URL'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Server Base URL */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Gateway Server Base URL *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Globe size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={config.server_url}
                  onChange={(e) => setConfig({ ...config, server_url: e.target.value })}
                  placeholder="https://app.aknexus.in/api"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                CRM will query <code>/create_instance</code>, <code>/get_qrcode</code>, and <code>/send</code> relative to this base.
              </span>
            </div>

            {/* Access Token */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Gateway Access Token / API Key *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={config.api_token}
                  onChange={(e) => setConfig({ ...config, api_token: e.target.value })}
                  placeholder="e.g. 6abe519e92b26"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Authentication token provided by your BSP dashboard (e.g. AK Nexus).
              </span>
            </div>

            {/* Scanned Accounts Limit (Master Admin Control) */}
            <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                <Shield size={16} style={{ color: '#4f46e5' }} />
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                  Max Allowed Scanned WhatsApp Accounts (Master Admin Limit) *
                </label>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                Control how many simultaneous active WhatsApp accounts can be scanned and connected across this workspace.
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={!isAdmin}
                  value={config.max_scanned_instances}
                  onChange={(e) => setConfig({ ...config, max_scanned_instances: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100px', padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}
                />

                {/* Quick preset buttons */}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {[1, 2, 5, 10, 0].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setConfig({ ...config, max_scanned_instances: val })}
                        style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: config.max_scanned_instances === val ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                          background: config.max_scanned_instances === val ? '#e0e7ff' : '#fff',
                          color: config.max_scanned_instances === val ? '#3730a3' : '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        {val === 0 ? 'Unlimited' : `${val} Acc.`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                {config.max_scanned_instances === 0 ? '✨ Unlimited accounts allowed' : `Currently capped at ${config.max_scanned_instances} account(s). Excess scans will be blocked.`}
              </span>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {saveSuccess && (
                  <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CheckCircle2 size={16} /> Saved Successfully! Setup is Live.
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary"
                style={{
                  padding: '0.65rem 1.75rem',
                  borderRadius: '6px',
                  backgroundColor: '#059669',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? 'Saving...' : 'Save Gateway Configuration'}
              </button>
            </div>

          </form>

        </div>

        {/* Right Column: Live Test Box & Quick Guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Live Test Dispatch */}
          <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Send size={16} style={{ color: '#059669' }} /> Verify Gateway Connection
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0 0 1rem 0' }}>
              Dispatch a live ping message through the configured credentials to verify your token and server URL.
            </p>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Test Mobile Number (with country code)
              </label>
              <input
                type="text"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="e.g. 917261902348"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !testNumber.trim()}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                backgroundColor: '#059669',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                cursor: (testing || !testNumber.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {testing ? 'Testing...' : 'Test Gateway Now'}
            </button>

            {testResponse && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                backgroundColor: testResponse.success ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${testResponse.success ? '#a7f3d0' : '#fecaca'}`,
                color: testResponse.success ? '#15803d' : '#b91c1c'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {testResponse.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {testResponse.success ? 'Success' : 'Error'}
                </div>
                <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                  {testResponse.message || testResponse.error}
                </div>
              </div>
            )}
          </div>

          {/* Quick 3-Step Guide */}
          <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <HelpCircle size={15} color="#4f46e5" /> Quick Workflow Guide
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem', color: '#475569', lineHeight: '1.4' }}>
              <div><strong>1. One-time Setup:</strong> Choose provider (AK Nexus / Saasyto / MyTAPI) and save your Access Token here.</div>
              <div><strong>2. Scan QR:</strong> Go to <strong>Instance Management</strong> and click <strong>&quot;New Instance&quot;</strong> or <strong>&quot;Scan QR&quot;</strong>.</div>
              <div><strong>3. Chalna Start:</strong> Scan code via WhatsApp mobile. Status flips to <em>Connected</em> and outbound messaging is live instantly!</div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
