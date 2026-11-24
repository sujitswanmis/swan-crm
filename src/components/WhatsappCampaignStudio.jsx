'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Send, Users, Building2, CheckCircle2, AlertCircle, PlayCircle, Eye, RefreshCw, 
  Sparkles, Check, ChevronRight, ChevronLeft, ShieldCheck, Phone, Zap, ArrowRight, ArrowLeft, X, ExternalLink,
  Megaphone, Filter, Clock, Calendar, Gauge, Plus, Search, RotateCcw, UserCheck, UserX, Info, Save, FileText,
  Trash2, ChevronDown
} from 'lucide-react';
import { crmStyles } from '@/components/common/CRMDesignSystem';
import { 
  getCampaignAudienceStats, 
  getCampaignAudiencePreview, 
  launchWhatsappBroadcastCampaign,
  saveWhatsappCampaignDraft,
  getBroadcastCampaignsList,
  getSyncedDepartmentsList
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

const AUDIENCE_FILTER_FIELDS = {
  leads: [
    {
      id: 'status',
      label: 'Pipeline Stage / Status',
      options: [
        '01 - New Stage',
        '02 - Contact Stage',
        '03 - Qualification Stage',
        '04 - Follow Up Stage',
        '05 - Sales Process Stage',
        '06 - Conversion Stage',
        '07 - Final Stage',
        '08 - Transfer to Party'
      ]
    },
    {
      id: 'state',
      label: 'Lead State',
      options: [
        'Uttar Pradesh',
        'Madhya Pradesh',
        'Bihar',
        'Punjab',
        'Haryana',
        'Maharashtra',
        'Rajasthan',
        'Gujarat',
        'Delhi',
        'Odisha',
        'West Bengal',
        'Uttarakhand'
      ]
    },
    {
      id: 'priority',
      label: 'Lead Priority',
      options: [
        'High / Hot',
        'Medium / Warm',
        'Normal / Low'
      ]
    }
  ],
  party: [
    {
      id: 'state',
      label: 'State',
      options: [
        'Uttar Pradesh',
        'Madhya Pradesh',
        'Bihar',
        'Punjab',
        'Haryana',
        'Maharashtra',
        'Rajasthan',
        'Gujarat',
        'Delhi',
        'Odisha',
        'West Bengal',
        'Uttarakhand'
      ]
    },
    {
      id: 'nature',
      label: 'Partner Nature / Type',
      options: [
        'Exclusive Swan',
        'Dealer',
        'Distributor',
        'Direct Partner'
      ]
    },
    {
      id: 'status',
      label: 'Activation Status',
      options: [
        'Active',
        'Hold / Payment Hold',
        'Draft'
      ]
    }
  ],
  users: [
    {
      id: 'department',
      label: 'Department',
      options: [
        'Accounts & Finance',
        'Administration',
        'Audit',
        'Corporate Strategy and Planning',
        'Customer Support',
        'Director',
        'Dispatch',
        'Electrical & Maintenance',
        'General',
        'Human Resource',
        'Human Resource & Administration',
        'Information Technology',
        'Logistics',
        'Manufacturing Engineering',
        'Marketing',
        'Operations',
        'Production',
        'Production Planning and Control',
        'Purchase',
        'Quality Assurance',
        'Research & Development',
        'Sales',
        'Sales & Marketing',
        'Security',
        'Service',
        'Store',
        'Testing',
        'Tool Room',
        'Training and Development',
        'Transport',
        'Vendor Development'
      ]
    },
    {
      id: 'status',
      label: 'Employment Status',
      options: [
        'Active Staff',
        'Inactive / Resigned Staff'
      ]
    },
    {
      id: 'role',
      label: 'Role / Designation',
      options: [
        'Admin',
        'Manager',
        'Executive'
      ]
    }
  ],
  end_customers: [
    {
      id: 'state',
      label: 'State',
      options: [
        'Uttar Pradesh',
        'Punjab',
        'Haryana',
        'Madhya Pradesh'
      ]
    }
  ]
};

export default function WhatsappCampaignStudio({ 
  tenantId = null, 
  tenantBranches = [], 
  templates = [],
  onNavigateToLogs = null 
}) {
  // Modal Pop-up state for Campaign Creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [wizardStage, setWizardStage] = useState(1); // 1: Audience & Filter, 2: Template Setting, 3: Review & Schedule

  // Campaigns History List (Main Table View)
  const [campaignsList, setCampaignsList] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignSearchTerm, setCampaignSearchTerm] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ALL');

  // Wizard Form State
  const [campaignName, setCampaignName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [selectedAudience, setSelectedAudience] = useState('leads');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientPriority, setRecipientPriority] = useState('lead_business');
  const [showAllTemplates, setShowAllTemplates] = useState(true);
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');

  // Dynamic Filter Builder Rules State
  const [filterRules, setFilterRules] = useState([
    { id: 'rule_1', field: 'status', condition: 'IN', values: ['05 - Sales Process Stage'] }
  ]);
  const [activeDropdownRuleId, setActiveDropdownRuleId] = useState(null);
  const [ruleSearchTerms, setRuleSearchTerms] = useState({});
  const [syncedDepartments, setSyncedDepartments] = useState([]);

  // Fetch departments synced with Settings ➔ Manage Departments on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDepts() {
      try {
        const list = await getSyncedDepartmentsList();
        if (isMounted && list && list.length > 0) {
          setSyncedDepartments(list);
        }
      } catch (err) {
        console.error('Failed to load synced departments:', err);
      }
    }
    loadDepts();
    return () => { isMounted = false; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeDropdownRuleId && !e.target.closest('[data-filter-popover="true"]')) {
        setActiveDropdownRuleId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeDropdownRuleId]);

  // Scheduling & Throttle state
  const [sendMode, setSendMode] = useState('immediate'); // 'immediate' | 'scheduled'
  const [scheduledAt, setScheduledAt] = useState('');
  const [throttleSpeed, setThrottleSpeed] = useState('safe'); // 'safe' | 'standard' | 'fast'

  // Stats & Previews
  const [stats, setStats] = useState({ partyCount: 0, leadCount: 0, customerCount: 0, userCount: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [samplePreviewRecords, setSamplePreviewRecords] = useState([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Preview Table Pagination inside Modal
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25); // 10, 25, 50, 'All'

  // Test send state
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Draft save state
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState(null);

  // Broadcast execution state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(null);
  const [campaignResult, setCampaignResult] = useState(null);

  // Pagination for Campaigns Main Table
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

  // 2. Reset rules when audience changes
  const handleSelectAudience = (audId) => {
    setSelectedAudience(audId);
    const fields = AUDIENCE_FILTER_FIELDS[audId] || [];
    const defaultField = fields[0]?.id || 'status';
    setFilterRules([
      { id: `rule_${Date.now()}`, field: defaultField, condition: 'IN', values: [] }
    ]);
    setActiveDropdownRuleId(null);
    setPreviewPage(1);
  };

  // 3. Dynamic Rule Handlers
  const handleAddRule = () => {
    const fields = AUDIENCE_FILTER_FIELDS[selectedAudience] || [];
    const defaultField = fields[0]?.id || 'status';
    setFilterRules(prev => [
      ...prev,
      { id: `rule_${Date.now()}_${Math.random()}`, field: defaultField, condition: 'IN', values: [] }
    ]);
  };

  const handleRemoveRule = (ruleId) => {
    setFilterRules(prev => {
      if (prev.length <= 1) {
        const fields = AUDIENCE_FILTER_FIELDS[selectedAudience] || [];
        return [{ id: `rule_${Date.now()}`, field: fields[0]?.id || 'status', condition: 'IN', values: [] }];
      }
      return prev.filter(r => r.id !== ruleId);
    });
    if (activeDropdownRuleId === ruleId) setActiveDropdownRuleId(null);
  };

  const handleRuleChange = (ruleId, key, val) => {
    setFilterRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r;
      if (key === 'field') {
        return { ...r, field: val, values: [] };
      }
      return { ...r, [key]: val };
    }));
  };

  const handleToggleRuleValue = (ruleId, optionVal) => {
    setFilterRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r;
      const exists = r.values.includes(optionVal);
      const newValues = exists 
        ? r.values.filter(v => v !== optionVal)
        : [...r.values, optionVal];
      return { ...r, values: newValues };
    }));
  };

  const handleSelectAllRuleValues = (ruleId, allOptions) => {
    setFilterRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r;
      return { ...r, values: [...allOptions] };
    }));
  };

  const handleClearRuleValues = (ruleId) => {
    setFilterRules(prev => prev.map(r => {
      if (r.id !== ruleId) return r;
      return { ...r, values: [] };
    }));
  };

  // 4. Fetch Audience Stats whenever Branch, Audience or Filter Rules change
  useEffect(() => {
    let isMounted = true;
    async function loadStats() {
      setLoadingStats(true);
      try {
        const res = await getCampaignAudienceStats({ 
          tenantId, 
          branchFilter: selectedBranch,
          audienceType: selectedAudience,
          subFilter: filterRules
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
  }, [tenantId, selectedBranch, selectedAudience, filterRules]);

  // 5. Fetch Sample Records for Preview (Uncapped to display up to 200 matching leads)
  useEffect(() => {
    let isMounted = true;
    async function loadPreview() {
      setLoadingPreviews(true);
      try {
        const rows = await getCampaignAudiencePreview({ 
          tenantId, 
          audienceType: selectedAudience, 
          branchFilter: selectedBranch,
          subFilter: filterRules,
          limit: 200
        });
        if (isMounted) {
          setSamplePreviewRecords(rows || []);
          setPreviewPage(1);
        }
      } catch (err) {
        console.error('Failed to load sample preview:', err);
      } finally {
        if (isMounted) setLoadingPreviews(false);
      }
    }
    loadPreview();
    return () => { isMounted = false; };
  }, [tenantId, selectedAudience, selectedBranch, filterRules]);

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

  // Save as Draft Handler
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setDraftNotice(null);
    try {
      const res = await saveWhatsappCampaignDraft({
        tenantId,
        campaignName: campaignName.trim() || `Draft ${new Date().toLocaleDateString('en-IN')}`,
        audienceType: selectedAudience,
        branchFilter: selectedBranch,
        subFilter: filterRules,
        templateId: selectedTemplateId || null,
        recipientPriority,
        sendMode,
        scheduledAt,
        throttleSpeed
      });
      if (res.success) {
        setDraftNotice(`✅ ${res.message}`);
        await refreshCampaigns();
        setTimeout(() => {
          setIsCreateModalOpen(false);
          setDraftNotice(null);
        }, 1200);
      } else {
        setDraftNotice(`❌ ${res.error}`);
      }
    } catch (err) {
      setDraftNotice(`❌ ${err.message || 'Failed to save draft'}`);
    } finally {
      setSavingDraft(false);
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
        subFilter: filterRules,
        templateId: selectedTemplateId,
        recipientPriority,
        sendMode,
        scheduledAt,
        throttleSpeed
      });
      setCampaignResult(res);
      await refreshCampaigns();
      setTimeout(() => {
        setIsCreateModalOpen(false);
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

  // Active dynamic filter rules display label
  const activeSubFiltersText = useMemo(() => {
    const activeWithValues = filterRules.filter(r => r.values && r.values.length > 0);
    if (activeWithValues.length === 0) {
      return 'All Records (Entire Segment)';
    }
    const currentFields = AUDIENCE_FILTER_FIELDS[selectedAudience] || [];
    return activeWithValues.map(r => {
      const fObj = currentFields.find(f => f.id === r.field);
      const label = fObj ? fObj.label : r.field;
      return `${label} ${r.condition} [${r.values.join(', ')}]`;
    }).join(' • ');
  }, [filterRules, selectedAudience]);

  // Paginated Preview Records in Stage 1 Modal
  const paginatedPreviewRecords = useMemo(() => {
    if (!samplePreviewRecords) return [];
    if (previewPageSize === 'All') return samplePreviewRecords;
    const size = Number(previewPageSize) || 25;
    const start = (previewPage - 1) * size;
    return samplePreviewRecords.slice(start, start + size);
  }, [samplePreviewRecords, previewPage, previewPageSize]);

  const totalPreviewPages = useMemo(() => {
    if (previewPageSize === 'All' || !samplePreviewRecords.length) return 1;
    return Math.ceil(samplePreviewRecords.length / Number(previewPageSize)) || 1;
  }, [samplePreviewRecords, previewPageSize]);

  // Open Create Modal
  const handleOpenCreateModal = (existingDraft = null) => {
    if (existingDraft) {
      setCampaignName(existingDraft.campaignName || '');
      setSelectedAudience(existingDraft.audienceType || 'leads');
      setSelectedBranch(existingDraft.branchFilter || 'All');
      if (Array.isArray(existingDraft.subFilters) && existingDraft.subFilters.length > 0 && typeof existingDraft.subFilters[0] === 'object' && existingDraft.subFilters[0].field) {
        setFilterRules(existingDraft.subFilters);
      } else {
        const fields = AUDIENCE_FILTER_FIELDS[existingDraft.audienceType || 'leads'] || [];
        setFilterRules([{ id: `rule_${Date.now()}`, field: fields[0]?.id || 'status', condition: 'IN', values: [] }]);
      }
      setSelectedTemplateId(existingDraft.templateId || '');
      setSendMode(existingDraft.sendMode || 'immediate');
      setScheduledAt(existingDraft.scheduledAt || '');
      setThrottleSpeed(existingDraft.throttleSpeed || 'safe');
    } else {
      setCampaignName('');
      setSelectedAudience('leads');
      setFilterRules([
        { id: `rule_${Date.now()}`, field: 'status', condition: 'IN', values: ['05 - Sales Process Stage'] }
      ]);
      setWizardStage(1);
    }
    setActiveDropdownRuleId(null);
    setDraftNotice(null);
    setCampaignResult(null);
    setIsCreateModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* =========================================================================
          MAIN VIEW: BROADCAST CAMPAIGNS DASHBOARD & TABLE (ALWAYS VISIBLE)
          ========================================================================= */}
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
              Track past, active and scheduled broadcasts to Party Master, Leads, End Customers, or Employees with automated anti-ban throttling.
            </p>
          </div>

          {/* Action Bar: Refresh & + Add Campaign Pop-up Trigger */}
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
              onClick={() => handleOpenCreateModal()}
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
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Anti-Spam Daily Cap</div>
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
              <option value="Draft">📝 Draft</option>
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
                        Click &quot;Add Campaign&quot; to open the wizard and launch or draft festival greetings, price lists, or announcements.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenCreateModal()}
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
                    const isDraft = camp.status === 'Draft';

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
                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateModal(camp)}
                              style={{
                                marginTop: '0.25rem',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                backgroundColor: 'var(--th-bg)',
                                border: '1px solid var(--border-light)',
                                color: 'var(--accent-color, #2563eb)',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              ✏️ Edit / Launch Draft
                            </button>
                          )}
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
                          ) : isDraft ? (
                            <span style={{ color: '#d97706', fontWeight: 600 }}>Saved in Drafts</span>
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
                            backgroundColor: camp.status === 'Completed' ? 'rgba(16, 185, 129, 0.1)' : camp.status === 'Scheduled' ? 'rgba(37, 99, 235, 0.1)' : camp.status === 'Draft' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: camp.status === 'Completed' ? '#059669' : camp.status === 'Scheduled' ? '#2563eb' : camp.status === 'Draft' ? '#d97706' : '#dc2626',
                            border: `1px solid ${camp.status === 'Completed' ? '#10b98140' : camp.status === 'Scheduled' ? '#3b82f640' : camp.status === 'Draft' ? '#f59e0b40' : '#ef444440'}`
                          }}>
                            {camp.status === 'Completed' ? '🟢 Completed' : camp.status === 'Scheduled' ? '📅 Scheduled' : camp.status === 'Draft' ? '📝 Draft' : '❌ Failed'}
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

      {/* =========================================================================
          MODAL POP-UP: 3-STAGE MULTI-BRANCH CAMPAIGN CREATION WIZARD & DRAFT
          ========================================================================= */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(4px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem'
        }} onClick={() => setIsCreateModalOpen(false)}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '1080px',
            maxHeight: '92vh',
            border: '1px solid var(--border-light)',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header: Title, Stage Pills, Save Draft & Close */}
            <div style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--th-bg)',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1.4rem' }}>📢</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Create WhatsApp Broadcast Campaign
                  </h3>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Multi-Branch Audience Filtering & Anti-Spam Dispatch
                  </div>
                </div>
              </div>

              {/* Wizard Stage Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { stage: 1, label: 'Stage 1: Audience & Filter' },
                  { stage: 2, label: 'Stage 2: Template Setting' },
                  { stage: 3, label: 'Stage 3: Review & Schedule' }
                ].map(s => {
                  const isActive = wizardStage === s.stage;
                  const isPassed = wizardStage > s.stage;
                  return (
                    <button
                      key={s.stage}
                      type="button"
                      onClick={() => {
                        if (s.stage < wizardStage || (s.stage === 2 && currentTargetCount > 0)) {
                          setWizardStage(s.stage);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: isActive ? 800 : 600,
                        backgroundColor: isActive ? 'var(--accent-color, #2563eb)' : isPassed ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface)',
                        color: isActive ? '#ffffff' : isPassed ? '#059669' : 'var(--text-secondary)',
                        border: isActive ? '1px solid var(--accent-color, #2563eb)' : isPassed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-light)',
                        cursor: 'pointer'
                      }}
                    >
                      <span>{isPassed ? '✓' : s.stage}.</span>
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Actions: Save Draft & Close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#d97706',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: savingDraft ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Save size={14} />
                  <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Draft Notice if any */}
            {draftNotice && (
              <div style={{ padding: '0.65rem 1.25rem', backgroundColor: draftNotice.includes('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: draftNotice.includes('✅') ? '#059669' : '#dc2626', fontSize: '0.82rem', fontWeight: 700 }}>
                {draftNotice}
              </div>
            )}

            {/* Modal Body: Scrollable Wizard Stages */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* -------------------------------------------------------------
                  STAGE 1: TARGET AUDIENCE & SMART MULTI-FILTERING
                  ------------------------------------------------------------- */}
              {wizardStage === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Campaign Header: Name & Target Branch */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1.15rem 1.25rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.25rem'
                  }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                        <Megaphone size={15} color="var(--accent-color, #2563eb)" /> Campaign Name (Tracker):
                      </label>
                      <input
                        type="text"
                        className={crmStyles.field}
                        value={campaignName}
                        onChange={e => setCampaignName(e.target.value)}
                        placeholder="e.g. Dev Diwali Wishes 2026 or Special Price Update"
                        style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.86rem', fontWeight: 600 }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                        <Building2 size={15} color="var(--accent-color, #2563eb)" /> Target Branch Filter:
                      </label>
                      <select
                        className={crmStyles.field}
                        value={selectedBranch}
                        onChange={e => setSelectedBranch(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.86rem', fontWeight: 700 }}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ display: 'inline-flex', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.72rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>1</span>
                        Choose Target Audience Segment
                      </label>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        Filtered for branch: <strong>{selectedBranch}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                      {AUDIENCE_TYPES.map(aud => {
                        const isSelected = selectedAudience === aud.id;
                        const count = stats[aud.countKey] || 0;
                        return (
                          <div 
                            key={aud.id}
                            onClick={() => handleSelectAudience(aud.id)}
                            style={{
                              padding: '1rem 1.15rem',
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
                              <span style={{ fontSize: '1.5rem' }}>{aud.icon}</span>
                              <span style={{ 
                                fontSize: '0.9rem', 
                                fontWeight: 800, 
                                color: isSelected ? aud.color : 'var(--text-primary)',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                backgroundColor: isSelected ? `${aud.color}20` : 'var(--th-bg)',
                                border: `1px solid ${isSelected ? aud.color + '40' : 'var(--border-light)'}`
                              }}>
                                {loadingStats ? '...' : `${Number(count || 0).toLocaleString()} Available`}
                              </span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
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

                  {/* Dynamic Filter Builder Row-by-Row Interface */}
                  <div style={{
                    padding: '1.1rem 1.25rem',
                    borderRadius: '10px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1.5px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Filter size={15} color="var(--accent-color, #2563eb)" />
                          Dynamic Filter Builder:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const fields = AUDIENCE_FILTER_FIELDS[selectedAudience] || [];
                            setFilterRules([{ id: `rule_${Date.now()}`, field: fields[0]?.id || 'status', condition: 'IN', values: [] }]);
                            setActiveDropdownRuleId(null);
                          }}
                          style={{
                            padding: '0.2rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: '1px solid var(--border-light)',
                            backgroundColor: 'var(--th-bg)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Clear All Filters
                        </button>
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Active: <strong style={{ color: 'var(--accent-color, #2563eb)' }}>{activeSubFiltersText}</strong>
                      </span>
                    </div>

                    {/* Filter Table Header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 140px 1fr 40px',
                      gap: '0.75rem',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      padding: '0 0.25rem'
                    }}>
                      <div>Filter</div>
                      <div>Condition*</div>
                      <div>Values*</div>
                      <div></div>
                    </div>

                    {/* Rules Rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {filterRules.map((rule) => {
                        const currentFields = AUDIENCE_FILTER_FIELDS[selectedAudience] || [];
                        const currentFieldObj = currentFields.find(f => f.id === rule.field) || currentFields[0];
                        const availableOptions = (rule.field === 'department' && syncedDepartments.length > 0)
                          ? syncedDepartments
                          : (currentFieldObj?.options || []);
                        const isDropdownOpen = activeDropdownRuleId === rule.id;
                        const searchTerm = (ruleSearchTerms[rule.id] || '').toLowerCase();
                        const filteredOptions = availableOptions.filter(opt => opt.toLowerCase().includes(searchTerm));
                        const hasNoValues = !rule.values || rule.values.length === 0;

                        return (
                          <div key={rule.id} style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 140px 1fr 40px',
                            gap: '0.75rem',
                            alignItems: 'start'
                          }}>
                            {/* 1. Filter Field Dropdown */}
                            <div>
                              <select
                                value={rule.field}
                                onChange={(e) => handleRuleChange(rule.id, 'field', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '0.55rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-light)',
                                  backgroundColor: 'var(--bg-surface)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                {currentFields.map(f => (
                                  <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* 2. Condition Dropdown */}
                            <div>
                              <select
                                value={rule.condition}
                                onChange={(e) => handleRuleChange(rule.id, 'condition', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '0.55rem 0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-light)',
                                  backgroundColor: 'var(--bg-surface)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="IN">IN</option>
                                <option value="NOT IN">NOT IN</option>
                                <option value="EQUALS">EQUALS</option>
                              </select>
                            </div>

                            {/* 3. Values Multi-Select Chip Input with Popover */}
                            <div data-filter-popover="true" style={{ position: 'relative' }}>
                              <div
                                onClick={() => setActiveDropdownRuleId(isDropdownOpen ? null : rule.id)}
                                style={{
                                  minHeight: '38px',
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: '6px',
                                  border: hasNoValues ? '1px solid #ef4444' : '1px solid var(--border-light)',
                                  backgroundColor: 'var(--bg-surface)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '0.35rem',
                                  cursor: 'pointer',
                                  boxShadow: isDropdownOpen ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem', flex: 1 }}>
                                  {hasNoValues ? (
                                    <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem' }}>Please Select</span>
                                  ) : (
                                    rule.values.map(val => (
                                      <span
                                        key={val}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.3rem',
                                          padding: '0.2rem 0.55rem',
                                          borderRadius: '4px',
                                          backgroundColor: 'var(--th-bg)',
                                          border: '1px solid var(--border-light)',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          color: 'var(--text-primary)'
                                        }}
                                      >
                                        {val}
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleRuleValue(rule.id, val);
                                          }}
                                          style={{
                                            cursor: 'pointer',
                                            fontWeight: 800,
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.75rem',
                                            lineHeight: 1
                                          }}
                                        >
                                          ✕
                                        </span>
                                      </span>
                                    ))
                                  )}
                                </div>
                                <ChevronDown size={15} color="var(--text-secondary)" />
                              </div>

                              {/* Validation Message matching screenshot */}
                              {hasNoValues && (
                                <div style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '0.25rem', fontWeight: 500 }}>
                                  Values is required.
                                </div>
                              )}

                              {/* Options Dropdown Popover */}
                              {isDropdownOpen && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 0,
                                  right: 0,
                                  marginTop: '4px',
                                  backgroundColor: 'var(--bg-surface)',
                                  border: '1px solid var(--border-light)',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                  zIndex: 1000,
                                  padding: '0.65rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem',
                                  maxHeight: '260px'
                                }}>
                                  {/* Search & Bulk Select Actions */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      padding: '0.25rem 0.5rem',
                                      border: '1px solid var(--border-light)',
                                      borderRadius: '4px',
                                      flex: 1
                                    }}>
                                      <Search size={13} color="var(--text-secondary)" />
                                      <input
                                        type="text"
                                        placeholder={`Search ${currentFieldObj?.label}...`}
                                        value={ruleSearchTerms[rule.id] || ''}
                                        onChange={(e) => setRuleSearchTerms(prev => ({ ...prev, [rule.id]: e.target.value }))}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.76rem', color: 'var(--text-primary)' }}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectAllRuleValues(rule.id, availableOptions);
                                      }}
                                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', color: 'var(--text-primary)' }}
                                    >
                                      All
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleClearRuleValues(rule.id);
                                      }}
                                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', color: 'var(--text-primary)' }}
                                    >
                                      Clear
                                    </button>
                                  </div>

                                  {/* Option Checkbox List */}
                                  <div style={{ overflowY: 'auto', maxHeight: '180px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {filteredOptions.length === 0 ? (
                                      <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>No options match</div>
                                    ) : (
                                      filteredOptions.map(opt => {
                                        const isChecked = rule.values.includes(opt);
                                        return (
                                          <div
                                            key={opt}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleRuleValue(rule.id, opt);
                                            }}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.5rem',
                                              padding: '0.3rem 0.5rem',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              backgroundColor: isChecked ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                                              fontSize: '0.78rem',
                                              fontWeight: isChecked ? 700 : 500,
                                              color: isChecked ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)',
                                              transition: 'background-color 0.1s ease'
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={() => {}}
                                              style={{ cursor: 'pointer', accentColor: 'var(--accent-color, #2563eb)' }}
                                            />
                                            <span>{opt}</span>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 4. Delete Row (Trash Can Icon) */}
                            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.45rem' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveRule(rule.id)}
                                title="Remove Filter"
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  padding: '0.2rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '4px'
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Action: + Add More Button styled like Screenshot */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={handleAddRule}
                        style={{
                          padding: '0.45rem 1.15rem',
                          borderRadius: '6px',
                          border: '1.5px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Plus size={14} />
                        Add More
                      </button>
                    </div>
                  </div>

                  {/* Live Recipients Preview Table (Uncapped & Fully Scrollable/Paginated) */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Eye size={15} color="var(--accent-color, #2563eb)" />
                        Targeted Recipients Full Preview:
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Rows per page selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                          <span>Show:</span>
                          <select
                            value={previewPageSize}
                            onChange={e => {
                              const val = e.target.value === 'All' ? 'All' : Number(e.target.value);
                              setPreviewPageSize(val);
                              setPreviewPage(1);
                            }}
                            style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.76rem', fontWeight: 700 }}
                          >
                            <option value={10}>10 records</option>
                            <option value={25}>25 records</option>
                            <option value={50}>50 records</option>
                            <option value="All">All ({samplePreviewRecords.length} records)</option>
                          </select>
                        </div>

                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                          {Number(currentTargetCount || 0).toLocaleString()} Matching Contacts
                        </span>
                      </div>
                    </div>

                    {/* Scrollable Table with Sticky Header */}
                    <div style={{ overflowX: 'auto', maxHeight: '250px', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                            <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>#</th>
                            <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Recipient / Firm Name</th>
                            <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Contact Person</th>
                            <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Phone Number</th>
                            <th style={{ padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Branch / Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingPreviews ? (
                            <tr>
                              <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto 0.25rem' }} />
                                <div>Loading recipient records...</div>
                              </td>
                            </tr>
                          ) : paginatedPreviewRecords.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No matching records found for this combination.
                              </td>
                            </tr>
                          ) : (
                            paginatedPreviewRecords.map((rec, i) => {
                              const globalIdx = previewPageSize === 'All' ? i + 1 : ((previewPage - 1) * Number(previewPageSize)) + i + 1;
                              return (
                                <tr key={rec.id || i} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--th-bg)' }}>
                                  <td style={{ padding: '0.5rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {globalIdx}
                                  </td>
                                  <td style={{ padding: '0.5rem 0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {rec.name}
                                  </td>
                                  <td style={{ padding: '0.5rem 0.85rem', color: 'var(--text-secondary)' }}>
                                    {rec.subName || '-'}
                                  </td>
                                  <td style={{ padding: '0.5rem 0.85rem', fontWeight: 600, color: '#059669' }}>
                                    +91 {rec.phone}
                                  </td>
                                  <td style={{ padding: '0.5rem 0.85rem', color: 'var(--text-secondary)' }}>
                                    {rec.tag || selectedBranch}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Preview Table Pagination Footer */}
                    {previewPageSize !== 'All' && samplePreviewRecords.length > previewPageSize && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-secondary)', paddingTop: '0.25rem' }}>
                        <span>
                          Showing <strong>{((previewPage - 1) * previewPageSize) + 1}</strong> to <strong>{Math.min(previewPage * previewPageSize, samplePreviewRecords.length)}</strong> of <strong>{samplePreviewRecords.length}</strong> preview contacts
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                            disabled={previewPage === 1}
                            style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', cursor: previewPage === 1 ? 'not-allowed' : 'pointer' }}
                          >
                            Prev
                          </button>
                          <span style={{ padding: '0.2rem 0.4rem', fontWeight: 700 }}>
                            Page {previewPage} of {totalPreviewPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                            disabled={previewPage === totalPreviewPages}
                            style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', cursor: previewPage === totalPreviewPages ? 'not-allowed' : 'pointer' }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
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

              {/* -------------------------------------------------------------
                  STAGE 2: TEMPLATE SETTING & LIVE PREVIEW
                  ------------------------------------------------------------- */}
              {wizardStage === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                    
                    {/* Left Column: Template Selection & Priority */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      
                      <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '10px',
                        padding: '1.15rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ display: 'inline-flex', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--accent-color, #2563eb)', color: '#fff', fontSize: '0.72rem', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</span>
                            Select Approved WhatsApp Template
                          </label>
                          <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--accent-color, #2563eb)', background: 'rgba(37, 99, 235, 0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                            {relevantTemplates.length} Available
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Search templates..."
                            value={templateSearchTerm}
                            onChange={e => setTemplateSearchTerm(e.target.value)}
                            style={{ flex: 1, padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}
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
                          <div style={{ padding: '0.85rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.82rem', color: '#b91c1c' }}>
                            <AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                            No approved templates match &quot;{templateSearchTerm}&quot;.
                          </div>
                        ) : (
                          <div>
                            <select
                              className={crmStyles.field}
                              value={selectedTemplateId}
                              onChange={e => setSelectedTemplateId(e.target.value)}
                              style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.86rem', fontWeight: 700 }}
                            >
                              {relevantTemplates.map(t => (
                                <option key={t.id} value={t.id}>
                                  ✉️ {t.template_name} ({t.campaign_name || t.company || 'Ready'})
                                </option>
                              ))}
                            </select>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'block' }}>
                              {showAllTemplates ? `Browsing all ${templates?.length || 0} templates.` : `Auto-filtered for ${AUDIENCE_TYPES.find(a => a.id === selectedAudience)?.label}.`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Recipient Priority */}
                      <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '10px',
                        padding: '1.15rem'
                      }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                          Delivery Phone Priority
                        </label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                          {selectedAudience === 'party' && (
                            <>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'party_business' ? '1.5px solid #0284c7' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'party_business' ? 'rgba(2, 132, 199, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
                                <input type="radio" name="priority" checked={recipientPriority === 'party_business'} onChange={() => setRecipientPriority('party_business')} />
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🏢 Official Business Mobile (1st Priority)</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Firm phone number (Auto-fallback to CP1 if blank)</div>
                                </div>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'party_cp1' ? '1.5px solid #0284c7' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'party_cp1' ? 'rgba(2, 132, 199, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
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
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'lead_business' ? '1.5px solid #10b981' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'lead_business' ? 'rgba(16, 185, 129, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
                                <input type="radio" name="priority" checked={recipientPriority === 'lead_business'} onChange={() => setRecipientPriority('lead_business')} />
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🏢 Business Contact (1st Priority - Fallback to CP1)</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Sends to Business Contact 1 or CP1 Phone</div>
                                </div>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: recipientPriority === 'lead_cp1' ? '1.5px solid #10b981' : '1px solid var(--border-light)', backgroundColor: recipientPriority === 'lead_cp1' ? 'rgba(16, 185, 129, 0.06)' : 'transparent', cursor: 'pointer', fontSize: '0.82rem' }}>
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
                      padding: '1.15rem',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Eye size={16} color="#25D366" /> Live WhatsApp Mobile Preview
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
                        padding: '1.15rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: '260px'
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
                            <div style={{ width: '100%', height: '135px', overflow: 'hidden', backgroundColor: '#025144' }}>
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

                      <div style={{ marginTop: '0.55rem', fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        Personalized tokens like <strong>&#123;&#123;1&#125;&#125;</strong> will automatically be replaced with recipient details.
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

              {/* -------------------------------------------------------------
                  STAGE 3: TESTING, SCHEDULE & LAUNCH
                  ------------------------------------------------------------- */}
              {wizardStage === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Test Send Card */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1.15rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                        <Phone size={15} color="#059669" /> Send Single Test Message
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        Verify template layout, dynamic parameters, and media on your personal phone before broadcasting.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="10-digit mobile"
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                        style={{ width: '150px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.84rem' }}
                      />
                      <button
                        type="button"
                        onClick={handleSendTestMessage}
                        disabled={sendingTest || !testPhone}
                        style={{
                          padding: '0.5rem 0.95rem',
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
                  </div>

                  {testResult && (
                    <div style={{ padding: '0.7rem 1rem', borderRadius: '8px', backgroundColor: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: testResult.success ? '#059669' : '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>
                      {testResult.message || testResult.error}
                    </div>
                  )}

                  {/* Schedule Send Mode & Speed Controls */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '1.15rem 1.25rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '1.25rem'
                  }}>
                    {/* Schedule Mode */}
                    <div>
                      <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                        <Clock size={15} color="var(--accent-color, #2563eb)" /> Campaign Schedule (Send Time)
                      </label>

                      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <label style={{
                          flex: 1,
                          padding: '0.6rem 0.85rem',
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
                          padding: '0.6rem 0.85rem',
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
                      <label style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                        <Gauge size={15} color="var(--accent-color, #2563eb)" /> Anti-Ban Throttle Speed
                      </label>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem', marginBottom: '0.65rem' }}>
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
                                padding: '0.6rem 0.45rem',
                                borderRadius: '8px',
                                border: isSelected ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                                backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                                {t.label}
                              </div>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: isSelected ? '#1d4ed8' : 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                {t.speed}
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
                        gap: '0.2rem',
                        fontSize: '0.72rem'
                      }}>
                        <div style={{ fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <ShieldCheck size={13} color="#059669" /> Anti-Spam & Delivery Safeguards:
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          • <strong>Daily Limit:</strong> Max <strong>3 messages / day / contact</strong> (enforced in IST).
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          • <strong>Failure Retry:</strong> Failed messages auto-retry <strong>up to 3 times over 3 days</strong>.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full Review Box */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1.5px solid var(--accent-color, #2563eb)',
                    borderRadius: '10px',
                    padding: '1.15rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                    boxShadow: '0 4px 15px rgba(37, 99, 235, 0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Campaign Summary & Launch Review
                        </h4>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          Ready to broadcast to <strong>{Number(currentTargetCount || 0).toLocaleString()} recipients</strong> in <strong>{selectedBranch}</strong>.
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          disabled={savingDraft}
                          style={{
                            padding: '0.65rem 1.15rem',
                            borderRadius: '8px',
                            border: '1px solid #f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            color: '#d97706',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            cursor: savingDraft ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <Save size={15} /> Save Draft
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowConfirmModal(true)}
                          disabled={launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)}
                          style={{
                            padding: '0.75rem 1.6rem',
                            background: sendMode === 'scheduled' 
                              ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' 
                              : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.94rem',
                            fontWeight: 800,
                            cursor: (launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            boxShadow: sendMode === 'scheduled' ? '0 4px 15px rgba(37, 99, 235, 0.35)' : '0 4px 15px rgba(22, 163, 74, 0.35)',
                            opacity: (launching || currentTargetCount === 0 || !selectedTemplateId || (sendMode === 'scheduled' && !scheduledAt)) ? 0.6 : 1
                          }}
                        >
                          {sendMode === 'scheduled' ? <Calendar size={16} /> : <Send size={16} />}
                          {launching 
                            ? (sendMode === 'scheduled' ? 'Scheduling...' : 'Broadcasting...') 
                            : (sendMode === 'scheduled'
                                ? `Schedule Broadcast (${Number(currentTargetCount || 0).toLocaleString()} Recipients)`
                                : `Launch Broadcast to ${Number(currentTargetCount || 0).toLocaleString()} Recipients`)}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem', fontSize: '0.8rem', padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)' }}>
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
                    <div style={{ padding: '0.85rem', background: 'rgba(37, 99, 235, 0.08)', borderRadius: '8px', border: '1px solid #3b82f6', color: '#1d4ed8', fontWeight: 700, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <RefreshCw size={15} className="animate-spin" /> {launchProgress}
                    </div>
                  )}

                  {campaignResult && (
                    <div style={{
                      padding: '1rem',
                      borderRadius: '8px',
                      backgroundColor: campaignResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      border: `1.5px solid ${campaignResult.success ? '#10b981' : '#ef4444'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem'
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.94rem', color: campaignResult.success ? '#065f46' : '#991b1b', marginBottom: '0.15rem' }}>
                          {campaignResult.success ? (campaignResult.isScheduled ? '📅 Campaign Scheduled Successfully!' : '✅ Broadcast Completed Successfully!') : '❌ Broadcast Failed'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {campaignResult.message || campaignResult.error}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        style={{
                          padding: '0.45rem 0.95rem',
                          backgroundColor: 'var(--accent-color, #2563eb)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        Close to Table
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

            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION POP-UP BEFORE FINAL LAUNCH */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 100000,
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
  );
}
