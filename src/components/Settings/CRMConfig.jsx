import React, { useState, useEffect } from 'react';
import { 
  Settings2, 
  Plus, 
  Trash2, 
  Save, 
  ChevronUp, 
  ChevronDown, 
  PlayCircle, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ToggleLeft,
  ToggleRight,
  FormInput,
  Check,
  RotateCcw
} from 'lucide-react';
import { logAuditAction } from '@/app/actions/audit';

const DEFAULT_CLIENT_FORM_FIELDS = {
  lead_date: { label: 'Lead Date', category: 'Lead Info', enabled: true, required: true },
  our_company: { label: 'Our Company Name', category: 'Lead Info', enabled: true, required: true },
  source: { label: 'Lead Source', category: 'Lead Info', enabled: true, required: true },
  source_name: { label: 'Source Name', category: 'Lead Info', enabled: true, required: false },
  entry_by: { label: 'Entry By', category: 'Lead Info', enabled: true, required: true },
  assigned_to: { label: 'Assigned To', category: 'Lead Info', enabled: true, required: false },
  status: { label: 'Lead Status', category: 'Lead Info', enabled: true, required: true },
  priority: { label: 'Lead Priority Type', category: 'Lead Info', enabled: true, required: false },
  company: { label: 'Business / Firm Name', category: 'Business Details', enabled: true, required: true },
  business_type: { label: 'Business Type', category: 'Business Details', enabled: true, required: false },
  business_gst: { label: 'Business GSTIN', category: 'Business Details', enabled: true, required: false },
  business_pan: { label: 'Business PAN', category: 'Business Details', enabled: true, required: false },
  business_contact_1: { label: 'Business Contact 1', category: 'Business Details', enabled: true, required: false },
  business_contact_2: { label: 'Business Contact 2', category: 'Business Details', enabled: true, required: false },
  business_email_1: { label: 'Business Email 1', category: 'Business Details', enabled: true, required: false },
  name: { label: 'Contact Person Name (CP1)', category: 'Contact Person', enabled: true, required: true },
  phone: { label: 'Mobile Number (CP1)', category: 'Contact Person', enabled: true, required: true },
  email: { label: 'Email Address (CP1)', category: 'Contact Person', enabled: true, required: false },
  cp1_mobile_2: { label: 'Alternate Mobile (CP1)', category: 'Contact Person', enabled: true, required: false },
  state_name: { label: 'State', category: 'Location & Address', enabled: true, required: true },
  district_name: { label: 'District', category: 'Location & Address', enabled: true, required: true },
  city_name: { label: 'City', category: 'Location & Address', enabled: true, required: true },
  tehsil_name: { label: 'Tehsil', category: 'Location & Address', enabled: true, required: false },
  block_name: { label: 'Block', category: 'Location & Address', enabled: true, required: false },
  pin_code: { label: 'PIN Code', category: 'Location & Address', enabled: true, required: false },
  address: { label: 'Full Address', category: 'Location & Address', enabled: true, required: false },
  requirement: { label: 'Requirement / Product', category: 'Commercial Details', enabled: true, required: false },
  investment: { label: 'Investment / Budget', category: 'Commercial Details', enabled: true, required: false },
  buying_timeline: { label: 'Buying Timeline', category: 'Commercial Details', enabled: true, required: false }
};

