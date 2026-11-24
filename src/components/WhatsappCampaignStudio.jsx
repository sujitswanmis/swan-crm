'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Send, Users, Building2, CheckCircle2, AlertCircle, PlayCircle, Eye, RefreshCw, 
  Sparkles, Check, ChevronRight, ShieldCheck, Phone, Zap, ArrowRight, X, ExternalLink
} from 'lucide-react';
import { crmStyles } from '@/components/common/CRMDesignSystem';
import { 
  getCampaignAudienceStats, 
  getCampaignAudiencePreview, 
  launchWhatsappBroadcastCampaign 
} from '@/app/actions/whatsappCampaigns';
import { getCategoryMeta, getRecipientMeta } from '@/components/WhatsappOfficial';

const AUDIENCE_TYPES = [
  { 
    id: 'party', 
    label: 'Party Master', 
    subtitle: 'Dealers, Distributors & Channel Partners', 
    icon: '🏢', 
    color: '#0284c7', 
    countKey: 'partyCount',
    defaultRecipient: 'party_business'
  },
  { 
    id: 'leads', 
    label: 'Lead Management', 
    subtitle: 'Active Leads, Inquiries & Prospects', 
    icon: '🎯', 
    color: '#10b981', 
    countKey: 'leadCount',
    defaultRecipient: 'lead_business'
  },
  { 
    id: 'end_customers', 
    label: 'End Customer Master', 
    subtitle: 'Machine Owners, Farmers & Retail Buyers', 
    icon: '🚜', 
    color: '#16a34a', 
    countKey: 'customerCount',
    defaultRecipient: 'end_customer_p1'
  },
  { 
    id: 'users', 
    label: 'User Manage', 
    subtitle: 'Internal Staff, Field Team & Employees', 
    icon: '🧑‍💼', 
    color: '#8b5cf6', 
    countKey: 'userCount',
    defaultRecipient: 'employee'
  }
];

