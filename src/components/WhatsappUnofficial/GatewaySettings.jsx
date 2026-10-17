'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  getAdminMessageConfig, 
  saveAdminMessageConfig, 
  testAdminChannel 
} from '@/app/actions/adminMessageConfig';
import {
  getSaaSTenantsAndAllocations,
  saveSaaSTenantAllocation,
  saveCustomBspProvider
} from '@/app/actions/whatsappUnofficialDb';
import { 
  Phone, Settings, Save, RefreshCw, Send, 
  CheckCircle2, AlertCircle, Shield, Globe, Key, HelpCircle,
  Plus, Building2, ExternalLink, X, Sliders, Check, Layers, Hash
} from 'lucide-react';

// Built-in Default BSP Catalog with standard endpoints & descriptions
const DEFAULT_BSP_PROVIDERS = [
  { 
    id: 'aknexus', 
    label: 'AK Nexus Gateway', 
    url: 'https://app.aknexus.in/api', 
    description: 'High-speed WhatsApp Web gateway with auto-healing instance sessions and media dispatch.',
    authType: 'Query Param (?access_token=...)'
  },
  { 
    id: 'mytapi', 
    label: 'MyTAPI Gateway', 
    url: 'https://api.mytapi.com/api', 
    description: 'Unofficial WhatsApp REST API requiring instance_id, access_token, and phone_id.',
    authType: 'Query / Body (phone_id, access_token)'
  },
  { 
    id: 'wasender', 
    label: 'Wasender API', 
    url: 'https://wasenderapi.com/api', 
    description: 'Official multi-device session REST API with Bearer token authentication.',
    authType: 'Bearer Token (Authorization: Bearer ...)'
  },
  { 
    id: 'evolution', 
    label: 'Evolution API', 
    url: 'http://localhost:8080', 
    description: 'Self-hosted or cloud Baileys gateway supporting multi-instance webhooks.',
    authType: 'Header (apikey: ...)'
  },
  { 
    id: 'ultramsg', 
    label: 'UltraMsg Gateway', 
    url: 'https://api.ultramsg.com', 
    description: 'Cloud-hosted WhatsApp API service for automated customer chat and notifications.',
    authType: 'Token (?token=...)'
  },
  { 
    id: 'wppconnect', 
    label: 'WPPConnect Server', 
    url: 'http://localhost:21465', 
    description: 'Open-source JavaScript WhatsApp Web engine with session QR streams.',
    authType: 'Bearer Token'
  },
  { 
    id: 'saasyto', 
    label: 'Saasyto Gateway', 
    url: 'https://web.saasyto.com/api', 
    description: 'Multi-device WhatsApp SaaS automation platform with webhook callbacks.',
    authType: 'Query Param (?access_token=...)'
  },
  { 
    id: 'custom', 
    label: 'Custom / Self-Hosted Gateway', 
    url: '', 
    description: 'Connect your own private WhatsApp server, Baileys container, or proxy gateway.',
    authType: 'Configurable'
  }
];

