'use client';

import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Image as ImageIcon, Upload, PlayCircle, Settings, MessageSquare, Repeat } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { 
  getWhatsappSettings, 
  saveWhatsappSettings, 
  getWhatsappTemplates, 
  saveWhatsappTemplate, 
  deleteWhatsappTemplate,
  getWhatsappAutomations,
  saveWhatsappAutomation,
  deleteWhatsappAutomation
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

  // Settings State
  const [apiKeyNsmlr, setApiKeyNsmlr] = useState('');
  const [apiKeyNstlp, setApiKeyNstlp] = useState('');

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
      setApiKeyNsmlr(setRes.data.api_key_nsmlr || setRes.data.api_key || '');
      setApiKeyNstlp(setRes.data.api_key_nstlp || '');
    }
    if (tplRes.success) setTemplates(tplRes.data || []);
    if (autoRes.success) setAutomations(autoRes.data || []);
    setLoading(false);
  };

  // --- SETTINGS LOGIC ---
  const handleSaveSettings = async () => {
    setLoading(true);
    const res = await saveWhatsappSettings(apiKeyNsmlr, apiKeyNstlp);
    setLoading(false);
    if (res.success) alert('Settings saved securely!');
    else alert('Error saving settings: ' + res.error);
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
        <div style={{ maxWidth: '600px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>WhatsApp API Configuration</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Enter API credentials for NSMLR (AiSensy) and NSTLP (Nextel). The CRM will automatically use the correct API based on the Lead's company.
          </p>

          <div className="form-group" style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#0369a1' }}>NSMLR (AiSensy)</h3>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>AiSensy API Key</label>
            <textarea 
              value={apiKeyNsmlr}
              onChange={(e) => setApiKeyNsmlr(e.target.value)}
              disabled={!settingsPerms.edit}
              placeholder="eyJhbGciOiJIUzI1..."
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', minHeight: '80px', fontSize: '0.85rem', fontFamily: 'monospace' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#16a34a' }}>NSTLP (Nextel)</h3>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Nextel API Endpoint URL</label>
            <textarea 
              value={apiKeyNstlp}
              onChange={(e) => setApiKeyNstlp(e.target.value)}
              disabled={!settingsPerms.edit}
              placeholder="https://api.nextel.io/API_V2/Whatsapp/send_session/..."
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', minHeight: '80px', fontSize: '0.85rem', fontFamily: 'monospace' }}
            />
          </div>

          {settingsPerms.edit ? (
            <button 
              onClick={handleSaveSettings}
              disabled={loading}
              style={{ padding: '0.75rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
            >
              <Save size={18} /> {loading ? 'Saving...' : 'Save Settings'}
            </button>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔒 Read-only view. Contact administrator to update API keys.</span>
          )}
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'var(--bg-surface)' }}>
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
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