export default function CRMConfig({ userCompany = '' }) {
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [saveMessage, setSaveMessage] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('stages');
  
  const [sources, setSources] = useState(['Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 'Customer Reference', 'Exhibition', 'Other']);
  const [newSource, setNewSource] = useState('');
  
  const [stages, setStages] = useState([
    { name: '01 - New Stage', enabled: true, is_closing: false, substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', enabled: true, is_closing: false, substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '03 - Qualification Stage', enabled: true, is_closing: false, substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '04 - Follow Up Stage', enabled: true, is_closing: false, substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '05 - Sales Process Stage', enabled: true, is_closing: false, substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '06 - Conversion Stage', enabled: true, is_closing: false, substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '07 - Final Stage', enabled: true, is_closing: true, substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '08 - Transfer to Party', enabled: true, is_closing: false, substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] }
  ]);
  const [expandedStage, setExpandedStage] = useState(null);
  
  const [clientStatuses, setClientStatuses] = useState(['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress']);
  const [newClientStatus, setNewClientStatus] = useState('');
  
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);
  const [newPriority, setNewPriority] = useState('');

  const [assignmentRule, setAssignmentRule] = useState('round_robin');
  const [leadSyncChunkSize, setLeadSyncChunkSize] = useState('500');
  const [clientFormFields, setClientFormFields] = useState(DEFAULT_CLIENT_FORM_FIELDS);

  // Load from LocalStorage immediately for instant render, then fetch source of truth from Supabase
  useEffect(() => {
    let isMounted = true;

    // 1. Initial immediate load from localStorage
    try {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stages && Array.isArray(parsed.stages) && parsed.stages.length > 0) {
          setStages(parsed.stages.map(s => ({ ...s, enabled: s.enabled !== false })));
        }
        if (parsed.sources && Array.isArray(parsed.sources) && parsed.sources.length > 0) setSources(parsed.sources);
        if (parsed.clientStatuses && Array.isArray(parsed.clientStatuses) && parsed.clientStatuses.length > 0) setClientStatuses(parsed.clientStatuses);
        if (parsed.priorities && Array.isArray(parsed.priorities) && parsed.priorities.length > 0) setPriorities(parsed.priorities);
        if (parsed.assignmentRule) setAssignmentRule(parsed.assignmentRule);
        if (parsed.leadSyncChunkSize) setLeadSyncChunkSize(parsed.leadSyncChunkSize);
        if (parsed.client_form_fields) {
          setClientFormFields({ ...DEFAULT_CLIENT_FORM_FIELDS, ...parsed.client_form_fields });
        }
      }
    } catch (e) {
      console.error('Error reading crm_config from localStorage:', e);
    }

    // 2. Fetch latest source-of-truth from Supabase (tenant-aware)
    const url = `/api/settings/crm-config${userCompany ? `?company=${encodeURIComponent(userCompany)}` : ''}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!isMounted || !data?.config) return;
        const cfg = data.config;
        if (cfg.stages && Array.isArray(cfg.stages) && cfg.stages.length > 0) {
          setStages(cfg.stages.map(s => ({ ...s, enabled: s.enabled !== false })));
        }
        if (cfg.sources && Array.isArray(cfg.sources) && cfg.sources.length > 0) setSources(cfg.sources);
        if (cfg.clientStatuses && Array.isArray(cfg.clientStatuses) && cfg.clientStatuses.length > 0) setClientStatuses(cfg.clientStatuses);
        if (cfg.priorities && Array.isArray(cfg.priorities) && cfg.priorities.length > 0) setPriorities(cfg.priorities);
        if (cfg.assignmentRule) setAssignmentRule(cfg.assignmentRule);
        if (cfg.leadSyncChunkSize) setLeadSyncChunkSize(cfg.leadSyncChunkSize);
        if (cfg.client_form_fields) {
          setClientFormFields({ ...DEFAULT_CLIENT_FORM_FIELDS, ...cfg.client_form_fields });
        }

        // Sync back to localStorage so other tabs / components have latest Supabase data
        try {
          const currentSaved = localStorage.getItem('crm_config');
          const localParsed = currentSaved ? JSON.parse(currentSaved) : {};
          const merged = { ...localParsed, ...cfg };
          localStorage.setItem('crm_config', JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: merged }));
        } catch (err) {}
      })
      .catch(err => {
        console.warn('Failed to fetch CRM config from Supabase:', err);
      })
      .finally(() => {
        if (isMounted) setIsFetching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userCompany]);

  const handleSave = async () => {
    setLoading(true);
    setSaveStatus(null);
    setSaveMessage('');

    const config = {
      sources,
      stages,
      clientStatuses,
      priorities,
      assignmentRule,
      leadSyncChunkSize,
      client_form_fields: clientFormFields,
      company: userCompany || '',
      is_customized: true,
      updated_at: new Date().toISOString()
    };
    
    // Preserve existing client preferences if present
    try {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.alertSound) config.alertSound = parsed.alertSound;
        if (parsed.alertDuration) config.alertDuration = parsed.alertDuration;
        if (parsed.browserPushEnabled !== undefined) config.browserPushEnabled = parsed.browserPushEnabled;
        if (parsed.confirmStageChange !== undefined) config.confirmStageChange = parsed.confirmStageChange;
      }
    } catch (e) {}
    
    // Optimistically update localStorage and notify all active modules
    localStorage.setItem('crm_config', JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: config }));

    // Persist permanently to Supabase via API
    try {
      const res = await fetch('/api/settings/crm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save configuration to Supabase database');
      }

      setSaveStatus('success');
      setSaveMessage('Saved permanently to Supabase!');

      try {
        logAuditAction('Update CRM Config', `Updated CRM pipeline stages, client form fields, sources for ${userCompany || 'workspace'}`);
      } catch (e) {
        console.error('Audit Log failed', e);
      }
    } catch (err) {
      console.error('Error saving CRM config to Supabase:', err);
      setSaveStatus('error');
      setSaveMessage(err.message || 'Error saving to Supabase');
    } finally {
      setLoading(false);
      setTimeout(() => {
        setSaveStatus(null);
      }, 4000);
    }
  };

  const moveItem = (array, setArray, index, direction) => {
    if ((direction === -1 && index === 0) || (direction === 1 && index === array.length - 1)) return;
    const newArray = [...array];
    const temp = newArray[index];
    newArray[index] = newArray[index + direction];
    newArray[index + direction] = temp;
    setArray(newArray);
  };

  const DraggableItem = ({ item, index, array, setArray, onRemove, editable = false }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <button onClick={() => moveItem(array, setArray, index, -1)} disabled={index === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={18} /></button>
        <button onClick={() => moveItem(array, setArray, index, 1)} disabled={index === array.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: index === array.length - 1 ? 'default' : 'pointer', color: index === array.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={18} /></button>
      </div>
      
      {editable ? (
        <input 
          type="text" 
          value={item}
          onChange={(e) => {
            const newArray = [...array];
            newArray[index] = e.target.value;
            setArray(newArray);
          }}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid transparent', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }}
          onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-color)'}
          onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
        />
      ) : (
        <span style={{ flex: 1 }}>{item}</span>
      )}

      {onRemove && (
        <button onClick={() => onRemove(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#ef4444', display: 'flex' }}>
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );

  const subTabs = [
    { id: 'stages', label: 'Pipeline Stages' },
    { id: 'client_form', label: 'Client Form Fields' },
    { id: 'sources', label: 'Lead Sources' },
    { id: 'client_status', label: 'Client Statuses' },
    { id: 'priority', label: 'Priority Types' },
    { id: 'assignment', label: 'Auto-Assignment' },
    { id: 'sync', label: 'Lead Sync Settings' },
  ];

  const activeStagesCount = stages.filter(s => s.enabled !== false).length;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Settings2 size={24} color="var(--accent-color)" />
            CRM & Lead Configurations
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Customize pipeline stages, tenant form fields, and lead rules {userCompany ? `for ${userCompany}` : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {saveStatus === 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#16a34a', fontSize: '0.9rem', fontWeight: 600, background: 'rgba(22, 163, 74, 0.1)', padding: '0.5rem 0.85rem', borderRadius: '6px' }}>
              <CheckCircle2 size={16} /> {saveMessage}
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#dc2626', fontSize: '0.9rem', fontWeight: 600, background: 'rgba(220, 38, 38, 0.1)', padding: '0.5rem 0.85rem', borderRadius: '6px' }}>
              <AlertCircle size={16} /> {saveMessage}
            </div>
          )}
          <button 
            onClick={handleSave} disabled={loading}
            style={{ padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
          >
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
            {loading ? 'Saving to Supabase...' : 'Save & Update'}
          </button>
        </div>
      </div>

      {/* Submenu Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '0.6rem 1.25rem',
              background: activeSubTab === tab.id ? 'var(--accent-color)' : 'transparent',
              color: activeSubTab === tab.id ? 'white' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: activeSubTab === tab.id ? 600 : 500,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            {tab.id === 'client_form' && <FormInput size={15} />}
            {tab.label}
            {tab.id === 'stages' && (
              <span style={{ 
                background: activeSubTab === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', 
                color: activeSubTab === tab.id ? 'white' : 'var(--text-primary)', 
                padding: '0.1rem 0.5rem', 
                borderRadius: '10px', 
                fontSize: '0.75rem', 
                fontWeight: 700 
              }}>
                {activeStagesCount}/8
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
        
        {/* TAB 1: PIPELINE STAGES (WITH ACTIVE/DISABLED TOGGLES) */}
        {activeSubTab === 'stages' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Pipeline Stages & Substages Configuration
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Toggle stages ON/OFF for your workspace. For example, turn off S06, S07, S08 to run a 5-stage pipeline (S01 to S05).
                </p>
              </div>
              <div style={{ 
                background: 'var(--bg-surface)', 
                padding: '0.45rem 0.9rem', 
                borderRadius: '8px', 
                border: '1px solid var(--border-light)',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-primary)'
              }}>
                Active Stages: <span style={{ color: 'var(--accent-color)' }}>{activeStagesCount}</span> of {stages.length}
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stages.map((stageObj, i) => {
                const isStageActive = stageObj.enabled !== false;
                return (
                  <div 
                    key={`stage-${i}`} 
                    style={{ 
                      background: isStageActive ? 'var(--bg-surface)' : 'rgba(148, 163, 184, 0.08)', 
                      border: `1px solid ${isStageActive ? 'var(--border-light)' : 'rgba(148, 163, 184, 0.25)'}`, 
                      borderRadius: '8px', 
                      overflow: 'hidden',
                      opacity: isStageActive ? 1 : 0.75,
                      transition: 'all 0.2s'
                    }}
                  >
                    
                    {/* Main Stage Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => moveItem(stages, setStages, i, -1)} disabled={i === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={16} /></button>
                        <button onClick={() => moveItem(stages, setStages, i, 1)} disabled={i === stages.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: i === stages.length - 1 ? 'default' : 'pointer', color: i === stages.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={16} /></button>
                      </div>
                      
                      <input 
                        type="text" 
                        value={stageObj.name}
                        onChange={(e) => {
                          const newStages = [...stages];
                          newStages[i].name = e.target.value;
                          setStages(newStages);
                        }}
                        style={{ 
                          flex: 1, 
                          padding: '0.4rem 0.5rem', 
                          border: '1px solid transparent', 
                          background: 'transparent', 
                          color: isStageActive ? 'var(--text-primary)' : 'var(--text-secondary)', 
                          outline: 'none', 
                          fontWeight: 600, 
                          fontSize: '0.95rem',
                          textDecoration: isStageActive ? 'none' : 'line-through'
                        }}
                        onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent-color)'}
                        onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                      />

                      {/* Active / Inactive Switch */}
                      <button
                        type="button"
                        onClick={() => {
                          const newStages = [...stages];
                          newStages[i].enabled = !isStageActive;
                          setStages(newStages);
                        }}
                        style={{
                          padding: '0.35rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          border: `1px solid ${isStageActive ? '#10b981' : '#94a3b8'}`,
                          background: isStageActive ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-primary)',
                          color: isStageActive ? '#059669' : '#64748b'
                        }}
                        title={isStageActive ? 'Click to disable stage' : 'Click to enable stage'}
                      >
                        {isStageActive ? '✓ Active' : '✕ Disabled'}
                      </button>

                      {/* Substages expand button */}
                      <button 
                        onClick={() => setExpandedStage(expandedStage === i ? null : i)}
                        style={{ 
                          padding: '0.35rem 0.8rem', 
                          background: expandedStage === i ? 'var(--th-filtered-bg)' : 'transparent', 
                          border: '1px solid var(--border-light)', 
                          borderRadius: '6px', 
                          fontSize: '0.8rem', 
                          cursor: 'pointer', 
                          color: 'var(--text-primary)', 
                          fontWeight: 500 
                        }}
                      >
                        {expandedStage === i ? 'Close' : `${stageObj.substages?.length || 0} Substages`}
                      </button>
                    </div>

                    {/* Expanded Substages */}
                    {expandedStage === i && (
                      <div style={{ padding: '1rem', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                          Substages for {stageObj.name}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                          {stageObj.substages.map((sub, j) => {
                            const stageNum = i + 1;
                            const subNum = String(j + 1).padStart(2, '0');
                            const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                            const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                            const cleanSubName = sub.startsWith(prefix) ? sub.replace(prefix, '') : (sub.includes('>') ? sub.split('>').pop() : sub);
                            
                            return (
                              <div key={`sub-${j}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <button onClick={() => {
                                    if(j === 0) return;
                                    const newStages = [...stages];
                                    const temp = newStages[i].substages[j];
                                    newStages[i].substages[j] = newStages[i].substages[j-1];
                                    newStages[i].substages[j-1] = temp;
                                    setStages(newStages);
                                  }} disabled={j === 0} style={{ padding: 0, background: 'none', border: 'none', cursor: j === 0 ? 'default' : 'pointer', color: j === 0 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronUp size={14} /></button>
                                  <button onClick={() => {
                                    if(j === stageObj.substages.length - 1) return;
                                    const newStages = [...stages];
                                    const temp = newStages[i].substages[j];
                                    newStages[i].substages[j] = newStages[i].substages[j+1];
                                    newStages[i].substages[j+1] = temp;
                                    setStages(newStages);
                                  }} disabled={j === stageObj.substages.length - 1} style={{ padding: 0, background: 'none', border: 'none', cursor: j === stageObj.substages.length - 1 ? 'default' : 'pointer', color: j === stageObj.substages.length - 1 ? '#cbd5e1' : 'var(--text-secondary)' }}><ChevronDown size={14} /></button>
                                </div>
                                
                                <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                                  <span style={{ padding: '0.2rem 0.45rem', color: 'var(--text-secondary)', fontSize: '0.78rem', userSelect: 'none', borderRight: '1px solid var(--border-light)', fontFamily: 'monospace' }}>{prefix}</span>
                                  <input 
                                    type="text" 
                                    value={cleanSubName}
                                    onChange={(e) => {
                                      const newStages = [...stages];
                                      newStages[i].substages[j] = `${prefix}${e.target.value}`;
                                      setStages(newStages);
                                    }}
                                    style={{ flex: 1, padding: '0.35rem 0.6rem', border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem' }}
                                  />
                                </div>

                                <button 
                                  onClick={() => {
                                    const newStages = [...stages];
                                    newStages[i].substages.splice(j, 1);
                                    setStages(newStages);
                                  }}
                                  style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add Substage */}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input 
                            type="text" 
                            id={`new-sub-${i}`} 
                            placeholder="New substage name..." 
                            style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value.trim()) {
                                const newStages = [...stages];
                                const stageNum = i + 1;
                                const subNum = String(newStages[i].substages.length + 1).padStart(2, '0');
                                const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                                const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                                newStages[i].substages.push(`${prefix}${e.target.value.trim()}`);
                                setStages(newStages);
                                e.target.value = '';
                              }
                            }}
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById(`new-sub-${i}`);
                              if (input && input.value.trim()) {
                                const newStages = [...stages];
                                const stageNum = i + 1;
                                const subNum = String(newStages[i].substages.length + 1).padStart(2, '0');
                                const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                                const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                                newStages[i].substages.push(`${prefix}${input.value.trim()}`);
                                setStages(newStages);
                                input.value = '';
                              }
                            }}
                            style={{ padding: '0.45rem 1rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CLIENT REGISTRATION FORM FIELDS CONFIG */}
        {activeSubTab === 'client_form' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Client Registration Form Fields (Tenant Control)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Select which fields appear in <strong>Sales &gt; New Client Registration</strong> for your workspace, and which fields are mandatory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClientFormFields(DEFAULT_CLIENT_FORM_FIELDS)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <RotateCcw size={14} /> Reset to Defaults
              </button>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Field Name & Key</th>
                    <th style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Section</th>
                    <th style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>Visible in Form</th>
                    <th style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>Required (Mandatory)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(clientFormFields).map(([key, config]) => {
                    const isVisible = config.enabled !== false;
                    const isRequired = Boolean(config.required);
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid var(--border-light)', background: isVisible ? 'transparent' : 'rgba(148, 163, 184, 0.05)' }}>
                        <td style={{ padding: '0.6rem 0.9rem' }}>
                          <div style={{ fontWeight: 600, color: isVisible ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {config.label}
                          </div>
                          <code style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{key}</code>
                        </td>
                        <td style={{ padding: '0.6rem 0.9rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          <span style={{ background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                            {config.category || 'General'}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>
                          <input 
                            type="checkbox"
                            checked={isVisible}
                            onChange={(e) => {
                              setClientFormFields(prev => ({
                                ...prev,
                                [key]: { ...prev[key], enabled: e.target.checked }
                              }));
                            }}
                            style={{ width: '17px', height: '17px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '0.6rem 0.9rem', textAlign: 'center' }}>
                          <input 
                            type="checkbox"
                            checked={isRequired}
                            disabled={!isVisible}
                            onChange={(e) => {
                              setClientFormFields(prev => ({
                                ...prev,
                                [key]: { ...prev[key], required: e.target.checked }
                              }));
                            }}
                            style={{ width: '17px', height: '17px', accentColor: '#ef4444', cursor: isVisible ? 'pointer' : 'not-allowed' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SOURCES */}
        {activeSubTab === 'sources' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Lead Sources</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Manage where your leads originate from.</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="Add new source (e.g., LinkedIn Campaign)..."
                style={{ flex: 1, padding: '0.6rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSource.trim()) {
                    setSources([...sources, newSource.trim()]);
                    setNewSource('');
                  }
                }}
              />
              <button 
                onClick={() => {
                  if (newSource.trim()) {
                    setSources([...sources, newSource.trim()]);
                    setNewSource('');
                  }
                }}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={18} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sources.map((src, i) => (
                <DraggableItem key={src} item={src} index={i} array={sources} setArray={setSources} onRemove={(item) => setSources(sources.filter(s => s !== item))} editable={true} />
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: CLIENT STATUSES */}
        {activeSubTab === 'client_status' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Client Statuses</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Manage client status badges like Hot, Warm, Cold.</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                value={newClientStatus}
                onChange={(e) => setNewClientStatus(e.target.value)}
                placeholder="Add new status (e.g., VIP, High Intent)..."
                style={{ flex: 1, padding: '0.6rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newClientStatus.trim()) {
                    setClientStatuses([...clientStatuses, newClientStatus.trim()]);
                    setNewClientStatus('');
                  }
                }}
              />
              <button 
                onClick={() => {
                  if (newClientStatus.trim()) {
                    setClientStatuses([...clientStatuses, newClientStatus.trim()]);
                    setNewClientStatus('');
                  }
                }}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={18} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {clientStatuses.map((st, i) => (
                <DraggableItem key={st} item={st} index={i} array={clientStatuses} setArray={setClientStatuses} onRemove={(item) => setClientStatuses(clientStatuses.filter(s => s !== item))} editable={true} />
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: PRIORITIES */}
        {activeSubTab === 'priority' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Priority Types</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Set lead priority levels for better triage.</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                placeholder="Add new priority (e.g., LP13: Urgent Escalation)..."
                style={{ flex: 1, padding: '0.6rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPriority.trim()) {
                    setPriorities([...priorities, newPriority.trim()]);
                    setNewPriority('');
                  }
                }}
              />
              <button 
                onClick={() => {
                  if (newPriority.trim()) {
                    setPriorities([...priorities, newPriority.trim()]);
                    setNewPriority('');
                  }
                }}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={18} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {priorities.map((p, i) => (
                <DraggableItem key={p} item={p} index={i} array={priorities} setArray={setPriorities} onRemove={(item) => setPriorities(priorities.filter(pr => pr !== item))} editable={true} />
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: AUTO-ASSIGNMENT */}
        {activeSubTab === 'assignment' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Lead Auto-Assignment Rules</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Define how incoming unassigned leads get distributed.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', background: assignmentRule === 'round_robin' ? 'var(--nav-active-bg)' : 'transparent' }}>
                <input 
                  type="radio" 
                  name="assignmentRule" 
                  value="round_robin" 
                  checked={assignmentRule === 'round_robin'} 
                  onChange={(e) => setAssignmentRule(e.target.value)} 
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Round Robin Distribution</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Leads are evenly distributed among all active agents in a cyclic order.</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '8px', cursor: 'pointer', background: assignmentRule === 'manual' ? 'var(--nav-active-bg)' : 'transparent' }}>
                <input 
                  type="radio" 
                  name="assignmentRule" 
                  value="manual" 
                  checked={assignmentRule === 'manual'} 
                  onChange={(e) => setAssignmentRule(e.target.value)} 
                  style={{ marginTop: '0.2rem' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Manual Assignment Only</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>New leads stay unassigned until a manager or admin manually routes them.</div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* TAB 7: LEAD SYNC CHUNK SIZE */}
        {activeSubTab === 'sync' && (
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Database Sync Performance Settings</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Configure batch sizes for local lead updates and cache sync.</p>

            <div style={{ maxWidth: '400px' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 500 }}>Sync Batch Chunk Size (Records per Request)</label>
              <select 
                value={leadSyncChunkSize} 
                onChange={(e) => setLeadSyncChunkSize(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
              >
                <option value="250">250 records (Low Network / Mobile)</option>
                <option value="500">500 records (Balanced - Recommended)</option>
                <option value="1000">1000 records (High Speed Fiber)</option>
                <option value="2000">2000 records (Enterprise Server)</option>
              </select>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
