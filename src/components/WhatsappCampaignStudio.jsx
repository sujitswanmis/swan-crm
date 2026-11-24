'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Send, Users, Building2, CheckCircle2, AlertCircle, PlayCircle, Eye, RefreshCw, 
  Sparkles, Check, ChevronRight, ChevronLeft, ShieldCheck, Phone, Zap, ArrowRight, ArrowLeft, X, ExternalLink,
  Megaphone, Filter, Clock, Calendar, Gauge, Plus, Search, RotateCcw, UserCheck, UserX, Info
} from 'lucide-react';
import { crmStyles } from '@/components/common/CRMDesignSystem';
import { 
  getCampaignAudienceStats, 
  getCampaignAudiencePreview, 
  launchWhatsappBroadcastCampaign,
  getBroadcastCampaignsList
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

const AUDIENCE_SUB_FILTERS = {
  party: [
    { id: 'ALL', label: 'All Partners' },
    { id: 'EXCLUSIVE', label: 'Exclusive Swan' },
    { id: 'DEALER', label: 'Dealers Only' },
    { id: 'ACTIVE', label: 'Active Status' },
    { id: 'STATE_UP', label: 'Uttar Pradesh' },
    { id: 'STATE_MH', label: 'Maharashtra' },
    { id: 'STATE_PB', label: 'Punjab' },
    { id: 'STATE_HR', label: 'Haryana' }
  ],
  leads: [
    { id: 'ALL', label: 'All Leads' },
    { id: 'STAGE_01', label: '01 - New Stage' },
    { id: 'STAGE_02', label: '02 - Contact Stage' },
    { id: 'STAGE_03', label: '03 - Qualification Stage' },
    { id: 'STAGE_04', label: '04 - Follow Up Stage' },
    { id: 'STAGE_05', label: '05 - Sales Process Stage' },
    { id: 'STAGE_06', label: '06 - Conversion Stage' },
    { id: 'STAGE_07', label: '07 - Final Stage' },
    { id: 'STAGE_08', label: '08 - Transfer to Party' }
  ],
  end_customers: [
    { id: 'ALL', label: 'All Customers' }
  ],
  users: [
    { id: 'ALL', label: 'All Staff' },
    { id: 'STATUS_ACTIVE', label: '🟢 Active Staff (165)' },
    { id: 'STATUS_INACTIVE', label: '⚪ Inactive / Resigned (33)' },
    { id: 'DEPT_SALES', label: 'Sales & Marketing' },
    { id: 'DEPT_PRODUCTION', label: 'Production & Plant' },
    { id: 'DEPT_QA', label: 'Quality Assurance' },
    { id: 'DEPT_HR', label: 'HR & Administration' },
    { id: 'DEPT_SERVICE', label: 'Service Team' },
    { id: 'DEPT_PURCHASE', label: 'Purchase Dept' }
  ]
};

export default function WhatsappCampaignStudio({ 
  tenantId = null, 
  tenantBranches = [], 
  templates = [],
  onNavigateToLogs = null 
}) {
  // View mode: 'list' (Campaigns Table) vs 'create' (3-Stage Wizard)
  const [viewMode, setViewMode] = useState('list');
  const [wizardStage, setWizardStage] = useState(1); // 1, 2, 3

  // Campaigns History List
  const [campaignsList, setCampaignsList] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignSearchTerm, setCampaignSearchTerm] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ALL');

  // Wizard Form State
  const [campaignName, setCampaignName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [selectedAudience, setSelectedAudience] = useState('leads');
  const [selectedSubFilters, setSelectedSubFilters] = useState(['ALL']);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientPriority, setRecipientPriority] = useState('lead_business');
  const [showAllTemplates, setShowAllTemplates] = useState(true);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');

  // Scheduling & Throttle state
  const [sendMode, setSendMode] = useState('immediate'); // 'immediate' | 'scheduled'
  const [scheduledAt, setScheduledAt] = useState('');
  const [throttleSpeed, setThrottleSpeed] = useState('safe'); // 'safe' | 'standard' | 'fast'

  // Stats & Previews
  const [stats, setStats] = useState({ partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [samplePreviewRecords, setSamplePreviewRecords] = useState([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Broadcast execution state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(null);
  const [campaignResult, setCampaignResult] = useState(null);

  // Pagination for Campaigns Table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 1. Fetch Campaigns List on mount
  const refreshCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const list = await getBroadcastCampaignsList({ tenantId });
      setCampaignsList(list || []);
    } catch (err) {
      console.error('Failed to load campaigns list:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    refreshCampaigns();
  }, [tenantId]);

  // 2. Reset sub-filter when audience changes
  const handleSelectAudience = (audId) => {
    setSelectedAudience(audId);
    setSelectedSubFilters(['ALL']);
  };

  // 3. Multi-Select Sub-Filter Toggle
  const handleToggleSubFilter = (fId) => {
    if (fId === 'ALL') {
      setSelectedSubFilters(['ALL']);
      return;
    }

    let next = selectedSubFilters.filter(id => id !== 'ALL');
    if (next.includes(fId)) {
      next = next.filter(id => id !== fId);
      if (next.length === 0) next = ['ALL'];
    } else {
      next.push(fId);
    }
    setSelectedSubFilters(next);
  };

  // 4. Fetch Audience Stats whenever Branch, Audience or SubFilters change
  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      setLoadingStats(true);
      try {
        const res = await getCampaignAudienceStats({ 
          tenantId, 
          branchFilter: selectedBranch,
          audienceType: selectedAudience,
          subFilter: selectedSubFilters
        });
        if (isMounted) setStats(res);
      } catch (err) {
        console.error('Failed to load audience stats:', err);
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    }
    loadStats();
    return () => { isMounted = false; };
  }, [tenantId, selectedBranch, selectedAudience, selectedSubFilters]);

  // 5. Fetch Sample Records for Preview
  useEffect(() => {
    let isMounted = true;
    async function loadPreview() {
      setLoadingPreviews(true);
      try {
        const rows = await getCampaignAudiencePreview({ 
          tenantId, 
          audienceType: selectedAudience, 
          branchFilter: selectedBranch,
          subFilter: selectedSubFilters
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
  }, [tenantId, selectedAudience, selectedBranch, selectedSubFilters]);

  // 6. Filter templates matching chosen audience
  const relevantTemplates = useMemo(() => {
    if (!templates || templates.length === 0) return [];
    
    const parseMeta = (compStr) => {
      const raw = String(compStr || '').trim();
      let category = 'leads';
      const metaMatch = raw.match(/\{category:(.*?),recipient:(.*?)\}/i);
      if (metaMatch && metaMatch[1]) {
        category = metaMatch[1].trim().toLowerCase();
      }
      return { category };
    };

    let list = templates;

    if (!showAllTemplates) {
      const filtered = templates.filter(t => {
        const { category } = parseMeta(t.company);
        if (selectedAudience === 'party') {
          return category === 'party' || category === 'general' || category === 'leads';
        }
        if (selectedAudience === 'leads') {
          return category === 'leads' || category === 'general' || category === 'party';
        }
        if (selectedAudience === 'end_customers') {
          return category === 'end_customers' || category === 'general';
        }
        if (selectedAudience === 'users') {
          return category === 'attendance' || category === 'leaves' || category === 'general';
        }
        return true;
      });
      list = filtered.length > 0 ? filtered : templates;
    }

    if (templateSearchTerm.trim()) {
      const q = templateSearchTerm.toLowerCase().trim();
      list = list.filter(t => 
        (t.template_name || '').toLowerCase().includes(q) ||
        (t.campaign_name || '').toLowerCase().includes(q) ||
        (t.message_body || '').toLowerCase().includes(q) ||
        (t.company || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [templates, selectedAudience, showAllTemplates, templateSearchTerm]);

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

  // Active template object
  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || relevantTemplates[0] || null;
  }, [templates, selectedTemplateId, relevantTemplates]);

  // Target count for currently chosen audience
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

  // Live preview text generator
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

  // Single Test Send Handler
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
        campaignName: campaignName || 'Test Broadcast',
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

  // Launch or Schedule Campaign Handler
  const handleLaunchCampaign = async () => {
    if (!selectedTemplateId) {
      alert('Please select a WhatsApp Template first.');
      return;
    }
    if (currentTargetCount === 0) {
      alert('No recipients available for the selected criteria.');
      return;
    }
    if (sendMode === 'scheduled' && !scheduledAt) {
      alert('Please select a scheduled date and time for the broadcast.');
      return;
    }
    setShowConfirmModal(false);
    setLaunching(true);
    setCampaignResult(null);
    setLaunchProgress(sendMode === 'scheduled'
      ? `Scheduling broadcast for ${scheduledAt}...`
      : `Broadcasting to ${Number(currentTargetCount || 0).toLocaleString()} recipients with Meta-safe throttle & anti-spam cap...`);

    try {
      const res = await launchWhatsappBroadcastCampaign({
        tenantId,
        campaignName: campaignName.trim() || `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
        audienceType: selectedAudience,
        branchFilter: selectedBranch,
        subFilter: selectedSubFilters,
        templateId: selectedTemplateId,
        recipientPriority,
        sendMode,
        scheduledAt,
        throttleSpeed
      });
      setCampaignResult(res);
      // Refresh list to include new campaign
      await refreshCampaigns();
      // Auto-switch to list after launch with success status visible
      setTimeout(() => {
        setViewMode('list');
      }, 2500);
    } catch (err) {
      setCampaignResult({ success: false, error: err.message || 'Campaign execution failed' });
    } finally {
      setLaunching(false);
      setLaunchProgress(null);
    }
  };

  // Filtered campaigns for table view
  const filteredCampaigns = useMemo(() => {
    let list = campaignsList || [];
    if (campaignSearchTerm.trim()) {
      const q = campaignSearchTerm.toLowerCase();
      list = list.filter(c => 
        (c.campaignName || '').toLowerCase().includes(q) ||
        (c.templateName || '').toLowerCase().includes(q) ||
        (c.branchFilter || '').toLowerCase().includes(q) ||
        (c.audienceType || '').toLowerCase().includes(q)
      );
    }
    if (campaignStatusFilter !== 'ALL') {
      list = list.filter(c => (c.status || '').toLowerCase() === campaignStatusFilter.toLowerCase());
    }
    return list;
  }, [campaignsList, campaignSearchTerm, campaignStatusFilter]);

  // Paginated campaigns
  const paginatedCampaigns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCampaigns.slice(start, start + pageSize);
  }, [filteredCampaigns, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredCampaigns.length / pageSize) || 1;

  // Active sub-filters display label
  const activeSubFiltersText = useMemo(() => {
    if (selectedSubFilters.includes('ALL') || selectedSubFilters.length === 0) {
      return 'All Records (Entire Segment)';
    }
    const filterDefs = AUDIENCE_SUB_FILTERS[selectedAudience] || [];
    const labels = selectedSubFilters.map(sf => {
      const found = filterDefs.find(f => f.id === sf);
      return found ? found.label.replace(/🟢|⚪/g, '').trim() : sf;
    });
    return labels.join(' + ');
  }, [selectedSubFilters, selectedAudience]);

  // Open Create Wizard
  const handleOpenCreate = () => {
    setCampaignName('');
    setWizardStage(1);
    setCampaignResult(null);
    setViewMode('create');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* =========================================================================
          VIEW 1: CAMPAIGNS DASHBOARD & TABLE (DEFAULT VIEW)
          ========================================================================= */}
      {viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top Hero Banner with Summary & + Add Campaign Button */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.4rem' }}>📢</span>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  WhatsApp Broadcast Campaigns
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
                  Live Multi-Branch Studio
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Track past and scheduled broadcasts to Party Master, Leads, End Customers, or Employees with automated anti-ban throttling.
              </p>
            </div>

            {/* Action Bar: Refresh & + Add Campaign */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={refreshCampaigns}
                disabled={loadingCampaigns}
                className={crmStyles.button}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 0.95rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-primary)',
                  cursor: loadingCampaigns ? 'not-allowed' : 'pointer'
                }}
              >
                <RefreshCw size={14} className={loadingCampaigns ? 'animate-spin' : ''} />
                Refresh
              </button>

              <button
                type="button"
                onClick={handleOpenCreate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.35rem',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Plus size={16} strokeWidth={3} />
                Add Campaign
              </button>
            </div>
          </div>

          {/* Quick Stats Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                📢
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Total Campaigns</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{campaignsList.length}</div>
              </div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                ✅
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Delivered Messages</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                  {campaignsList.reduce((acc, c) => acc + (c.sentCount || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                🛡️
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Anti-Spam Frequency Cap</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>Max 3 msgs/day per contact</div>
              </div>
            </div>

            <div style={{ padding: '0.9rem 1.15rem', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                🔄
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Smart Auto-Retry</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>3 Attempts over 3 Days</div>
              </div>
            </div>
          </div>

          {/* Table Filters Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
              <Search size={15} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Search campaigns by name, template, or branch..."
                value={campaignSearchTerm}
                onChange={e => { setCampaignSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  width: '100%',
                  fontSize: '0.84rem',
                  color: 'var(--text-primary)'
                }}
              />
              {campaignSearchTerm && (
                <button type="button" onClick={() => setCampaignSearchTerm('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Status:</span>
              <select
                value={campaignStatusFilter}
                onChange={e => { setCampaignStatusFilter(e.target.value); setCurrentPage(1); }}
                className={crmStyles.field}
                style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}
              >
                <option value="ALL">All Statuses</option>
                <option value="Completed">🟢 Completed</option>
                <option value="Scheduled">📅 Scheduled</option>
                <option value="Failed">❌ Failed</option>
              </select>
            </div>
          </div>

          {/* Campaigns Data Table (Frozen Header & Standard Pagination) */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 350px)', minHeight: '340px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: 'var(--th-bg, #f8fafc)',
                    boxShadow: 'inset 0 -1px 0 var(--border-light)'
                  }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Campaign Name</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Audience & Sub-Filters</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Target Branch</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Template</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Scheduled / Sent (IST)</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Speed & Limits</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Recipients</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCampaigns ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem', color: 'var(--accent-color, #2563eb)' }} />
                        <div>Loading campaigns history...</div>
                      </td>
                    </tr>
                  ) : paginatedCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3.5rem 1rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📢</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                          No WhatsApp Broadcast Campaigns Found
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
                          Click &quot;Add Campaign&quot; to launch targeted festival greetings, price lists, or announcements to your Party Master, Leads, or Employees.
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenCreate}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.65rem 1.25rem',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            borderRadius: '8px',
                            background: 'var(--accent-color, #2563eb)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <Plus size={16} /> Create First Campaign
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedCampaigns.map((camp, idx) => {
                      const audDef = AUDIENCE_TYPES.find(a => a.id === camp.audienceType);
                      const subFiltersList = Array.isArray(camp.subFilters) ? camp.subFilters : [camp.subFilters || 'ALL'];
                      const subFiltersDisplay = subFiltersList.includes('ALL') ? 'All Records' : subFiltersList.join(', ');
                      const isScheduled = camp.status === 'Scheduled' || camp.sendMode === 'scheduled';

                      return (
                        <tr 
                          key={camp.id || idx}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--th-bg)'
                          }}
                        >
                          {/* Campaign Name */}
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>📢</span>
                              <span>{camp.campaignName || 'Broadcast Campaign'}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              Created: {camp.createdAt ? new Date(camp.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Recently'}
                            </div>
                          </td>

                          {/* Audience & Sub-Filters */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
                              <span>{audDef?.icon || '👥'}</span>
                              <span style={{ fontWeight: 700, color: audDef?.color || 'var(--text-primary)' }}>
                                {audDef?.label || camp.audienceType || 'Audience'}
                              </span>
                            </div>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(37, 99, 235, 0.08)',
                              color: 'var(--accent-color, #2563eb)'
                            }}>
                              {subFiltersDisplay}
                            </span>
                          </td>

                          {/* Target Branch */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            🏢 {camp.branchFilter || 'Universal / All'}
                          </td>

                          {/* Template */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            ✉️ {camp.templateName || 'Approved Template'}
                          </td>

                          {/* Scheduled / Sent Date */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                            {isScheduled ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#2563eb', fontWeight: 700 }}>
                                <Calendar size={13} /> {camp.scheduledAt || 'Upcoming'}
                              </div>
                            ) : (
                              <div>{camp.sentAt ? new Date(camp.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Dispatched'}</div>
                            )}
                          </td>

                          {/* Speed & Limits */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            <div>⚡ {camp.throttleSpeed === 'fast' ? '~150/min' : camp.throttleSpeed === 'standard' ? '~75/min' : '~40/min'}</div>
                            <div style={{ color: '#059669', fontWeight: 600, fontSize: '0.7rem' }}>🛡️ Cap: 3/day • 3-day retry</div>
                          </td>

                          {/* Recipients */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                              {Number(camp.totalTargeted || 0).toLocaleString()} Contacts
                            </div>
                            {camp.sentCount > 0 && (
                              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                                ✅ {Number(camp.sentCount).toLocaleString()} Sent
                              </div>
                            )}
                            {camp.skippedCappedCount > 0 && (
                              <div style={{ fontSize: '0.7rem', color: '#d97706' }}>
                                ⚠️ {camp.skippedCappedCount} skipped (daily cap)
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '999px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              backgroundColor: camp.status === 'Completed' ? 'rgba(16, 185, 129, 0.1)' : camp.status === 'Scheduled' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: camp.status === 'Completed' ? '#059669' : camp.status === 'Scheduled' ? '#2563eb' : '#dc2626',
                              border: `1px solid ${camp.status === 'Completed' ? '#10b98140' : camp.status === 'Scheduled' ? '#3b82f640' : '#ef444440'}`
                            }}>
                              {camp.status === 'Completed' ? '🟢 Completed' : camp.status === 'Scheduled' ? '📅 Scheduled' : '❌ Failed'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Pagination Bar */}
            {filteredCampaigns.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderTop: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Showing <strong>{((currentPage - 1) * pageSize) + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredCampaigns.length)}</strong> of <strong>{filteredCampaigns.length}</strong> campaigns
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-surface)',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.76rem',
                      color: 'var(--text-primary)',
                      opacity: currentPage === 1 ? 0.5 : 1
                    }}
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        border: page === currentPage ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                        backgroundColor: page === currentPage ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface)',
                        color: page === currentPage ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.76rem',
                        fontWeight: page === currentPage ? 800 : 500
                      }}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-surface)',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.76rem',
                      color: 'var(--text-primary)',
                      opacity: currentPage === totalPages ? 0.5 : 1
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: 3-STAGE MULTI-BRANCH CAMPAIGN CREATION WIZARD
          ========================================================================= */}
      {viewMode === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top Wizard Bar: Back Button & Step Indicators */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--th-bg)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={15} /> Back to Campaigns Table
            </button>

            {/* 3-Stage Wizard Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {[
                { stage: 1, label: 'Stage 1: Audience & Filter' },
                { stage: 2, label: 'Stage 2: Template Setting' },
                { stage: 3, label: 'Stage 3: Review & Schedule' }
              ].map(s => {
                const isActive = wizardStage === s.stage;
                const isPassed = wizardStage > s.stage;
                return (
                  <div
                    key={s.stage}
                    onClick={() => {
                      if (s.stage < wizardStage || (s.stage === 2 && currentTargetCount > 0)) {
                        setWizardStage(s.stage);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: isActive ? 800 : 600,
                      backgroundColor: isActive ? 'var(--accent-color, #2563eb)' : isPassed ? 'rgba(16, 185, 129, 0.12)' : 'var(--th-bg)',
                      color: isActive ? '#ffffff' : isPassed ? '#059669' : 'var(--text-secondary)',
                      border: isActive ? '1px solid var(--accent-color, #2563eb)' : isPassed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-light)',
                      cursor: 'pointer'
                    }}
                  >
                    <span>{isPassed ? '✓' : s.stage}.</span>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* -------------------------------------------------------------------
              STAGE 1: TARGET AUDIENCE SELECTION & SMART MULTI-FILTERING
              ------------------------------------------------------------------- */}
          {wizardStage === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Campaign Header: Name & Target Branch */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.25rem'
              }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Megaphone size={15} color="var(--accent-color, #2563eb)" /> Campaign Name (Tracker):
                  </label>
                  <input
                    type="text"
                    className={crmStyles.field}
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Dev Diwali Wishes 2026 or Special Price Update"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.86rem', fontWeight: 600 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Building2 size={15} color="var(--accent-color, #2563eb)" /> Target Branch Filter:
                  </label>
                  <select
                    className={crmStyles.field}
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.86rem', fontWeight: 700 }}
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

              {/* 4 Audience Cards */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <label style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.75rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>1</span>
                    Choose Target Audience Segment
                  </label>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Filtered for branch: <strong>{selectedBranch}</strong>
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  {AUDIENCE_TYPES.map(aud => {
                    const isSelected = selectedAudience === aud.id;
                    const count = stats[aud.countKey] || 0;
                    return (
                      <div 
                        key={aud.id}
                        onClick={() => handleSelectAudience(aud.id)}
                        style={{
                          padding: '1.1rem 1.25rem',
                          borderRadius: '10px',
                          border: isSelected ? `2px solid ${aud.color}` : '1px solid var(--border-light)',
                          backgroundColor: isSelected ? `${aud.color}0c` : 'var(--bg-surface)',
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
                          <span style={{ fontSize: '1.6rem' }}>{aud.icon}</span>
                          <span style={{ 
                            fontSize: '0.95rem', 
                            fontWeight: 800, 
                            color: isSelected ? aud.color : 'var(--text-primary)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            backgroundColor: isSelected ? `${aud.color}20` : 'var(--th-bg)',
                            border: `1px solid ${isSelected ? aud.color + '40' : 'var(--border-light)'}`
                          }}>
                            {loadingStats ? '...' : `${Number(count || 0).toLocaleString()} Available`}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {aud.label}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                          {aud.subtitle}
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: '10px', right: '10px', width: '9px', height: '9px', borderRadius: '50%', backgroundColor: aud.color }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Select Sub-Filters Chips */}
              {AUDIENCE_SUB_FILTERS[selectedAudience] && (
                <div style={{
                  padding: '1rem 1.25rem',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1.5px solid var(--border-light)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Filter size={15} color="var(--accent-color, #2563eb)" />
                      Filter Criteria (Multi-Select Enabled):
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Active Selection: <strong>{activeSubFiltersText}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {AUDIENCE_SUB_FILTERS[selectedAudience].map(f => {
                      const isActive = selectedSubFilters.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleToggleSubFilter(f.id)}
                          style={{
                            padding: '0.35rem 0.85rem',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: isActive ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                            backgroundColor: isActive ? 'var(--accent-color, #2563eb)' : 'var(--th-bg)',
                            color: isActive ? '#fff' : 'var(--text-primary)',
                            boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    💡 <em>Tip: You can select multiple stages or departments simultaneously to combine audiences. Click &apos;All&apos; to target everyone.</em>
                  </div>
                </div>
              )}

              {/* Live Preview List of Recipients for Selected Filter */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '1.15rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Eye size={16} color="var(--accent-color, #2563eb)" />
                    Targeted Recipients Live Preview:
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                    {Number(currentTargetCount || 0).toLocaleString()} Total Matching Contacts
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                        <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Recipient / Firm Name</th>
                        <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Contact Person</th>
                        <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Phone Number</th>
                        <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Branch / Company</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingPreviews ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto 0.25rem' }} />
                            <div>Loading recipient samples...</div>
                          </td>
                        </tr>
                      ) : samplePreviewRecords.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No sample records found for this combination.
                          </td>
                        </tr>
                      ) : (
                        samplePreviewRecords.map((rec, i) => (
                          <tr key={rec.id || i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {rec.name}
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                              {rec.subName || '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: '#059669' }}>
                              +91 {rec.phone}
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                              {rec.tag || selectedBranch}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Navigation Action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setWizardStage(2)}
                  disabled={currentTargetCount === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.6rem',
                    borderRadius: '8px',
                    backgroundColor: currentTargetCount === 0 ? 'var(--th-bg)' : 'var(--accent-color, #2563eb)',
                    color: currentTargetCount === 0 ? 'var(--text-secondary)' : '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    cursor: currentTargetCount === 0 ? 'not-allowed' : 'pointer',
                    boxShadow: currentTargetCount === 0 ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.35)'
                  }}
                >
                  <span>Continue to Stage 2: Template Setting</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------
              STAGE 2: TEMPLATE SETTING & LIVE PREVIEW
              ------------------------------------------------------------------- */}
          {wizardStage === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                
                {/* Left Column: Template Picker & Recipient Priority */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Template Picker */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1.25rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ display: 'inline-flex', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.75rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</span>
                        Select Approved WhatsApp Template
                      </label>
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--accent-color, #2563eb)', background: 'rgba(37, 99, 235, 0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                        {relevantTemplates.length} Available
                      </span>
                    </div>

                    {/* Template Search & Toggle */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Search templates..."
                        value={templateSearchTerm}
                        onChange={e => setTemplateSearchTerm(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.84rem' }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input 
                          type="checkbox" 
                          checked={showAllTemplates} 
                          onChange={e => setShowAllTemplates(e.target.checked)} 
                          style={{ cursor: 'pointer' }}
                        />
                        Show All ({templates?.length || 0})
                      </label>
                    </div>

                    {relevantTemplates.length === 0 ? (
                      <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.82rem', color: '#b91c1c' }}>
                        <AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                        No approved templates match &quot;{templateSearchTerm}&quot;.
                      </div>
                    ) : (
                      <div>
                        <select
                          className={crmStyles.field}
                          value={selectedTemplateId}
                          onChange={e => setSelectedTemplateId(e.target.value)}
                          style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem', fontWeight: 700 }}
                        >
                          {relevantTemplates.map(t => (
                            <option key={t.id} value={t.id}>
                              ✉️ {t.template_name} ({t.campaign_name || t.company || 'Ready'})
                            </option>
                          ))}
                        </select>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem', display: 'block' }}>
                          {showAllTemplates ? `Browsing all ${templates?.length || 0} templates.` : `Auto-filtered for ${AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}.`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Recipient Priority Options */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1.25rem'
                  }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      Delivery Phone Priority
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
                        </>
                      )}

                      {selectedAudience === 'leads' && (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'lead_business' ? '1.5px solid #10b981' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'lead_business' ? 'rgba(16, 185, 129, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.84rem' }}>
                            <input type="radio" name="priority" checked={recipientPriority === 'lead_business'} onChange={() => setRecipientPriority('lead_business')} />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🏢 Business Contact (1st Priority - Fallback to CP1)</div>
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
                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'rgba(22, 163, 74, 0.06)', border: '1.5px solid #16a34a', fontSize: '0.84rem', fontWeight: 700, color: '#16a34a' }}>
                          🚜 Customer Primary Mobile 1 (Directly to machine owner)
                        </div>
                      )}

                      {selectedAudience === 'users' && (
                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.06)', border: '1.5px solid #8b5cf6', fontSize: '0.84rem', fontWeight: 700, color: '#8b5cf6' }}>
                          🧑‍💼 Official Registered Employee Mobile Number
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Live WhatsApp Mobile Green Chat Bubble Preview */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Eye size={17} color="#25D366" /> Live WhatsApp Mobile Preview
                    </label>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'var(--th-bg)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      Sample: {sampleRecipient.name}
                    </span>
                  </div>

                  <div style={{
                    flex: 1,
                    backgroundColor: '#0b141a',
                    backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)',
                    backgroundSize: '16px 16px',
                    borderRadius: '10px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '270px'
                  }}>
                    <div style={{
                      width: '100%',
                      maxWidth: '340px',
                      backgroundColor: '#005c4b',
                      color: '#e9edef',
                      borderRadius: '8px 8px 2px 8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                      overflow: 'hidden',
                      fontSize: '0.86rem',
                      lineHeight: 1.45
                    }}>
                      {activeTemplate?.image_url && (
                        <div style={{ width: '100%', height: '140px', overflow: 'hidden', backgroundColor: '#025144' }}>
                          <img src={activeTemplate.image_url} alt="Campaign Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ padding: '0.75rem 0.85rem 0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {liveMessagePreviewText}
                      </div>
                      <div style={{ padding: '0 0.85rem 0.45rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem', fontSize: '0.68rem', color: 'rgba(233, 237, 239, 0.65)' }}>
                        <span>Just Now</span>
                        <span style={{ color: '#53bdeb' }}>✓✓</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.65rem', fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Personalized tokens like <strong>&#123;&#123;1&#125;&#125;</strong> will automatically be substituted with recipient name & details.
                  </div>
                </div>
              </div>

              {/* Navigation Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setWizardStage(1)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--th-bg)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} /> Back to Audience
                </button>

                <button
                  type="button"
                  onClick={() => setWizardStage(3)}
                  disabled={!selectedTemplateId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.6rem',
                    borderRadius: '8px',
                    backgroundColor: !selectedTemplateId ? 'var(--th-bg)' : 'var(--accent-color, #2563eb)',
                    color: !selectedTemplateId ? 'var(--text-secondary)' : '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    cursor: !selectedTemplateId ? 'not-allowed' : 'pointer',
                    boxShadow: !selectedTemplateId ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.35)'
                  }}
                >
                  <span>Continue to Stage 3: Testing & Schedule</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------
              STAGE 3: TESTING, SCHEDULE & LAUNCH
              ------------------------------------------------------------------- */}
          {wizardStage === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Test Send Card */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '1.25rem',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                    <Phone size={16} color="#059669" /> Send Single Test Message
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Verify message layout, dynamic parameters, and media on your personal phone before broadcasting.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="10-digit mobile"
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    style={{ width: '160px', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.84rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={sendingTest || !testPhone}
                    style={{
                      padding: '0.55rem 1rem',
                      backgroundColor: 'var(--th-bg)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: (sendingTest || !testPhone) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {sendingTest ? 'Sending...' : '🧪 Send Test'}
                  </button>
                </div>
              </div>

              {testResult && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: testResult.success ? '#059669' : '#dc2626', fontWeight: 700, fontSize: '0.84rem' }}>
                  {testResult.message || testResult.error}
                </div>
              )}

              {/* Schedule Send Mode & Speed Controls */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem'
              }}>
                {/* Schedule Mode */}
                <div>
                  <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    <Clock size={16} color="var(--accent-color, #2563eb)" /> Campaign Schedule (Send Time)
                  </label>

                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <label style={{
                      flex: 1,
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: sendMode === 'immediate' ? '2px solid #16a34a' : '1px solid var(--border-light)',
                      backgroundColor: sendMode === 'immediate' ? '#16a34a0a' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: sendMode === 'immediate' ? '#16a34a' : 'var(--text-primary)'
                    }}>
                      <input type="radio" name="sendMode" checked={sendMode === 'immediate'} onChange={() => setSendMode('immediate')} />
                      <span>⚡ Send Immediately (Now)</span>
                    </label>

                    <label style={{
                      flex: 1,
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: sendMode === 'scheduled' ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      backgroundColor: sendMode === 'scheduled' ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: sendMode === 'scheduled' ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)'
                    }}>
                      <input type="radio" name="sendMode" checked={sendMode === 'scheduled'} onChange={() => setSendMode('scheduled')} />
                      <span>📅 Schedule for Later</span>
                    </label>
                  </div>

                  {sendMode === 'scheduled' && (
                    <div style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Choose Send Date & Time (Indian Standard Time - IST):
                      </div>
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={e => setScheduledAt(e.target.value)}
                        className={crmStyles.field}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.84rem' }}
                      />
                    </div>
                  )}
                </div>

                {/* Anti-Ban Speed & Protection Limits */}
                <div>
                  <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                    <Gauge size={16} color="var(--accent-color, #2563eb)" /> Anti-Ban Throttle Speed
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    {[
                      { id: 'safe', label: '🛡️ Safe Pace', speed: '~40 msgs/min', desc: 'Recommended' },
                      { id: 'standard', label: '⚡ Standard', speed: '~75 msgs/min', desc: 'Warm WABA' },
                      { id: 'fast', label: '🚀 High Speed', speed: '~150 msgs/min', desc: 'Tier 2/3' }
                    ].map(t => {
                      const isSelected = throttleSpeed === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setThrottleSpeed(t.id)}
                          style={{
                            padding: '0.65rem 0.5rem',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                            backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                            {t.label}
                          </div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isSelected ? '#1d4ed8' : 'var(--text-secondary)', marginTop: '0.15rem' }}>
                            {t.speed}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            {t.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Anti-Spam Frequency Cap & Failure Auto-Retry Details */}
                  <div style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    fontSize: '0.74rem'
                  }}>
                    <div style={{ fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <ShieldCheck size={14} color="#059669" /> Anti-Spam & Delivery Safeguards:
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      • <strong>Daily Contact Limit:</strong> Maximum <strong>3 messages / day / contact</strong> (enforced in IST to prevent spam blocks).
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      • <strong>Failure Auto-Retry:</strong> In case of network/provider drops, system automatically retries failed messages <strong>up to 3 times across 3 days</strong>.
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Review Box */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1.5px solid var(--accent-color, #2563eb)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.08)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Campaign Summary & Launch Review
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Ready to broadcast to <strong>{Number(currentTargetCount || 0).toLocaleString()} recipients</strong> in <strong>{selectedBranch}</strong>.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)}
                    style={{
                      padding: '0.75rem 1.8rem',
                      background: sendMode === 'scheduled' 
                        ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' 
                        : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.98rem',
                      fontWeight: 800,
                      cursor: (launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: sendMode === 'scheduled' ? '0 4px 15px rgba(37, 99, 235, 0.35)' : '0 4px 15px rgba(22, 163, 74, 0.35)',
                      opacity: (launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)) ? 0.6 : 1
                    }}
                  >
                    {sendMode === 'scheduled' ? <Calendar size={18} /> : <Send size={18} />}
                    {launching 
                      ? (sendMode === 'scheduled' ? 'Scheduling...' : 'Broadcasting...') 
                      : (sendMode === 'scheduled'
                          ? `Schedule Broadcast (${Number(currentTargetCount || 0).toLocaleString()} Recipients)`
                          : `Launch Broadcast to ${Number(currentTargetCount || 0).toLocaleString()} Recipients`)}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.82rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)' }}>
                  <div><strong>Campaign:</strong> {campaignName || 'Standard Broadcast'}</div>
                  <div><strong>Target Audience:</strong> {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}</div>
                  <div><strong>Sub-Filter:</strong> {activeSubFiltersText}</div>
                  <div><strong>Template:</strong> {activeTemplate?.template_name}</div>
                  <div><strong>Delivery Mode:</strong> {sendMode === 'scheduled' ? `📅 Scheduled: ${scheduledAt}` : '⚡ Send Immediately'}</div>
                  <div><strong>Daily Cap:</strong> Max 3 msgs/contact/day</div>
                </div>
              </div>

              {/* Progress & Result Banners */}
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
                      {campaignResult.success ? (campaignResult.isScheduled ? '📅 Campaign Scheduled Successfully!' : '✅ Broadcast Completed Successfully!') : '❌ Broadcast Failed'}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                      {campaignResult.message || campaignResult.error}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    style={{
                      padding: '0.55rem 1.15rem',
                      backgroundColor: 'var(--accent-color, #2563eb)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    View in Campaigns Table
                  </button>
                </div>
              )}

              {/* Navigation Back */}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  onClick={() => setWizardStage(2)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--th-bg)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} /> Back to Template Setting
                </button>
              </div>
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
                      Confirm WhatsApp {sendMode === 'scheduled' ? 'Scheduled Broadcast' : 'Broadcast Campaign'}
                    </h3>
                  </div>
                  <button type="button" onClick={() => setShowConfirmModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  Are you sure you want to {sendMode === 'scheduled' ? 'schedule' : 'broadcast'} this WhatsApp campaign to <strong>{Number(currentTargetCount || 0).toLocaleString()} {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}</strong> in <strong>{selectedBranch}</strong>?
                </div>

                <div style={{ padding: '0.75rem', background: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div><strong>Campaign Name:</strong> {campaignName || 'Standard Broadcast'}</div>
                  <div><strong>Template:</strong> {activeTemplate?.template_name}</div>
                  <div><strong>Audience:</strong> {AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label} ({activeSubFiltersText})</div>
                  <div><strong>Branch Filter:</strong> {selectedBranch}</div>
                  <div><strong>Delivery Mode:</strong> {sendMode === 'scheduled' ? `📅 Scheduled for ${scheduledAt} IST` : '⚡ Send Immediately (Now)'}</div>
                  <div><strong>Anti-Spam Safeguards:</strong> Max 3 msgs/contact/day • Auto-retry 3 attempts/3 days</div>
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
                    style={{
                      padding: '0.55rem 1.4rem',
                      backgroundColor: sendMode === 'scheduled' ? '#2563eb' : '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.85rem'
                    }}
                  >
                    {sendMode === 'scheduled' ? 'Yes, Schedule Campaign' : 'Yes, Launch Campaign Now'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