export default function WhatsappCampaignStudio({ 
  tenantId = null, 
  tenantBranches = [], 
  templates = [],
  onNavigateToLogs = null 
}) {
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [selectedAudience, setSelectedAudience] = useState('party');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientPriority, setRecipientPriority] = useState('party_business');

  // Stats & Previews
  const [stats, setStats] = useState({ partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [samplePreviewRecords, setSamplePreviewRecords] = useState([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Broadcast campaign state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(null);
  const [campaignResult, setCampaignResult] = useState(null);

  // Fetch Audience Stats whenever Branch changes
  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      setLoadingStats(true);
      try {
        const res = await getCampaignAudienceStats({ tenantId, branchFilter: selectedBranch });
        if (isMounted) setStats(res);
      } catch (err) {
        console.error('Failed to load audience stats:', err);
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    }
    loadStats();
    return () => { isMounted = false; };
  }, [tenantId, selectedBranch]);

  // Fetch Sample Records for Preview
  useEffect(() => {
    let isMounted = true;
    async function loadPreview() {
      setLoadingPreviews(true);
      try {
        const rows = await getCampaignAudiencePreview({ 
          tenantId, 
          audienceType: selectedAudience, 
          branchFilter: selectedBranch 
        });
        if (isMounted) setSamplePreviewRecords(rows);
      } catch (err) {
        console.error('Failed to load sample preview:', err);
      } finally {
        if (isMounted) setLoadingPreviews(false);
      }
    }
    loadPreview();
    return () => { isMounted = false; };
  }, [tenantId, selectedAudience, selectedBranch]);

  // Filter templates matching chosen audience
  const relevantTemplates = useMemo(() => {
    if (!templates || templates.length === 0) return [];
    return templates.filter(t => {
      const comp = String(t.company || '').toLowerCase();
      if (selectedAudience === 'party') return comp.includes('category:party') || comp.includes('general') || comp.includes('broadcast');
      if (selectedAudience === 'leads') return comp.includes('category:leads') || comp.includes('general') || comp.includes('broadcast');
      if (selectedAudience === 'end_customers') return comp.includes('category:end_customers') || comp.includes('general') || comp.includes('broadcast');
      if (selectedAudience === 'users') return comp.includes('category:attendance') || comp.includes('category:leaves') || comp.includes('general');
      return true;
    });
  }, [templates, selectedAudience]);

  // Auto-select first matching template if none or invalid
  useEffect(() => {
    if (relevantTemplates.length > 0) {
      if (!selectedTemplateId || !relevantTemplates.some(t => t.id === selectedTemplateId)) {
        setSelectedTemplateId(relevantTemplates[0].id);
      }
    } else {
      setSelectedTemplateId('');
    }
  }, [relevantTemplates, selectedTemplateId]);

  // Sync default recipient when audience changes
  useEffect(() => {
    const found = AUDIENCE_TYPES.find(a => a.id === selectedAudience);
    if (found) {
      setRecipientPriority(found.defaultRecipient);
    }
  }, [selectedAudience]);

  // Currently selected template object
  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || relevantTemplates[0] || null;
  }, [templates, selectedTemplateId, relevantTemplates]);

  // Target count
  const currentTargetCount = useMemo(() => {
    if (selectedAudience === 'party') return stats.partyCount;
    if (selectedAudience === 'leads') return stats.leadCount;
    if (selectedAudience === 'end_customers') return stats.customerCount;
    if (selectedAudience === 'users') return stats.userCount;
    return 0;
  }, [selectedAudience, stats]);

  // Sample recipient for preview
  const sampleRecipient = useMemo(() => {
    if (samplePreviewRecords && samplePreviewRecords.length > 0) {
      return samplePreviewRecords[0];
    }
    return { name: 'Shiva Auto Parts', subName: 'Ramesh Kumar (CP1)', phone: '9991899386' };
  }, [samplePreviewRecords]);

  // Generate Live Message Body Preview
  const liveMessagePreviewText = useMemo(() => {
    if (!activeTemplate || !activeTemplate.message_body) {
      return 'Please select an approved WhatsApp template to view live preview.';
    }
    let body = activeTemplate.message_body;
    body = body.replace(/\{\{1\}\}/g, sampleRecipient.name || 'Channel Partner');
    body = body.replace(/\{\{2\}\}/g, sampleRecipient.subName || 'Contact Person');
    body = body.replace(/\{\{3\}\}/g, sampleRecipient.phone || 'Official Contact');
    body = body.replace(/\{\{4\}\}/g, selectedBranch !== 'All' ? selectedBranch : 'New Swan Group');
    body = body.replace(/\{\{5\}\}/g, 'Active Partner');
    return body;
  }, [activeTemplate, sampleRecipient, selectedBranch]);

  // Handle Test Message Send
  const handleSendTestMessage = async () => {
    if (!selectedTemplateId) {
      alert('Please select a WhatsApp Template first.');
      return;
    }
    if (!testPhone || testPhone.replace(/\D/g, '').length < 10) {
      alert('Please enter a valid 10-digit mobile number for test send.');
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await launchWhatsappBroadcastCampaign({
        tenantId,
        audienceType: selectedAudience,
        branchFilter: selectedBranch,
        templateId: selectedTemplateId,
        testPhone: testPhone.trim()
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err.message || 'Test send failed' });
    } finally {
      setSendingTest(false);
    }
  };

  // Handle Full Campaign Launch
  const handleLaunchCampaign = async () => {
    if (!selectedTemplateId) {
      alert('Please select a WhatsApp Template first.');
      return;
    }
    if (currentTargetCount === 0) {
      alert('No recipients available for the selected branch and audience.');
      return;
    }
    setShowConfirmModal(false);
    setLaunching(true);
    setCampaignResult(null);
    setLaunchProgress(`Preparing broadcast to ${currentTargetCount} recipients...`);

    try {
      const res = await launchWhatsappBroadcastCampaign({
        tenantId,
        audienceType: selectedAudience,
        branchFilter: selectedBranch,
        templateId: selectedTemplateId,
        recipientPriority
      });
      setCampaignResult(res);
    } catch (err) {
      setCampaignResult({ success: false, error: err.message || 'Campaign execution failed' });
    } finally {
      setLaunching(false);
      setLaunchProgress(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* 1. STUDIO HERO HEADER */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(37, 99, 235, 0.05) 100%)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📢</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              WhatsApp Broadcast Campaign Studio
            </h2>
            <span style={{ 
              fontSize: '0.72rem', 
              fontWeight: 700, 
              padding: '0.15rem 0.5rem', 
              borderRadius: '999px', 
              backgroundColor: 'rgba(16, 185, 129, 0.12)', 
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              Multi-Branch Ready
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            Launch festival greetings (e.g. Dev Diwali), pricing notices, or announcements to Party Master, Leads, End Customers, or Staff.
          </p>
        </div>

        {/* Dynamic Branch Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Building2 size={15} color="var(--accent-color, #2563eb)" /> Target Branch:
          </label>
          <select className={crmStyles.field}
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ 
              minWidth: '240px', 
              maxWidth: '320px', 
              padding: '0.55rem 0.85rem', 
              borderRadius: '8px', 
              fontSize: '0.84rem', 
              fontWeight: 700,
              border: '1.5px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)'
            }}
          >
            <option value="All">🌐 All Branches (Universal / Group-Wide)</option>
            {tenantBranches && tenantBranches.length > 0 ? (
              tenantBranches.map(b => (
                <option key={b.branch_code || b.id} value={b.branch_name}>
                  🏢 {b.branch_name} {b.custom_code ? `(${b.custom_code})` : ''}
                </option>
              ))
            ) : (
              <>
                <option value="New Swan Group (Headquarters)">🏢 New Swan Group (Headquarters)</option>
                <option value="New Swan Multitech Limited Raian">🏢 New Swan Multitech Limited Raian (NSMLR)</option>
                <option value="New Swan Technologies Limited Paharuwal">🏢 New Swan Technologies Limited Paharuwal (NSTLP)</option>
                <option value="New Swan Enterprises - 1">🏢 New Swan Enterprises - 1 (NSE1)</option>
                <option value="New Swan Enterprises - 2">🏢 New Swan Enterprises - 2 (NSE2)</option>
                <option value="New Swan Enterprises - 3">🏢 New Swan Enterprises - 3 (NSE3)</option>
                <option value="New Swan Enterprises - 4">🏢 New Swan Enterprises - 4 (NSE4)</option>
                <option value="New Swan Autocomp Pvt. Ltd.">🏢 New Swan Autocomp Pvt. Ltd. (NSACPL1)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* 2. STEP 1: AUDIENCE SELECTOR CARDS (PARTY, LEADS, CUSTOMERS, USERS) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <label style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.75rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>1</span>
            Step 1: Choose Target Audience
          </label>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Showing counts for: <strong>{selectedBranch}</strong>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
          {AUDIENCE_TYPES.map(aud => {
            const isSelected = selectedAudience === aud.id;
            const count = stats[aud.countKey] || 0;
            return (
              <div 
                key={aud.id}
                onClick={() => setSelectedAudience(aud.id)}
                style={{
                  padding: '1rem 1.15rem',
                  borderRadius: '10px',
                  border: isSelected ? `2px solid ${aud.color}` : '1px solid var(--border-light)',
                  backgroundColor: isSelected ? `${aud.color}0a` : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  boxShadow: isSelected ? `0 4px 15px ${aud.color}25` : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.5rem' }}>{aud.icon}</span>
                  <span style={{ 
                    fontSize: '0.95rem', 
                    fontWeight: 800, 
                    color: isSelected ? aud.color : 'var(--text-primary)',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? `${aud.color}20` : 'var(--th-bg)',
                    border: `1px solid ${isSelected ? aud.color + '40' : 'var(--border-light)'}`
                  }}>
                    {loadingStats ? '...' : `${count} Available`}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  {aud.label}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {aud.subtitle}
                </div>
                {isSelected && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: aud.color }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. STEP 2 & 3: TEMPLATE PICKER & LIVE PREVIEW BUBBLE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        
        {/* Left Column: Template & Recipient Priority */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Step 2: Template Selection */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            padding: '1.15rem'
          }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
              <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.75rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</span>
              Step 2: Select Approved WhatsApp Template
            </label>

            {relevantTemplates.length === 0 ? (
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.82rem', color: '#b91c1c' }}>
                <AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                No approved templates found matching <strong>{AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}</strong>. Please create one in <strong>Templates Library</strong> tab.
              </div>
            ) : (
              <div>
                <select className={crmStyles.field}
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.86rem', fontWeight: 700 }}
                >
                  {relevantTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      ✉️ {t.template_name} ({t.campaign_name || 'Campaign'})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'block' }}>
                  Auto-filtered to templates configured for {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}.
                </span>
              </div>
            )}
          </div>

          {/* Step 3: Recipient Priority Options */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            padding: '1.15rem'
          }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
              <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.75rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>3</span>
              Step 3: Recipient Delivery Priority
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedAudience === 'party' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'party_business' ? '1.5px solid #0284c7' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'party_business' ? 'rgba(2, 132, 199, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="radio" name="priority" checked={recipientPriority === 'party_business'} onChange={() => setRecipientPriority('party_business')} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🏢 Official Business Mobile (1st Priority)</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Firm phone number (Auto-fallback to CP1 if blank)</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'party_cp1' ? '1.5px solid #0284c7' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'party_cp1' ? 'rgba(2, 132, 199, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="radio" name="priority" checked={recipientPriority === 'party_cp1'} onChange={() => setRecipientPriority('party_cp1')} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>👤 Contact Person 1 - CP1 (2nd Priority)</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Directly to Owner / Main Contact</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'party_all' ? '1.5px solid #0284c7' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'party_all' ? 'rgba(2, 132, 199, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="radio" name="priority" checked={recipientPriority === 'party_all'} onChange={() => setRecipientPriority('party_all')} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>📢 All Party Contacts (Firm + CPs - Multi-Send)</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Deliver to Firm, CP1, and CP2 simultaneously</div>
                    </div>
                  </label>
                </>
              )}

              {selectedAudience === 'leads' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'lead_business' ? '1.5px solid #10b981' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'lead_business' ? 'rgba(16, 185, 129, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="radio" name="priority" checked={recipientPriority === 'lead_business'} onChange={() => setRecipientPriority('lead_business')} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🏢 Business Contact (1st Priority - Auto Fallback to CP1)</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Sends to Business Contact 1 or CP1 Phone</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'lead_cp1' ? '1.5px solid #10b981' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'lead_cp1' ? 'rgba(16, 185, 129, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="radio" name="priority" checked={recipientPriority === 'lead_cp1'} onChange={() => setRecipientPriority('lead_cp1')} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>👤 Contact Person 1 - CP1 (Lead Owner)</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Sends to primary mobile number</div>
                    </div>
                  </label>
                </>
              )}

              {selectedAudience === 'end_customers' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1.5px solid #16a34a', backgroundColor: 'rgba(22, 163, 74, 0.06)', cursor: 'pointer', fontSize: '0.84rem' }}>
                  <input type="radio" name="priority" checked readOnly />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🚜 End Customer Primary Mobile 1</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Directly to machine owner</div>
                  </div>
                </label>
              )}

              {selectedAudience === 'users' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1.5px solid #8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.06)', cursor: 'pointer', fontSize: '0.84rem' }}>
                  <input type="radio" name="priority" checked readOnly />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🧑‍💼 Official Employee Mobile Number</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Registered staff mobile</div>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Mobile WhatsApp Chat Preview */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          padding: '1.15rem',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Eye size={17} color="#25D366" /> Live WhatsApp Mobile Preview
            </label>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'var(--th-bg)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Sample: {sampleRecipient.name}
            </span>
          </div>

          {/* Realistic WhatsApp Chat Bubble Container */}
          <div style={{
            flex: 1,
            backgroundColor: '#0b141a',
            backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)',
            backgroundSize: '16px 16px',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '260px'
          }}>
            {/* Phone Screen Mockup */}
            <div style={{
              width: '100%',
              maxWidth: '340px',
              backgroundColor: '#005c4b',
              color: '#e9edef',
              borderRadius: '8px 8px 2px 8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              overflow: 'hidden',
              fontSize: '0.86rem',
              lineHeight: 1.45,
              position: 'relative'
            }}>
              {/* Optional Header Image Preview */}
              {activeTemplate?.image_url && (
                <div style={{ width: '100%', height: '140px', overflow: 'hidden', backgroundColor: '#025144' }}>
                  <img src={activeTemplate.image_url} alt="Campaign Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}

              {/* Message Body with Tokens Replaced */}
              <div style={{ padding: '0.75rem 0.85rem 0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {liveMessagePreviewText}
              </div>

              {/* Timestamp & Sent Checkmarks */}
              <div style={{ padding: '0 0.85rem 0.45rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'rgba(233, 237, 239, 0.65)' }}>
                <span>Just Now</span>
                <span style={{ color: '#53bdeb' }}>✓✓</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Personalized variables like <strong>&#123;&#123;1&#125;&#125;</strong> will automatically be replaced with each recipient&apos;s real name & details.
          </div>
        </div>
      </div>

      {/* 4. STEP 4: TEST SEND & 1-CLICK LAUNCH CAMPAIGN */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1.5px solid var(--accent-color, #2563eb)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 6px 20px rgba(37, 99, 235, 0.08)'
      }}>
        {/* Test Send Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <Phone size={15} color="#059669" /> Send Single Test:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input 
              type="text" 
              placeholder="10-digit mobile" 
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              style={{ width: '150px', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.84rem' }}
            />
            <button
              type="button"
              onClick={handleSendTestMessage}
              disabled={sendingTest || !testPhone}
              style={{
                padding: '0.45rem 0.85rem',
                backgroundColor: 'var(--th-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: (sendingTest || !testPhone) ? 'not-allowed' : 'pointer'
              }}
            >
              {sendingTest ? 'Sending...' : '🧪 Send Test'}
            </button>
          </div>
          {testResult && (
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: testResult.success ? '#059669' : '#b91c1c' }}>
              {testResult.message || testResult.error}
            </span>
          )}
        </div>

        {/* Big Launch Broadcast Button */}
        <div>
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={launching || currentTargetCount === 0 || !selectedTemplateId}
            style={{
              padding: '0.75rem 1.8rem',
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.98rem',
              fontWeight: 800,
              cursor: (launching || currentTargetCount === 0 || !selectedTemplateId) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 15px rgba(22, 163, 74, 0.35)',
              opacity: (launching || currentTargetCount === 0 || !selectedTemplateId) ? 0.6 : 1
            }}
          >
            <Send size={18} />
            {launching ? 'Broadcasting Campaign...' : `Launch Broadcast to ${currentTargetCount} Recipients`}
          </button>
        </div>
      </div>

      {/* Campaign Progress / Status Result */}
      {launchProgress && (
        <div style={{ padding: '1rem', background: 'rgba(37, 99, 235, 0.08)', borderRadius: '8px', border: '1px solid #3b82f6', color: '#1d4ed8', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={16} className="animate-spin" /> {launchProgress}
        </div>
      )}

      {campaignResult && (
        <div style={{
          padding: '1.15rem',
          borderRadius: '10px',
          backgroundColor: campaignResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          border: `1.5px solid ${campaignResult.success ? '#10b981' : '#ef4444'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.96rem', color: campaignResult.success ? '#065f46' : '#991b1b', marginBottom: '0.2rem' }}>
              {campaignResult.success ? '✅ Broadcast Campaign Completed Successfully!' : '❌ Broadcast Campaign Failed'}
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              {campaignResult.message || campaignResult.error}
            </div>
          </div>
          {onNavigateToLogs && (
            <button
              type="button"
              onClick={onNavigateToLogs}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--accent-color, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <ExternalLink size={14} /> View Sent Logs
            </button>
          )}
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE LAUNCHING */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }} onClick={() => setShowConfirmModal(false)}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.3rem' }}>📢</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Confirm WhatsApp Broadcast
                </h3>
              </div>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Are you sure you want to broadcast this WhatsApp message to <strong>{currentTargetCount} {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}</strong> in <strong>{selectedBranch}</strong>?
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div><strong>Template:</strong> {activeTemplate?.template_name}</div>
              <div><strong>Audience:</strong> {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}</div>
              <div><strong>Branch Filter:</strong> {selectedBranch}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{ padding: '0.55rem 1.1rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLaunchCampaign}
                style={{ padding: '0.55rem 1.4rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                Yes, Launch Campaign Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
