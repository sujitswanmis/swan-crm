'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Image as ImageIcon, Upload, PlayCircle, Settings, MessageSquare, Repeat,
  CheckCircle2, AlertCircle, Eye, EyeOff, Send, ShieldCheck, Users, HelpCircle, RefreshCw, Zap
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { 
  getWhatsappSettings, 
  saveWhatsappSettings, 
  getWhatsappTemplates, 
  saveWhatsappTemplate, 
  deleteWhatsappTemplate,
  getWhatsappAutomations,
  saveWhatsappAutomation,
  deleteWhatsappAutomation,
  testWhatsappProviderConnection
} from '@/app/actions/whatsapp';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';

const ALL_WA_TABS = [
  { id: 'templates', label: 'Templates Library', icon: MessageSquare },
  { id: 'automations', label: 'Stage Automations', icon: Repeat },
  { id: 'settings', label: 'Global Settings', icon: Settings }
];

export default function WhatsappOfficial({ moduleAccess = {}, userRole = '' }) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'whatsapp_official', ALL_WA_TABS);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('wa_tab');
      if (param && visibleTabs.some(t => t.id === param)) return param;
    }
    return visibleTabs[0]?.id || 'templates';
  });

  // Ensure active tab stays within allowed tabs if permissions change
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  // Listen for browser back/forward navigation
  React.useEffect(() => {
    const handlePopState = () => {
      const param = new URLSearchParams(window.location.search).get('wa_tab');
      if (param && param !== activeTab && visibleTabs.some(t => t.id === param)) setActiveTab(param);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, visibleTabs]);

  const handleTabChange = (tabId) => {
    if (!visibleTabs.some(t => t.id === tabId)) return;
    setActiveTab(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set('wa_tab', tabId);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // Settings State - Multi-Provider & Target Seats
  const [provider, setProvider] = useState('aisensy');
  const [targetSeats, setTargetSeats] = useState(5);
  const [accountLimit, setAccountLimit] = useState(1);
  const [metaConfig, setMetaConfig] = useState({ phone_number_id: '', waba_id: '', access_token: '', api_version: 'v21.0' });
  const [aisensyConfig, setAisensyConfig] = useState({ api_key: '', user_name: 'New Swan MultiTech Limited-Swan Agro' });
  const [interaktConfig, setInteraktConfig] = useState({ api_key: '' });
  const [watiConfig, setWatiConfig] = useState({ endpoint_url: '', access_token: '' });
  const [nextelConfig, setNextelConfig] = useState({ endpoint_url: '' });

  // Legacy fallback states
  const [apiKeyNsmlr, setApiKeyNsmlr] = useState('');
  const [apiKeyNstlp, setApiKeyNstlp] = useState('');

  // Test Connection State
  const [testPhone, setTestPhone] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);
  const [showSecretToken, setShowSecretToken] = useState(false);

  // Templates State
  const [templates, setTemplates] = useState([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({ template_name: '', campaign_name: '', message_body: '', image_url: '', company: 'All' });
  const [uploadingImage, setUploadingImage] = useState(false);

  // Automations State
  const [automations, setAutomations] = useState([]);
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [currentAuto, setCurrentAuto] = useState({ stage_name: '', template_id: '', frequency: 'Once', company: 'All', is_active: true });
  const [stages, setStages] = useState([]);

  useEffect(() => {
    loadAllData();
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.stages && parsed.stages.length > 0 && typeof parsed.stages[0] === 'object' && parsed.stages[0].substages) {
            setStages(parsed.stages);
          }
        } catch (e) { console.error(e); }
      }
    };
    loadConfig();
    window.addEventListener('crm_config_updated', loadConfig);
    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    const [setRes, tplRes, autoRes] = await Promise.all([
      getWhatsappSettings(),
      getWhatsappTemplates(),
      getWhatsappAutomations()
    ]);
    
    if (setRes.success && setRes.data) {
      const d = setRes.data;
      setProvider(d.provider || (d.api_key_nstlp ? 'nextel' : 'aisensy'));
      setTargetSeats(d.target_seats || 5);
      setAccountLimit(d.account_limit || 1);
      if (d.meta) setMetaConfig({ phone_number_id: d.meta.phone_number_id || '', waba_id: d.meta.waba_id || '', access_token: d.meta.access_token || '', api_version: d.meta.api_version || 'v21.0' });
      if (d.aisensy) setAisensyConfig({ api_key: d.aisensy.api_key || d.api_key_nsmlr || '', user_name: d.aisensy.user_name || 'New Swan MultiTech Limited-Swan Agro' });
      if (d.interakt) setInteraktConfig({ api_key: d.interakt.api_key || '' });
      if (d.wati) setWatiConfig({ endpoint_url: d.wati.endpoint_url || '', access_token: d.wati.access_token || '' });
      if (d.nextel) setNextelConfig({ endpoint_url: d.nextel.endpoint_url || d.api_key_nstlp || '' });

      setApiKeyNsmlr(d.api_key_nsmlr || d.aisensy?.api_key || d.api_key || '');
      setApiKeyNstlp(d.api_key_nstlp || d.nextel?.endpoint_url || '');
    }
    if (tplRes.success) setTemplates(tplRes.data || []);
    if (autoRes.success) setAutomations(autoRes.data || []);
    setLoading(false);
  };

  // --- SETTINGS LOGIC ---
  const handleSaveSettings = async () => {
    setLoading(true);
    const payload = {
      provider,
      target_seats: Number(targetSeats) || 5,
      account_limit: Number(accountLimit) || 1,
      meta: metaConfig,
      aisensy: aisensyConfig,
      interakt: interaktConfig,
      wati: watiConfig,
      nextel: nextelConfig,
      api_key_nsmlr: aisensyConfig.api_key || apiKeyNsmlr,
      api_key_nstlp: nextelConfig.endpoint_url || apiKeyNstlp
    };
    const res = await saveWhatsappSettings(payload);
    setLoading(false);
    if (res.success) alert('WhatsApp settings saved securely!');
    else alert('Error saving settings: ' + res.error);
  };

  const handleTestConnection = async () => {
    if (!testPhone.trim()) {
      alert('Please enter a recipient mobile number (e.g. 9876543210) to test the connection.');
      return;
    }
    setTestingConnection(true);
    setTestFeedback(null);
    const config = {
      meta: metaConfig,
      aisensy: aisensyConfig,
      interakt: interaktConfig,
      wati: watiConfig,
      nextel: nextelConfig
    };
    const res = await testWhatsappProviderConnection({ provider, config, testPhone });
    setTestingConnection(false);
    setTestFeedback(res);
  };

  // --- TEMPLATES LOGIC ---
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `templates/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('whatsapp_media').upload(filePath, file);
    
    if (uploadError) {
      alert('Error uploading image: ' + uploadError.message);
      setUploadingImage(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('whatsapp_media').getPublicUrl(filePath);
    setCurrentTemplate(prev => ({ ...prev, image_url: publicUrlData.publicUrl }));
    setUploadingImage(false);
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate.template_name || !currentTemplate.campaign_name || !currentTemplate.message_body) {
      alert('Please fill all required fields');
      return;
    }
    setLoading(true);
    const res = await saveWhatsappTemplate(currentTemplate);
    if (res.success) {
      setShowTemplateForm(false);
      setCurrentTemplate({ template_name: '', campaign_name: '', message_body: '', image_url: '', company: 'All' });
      loadAllData();
    } else {
      alert('Error saving template: ' + res.error);
    }
    setLoading(false);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template? Automations linked to it will break.')) return;
    const res = await deleteWhatsappTemplate(id);
    if (res.success) loadAllData();
  };

  // --- AUTOMATIONS LOGIC ---
  const handleSaveAutomation = async () => {
    if (!currentAuto.template_id) {
      alert('Please select a template');
      return;
    }
    setLoading(true);
    const res = await saveWhatsappAutomation(currentAuto);
    if (res.success) {
      setShowAutoForm(false);
      setCurrentAuto({ stage_name: '', template_id: '', frequency: 'Once', company: 'All', is_active: true });
      loadAllData();
    } else {
      alert('Error saving automation: ' + res.error);
    }
    setLoading(false);
  };

  const handleDeleteAutomation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    const res = await deleteWhatsappAutomation(id);
    if (res.success) loadAllData();
  };

  const templatesPerms = getSubItemPermissions(moduleAccess, userRole, 'whatsapp_official', 'templates');
  const automationsPerms = getSubItemPermissions(moduleAccess, userRole, 'whatsapp_official', 'automations');
  const settingsPerms = getSubItemPermissions(moduleAccess, userRole, 'whatsapp_official', 'settings');

  if (visibleTabs.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
        <p>You do not have permission to view any sub-pages under WhatsApp Official.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '2rem', minHeight: '80vh' }}>
      
      {/* Top Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '2rem', overflowX: 'auto' }}>
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{ padding: '0.5rem 1rem', background: isActive ? 'var(--accent-color)' : 'transparent', color: isActive ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
            >
              <Icon size={18} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: '960px' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
              WhatsApp Official API & Multi-Provider Gateway
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Connect your official WhatsApp Business account (Meta Cloud API, AiSensy, Interakt, Wati, or Nextel). Includes 1 WhatsApp API account with allocated target CRM seats.
            </p>
          </div>

          {/* SAAS ENTITLEMENT & TARGET SEATS ALLOCATION CARD */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
            gap: '1rem', 
            marginBottom: '1.5rem',
            padding: '1.25rem',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(59, 130, 246, 0.08) 100%)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: '10px'
          }}>
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(37, 99, 235, 0.15)', 
                color: '#2563eb', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Zap size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                  SaaS Entitlement: 1 Official API Account
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                  Onetime setup cost model for 1 connected WhatsApp Business account. Fully managed & isolated per workspace.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                color: '#10b981', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Users size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Target Seat Limit:
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input 
                      type="number" 
                      min="1" 
                      max="500"
                      value={targetSeats}
                      onChange={(e) => setTargetSeats(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={!settingsPerms.edit}
                      style={{ 
                        width: '70px', 
                        padding: '0.3rem 0.5rem', 
                        borderRadius: '6px', 
                        border: '1px solid var(--border-light)', 
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>seats</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Number of CRM telecallers/agents entitled to send WhatsApp broadcasts & updates.
                </div>
              </div>
            </div>
          </div>

          {/* PROVIDER SELECTOR */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.92rem', fontWeight: 700, display: 'block', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
              Select WhatsApp Gateway Provider (BSP / API)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
              {[
                { id: 'meta', name: 'Meta Cloud API', tag: 'Direct Graph API', note: 'Direct Meta platform v21.0' },
                { id: 'aisensy', name: 'AiSensy', tag: 'Meta BSP', note: 'Campaigns & NSMLR default' },
                { id: 'interakt', name: 'Interakt', tag: 'Jio Haptik BSP', note: 'Smart automated suite' },
                { id: 'wati', name: 'Wati', tag: 'Clare.ai BSP', note: 'Team inbox & broadcasts' },
                { id: 'nextel', name: 'Nextel.io', tag: 'Meta BSP', note: 'Session & NSTLP default' }
              ].map(p => {
                const isSelected = provider === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => settingsPerms.edit && setProvider(p.id)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-primary)',
                      cursor: settingsPerms.edit ? 'pointer' : 'default',
                      transition: 'all 0.15s ease-in-out',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                        {p.name}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 size={16} color="var(--accent-color, #2563eb)" />
                      ) : (
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '1.5px solid var(--border-light)' }} />
                      )}
                    </div>
                    <span style={{ 
                      display: 'inline-block', 
                      fontSize: '0.68rem', 
                      fontWeight: 600, 
                      padding: '0.15rem 0.4rem', 
                      borderRadius: '4px', 
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'var(--bg-surface)',
                      color: isSelected ? '#1d4ed8' : 'var(--text-secondary)',
                      marginBottom: '0.35rem'
                    }}>
                      {p.tag}
                    </span>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.25' }}>
                      {p.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DYNAMIC CREDENTIALS FORM ACCORDING TO SELECTED PROVIDER */}
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1.5rem', 
            backgroundColor: 'var(--bg-primary)', 
            borderRadius: '10px', 
            border: '1px solid var(--border-light)' 
          }}>
            {provider === 'meta' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#2563eb' }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Meta Cloud API Credentials (v21.0)</h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Enter your Meta for Developers credentials. Messages will be dispatched directly through the official Meta Graph API without intermediary BSP markups.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      Phone Number ID <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input 
                      type="text"
                      value={metaConfig.phone_number_id}
                      onChange={(e) => setMetaConfig({ ...metaConfig, phone_number_id: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder="e.g. 104857291823901"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      WABA ID (WhatsApp Business Account ID)
                    </label>
                    <input 
                      type="text"
                      value={metaConfig.waba_id}
                      onChange={(e) => setMetaConfig({ ...metaConfig, waba_id: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder="e.g. 293847192837465"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      System User Permanent Access Token <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <button 
                      type="button" 
                      onClick={() => setShowSecretToken(!showSecretToken)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
                    >
                      {showSecretToken ? <EyeOff size={14} /> : <Eye size={14} />} {showSecretToken ? 'Hide Token' : 'Show Token'}
                    </button>
                  </div>
                  <textarea 
                    value={metaConfig.access_token}
                    onChange={(e) => setMetaConfig({ ...metaConfig, access_token: e.target.value })}
                    disabled={!settingsPerms.edit}
                    rows={showSecretToken ? 3 : 2}
                    placeholder="EAAG..."
                    style={{ 
                      width: '100%', 
                      padding: '0.65rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-light)', 
                      backgroundColor: 'var(--bg-surface)', 
                      fontFamily: 'monospace', 
                      fontSize: '0.82rem',
                      filter: showSecretToken ? 'none' : 'blur(3px)',
                      transition: 'filter 0.2s'
                    }}
                  />
                </div>
              </div>
            )}

            {provider === 'aisensy' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#0284c7' }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>AiSensy WhatsApp API Credentials</h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Enter your AiSensy API Key (used for New Swan MultiTech Limited - NSMLR). Broadcast campaigns & quick template messages will route via AiSensy.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    AiSensy API Key <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea 
                    value={aisensyConfig.api_key}
                    onChange={(e) => setAisensyConfig({ ...aisensyConfig, api_key: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.82rem', minHeight: '75px' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    AiSensy Registered Business / User Name
                  </label>
                  <input 
                    type="text"
                    value={aisensyConfig.user_name}
                    onChange={(e) => setAisensyConfig({ ...aisensyConfig, user_name: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="e.g. New Swan MultiTech Limited-Swan Agro"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}

            {provider === 'interakt' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#7c3aed' }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Interakt (Jio Haptik) API Credentials</h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Connect your Interakt account. You can generate your Secret API Key under Interakt Dashboard &rarr; Settings &rarr; Developer Settings.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Interakt Secret API Key <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="password"
                    value={interaktConfig.api_key}
                    onChange={(e) => setInteraktConfig({ ...interaktConfig, api_key: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="e.g. a1b2c3d4e5f6..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}

            {provider === 'wati' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#059669' }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Wati (Clare.ai) API Credentials</h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Connect Wati team inbox. Obtain your API Endpoint and Access Token from Wati Dashboard &rarr; API Docs &rarr; Access Token.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Wati API Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
                    type="text"
                    value={watiConfig.endpoint_url}
                    onChange={(e) => setWatiConfig({ ...watiConfig, endpoint_url: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="e.g. https://live-server-xxxx.wati.io/api/v1"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Wati Access Token <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea 
                    value={watiConfig.access_token}
                    onChange={(e) => setWatiConfig({ ...watiConfig, access_token: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="Bearer token from Wati..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.82rem', minHeight: '65px' }}
                  />
                </div>
              </div>
            )}

            {provider === 'nextel' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Nextel.io API Credentials</h3>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Enter your Nextel session endpoint URL (used for New Swan Transmission Ltd - NSTLP).
                </p>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Nextel Session Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea 
                    value={nextelConfig.endpoint_url}
                    onChange={(e) => setNextelConfig({ ...nextelConfig, endpoint_url: e.target.value })}
                    disabled={!settingsPerms.edit}
                    placeholder="https://api.nextel.io/API_V2/Whatsapp/send_session/..."
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.82rem', minHeight: '75px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* DUAL COMPANY BACKWARD COMPATIBILITY NOTICE */}
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1rem 1.25rem', 
            backgroundColor: 'rgba(2, 132, 199, 0.05)', 
            border: '1px dashed rgba(2, 132, 199, 0.35)', 
            borderRadius: '8px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', color: '#0369a1', fontWeight: 600, fontSize: '0.88rem' }}>
              <HelpCircle size={16} /> Legacy Dual Routing Synchronization (NSMLR & NSTLP)
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
              For New Swan internal operations, leads tagged with <strong>NSMLR</strong> automatically route through AiSensy, and leads tagged with <strong>NSTLP</strong> route through Nextel. Both keys are securely preserved in the database to guarantee zero disruption to existing telecalling workflows.
            </p>
          </div>

          {/* LIVE TEST CONNECTION CARD */}
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1.25rem', 
            backgroundColor: 'var(--bg-primary)', 
            borderRadius: '10px', 
            border: '1px solid var(--border-light)' 
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Live Connection Verification
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Verify connectivity with your selected WhatsApp provider ({provider.toUpperCase()}) before saving.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: testFeedback ? '0.75rem' : 0 }}>
              <input 
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Recipient Mobile Number (e.g. 9876543210)"
                style={{ 
                  flex: '1 1 240px', 
                  padding: '0.65rem 0.85rem', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-light)', 
                  backgroundColor: 'var(--bg-surface)', 
                  fontSize: '0.85rem' 
                }}
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || !settingsPerms.edit}
                style={{ 
                  padding: '0.65rem 1.25rem', 
                  backgroundColor: 'transparent', 
                  color: 'var(--accent-color, #2563eb)', 
                  border: '1px solid var(--accent-color, #2563eb)', 
                  borderRadius: '6px', 
                  cursor: (testingConnection || !settingsPerms.edit) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <RefreshCw size={16} className={testingConnection ? 'animate-spin' : ''} />
                {testingConnection ? 'Verifying...' : 'Test Connection'}
              </button>
            </div>

            {testFeedback && (
              <div style={{ 
                padding: '0.75rem 1rem', 
                borderRadius: '6px', 
                backgroundColor: testFeedback.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                border: testFeedback.success ? '1px solid #10b981' : '1px solid #ef4444',
                color: testFeedback.success ? '#065f46' : '#991b1b',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.75rem'
              }}>
                {testFeedback.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{testFeedback.message || testFeedback.error}</span>
              </div>
            )}
          </div>

          {/* ACTION BUTTON */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: '0.5rem' }}>
            {settingsPerms.edit ? (
              <button 
                onClick={handleSaveSettings}
                disabled={loading}
                style={{ 
                  padding: '0.75rem 1.75rem', 
                  background: 'var(--accent-color, #2563eb)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: loading ? 'not-allowed' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                }}
              >
                <Save size={18} /> {loading ? 'Saving Settings...' : 'Save WhatsApp Configuration'}
              </button>
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔒 Read-only view. Contact administrator to update API keys.</span>
            )}
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem' }}>Message Templates</h2>
            {templatesPerms.add && (
              <button 
                onClick={() => { setCurrentTemplate({ template_name: '', campaign_name: '', message_body: '', image_url: '' }); setShowTemplateForm(true); }}
                style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
              >
                <Plus size={18} /> Create New Template
              </button>
            )}
          </div>

          {showTemplateForm && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.1rem' }}>{currentTemplate.id ? 'Edit' : 'New'} Template</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Company</label>
                  <select value={currentTemplate.company || 'All'} onChange={e => setCurrentTemplate({...currentTemplate, company: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                    <option value="All">Both / All</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Template Name (CRM Display)</label>
                  <input type="text" value={currentTemplate.template_name} onChange={e => setCurrentTemplate({...currentTemplate, template_name: e.target.value})} placeholder="e.g. dealer_marketing" style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Campaign Name (API ID)</label>
                  <input type="text" value={currentTemplate.campaign_name} onChange={e => setCurrentTemplate({...currentTemplate, campaign_name: e.target.value})} placeholder="API Campaign ID" style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Message Content</label>
                <textarea 
                  value={currentTemplate.message_body} 
                  onChange={e => setCurrentTemplate({...currentTemplate, message_body: e.target.value})} 
                  placeholder="Paste the message here. Use {{1}} for dynamic names." 
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', minHeight: '150px' }} 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '2rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Image Attachment (Optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ padding: '0.5rem 1rem', background: 'var(--th-hover-bg)', color: '#334155', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 500 }}>
                    <Upload size={16} /> {uploadingImage ? 'Uploading...' : 'Upload Image File'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                  
                  {currentTemplate.image_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#10b981' }}>
                      <ImageIcon size={16} /> Image Linked
                      <img src={currentTemplate.image_url} alt="preview" style={{ height: '30px', width: '30px', objectFit: 'cover', borderRadius: '4px', marginLeft: '0.5rem' }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleSaveTemplate} disabled={loading} style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                  {loading ? 'Saving...' : 'Save Template'}
                </button>
                <button onClick={() => setShowTemplateForm(false)} style={{ padding: '0.6rem 1.5rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
                {tpl.image_url && (
                  <div style={{ height: '120px', width: '100%', overflow: 'hidden', backgroundColor: 'var(--th-bg)' }}>
                    <img src={tpl.image_url} alt="Template" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: '0', fontSize: '1rem', color: 'var(--text-primary)' }}>{tpl.template_name}</h4>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.4rem', backgroundColor: 'var(--th-hover-bg)', borderRadius: '4px' }}>{tpl.company || 'All'}</span>
                  </div>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>API: {tpl.campaign_name}</p>
                  
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', flex: 1, whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                    {tpl.message_body.substring(0, 150)}{tpl.message_body.length > 150 ? '...' : ''}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    {templatesPerms.edit && (
                      <button onClick={() => { setCurrentTemplate(tpl); setShowTemplateForm(true); window.scrollTo(0, 0); }} style={{ flex: 1, padding: '0.4rem', background: 'var(--th-bg)', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}>
                        Edit
                      </button>
                    )}
                    {templatesPerms.delete && (
                      <button onClick={() => handleDeleteTemplate(tpl.id)} style={{ padding: '0.4rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {templates.length === 0 && !showTemplateForm && (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                No templates created yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUTOMATIONS TAB */}
      {activeTab === 'automations' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem 0' }}>Stage-Based Automation Rules</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Map your templates to specific CRM stages to send automated drip campaigns.</p>
            </div>
            {automationsPerms.add && (
              <button 
                onClick={() => { setCurrentAuto({ stage_name: '', template_id: '', frequency: 'Once' }); setShowAutoForm(true); }}
                style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
              >
                <Plus size={18} /> Add New Rule
              </button>
            )}
          </div>

          {showAutoForm && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.1rem' }}>{currentAuto.id ? 'Edit' : 'New'} Automation Rule</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Company</label>
                  <select 
                    value={currentAuto.company || 'All'} 
                    onChange={e => setCurrentAuto({...currentAuto, company: e.target.value})}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="All">All Companies</option>
                    <option value="NSMLR">NSMLR Only</option>
                    <option value="NSTLP">NSTLP Only</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Status</label>
                  <select 
                    value={currentAuto.is_active ? 'active' : 'inactive'} 
                    onChange={e => setCurrentAuto({...currentAuto, is_active: e.target.value === 'active'})}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: currentAuto.is_active ? '#16a34a' : '#ef4444', fontWeight: 600 }}
                  >
                    <option value="active">Active (Sending)</option>
                    <option value="inactive">Paused (Inactive)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>If Lead is in Stage:</label>
                  <select value={currentAuto.stage_name} onChange={e => setCurrentAuto({...currentAuto, stage_name: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                    <option value="">Select Stage</option>
                    {stages.map((stageObj, i) => {
                      const stageNum = i + 1;
                      const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                      return (
                        <optgroup key={`wa-stage-${i}`} label={stageObj.name}>
                          {stageObj.substages.map((sub, j) => {
                            const subNum = String(j + 1).padStart(2, '0');
                            const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                            const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                            return <option key={val} value={val}>{val}</option>;
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Send this Template:</label>
                  <select 
                    value={currentAuto.template_id} 
                    onChange={e => setCurrentAuto({...currentAuto, template_id: e.target.value})}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="">-- Select Template --</option>
                    {templates.filter(tpl => !currentAuto.company || currentAuto.company === 'All' || tpl.company === 'All' || tpl.company === currentAuto.company).map(tpl => (
                      <option key={tpl.id} value={tpl.id}>{tpl.template_name} ({tpl.company || 'All'})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Frequency:</label>
                  <select 
                    value={currentAuto.frequency} 
                    onChange={e => setCurrentAuto({...currentAuto, frequency: e.target.value})}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                  >
                    <option value="Once">Send Once (On Entry)</option>
                    <option value="Weekly">Weekly (Every 7 Days)</option>
                    <option value="Monthly">Monthly (Every 30 Days)</option>
                    <option value="Quarterly">Quarterly (Every 90 Days)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleSaveAutomation} disabled={loading} style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                  {loading ? 'Saving...' : 'Save Rule'}
                </button>
                <button onClick={() => setShowAutoForm(false)} style={{ padding: '0.6rem 1.5rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <MobileTableView id="WhatsappOfficial-1"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'var(--bg-surface)' }}>
              <thead style={{ backgroundColor: 'var(--th-bg)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Company</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Target Stage</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Template Assigned</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Frequency</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {automations.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No automation rules defined yet.</td></tr>
                ) : (
                  automations.map(auto => (
                    <tr key={auto.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.4rem', backgroundColor: 'var(--th-hover-bg)', borderRadius: '4px' }}>{auto.company || 'All'}</span>
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{auto.stage_name}</td>
                      <td style={{ padding: '1rem' }}>
                        {auto.whatsapp_templates?.template_name || <span style={{color: '#ef4444'}}>Missing Template</span>}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.2rem 0.5rem', backgroundColor: '#e0f2fe', color: '#0284c7', borderRadius: '4px', fontSize: '0.8rem' }}>
                          {auto.frequency}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {auto.is_active ? 
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#10b981', fontSize: '0.85rem' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div> Active</span> : 
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8', fontSize: '0.85rem' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }}></div> Paused</span>
                        }
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {automationsPerms.edit && (
                          <button onClick={() => { setCurrentAuto(auto); setShowAutoForm(true); }} style={{ padding: '0.4rem', background: 'transparent', color: '#475569', border: 'none', cursor: 'pointer' }}>Edit</button>
                        )}
                        {automationsPerms.delete && (
                          <button onClick={() => handleDeleteAutomation(auto.id)} style={{ padding: '0.4rem', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table></MobileTableView>
          </div>

        </div>
      )}

    </div>
  );
}