export default function GatewaySettings({ isAdmin = true, onNavigateToInstances }) {
  // Global config state
  const [config, setConfig] = useState({
    enabled: true,
    provider: 'aknexus',
    server_url: 'https://app.aknexus.in/api',
    instance_id: '6AD37BDFCEDF5',
    api_token: '6abe519e92b26',
    phone_id: '',
    max_scanned_instances: 5,
    custom_providers: []
  });

  const [customProviders, setCustomProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test Dispatch State
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState(null);

  // SaaS Tenants Matrix State
  const [tenants, setTenants] = useState([]);
  const [tenantAllocations, setTenantAllocations] = useState({});
  const [tenantSaving, setTenantSaving] = useState({});
  const [tenantSaved, setTenantSaved] = useState({});

  // Add Custom BSP Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBsp, setNewBsp] = useState({
    id: '',
    label: '',
    url: '',
    description: '',
    authType: 'Bearer Token'
  });
  const [modalSaving, setModalSaving] = useState(false);

  // Column Resizing for SaaS Allocation Matrix Table (Lead Data Pattern)
  const defaultColWidths = {
    tenant: 190,
    provider: 160,
    maxLimit: 100,
    instanceId: 150,
    apiToken: 150,
    phoneId: 140,
    serverUrl: 180,
    status: 90,
    actions: 110
  };

  const [colWidths, setColWidths] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wa_unofficial_tenant_table_col_widths_v2');
        if (saved) return { ...defaultColWidths, ...JSON.parse(saved) };
      } catch (e) {}
    }
    return defaultColWidths;
  });

  const [activeResizingCol, setActiveResizingCol] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('wa_unofficial_tenant_table_col_widths_v2', JSON.stringify(colWidths));
      } catch (e) {}
    }
  }, [colWidths]);

  // Handle Drag Resizing
  const handleMouseDownResize = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveResizingCol(colKey);
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || defaultColWidths[colKey];

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(65, startWidth + delta);
      setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      setActiveResizingCol(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClickReset = (colKey) => {
    setColWidths(prev => ({ ...prev, [colKey]: defaultColWidths[colKey] }));
  };

  // Load Initial Settings & Tenants
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [cfgRes, tenantRes] = await Promise.all([
        getAdminMessageConfig(),
        getSaaSTenantsAndAllocations()
      ]);

      if (cfgRes.success && cfgRes.data?.wa_unofficial) {
        const wa = cfgRes.data.wa_unofficial;
        setConfig({
          enabled: wa.enabled !== false,
          provider: wa.provider || 'aknexus',
          server_url: wa.server_url || 'https://app.aknexus.in/api',
          instance_id: wa.instance_id || '6AD37BDFCEDF5',
          api_token: wa.api_token || '6abe519e92b26',
          phone_id: wa.phone_id || '',
          max_scanned_instances: typeof wa.max_scanned_instances === 'number' ? wa.max_scanned_instances : 5,
          custom_providers: Array.isArray(wa.custom_providers) ? wa.custom_providers : []
        });

        if (Array.isArray(wa.custom_providers)) {
          setCustomProviders(wa.custom_providers);
        }
      }

      if (tenantRes.success) {
        setTenants(tenantRes.tenants || []);
        const allocMap = {};
        (tenantRes.tenants || []).forEach(t => {
          allocMap[t.id] = {
            provider: t.assigned_provider || 'aknexus',
            max_scanned_instances: t.max_scanned_instances,
            instance_id: t.instance_id || '',
            api_token: t.api_token || '',
            phone_id: t.phone_id || '',
            server_url: t.server_url || '',
            is_active: t.is_allocated_active !== false
          };
        });
        setTenantAllocations(allocMap);
      }
    } catch (err) {
      console.error('loadAllData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const allProviders = [...DEFAULT_BSP_PROVIDERS, ...customProviders];

  const handleProviderChange = (newProvider) => {
    const prov = allProviders.find(p => p.id === newProvider);
    setConfig(prev => ({
      ...prev,
      provider: newProvider,
      server_url: prov && prov.url ? prov.url : prev.server_url
    }));
  };

  const handleSaveGlobal = async (e) => {
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

  const handleTenantFieldChange = (tenantId, field, value) => {
    setTenantAllocations(prev => ({
      ...prev,
      [tenantId]: {
        ...(prev[tenantId] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveTenantAllocation = async (tenantId) => {
    const alloc = tenantAllocations[tenantId];
    if (!alloc) return;

    setTenantSaving(prev => ({ ...prev, [tenantId]: true }));
    setTenantSaved(prev => ({ ...prev, [tenantId]: false }));

    const res = await saveSaaSTenantAllocation(tenantId, alloc);
    setTenantSaving(prev => ({ ...prev, [tenantId]: false }));

    if (res.success) {
      setTenantSaved(prev => ({ ...prev, [tenantId]: true }));
      setTimeout(() => {
        setTenantSaved(prev => ({ ...prev, [tenantId]: false }));
      }, 3000);
    } else {
      alert(`Failed to save tenant allocation: ${res.error}`);
    }
  };

  const handleAddCustomBsp = async (e) => {
    e.preventDefault();
    if (!newBsp.label.trim()) {
      alert('Please enter a provider name.');
      return;
    }

    const providerId = (newBsp.id || newBsp.label.toLowerCase().replace(/[^a-z0-9]/g, '_')).trim();
    const payload = {
      id: providerId,
      label: newBsp.label.trim(),
      url: newBsp.url.trim(),
      description: newBsp.description.trim() || 'Custom WhatsApp Gateway',
      authType: newBsp.authType || 'Bearer Token'
    };

    setModalSaving(true);
    const res = await saveCustomBspProvider(payload);
    setModalSaving(false);

    if (res.success) {
      setCustomProviders(res.customProviders || [...customProviders, payload]);
      setIsModalOpen(false);
      setNewBsp({ id: '', label: '', url: '', description: '', authType: 'Bearer Token' });
    } else {
      alert(`Error adding provider: ${res.error}`);
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
        <p>Loading WhatsApp BSP settings &amp; SaaS Tenant Allocations...</p>
      </div>
    );
  }

  const isMyTapiSelected = config.provider === 'mytapi';

  return (
    <div style={{ flex: 1, padding: '1.75rem', overflowY: 'auto' }}>
      
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
            Configure default credentials (Instance ID, Access Token, Phone ID for MyTAPI) and allocate dedicated gateways across SaaS tenants.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              padding: '0.55rem 1rem', 
              borderRadius: '6px', 
              borderColor: '#059669', 
              color: '#059669',
              fontWeight: 700 
            }}
          >
            <Plus size={16} /> Add New BSP Provider
          </button>

          {onNavigateToInstances && (
            <button 
              type="button"
              onClick={onNavigateToInstances}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1rem', borderRadius: '6px' }}
            >
              Go to Instance Management &rarr;
            </button>
          )}
        </div>
      </div>

      {/* Top Grid: Master Global Setup + Test Box */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(450px, 1.4fr) minmax(300px, 0.8fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Left Column: Global Provider Config */}
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px' }}>
          
          <form onSubmit={handleSaveGlobal}>
            
            {/* Top Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Enable Unofficial WhatsApp Engine</span>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                  Enable or temporarily pause automated WhatsApp sending globally across the workspace.
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

            {/* Provider Grid Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  Global Default BSP Provider *
                </label>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#059669', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Plus size={13} /> + Add Another Gateway
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto', padding: '2px' }}>
                {allProviders.map(prov => {
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
                        transition: 'all 0.15s',
                        position: 'relative'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: isSelected ? '#047857' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {isSelected && <CheckCircle2 size={14} color="#059669" />}
                        {prov.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: '1.3' }}>
                        {prov.url || 'Self-hosted URL'}
                      </div>
                      {prov.authType && (
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.3rem', fontStyle: 'italic' }}>
                          {prov.authType}
                        </div>
                      )}
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
                  placeholder="e.g. https://app.aknexus.in/api or https://api.mytapi.com/api"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Base URL for API queries like <code>/create_instance</code>, <code>/get_qrcode</code>, and <code>/send</code>.
              </span>
            </div>

            {/* Default Instance ID */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  Default Instance ID *
                </label>
                <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                  e.g. 6AD37BDFCEDF5
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Hash size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={config.instance_id}
                  onChange={(e) => setConfig({ ...config, instance_id: e.target.value })}
                  placeholder="e.g. 6AD37BDFCEDF5"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Standard instance or session identifier provided by your unofficial WhatsApp provider.
              </span>
            </div>

            {/* Access Token */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                  Gateway Access Token / API Key *
                </label>
                <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                  e.g. 6abe519e92b26
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={config.api_token}
                  onChange={(e) => setConfig({ ...config, api_token: e.target.value })}
                  placeholder="e.g. 6abe519e92b26"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Authentication secret / token used to authorize requests against the WhatsApp gateway.
              </span>
            </div>

            {/* Phone ID (Required for MyTAPI / Multi-device Gateways) */}
            <div style={{ 
              marginBottom: '1.25rem',
              background: isMyTapiSelected ? '#eff6ff' : 'transparent',
              padding: isMyTapiSelected ? '0.75rem' : '0',
              borderRadius: isMyTapiSelected ? '8px' : '0',
              border: isMyTapiSelected ? '1px solid #bfdbfe' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Phone ID</span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    background: isMyTapiSelected ? '#2563eb' : '#dbeafe', 
                    color: isMyTapiSelected ? '#fff' : '#1d4ed8', 
                    padding: '0.15rem 0.45rem', 
                    borderRadius: '4px', 
                    fontWeight: 700 
                  }}>
                    {isMyTapiSelected ? '★ Required for MyTAPI' : 'MyTAPI / Multi-Device'}
                  </span>
                </label>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Optional for others
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: '10px', color: isMyTapiSelected ? '#2563eb' : 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={config.phone_id || ''}
                  onChange={(e) => setConfig({ ...config, phone_id: e.target.value })}
                  placeholder="e.g. 919876543210 or device phone id"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: isMyTapiSelected ? '1px solid #93c5fd' : '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
              <span style={{ fontSize: '0.73rem', color: isMyTapiSelected ? '#1e40af' : 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Required when using <strong>MyTAPI</strong> or device-bound multi-phone gateways. Leave empty if using AK Nexus, Wasender, or Evolution.
              </span>
            </div>

            {/* Scanned Accounts Limit (Master Admin Control) */}
            <div style={{ marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                <Shield size={16} style={{ color: '#4f46e5' }} />
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                  Global Max Allowed Scanned WhatsApp Accounts *
                </label>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                Default limit for simultaneous active WhatsApp accounts across tenants without individual allocation.
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
                {saving ? 'Saving...' : 'Save Global BSP Configuration'}
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
              Dispatch a live ping message through the configured credentials (instance_id, access_token, phone_id) to verify connectivity.
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

          {/* Quick Guide */}
          <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <HelpCircle size={15} color="#4f46e5" /> Credentials &amp; Architecture Reference
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem', color: '#475569', lineHeight: '1.4' }}>
              <div><strong>Instance ID:</strong> Found in your gateway dashboard (e.g. <code>6AD37BDFCEDF5</code>). Represents your WhatsApp Web runtime instance.</div>
              <div><strong>Access Token:</strong> Gateway API key (e.g. <code>6abe519e92b26</code>) authorizing REST requests.</div>
              <div><strong>Phone ID (MyTAPI):</strong> Required when using MyTAPI to target a registered phone number. Leave empty for AK Nexus or Wasender.</div>
              <div><strong>Auto-Healing Engine:</strong> Expired or invalidated instances are automatically revived in real-time without user downtime.</div>
            </div>
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 🏢 SaaS Multi-Tenant Allocation Matrix ("main tenant ko kaise duga?") */}
      {/* ========================================================================= */}
      <div className="card" style={{ padding: '1.75rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} style={{ color: '#059669' }} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                🏢 SaaS Multi-Tenant Allocation Matrix
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.3rem 0 0 0' }}>
              Allocate specific WhatsApp BSP providers, dedicated Instance IDs, Access Tokens, Phone IDs (MyTAPI), and max accounts per tenant.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', background: '#e0e7ff', color: '#3730a3', padding: '0.25rem 0.6rem', borderRadius: '12px', fontWeight: 700 }}>
              {tenants.length} Registered Tenants
            </span>
          </div>
        </div>

        {/* Responsive Table with Draggable Resizer (Lead Data Pattern) */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                
                {/* Column: Tenant */}
                <th style={{ width: `${colWidths.tenant}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Tenant / Company</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('tenant', e)}
                    onDoubleClick={() => handleDoubleClickReset('tenant')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'tenant' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Provider */}
                <th style={{ width: `${colWidths.provider}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Assigned BSP</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('provider', e)}
                    onDoubleClick={() => handleDoubleClickReset('provider')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'provider' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Max Limit */}
                <th style={{ width: `${colWidths.maxLimit}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Max Accounts</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('maxLimit', e)}
                    onDoubleClick={() => handleDoubleClickReset('maxLimit')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'maxLimit' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Dedicated Instance ID */}
                <th style={{ width: `${colWidths.instanceId}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Dedicated Instance ID</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('instanceId', e)}
                    onDoubleClick={() => handleDoubleClickReset('instanceId')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'instanceId' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Dedicated Token */}
                <th style={{ width: `${colWidths.apiToken}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Dedicated Token</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('apiToken', e)}
                    onDoubleClick={() => handleDoubleClickReset('apiToken')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'apiToken' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Dedicated Phone ID (MyTAPI) */}
                <th style={{ width: `${colWidths.phoneId}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Phone ID <small style={{ color: '#2563eb', fontWeight: 700 }}>(MyTAPI)</small></span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('phoneId', e)}
                    onDoubleClick={() => handleDoubleClickReset('phoneId')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'phoneId' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Dedicated Server URL */}
                <th style={{ width: `${colWidths.serverUrl}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Dedicated Server URL</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('serverUrl', e)}
                    onDoubleClick={() => handleDoubleClickReset('serverUrl')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'serverUrl' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Status */}
                <th style={{ width: `${colWidths.status}px`, padding: '0.75rem 0.85rem', position: 'relative', fontWeight: 700, color: '#1e293b' }}>
                  <span>Status</span>
                  <div
                    onMouseDown={(e) => handleMouseDownResize('status', e)}
                    onDoubleClick={() => handleDoubleClickReset('status')}
                    title="Drag to resize | Double click to reset"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      backgroundColor: activeResizingCol === 'status' ? '#059669' : 'transparent'
                    }}
                  />
                </th>

                {/* Column: Actions */}
                <th style={{ width: `${colWidths.actions}px`, padding: '0.75rem 0.85rem', fontWeight: 700, color: '#1e293b', textAlign: 'center' }}>
                  <span>Action</span>
                </th>

              </tr>
            </thead>
            <tbody>
              {tenants.map((t, idx) => {
                const alloc = tenantAllocations[t.id] || {
                  provider: 'aknexus',
                  max_scanned_instances: 5,
                  instance_id: '',
                  api_token: '',
                  phone_id: '',
                  server_url: '',
                  is_active: true
                };
                const isSaving = tenantSaving[t.id];
                const isSaved = tenantSaved[t.id];
                const isRowMyTapi = alloc.provider === 'mytapi';

                return (
                  <tr 
                    key={t.id} 
                    style={{ 
                      borderBottom: '1px solid var(--border-light)', 
                      background: idx % 2 === 0 ? 'var(--bg-surface)' : '#fafafa' 
                    }}
                  >
                    
                    {/* Tenant Info */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
                        Code: <code>{t.tenant_code}</code>
                      </div>
                    </td>

                    {/* Assigned Provider Selector */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <select
                        value={alloc.provider || 'aknexus'}
                        onChange={(e) => handleTenantFieldChange(t.id, 'provider', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          background: '#fff'
                        }}
                      >
                        {allProviders.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Max Scanned Accounts Limit */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={alloc.max_scanned_instances}
                        onChange={(e) => handleTenantFieldChange(t.id, 'max_scanned_instances', parseInt(e.target.value, 10) || 0)}
                        placeholder="5"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textAlign: 'center'
                        }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', textAlign: 'center', marginTop: '2px' }}>
                        {alloc.max_scanned_instances === 0 ? 'Unlimited' : `${alloc.max_scanned_instances} acc.`}
                      </span>
                    </td>

                    {/* Dedicated Instance ID */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <input
                        type="text"
                        value={alloc.instance_id || ''}
                        onChange={(e) => handleTenantFieldChange(t.id, 'instance_id', e.target.value)}
                        placeholder="Default Instance"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.78rem',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>

                    {/* Dedicated Access Token */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <input
                        type="text"
                        value={alloc.api_token || ''}
                        onChange={(e) => handleTenantFieldChange(t.id, 'api_token', e.target.value)}
                        placeholder="Default Token"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.78rem',
                          fontFamily: 'monospace'
                        }}
                      />
                    </td>

                    {/* Dedicated Phone ID (MyTAPI) */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <input
                        type="text"
                        value={alloc.phone_id || ''}
                        onChange={(e) => handleTenantFieldChange(t.id, 'phone_id', e.target.value)}
                        placeholder={isRowMyTapi ? 'Required for MyTAPI' : 'Optional (phone_id)'}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: isRowMyTapi ? '1px solid #93c5fd' : '1px solid var(--border-light)',
                          backgroundColor: isRowMyTapi ? '#eff6ff' : '#fff',
                          fontSize: '0.78rem'
                        }}
                      />
                    </td>

                    {/* Dedicated Server URL */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <input
                        type="text"
                        value={alloc.server_url || ''}
                        onChange={(e) => handleTenantFieldChange(t.id, 'server_url', e.target.value)}
                        placeholder="Default (Use Global URL)"
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.78rem'
                        }}
                      />
                    </td>

                    {/* Active Status Switch */}
                    <td style={{ padding: '0.75rem 0.85rem' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={alloc.is_active !== false}
                          onChange={(e) => handleTenantFieldChange(t.id, 'is_active', e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#059669', cursor: 'pointer' }}
                        />
                        {alloc.is_active !== false ? <span style={{ color: '#059669' }}>Active</span> : <span style={{ color: '#94a3b8' }}>Paused</span>}
                      </label>
                    </td>

                    {/* Action Button */}
                    <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleSaveTenantAllocation(t.id)}
                        disabled={isSaving}
                        className="btn-primary"
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: isSaved ? '#059669' : '#2563eb',
                          border: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          cursor: isSaving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isSaving ? <RefreshCw size={13} className="animate-spin" /> : isSaved ? <Check size={13} /> : <Save size={13} />}
                        {isSaving ? 'Saving...' : isSaved ? 'Allocated!' : 'Save'}
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* Dynamic "+ Add New BSP Provider" Modal */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: '#059669' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Add New WhatsApp BSP Provider
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddCustomBsp} style={{ padding: '1.5rem' }}>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Provider Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Green API, ChatAPI, or Self-Hosted Baileys"
                  value={newBsp.label}
                  onChange={(e) => setNewBsp({ ...newBsp, label: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Provider Identifier / Key
                </label>
                <input
                  type="text"
                  placeholder="e.g. greenapi (auto-generated if empty)"
                  value={newBsp.id}
                  onChange={(e) => setNewBsp({ ...newBsp, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Default Base Server URL *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. https://api.green-api.com"
                  value={newBsp.url}
                  onChange={(e) => setNewBsp({ ...newBsp, url: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Authentication Style
                </label>
                <select
                  value={newBsp.authType}
                  onChange={(e) => setNewBsp({ ...newBsp, authType: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
                >
                  <option value="Bearer Token">Bearer Token (Authorization: Bearer ...)</option>
                  <option value="Header apikey">Header (apikey: ...)</option>
                  <option value="Query Param">URL Query Param (?access_token=... or ?token=...)</option>
                  <option value="Query / Body (phone_id, access_token)">MyTAPI Style (phone_id, access_token)</option>
                  <option value="Custom Header">Custom Header</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Provider Notes / Documentation Reference
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Supports multi-device, endpoint for send is /sendMessage"
                  value={newBsp.description}
                  onChange={(e) => setNewBsp({ ...newBsp, description: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '0.55rem 1.25rem', borderRadius: '6px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="btn-primary"
                  style={{
                    padding: '0.55rem 1.5rem',
                    borderRadius: '6px',
                    backgroundColor: '#059669',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: modalSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {modalSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {modalSaving ? 'Registering...' : 'Register BSP Provider'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
