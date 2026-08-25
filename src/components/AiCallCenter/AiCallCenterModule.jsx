'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Settings2, Megaphone, Users, CheckCircle2, PlayCircle, Loader2, StopCircle, RefreshCw, Plus, Upload, PhoneOutgoing, ArrowLeft } from 'lucide-react';
import Papa from 'papaparse';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';

const ALL_AICALL_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: <Megaphone size={18} /> },
  { id: 'campaigns', label: 'Campaigns', icon: <PhoneOutgoing size={18} /> },
  { id: 'settings', label: 'Incoming Settings', icon: <Settings2 size={18} /> }
];

export default function AiCallCenterModule({ moduleAccess = {}, userRole = '' }) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'aicallcenter', ALL_AICALL_TABS);

  const [activeTab, setActiveTab] = useState(() => {
    return visibleTabs[0]?.id || 'dashboard';
  });

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const [activeCampaignId, setActiveCampaignId] = useState(null);

  const renderTab = () => {
    if (visibleTabs.length === 0) {
      return (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
          <p>You do not have permission to view any sub-pages in AI Call Center.</p>
        </div>
      );
    }

    if (activeCampaignId) return <CampaignDetail id={activeCampaignId} onBack={() => setActiveCampaignId(null)} />;

    switch (activeTab) {
      case 'dashboard': return <DashboardTab />;
      case 'campaigns': return <CampaignsTab onSelectCampaign={setActiveCampaignId} />;
      case 'settings': return <SettingsTab />;
      default: return null;
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#3b82f6', padding: '0.75rem', borderRadius: '12px', color: 'white' }}>
          <Bot size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>AI Call Center</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>Manage AI Agents for Incoming & Outgoing Calls</p>
        </div>
      </div>

      {!activeCampaignId && visibleTabs.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', overflowX: 'auto' }}>
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                background: activeTab === t.id ? '#eff6ff' : 'transparent',
                color: activeTab === t.id ? '#3b82f6' : '#64748b',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem'
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {renderTab()}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────
function DashboardTab() {
  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ color: '#1e293b' }}>AI Overview</h2>
      <p style={{ color: '#64748b' }}>Quick stats will appear here as campaigns start generating data.</p>
      {/* Metrics placeholder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem' }}>
         <MetricBox label="Total Calls" value="0" color="#3b82f6" />
         <MetricBox label="Interested" value="0" color="#10b981" />
         <MetricBox label="Callbacks" value="0" color="#f59e0b" />
         <MetricBox label="Failed" value="0" color="#ef4444" />
      </div>
    </div>
  );
}
const MetricBox = ({ label, value, color }) => (
  <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: '2rem', color: '#1e293b', fontWeight: 'bold', marginTop: '0.5rem' }}>{value}</div>
  </div>
);

// ── Settings ────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/ai/settings').then(r => r.json()).then(d => setSettings(d.settings || {}));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/ai/settings', { method: 'POST', body: JSON.stringify(settings) });
    setSaving(false);
    alert('Settings saved successfully!');
  };

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0', maxWidth: '800px' }}>
      <h3 style={{ marginBottom: '1.5rem' }}>Incoming AI Configuration</h3>
      
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <input type="checkbox" checked={!!settings.is_incoming_ai_enabled} onChange={e => setSettings({...settings, is_incoming_ai_enabled: e.target.checked})} />
          Enable AI for Incoming Calls
        </label>
        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>If enabled, incoming calls will be routed to the Plivo AI Agent using the prompt below.</p>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Default AI Prompt / Instructions</label>
        <textarea 
          value={settings.incoming_agent_prompt || ''} 
          onChange={e => setSettings({...settings, incoming_agent_prompt: e.target.value})}
          style={{ width: '100%', height: '150px', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Default Language</label>
          <select value={settings.default_language || 'Hindi'} onChange={e => setSettings({...settings, default_language: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <option value="Hindi">Hindi</option>
            <option value="English">English</option>
            <option value="Punjabi">Punjabi</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Human Transfer Number</label>
          <input type="text" value={settings.human_transfer_number || ''} onChange={e => setSettings({...settings, human_transfer_number: e.target.value})} placeholder="+91..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

// ── Campaigns ────────────────────────────────────────────────────────
function CampaignsTab({ onSelectCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: '', language: 'Hindi', script: '' });

  useEffect(() => {
    fetch('/api/ai/campaigns').then(r => r.json()).then(d => setCampaigns(d.campaigns || []));
  }, [showCreate]);

  const handleCreate = async () => {
    const r = await fetch('/api/ai/campaign/create', { method: 'POST', body: JSON.stringify({ campaign_name: newCampaign.name, language: newCampaign.language, script: newCampaign.script }) });
    const d = await r.json();
    if (d.success) {
      setShowCreate(false);
      onSelectCampaign(d.campaign.id);
    }
  };

  if (showCreate) {
    return (
      <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0', maxWidth: '800px' }}>
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><button onClick={()=>setShowCreate(false)} style={{background:'none',border:'none',cursor:'pointer'}}><ArrowLeft size={18}/></button> Create New AI Campaign</h3>
        <input placeholder="Campaign Name" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        <select value={newCampaign.language} onChange={e => setNewCampaign({...newCampaign, language: e.target.value})} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <option value="Hindi">Hindi</option>
          <option value="English">English</option>
        </select>
        <textarea placeholder="AI Script / Instructions" value={newCampaign.script} onChange={e => setNewCampaign({...newCampaign, script: e.target.value})} style={{ width: '100%', height: '150px', padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        <button onClick={handleCreate} style={{ padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Create Campaign</button>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0 }}>Outgoing Campaigns</h3>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}><Plus size={16}/> New Campaign</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: 'var(--th-bg)' }}>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <th style={{ padding: '1rem' }}>Name</th>
            <th style={{ padding: '1rem' }}>Status</th>
            <th style={{ padding: '1rem' }}>Contacts</th>
            <th style={{ padding: '1rem' }}>Interested</th>
            <th style={{ padding: '1rem' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '1rem', fontWeight: 600 }}>{c.campaign_name}</td>
              <td style={{ padding: '1rem' }}>{c.status}</td>
              <td style={{ padding: '1rem' }}>{c.completed_calls} / {c.total_contacts}</td>
              <td style={{ padding: '1rem', color: '#10b981', fontWeight: 600 }}>{c.interested_count}</td>
              <td style={{ padding: '1rem' }}><button onClick={() => onSelectCampaign(c.id)} style={{ padding: '0.4rem 0.8rem', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Manage</button></td>
            </tr>
          ))}
          {campaigns.length === 0 && <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No campaigns found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Campaign Detail ────────────────────────────────────────────────
function CampaignDetail({ id, onBack }) {
  const [data, setData] = useState(null);
  const [dialing, setDialing] = useState(false);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/ai/campaign/${id}`);
    const json = await res.json();
    setData(json);
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.toLowerCase().trim(),
      complete: async (results) => {
        const r = await fetch('/api/ai/campaign/upload-contacts', { method: 'POST', body: JSON.stringify({ campaign_id: id, contacts: results.data }) });
        const d = await r.json();
        if (d.success) {
          alert(`Uploaded ${d.count} valid contacts!`);
          fetchDetail();
        } else {
          alert(d.error);
        }
      }
    });
  };

  const handleStart = async () => {
    await fetch('/api/ai/campaign/start', { method: 'POST', body: JSON.stringify({ campaign_id: id }) });
    fetchDetail();
  };
  const handleStop = async () => {
    await fetch('/api/ai/campaign/stop', { method: 'POST', body: JSON.stringify({ campaign_id: id }) });
    fetchDetail();
  };

  const dialNext = async () => {
    setDialing(true);
    const r = await fetch('/api/ai/campaign/dial-next', { method: 'POST', body: JSON.stringify({ campaign_id: id, batch_size: 1 }) });
    const d = await r.json();
    setDialing(false);
    if (d.success) {
       alert(`Dialed ${d.dialed} contact(s)`);
       fetchDetail();
    } else {
       alert(d.message || d.error);
    }
  };

  if (!data) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spin" /></div>;
  if (data.error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {data.error}</div>;
  if (!data.campaign) return <div style={{ padding: '2rem' }}>Campaign not found.</div>;

  const { campaign, contacts = [] } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: '0.5rem' }}><ArrowLeft size={16}/> Back to Campaigns</button>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{campaign.campaign_name} <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: '#f1f5f9', borderRadius: '6px' }}>{campaign.status}</span></h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {campaign.status === 'draft' || campaign.status === 'stopped' ? (
             <button onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}><PlayCircle size={18}/> Start Campaign</button>
          ) : (
             <button onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}><StopCircle size={18}/> Pause Campaign</button>
          )}
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
             <Upload size={18} /> Upload CSV
             <input type="file" accept=".csv" onClick={(e) => { e.target.value = null }} onChange={handleUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {campaign.status === 'running' && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e3a8a' }}>Campaign is Running</h4>
              <p style={{ margin: 0, color: '#1e40af', fontSize: '0.9rem' }}>You can trigger outbound calls manually or setup a cron job to call automatically.</p>
           </div>
           <button onClick={dialNext} disabled={dialing} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>
              <PhoneOutgoing size={18}/> {dialing ? 'Dialing...' : 'Dial Next Contact'}
           </button>
        </div>
      )}

      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
         <h3 style={{ margin: '0 0 1rem 0' }}>Contacts ({contacts.length})</h3>
         <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead style={{ backgroundColor: 'var(--th-bg)' }}>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mobile</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>AI Result</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.name || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.mobile}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{c.call_status}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: c.ai_result === 'Interested' ? '#10b981' : 'inherit' }}>{c.ai_result || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
