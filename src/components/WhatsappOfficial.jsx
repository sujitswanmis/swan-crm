'use client';

import MobileTableView, { useTableViewPreference } from '@/components/common/MobileTableView';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import { CRMPage, CRMPageHeader, CRMCard, CRMToolbar, CRMTabs, CRMTabPanel, CRMStatusBadge, CRMViewToggle, crmStyles, useCRMPageSize, useCRMPageSizeOptions, useCRMResizableTable } from '@/components/common/CRMDesignSystem';
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';
import ErrorBoundary from '@/components/ErrorBoundary';
import WhatsappOfficialMessageLogs from '@/components/WhatsappOfficialMessageLogs';
import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Image as ImageIcon, Upload, PlayCircle, PauseCircle, Settings, MessageSquare, Repeat,
  CheckCircle2, AlertCircle, Eye, EyeOff, Send, ShieldCheck, Users, HelpCircle, RefreshCw, Zap,
  Building2, Filter, Briefcase, Edit3, Globe, Code2, X, ExternalLink, Check, Search, Layers, Key,
  RotateCcw, LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square
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
  bulkUpdateWhatsappAutomationStatus,
  toggleWhatsappAutomationStatus,
  testWhatsappProviderConnection,
  getGlobalBspCatalog,
  getClientBspAllocations,
  saveClientBspAllocations
} from '@/app/actions/whatsapp';
import { getTenantBranches, getAllTenantBranches } from '@/app/actions/tenantBranches';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';

const ALLOCATION_WIDTHS = { office: 240, type: 140, bsps: 260, defaultBsp: 160, quota: 110, action: 90 };
const TEMPLATE_WIDTHS = { select: 48, name: 240, provider: 150, branch: 180, campaign: 170, preview: 280, actions: 144 };
const AUTOMATION_WIDTHS = { select: 48, company: 160, stage: 240, template: 250, frequency: 140, status: 130, actions: 144 };
const ALLOCATION_MINIMUMS = { office: 160, type: 110, bsps: 180, defaultBsp: 120, quota: 80, action: 70 };
const TEMPLATE_MINIMUMS = { select: 48, name: 110, provider: 100, branch: 110, campaign: 110, preview: 140, actions: 144 };
const AUTOMATION_MINIMUMS = { select: 48, company: 100, stage: 110, template: 120, frequency: 100, status: 100, actions: 144 };
const WA_EDGE_MAXIMUMS = { select: 72, actions: 180 };

const ALL_WA_TABS = [
  { id: 'templates', label: 'Templates Library', icon: MessageSquare },
  { id: 'automations', label: 'Stage Automations', icon: Repeat },
  { id: 'sent_logs', label: 'API Message Sent Logs', icon: Send },
  { id: 'catalog', label: 'Master BSP Catalog (20+)', icon: Layers },
  { id: 'allocations', label: 'Client Allocation Matrix', icon: Users },
  { id: 'settings', label: 'API Credentials & Setup', icon: Settings }
];

export default function WhatsappOfficial({ moduleAccess = {}, userRole = '', userCompany = '', isMasterAdmin = false, userId = '', tenantId = null, isActive = true, allowedLogViews }) {
  const rLower = String(userRole || '').trim().toLowerCase();
  const isAdmin = !userRole || rLower === 'admin' || rLower === 'superadmin' || rLower === 'super_admin' || rLower === 'masteradmin' || rLower === 'owner' || rLower.includes('admin');

  const visibleTabs = React.useMemo(() => {
    let list = ALL_WA_TABS;
    if (!isMasterAdmin) {
      list = list.filter(t => t.id !== 'catalog' && t.id !== 'allocations');
    }
    return filterVisibleSubTabs(moduleAccess, userRole, 'whatsapp_official', list);
  }, [moduleAccess, userRole, isMasterAdmin]);

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
    setTemplatePage(1);
    setAutoPage(1);
    setAllocationPage(1);
    if (tabId === 'catalog') setActiveAdminSubTab('catalog');
    if (tabId === 'allocations') setActiveAdminSubTab('allocations');
    if (tabId === 'settings') setActiveAdminSubTab('credentials');
    const params = new URLSearchParams(window.location.search);
    params.set('wa_tab', tabId);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // Settings State - Multi-Active Providers & Default Gateway
  const [enabledProviders, setEnabledProviders] = useState(['aisensy']);
  const [defaultProvider, setDefaultProvider] = useState('aisensy');
  const [accountLimit, setAccountLimit] = useState(1);
  const [metaConfig, setMetaConfig] = useState({ phone_number_id: '', waba_id: '', access_token: '', api_version: 'v21.0' });
  const [aisensyConfig, setAisensyConfig] = useState({ api_key: '', user_name: 'New Swan Group' });
  const [interaktConfig, setInteraktConfig] = useState({ api_key: '' });
  const [watiConfig, setWatiConfig] = useState({ endpoint_url: '', access_token: '' });
  const [nextelConfig, setNextelConfig] = useState({ endpoint_url: '' });

  // 3-Tier Multi-Tenant State (Catalog, Allocations, Workspace Setup)
  const [catalog, setCatalog] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [clientAllocations, setClientAllocations] = useState({});
  const [tenantsList, setTenantsList] = useState([]);
  const [selectedHqForAllocation, setSelectedHqForAllocation] = useState('NEW_SWAN_GROUP');
  const [selectedClientForAllocation, setSelectedClientForAllocation] = useState('NEW_SWAN_GROUP');
  const [selectedHqForCredentials, setSelectedHqForCredentials] = useState(() => userCompany || 'NEW_SWAN_GROUP');
  const [selectedClientForCredentials, setSelectedClientForCredentials] = useState(() => userCompany || 'NEW_SWAN_GROUP');
  const [overviewTableHqFilter, setOverviewTableHqFilter] = useState('All');
  const [activeAdminSubTab, setActiveAdminSubTab] = useState('catalog'); // 'catalog' | 'allocations' | 'credentials'
  const [isClientScoped, setIsClientScoped] = useState(false);
  const [assignedBsps, setAssignedBsps] = useState([]);
  const [bspCredentials, setBspCredentials] = useState({});
  const [savingAllocations, setSavingAllocations] = useState(false);
  const [allocationFeedback, setAllocationFeedback] = useState(null);

  // Custom BSP State - Dynamic Self-Serve Gateway Engine
  const [customBsps, setCustomBsps] = useState([]);
  const [showCustomBspModal, setShowCustomBspModal] = useState(false);
  const [showCustomToken, setShowCustomToken] = useState(false);
  const [customBspForm, setCustomBspForm] = useState({
    id: '',
    name: '',
    endpoint_url: '',
    method: 'POST',
    auth_type: 'Bearer',
    auth_header_name: 'apikey',
    auth_token: '',
    payload_format: '{\n  "to": "{{PHONE}}",\n  "template_name": "{{TEMPLATE_NAME}}",\n  "customer_name": "{{NAME}}",\n  "message": "{{MESSAGE}}",\n  "media_url": "{{IMAGE_URL}}"\n}'
  });

  // Legacy fallback states
  const [apiKeyNsmlr, setApiKeyNsmlr] = useState('');
  const [apiKeyNstlp, setApiKeyNstlp] = useState('');

  // Test Connection State
  const [testProvider, setTestProvider] = useState('aisensy');
  const [testPhone, setTestPhone] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);
  const [showSecretToken, setShowSecretToken] = useState(false);

  // Templates State
  const [templates, setTemplates] = useState([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({ template_name: '', campaign_name: '', message_body: '', image_url: '', company: 'All' });
  const [uploadingImage, setUploadingImage] = useState(false);

  // Template Search, Selection List, & Pagination State
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePerPage, setTemplatePerPage] = useCRMPageSize(setTemplatePage);
  const templatePageSizes = useCRMPageSizeOptions(templatePerPage);
  const [templateViewMode, setTemplateViewMode] = useState('grid'); // 'grid' | 'table'
  const [deletingBulkTemplates, setDeletingBulkTemplates] = useState(false);

  // Branches & Office State
  const [branches, setBranches] = useState([]);
  const [selectedTemplateBsp, setSelectedTemplateBsp] = useState('aisensy');
  const [selectedTemplateBranch, setSelectedTemplateBranch] = useState('New Swan Group (Headquarters)');
  const [filterBsp, setFilterBsp] = useState('All');
  const [filterBranch, setFilterBranch] = useState('All');

  // Automations State
  const [automations, setAutomations] = useState([]);
  const [selectedAutoIds, setSelectedAutoIds] = useState([]);
  const [updatingBulkAuto, setUpdatingBulkAuto] = useState(false);
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [currentAuto, setCurrentAuto] = useState({ stage_name: '', template_id: '', frequency: 'Once', company: 'All', is_active: true });
  const [stages, setStages] = useState([]);
  const [autoSearch, setAutoSearch] = useState('');
  const [autoCompanyFilter, setAutoCompanyFilter] = useState('ALL');
  const [autoStatusFilter, setAutoStatusFilter] = useState('ALL');
  const [autoFrequencyFilter, setAutoFrequencyFilter] = useState('ALL');
  const [autoTableView, setAutoTableView] = useTableViewPreference('WhatsappOfficial-1');
  const [autoPage, setAutoPage] = useState(1);
  const [autoPageSize, setAutoPageSize] = useCRMPageSize(setAutoPage);

  const autoCompanyOptions = React.useMemo(() => {
    const set = new Set();
    automations.forEach(a => {
      if (a.company && a.company !== 'All') set.add(a.company);
    });
    return Array.from(set).sort();
  }, [automations]);

  const filteredAutomations = React.useMemo(() => {
    return automations.filter(auto => {
      // 1. Search text
      if (autoSearch.trim()) {
        const q = autoSearch.toLowerCase().trim();
        const stageMatch = (auto.stage_name || '').toLowerCase().includes(q);
        const tplIdMatch = (auto.template_id || '').toLowerCase().includes(q);
        const tplNameMatch = (auto.whatsapp_templates?.template_name || '').toLowerCase().includes(q);
        const compMatch = (auto.company || '').toLowerCase().includes(q);
        if (!stageMatch && !tplIdMatch && !tplNameMatch && !compMatch) return false;
      }
      // 2. Company filter
      if (autoCompanyFilter !== 'ALL') {
        if ((auto.company || '').toUpperCase() !== autoCompanyFilter.toUpperCase()) return false;
      }
      // 3. Status filter
      if (autoStatusFilter === 'ACTIVE' && !auto.is_active) return false;
      if (autoStatusFilter === 'PAUSED' && auto.is_active) return false;
      // 4. Frequency filter
      if (autoFrequencyFilter !== 'ALL') {
        if ((auto.frequency || '').toLowerCase() !== autoFrequencyFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [automations, autoSearch, autoCompanyFilter, autoStatusFilter, autoFrequencyFilter]);

  const paginatedAutomations = React.useMemo(() => {
    if (autoPageSize === 100000) return filteredAutomations;
    const startIdx = (autoPage - 1) * autoPageSize;
    return filteredAutomations.slice(startIdx, startIdx + autoPageSize);
  }, [filteredAutomations, autoPage, autoPageSize]);

  const totalAutoPages = Math.max(1, Math.ceil(filteredAutomations.length / (autoPageSize === 100000 ? (filteredAutomations.length || 1) : autoPageSize)));

  useEffect(() => {
    if (autoPage > totalAutoPages) {
      setAutoPage(totalAutoPages);
    }
  }, [totalAutoPages, autoPage]);

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
  }, [userCompany]);

  const loadAllData = async () => {
    setLoading(true);
    const effectiveComp = userCompany || 'New Swan Group';
    const [setRes, tplRes, autoRes, branchRes, catRes, allocRes] = await Promise.all([
      getWhatsappSettings(effectiveComp),
      getWhatsappTemplates(),
      getWhatsappAutomations(),
      isAdmin ? getAllTenantBranches() : getTenantBranches(effectiveComp),
      getGlobalBspCatalog(),
      getClientBspAllocations()
    ]);

    if (branchRes.success && Array.isArray(branchRes.branches)) {
      setBranches(branchRes.branches);
    }

    if (catRes.success && Array.isArray(catRes.catalog)) {
      setCatalog(catRes.catalog);
    }

    if (allocRes.success) {
      setClientAllocations(allocRes.allocations || {});
      setTenantsList(allocRes.tenants || []);
    }
    
    if (setRes.success && setRes.data) {
      const d = setRes.data;
      if (Array.isArray(d.custom_bsps)) {
        setCustomBsps(d.custom_bsps);
      }

      setIsClientScoped(!!d.is_client_scoped);
      const assigned = Array.isArray(d.assigned_bsps) ? d.assigned_bsps : [];
      setAssignedBsps(assigned);
      if (d.bsp_credentials && typeof d.bsp_credentials === 'object') {
        setBspCredentials(d.bsp_credentials);
      }

      const initialEnabled = Array.isArray(d.enabled_providers) && d.enabled_providers.length > 0
        ? d.enabled_providers
        : (d.api_key_nstlp ? ['aisensy', 'nextel'] : ['aisensy']);
      setEnabledProviders(initialEnabled);

      const def = d.default_provider || d.provider || initialEnabled[0] || 'aisensy';
      setDefaultProvider(def);
      setTestProvider(def);
      setSelectedTemplateBsp(def);
      setAccountLimit(d.account_limit || initialEnabled.length);

      if (d.meta) setMetaConfig({ phone_number_id: d.meta.phone_number_id || '', waba_id: d.meta.waba_id || '', access_token: d.meta.access_token || '', api_version: d.meta.api_version || 'v21.0' });
      if (d.aisensy) setAisensyConfig({ api_key: d.aisensy.api_key || d.api_key_nsmlr || '', user_name: d.aisensy.user_name || 'New Swan Group' });
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

  const toggleProvider = (pId) => {
    if (!settingsPerms.edit) return;
    setEnabledProviders(prev => {
      let updated;
      if (prev.includes(pId)) {
        if (prev.length === 1) {
          alert('At least one WhatsApp provider must remain enabled.');
          return prev;
        }
        updated = prev.filter(x => x !== pId);
        if (defaultProvider === pId) setDefaultProvider(updated[0]);
        if (testProvider === pId) setTestProvider(updated[0]);
      } else {
        updated = [...prev, pId];
      }
      return updated;
    });
  };

  // --- CLIENT & BRANCH ALLOCATION HELPERS (TIER 2) ---
  const allClients = React.useMemo(() => {
    const list = [
      { id: 'NEW_SWAN_GROUP', name: 'New Swan Group (Headquarters)', code: 'NEW_SWAN_GROUP', type: 'headquarters', hqCode: 'NEW_SWAN_GROUP', group: 'New Swan Group' },
      { id: 'NSMLR', name: '🏢 NSMLR (Branch)', code: 'NSMLR', type: 'branch', hqCode: 'NEW_SWAN_GROUP', group: 'New Swan Group' },
      { id: 'NSTLP', name: '🏢 NSTLP (Branch)', code: 'NSTLP', type: 'branch', hqCode: 'NEW_SWAN_GROUP', group: 'New Swan Group' }
    ];

    // 1. Automatically import all Registered Tenants as Headquarters
    (tenantsList || []).forEach(t => {
      const code = (t.tenant_code || t.name || '').trim();
      const lowerCode = code.toLowerCase();
      const lowerName = (t.name || '').toLowerCase();
      
      const alreadyExists = list.some(x => 
        x.code?.toLowerCase() === lowerCode || 
        x.name?.toLowerCase().includes(lowerName)
      );

      if (!alreadyExists && code) {
        list.push({ 
          id: t.id || code, 
          name: t.name.toLowerCase().includes('headquarter') ? t.name : `${t.name} (Headquarters)`, 
          code: code, 
          type: 'headquarters', 
          hqCode: code,
          group: t.name 
        });
      }
    });

    // 2. Automatically import all dynamic Branches (both DB & Local config)
    (branches || []).forEach(b => {
      const bCode = (b.branch_code || b.branch_name || '').trim();
      const lowerCode = bCode.toLowerCase();
      const lowerName = (b.branch_name || '').toLowerCase();
      const locType = (b.location_type || '').toLowerCase();
      const isHQ = locType === 'headquarters' || lowerName.includes('headquarter');

      const alreadyExists = list.some(x => 
        x.code?.toLowerCase() === lowerCode || 
        x.name?.toLowerCase() === lowerName ||
        (isHQ && b.company && x.name?.toLowerCase().includes(b.company.toLowerCase()) && x.type === 'headquarters')
      );

      if (!alreadyExists && bCode) {
        let displayName = b.branch_name;
        if (isHQ) {
          displayName = b.company 
            ? `${b.company} (Headquarters)` 
            : (displayName.includes('(') ? displayName : `${displayName} (Headquarters)`);
        } else {
          const suffix = b.location_type && !b.location_type.toLowerCase().includes('branch')
            ? ` (${b.location_type})`
            : ' (Branch)';
          displayName = displayName.startsWith('🏢') ? displayName : `🏢 ${displayName}${displayName.includes('(') ? '' : suffix}`;
        }

        // Determine parent HQ code
        let parentHqCode = 'NEW_SWAN_GROUP';
        if (b.company) {
          const matchedTenant = (tenantsList || []).find(t => t.name?.toLowerCase() === b.company.toLowerCase() || t.tenant_code?.toLowerCase() === b.company.toLowerCase());
          if (matchedTenant) {
            parentHqCode = matchedTenant.tenant_code || matchedTenant.name;
          } else {
            parentHqCode = b.company;
          }
        }

        list.push({
          id: b.id || bCode,
          name: displayName,
          code: bCode,
          type: isHQ ? 'headquarters' : 'branch',
          hqCode: parentHqCode,
          group: b.company || 'Branch Office'
        });
      }
    });

    return list;
  }, [tenantsList, branches]);

  const hqOptions = React.useMemo(() => {
    const list = [
      { code: 'NEW_SWAN_GROUP', name: 'New Swan Group' }
    ];
    (tenantsList || []).forEach(t => {
      const code = (t.tenant_code || t.name || '').trim();
      if (code && !list.some(x => x.code.toLowerCase() === code.toLowerCase())) {
        list.push({ code, name: t.name });
      }
    });
    return list;
  }, [tenantsList]);

  const branchOptionsForSelectedHq = React.useMemo(() => {
    const targetHq = String(selectedHqForAllocation || 'NEW_SWAN_GROUP').toLowerCase();
    const hqItem = hqOptions.find(h => h.code.toLowerCase() === targetHq);
    const hqName = (hqItem?.name || '').toLowerCase();

    return allClients.filter(c => {
      const cHq = (c.hqCode || '').toLowerCase();
      const cGroup = (c.group || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      return cHq === targetHq || cGroup === targetHq || cCode === targetHq || (hqName && cGroup.includes(hqName));
    });
  }, [allClients, selectedHqForAllocation, hqOptions]);

  const handleHqChange = (newHqCode) => {
    setSelectedHqForAllocation(newHqCode);
    const targetHq = String(newHqCode || '').toLowerCase();
    const hqItem = hqOptions.find(h => h.code.toLowerCase() === targetHq);
    const hqName = (hqItem?.name || '').toLowerCase();

    const matching = allClients.filter(c => {
      const cHq = (c.hqCode || '').toLowerCase();
      const cGroup = (c.group || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      return cHq === targetHq || cGroup === targetHq || cCode === targetHq || (hqName && cGroup.includes(hqName));
    });

    if (matching.length > 0) {
      setSelectedClientForAllocation(matching[0].code || matching[0].name);
    } else {
      setSelectedClientForAllocation(newHqCode);
    }
  };

  const branchOptionsForSelectedCredentialsHq = React.useMemo(() => {
    const targetHq = String(selectedHqForCredentials || userCompany || 'NEW_SWAN_GROUP').toLowerCase();
    const hqItem = hqOptions.find(h => h.code.toLowerCase() === targetHq);
    const hqName = (hqItem?.name || '').toLowerCase();

    return allClients.filter(c => {
      const cHq = (c.hqCode || '').toLowerCase();
      const cGroup = (c.group || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      return cHq === targetHq || cGroup === targetHq || cCode === targetHq || (hqName && cGroup.includes(hqName));
    });
  }, [allClients, selectedHqForCredentials, userCompany, hqOptions]);

  const loadClientCredentials = async (clientCode) => {
    setLoading(true);
    const res = await getWhatsappSettings(clientCode);
    if (res.success && res.data) {
      const d = res.data;
      if (d.meta) setMetaConfig({ phone_number_id: d.meta.phone_number_id || '', waba_id: d.meta.waba_id || '', access_token: d.meta.access_token || '', api_version: d.meta.api_version || 'v21.0' });
      if (d.aisensy) setAisensyConfig({ api_key: d.aisensy.api_key || '', user_name: d.aisensy.user_name || clientCode });
      if (d.interakt) setInteraktConfig({ api_key: d.interakt.api_key || '' });
      if (d.wati) setWatiConfig({ endpoint_url: d.wati.endpoint_url || '', access_token: d.wati.access_token || '' });
      if (d.nextel) setNextelConfig({ endpoint_url: d.nextel.endpoint_url || '' });
      if (d.bsp_credentials && typeof d.bsp_credentials === 'object') setBspCredentials(d.bsp_credentials);
      if (d.default_provider) setDefaultProvider(d.default_provider);
      if (Array.isArray(d.assigned_bsps)) setAssignedBsps(d.assigned_bsps);
      setIsClientScoped(!!d.is_client_scoped);
    }
    setLoading(false);
  };

  const handleCredentialsHqChange = (newHqCode) => {
    setSelectedHqForCredentials(newHqCode);
    const targetHq = String(newHqCode || '').toLowerCase();
    const hqItem = hqOptions.find(h => h.code.toLowerCase() === targetHq);
    const hqName = (hqItem?.name || '').toLowerCase();

    const matching = allClients.filter(c => {
      const cHq = (c.hqCode || '').toLowerCase();
      const cGroup = (c.group || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      return cHq === targetHq || cGroup === targetHq || cCode === targetHq || (hqName && cGroup.includes(hqName));
    });

    const newTarget = matching.length > 0 ? (matching[0].code || matching[0].name) : newHqCode;
    setSelectedClientForCredentials(newTarget);
    loadClientCredentials(newTarget);
  };

  const handleCredentialsClientChange = (newClientCode) => {
    setSelectedClientForCredentials(newClientCode);
    loadClientCredentials(newClientCode);
  };

  const filteredTableClients = React.useMemo(() => {
    if (overviewTableHqFilter === 'All') return allClients;
    const targetHq = overviewTableHqFilter.toLowerCase();
    const hqItem = hqOptions.find(h => h.code.toLowerCase() === targetHq);
    const hqName = (hqItem?.name || '').toLowerCase();

    return allClients.filter(c => {
      const cHq = (c.hqCode || '').toLowerCase();
      const cGroup = (c.group || '').toLowerCase();
      const cCode = (c.code || '').toLowerCase();
      return cHq === targetHq || cGroup === targetHq || cCode === targetHq || (hqName && cGroup.includes(hqName));
    });
  }, [allClients, overviewTableHqFilter, hqOptions]);

  const allocationResize = useTableColumnResize('crm_wa_table_col_widths', ALLOCATION_WIDTHS, ALLOCATION_MINIMUMS);
  const { attachContainer: templateContainerRef, ...templateResize } = useCRMResizableTable('crm_wa_template_table_col_widths', TEMPLATE_WIDTHS, TEMPLATE_MINIMUMS, activeTab === 'templates' && templateViewMode === 'table', WA_EDGE_MAXIMUMS);
  const { attachContainer: automationContainerRef, ...automationResize } = useCRMResizableTable('crm_wa_automation_table_col_widths', AUTOMATION_WIDTHS, AUTOMATION_MINIMUMS, activeTab === 'automations' && autoTableView === 'table', WA_EDGE_MAXIMUMS);
  const [allocationPage, setAllocationPage] = useState(1);
  const [allocationPageSize, setAllocationPageSize] = useCRMPageSize(setAllocationPage);
  const currentAllocationPage = Math.min(allocationPage, Math.max(1, Math.ceil(filteredTableClients.length / allocationPageSize)));
  const paginatedTableClients = filteredTableClients.slice((currentAllocationPage - 1) * allocationPageSize, currentAllocationPage * allocationPageSize);

  const getInitialClientAlloc = (clientCode) => {
    const code = String(clientCode || '').toUpperCase();
    if (code.includes('NSTLP')) {
      return {
        allowed_bsps: ['nextel'],
        default_bsp: 'nextel',
        account_limit: 1
      };
    }
    if (code.includes('NSMLR')) {
      return {
        allowed_bsps: ['aisensy'],
        default_bsp: 'aisensy',
        account_limit: 1
      };
    }
    if (code === 'NEW_SWAN_GROUP') {
      return {
        allowed_bsps: ['aisensy', 'nextel'],
        default_bsp: 'aisensy',
        account_limit: 2
      };
    }
    return {
      allowed_bsps: ['aisensy'],
      default_bsp: 'aisensy',
      account_limit: 1
    };
  };

  const currentClientAlloc = clientAllocations[selectedClientForAllocation] || getInitialClientAlloc(selectedClientForAllocation);

  const toggleClientBsp = (bspId) => {
    const existing = clientAllocations[selectedClientForAllocation] || getInitialClientAlloc(selectedClientForAllocation);
    const currentAllowed = Array.isArray(existing.allowed_bsps) ? existing.allowed_bsps : [];
    let updatedAllowed;
    if (currentAllowed.includes(bspId)) {
      if (currentAllowed.length === 1) {
        alert('Each client or branch must have at least one assigned BSP gateway.');
        return;
      }
      updatedAllowed = currentAllowed.filter(x => x !== bspId);
    } else {
      updatedAllowed = [...currentAllowed, bspId];
    }
    let updatedDefault = existing.default_bsp;
    if (!updatedAllowed.includes(updatedDefault)) {
      updatedDefault = updatedAllowed[0] || 'aisensy';
    }
    setClientAllocations(prev => ({
      ...prev,
      [selectedClientForAllocation]: {
        ...existing,
        allowed_bsps: updatedAllowed,
        default_bsp: updatedDefault
      }
    }));
  };

  const setClientDefaultBsp = (defBsp) => {
    const existing = clientAllocations[selectedClientForAllocation] || getInitialClientAlloc(selectedClientForAllocation);
    setClientAllocations(prev => ({
      ...prev,
      [selectedClientForAllocation]: {
        ...existing,
        default_bsp: defBsp
      }
    }));
  };

  const setClientAccountLimit = (limit) => {
    const existing = clientAllocations[selectedClientForAllocation] || getInitialClientAlloc(selectedClientForAllocation);
    setClientAllocations(prev => ({
      ...prev,
      [selectedClientForAllocation]: {
        ...existing,
        account_limit: Number(limit) || 1
      }
    }));
  };

  const handleSaveClientAllocations = async () => {
    if (!selectedClientForAllocation) return;
    setSavingAllocations(true);
    setAllocationFeedback(null);
    const res = await saveClientBspAllocations(clientAllocations);
    setSavingAllocations(false);
    if (res.success) {
      setAllocationFeedback({ success: true, message: `Allocations successfully saved for ${selectedClientForAllocation}!` });
      setTimeout(() => setAllocationFeedback(null), 4000);
    } else {
      setAllocationFeedback({ success: false, message: res.error || 'Failed to save allocations' });
    }
  };

  const handleUpdateBspCredential = (bspId, field, value) => {
    setBspCredentials(prev => ({
      ...prev,
      [bspId]: {
        ...(prev[bspId] || {}),
        [field]: value
      }
    }));
  };

  // --- SETTINGS LOGIC ---
  const handleSaveSettings = async (customBspsOverride, enabledProvidersOverride) => {
    setLoading(true);
    const activeCustomBsps = customBspsOverride || customBsps;
    const activeEnabled = enabledProvidersOverride || enabledProviders;
    const targetClient = selectedClientForCredentials || userCompany || 'NEW_SWAN_GROUP';
    const payload = {
      target_client: targetClient,
      enabled_providers: activeEnabled,
      default_provider: defaultProvider,
      provider: defaultProvider,
      account_limit: Number(accountLimit) || activeEnabled.length,
      custom_bsps: activeCustomBsps,
      client_allocations: clientAllocations,
      bsp_credentials: bspCredentials,
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
    if (res.success) {
      if (!customBspsOverride) {
        alert(`WhatsApp API settings saved successfully for ${targetClient}!`);
      }
      const allocRes = await getClientBspAllocations();
      if (allocRes.success) {
        setClientAllocations(allocRes.allocations || {});
      }
    } else {
      alert('Error saving settings: ' + res.error);
    }
    return res;
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
      nextel: nextelConfig,
      custom_bsps: customBsps,
      bsp_credentials: bspCredentials
    };
    const res = await testWhatsappProviderConnection({ provider: testProvider, config, testPhone });
    setTestingConnection(false);
    setTestFeedback(res);
  };

  // --- CUSTOM BSP SELF-SERVE ENGINE LOGIC ---
  const handleOpenAddCustomBsp = () => {
    setCustomBspForm({
      id: '',
      name: '',
      endpoint_url: '',
      method: 'POST',
      auth_type: 'Bearer',
      auth_header_name: 'apikey',
      auth_token: '',
      payload_format: '{\n  "to": "{{PHONE}}",\n  "template_name": "{{TEMPLATE_NAME}}",\n  "customer_name": "{{NAME}}",\n  "message": "{{MESSAGE}}",\n  "media_url": "{{IMAGE_URL}}"\n}'
    });
    setShowCustomBspModal(true);
  };

  const handleOpenEditBsp = (bsp, e) => {
    if (e) e.stopPropagation();
    const existingOverride = customBsps.find(cb => cb.id === bsp.id);
    const effective = existingOverride || bsp;

    setCustomBspForm({
      id: bsp.id,
      name: effective.name || bsp.name || '',
      endpoint_url: effective.endpoint_url || bsp.default_endpoint || bsp.endpoint_url || '',
      method: effective.method || bsp.method || 'POST',
      auth_type: effective.auth_type || bsp.auth_type || 'Bearer',
      auth_header_name: effective.auth_header_name || bsp.auth_header_name || 'apikey',
      auth_token: effective.auth_token || '',
      payload_format: effective.payload_format || bsp.payload_format || '{\n  "to": "{{PHONE}}",\n  "template_name": "{{TEMPLATE_NAME}}",\n  "customer_name": "{{NAME}}",\n  "message": "{{MESSAGE}}",\n  "media_url": "{{IMAGE_URL}}"\n}'
    });
    setShowCustomBspModal(true);
  };
  const handleOpenEditCustomBsp = handleOpenEditBsp;

  const handleResetBspOverride = async (bspId, bspName, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Reset "${bspName}" back to original official catalog defaults?`)) {
      return;
    }
    const updatedCustomBsps = customBsps.filter(b => b.id !== bspId);
    setCustomBsps(updatedCustomBsps);
    await handleSaveSettings(updatedCustomBsps);
    alert(`"${bspName}" reset to official catalog defaults.`);
  };

  const handleSaveCustomBsp = async () => {
    if (!customBspForm.name.trim()) {
      alert('Please enter a BSP Name (e.g., Gupshup, Twilio, DoubleTick).');
      return;
    }
    if (!customBspForm.endpoint_url.trim()) {
      alert('Please enter the API Endpoint URL.');
      return;
    }

    const testJson = customBspForm.payload_format
      .replace(/\{\{PHONE\}\}/g, '919876543210')
      .replace(/\{\{NAME\}\}/g, 'Customer')
      .replace(/\{\{TEMPLATE_NAME\}\}/g, 'test_tpl')
      .replace(/\{\{MESSAGE\}\}/g, 'Test')
      .replace(/\{\{IMAGE_URL\}\}/g, 'https://example.com/img.jpg');
    try {
      JSON.parse(testJson);
    } catch (err) {
      alert('JSON Payload Format syntax error:\n' + err.message + '\n\nPlease ensure your payload format is valid JSON.');
      return;
    }

    const bspId = customBspForm.id || ('custom_' + customBspForm.name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36));
    const newBsp = {
      ...customBspForm,
      id: bspId,
      name: customBspForm.name.trim(),
      endpoint_url: customBspForm.endpoint_url.trim()
    };

    let updatedCustomBsps;
    if (customBsps.some(b => b.id === bspId)) {
      updatedCustomBsps = customBsps.map(b => b.id === bspId ? newBsp : b);
    } else {
      updatedCustomBsps = [...customBsps, newBsp];
    }

    let updatedEnabled = enabledProviders;
    if (!updatedEnabled.includes(bspId)) {
      updatedEnabled = [...updatedEnabled, bspId];
    }

    setCustomBsps(updatedCustomBsps);
    setEnabledProviders(updatedEnabled);
    setShowCustomBspModal(false);

    await handleSaveSettings(updatedCustomBsps, updatedEnabled);
    alert(`Custom BSP "${newBsp.name}" configured and activated successfully!`);
  };

  const handleDeleteCustomBsp = async (bspId, bspName, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete custom BSP "${bspName}"? Templates mapped to it will fall back to the default gateway.`)) {
      return;
    }

    const updatedCustomBsps = customBsps.filter(b => b.id !== bspId);
    let updatedEnabled = enabledProviders.filter(id => id !== bspId);
    if (updatedEnabled.length === 0) updatedEnabled = ['aisensy'];

    setCustomBsps(updatedCustomBsps);
    setEnabledProviders(updatedEnabled);

    if (defaultProvider === bspId) setDefaultProvider(updatedEnabled[0]);
    if (testProvider === bspId) setTestProvider(updatedEnabled[0]);
    if (selectedTemplateBsp === bspId) setSelectedTemplateBsp(updatedEnabled[0]);

    await handleSaveSettings(updatedCustomBsps, updatedEnabled);
    alert(`Custom BSP "${bspName}" removed.`);
  };

  const combinedCatalog = React.useMemo(() => {
    const customMap = new Map((customBsps || []).map(c => [c.id, c]));
    const merged = (catalog || []).map(catItem => {
      if (customMap.has(catItem.id)) {
        const override = customMap.get(catItem.id);
        return {
          ...catItem,
          ...override,
          hasOverride: true,
          isCustom: false
        };
      }
      return {
        ...catItem,
        hasOverride: false,
        isCustom: false
      };
    });

    const catalogIds = new Set((catalog || []).map(c => c.id));
    (customBsps || []).forEach(cb => {
      if (!catalogIds.has(cb.id)) {
        merged.push({
          ...cb,
          hasOverride: false,
          isCustom: true
        });
      }
    });

    return merged;
  }, [catalog, customBsps]);

  const getBspDisplayName = (bspId) => {
    if (!bspId) return 'AiSensy';
    const lower = String(bspId).toLowerCase();
    const item = combinedCatalog.find(b => b.id?.toLowerCase() === lower || (b.name && b.name.toLowerCase() === lower));
    if (item) return item.name;
    if (lower === 'meta') return 'Meta Cloud API';
    if (lower === 'aisensy') return 'AiSensy';
    if (lower === 'interakt') return 'Interakt';
    if (lower === 'wati') return 'Wati';
    if (lower === 'nextel') return 'Nextel.io';
    return bspId.toUpperCase();
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

  const parseTemplateMeta = (compStr) => {
    const raw = String(compStr || '').trim();
    let bsp = defaultProvider || 'aisensy';
    let branch = 'New Swan Group (Headquarters)';

    const match = raw.match(/\[(.*?)\]/);
    if (match && match[1]) {
      bsp = match[1];
      branch = raw.replace(/\[.*?\]/, '').trim() || 'New Swan Group (Headquarters)';
    } else if (raw.toLowerCase() === 'nstlp') {
      bsp = 'nextel';
      branch = 'NSTLP';
    } else if (raw.toLowerCase() === 'nsmlr') {
      bsp = 'aisensy';
      branch = 'NSMLR';
    } else if (['aisensy', 'interakt', 'meta', 'wati', 'nextel'].includes(raw.toLowerCase())) {
      bsp = raw.toLowerCase();
      branch = 'New Swan Group (Headquarters)';
    } else {
      const customMatch = customBsps.find(b => b.id.toLowerCase() === raw.toLowerCase() || (b.name && b.name.toLowerCase() === raw.toLowerCase()));
      if (customMatch) {
        bsp = customMatch.id;
        branch = 'New Swan Group (Headquarters)';
      } else if (raw && raw !== 'All') {
        branch = raw;
      }
    }
    return { bsp, branch };
  };

  const handleOpenCreateTemplate = () => {
    setSelectedTemplateBsp(defaultProvider || 'aisensy');
    const firstBranch = 'New Swan Group (Headquarters)';
    setSelectedTemplateBranch(firstBranch);
    setCurrentTemplate({ template_name: '', campaign_name: '', message_body: '', image_url: '', company: 'All' });
    setShowTemplateForm(true);
  };

  const handleOpenEditTemplate = (tpl) => {
    const meta = parseTemplateMeta(tpl.company);
    setSelectedTemplateBsp(meta.bsp);
    setSelectedTemplateBranch(meta.branch);
    setCurrentTemplate(tpl);
    setShowTemplateForm(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate.template_name || !currentTemplate.campaign_name || !currentTemplate.message_body) {
      alert('Please fill all required fields');
      return;
    }
    setLoading(true);
    const branchLabel = selectedTemplateBranch || 'New Swan Group (Headquarters)';
    const bspLabel = selectedTemplateBsp || defaultProvider || 'aisensy';
    const combinedCompany = `${branchLabel} [${bspLabel}]`;

    const res = await saveWhatsappTemplate({
      ...currentTemplate,
      company: combinedCompany
    });

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
    if (res.success) {
      setSelectedTemplateIds(prev => prev.filter(x => x !== id));
      loadAllData();
    }
  };

  // Filtered Templates based on Search, BSP, and Branch
  const filteredTemplates = React.useMemo(() => {
    let list = templates;

    // 1. Search Query (template name, campaign name, message body, branch, bsp)
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase().trim();
      list = list.filter(tpl => {
        const meta = parseTemplateMeta(tpl.company);
        const nameMatch = (tpl.template_name || '').toLowerCase().includes(q);
        const campMatch = (tpl.campaign_name || '').toLowerCase().includes(q);
        const bodyMatch = (tpl.message_body || '').toLowerCase().includes(q);
        const branchMatch = (meta.branch || '').toLowerCase().includes(q);
        const bspMatch = (meta.bsp || '').toLowerCase().includes(q) || getBspDisplayName(meta.bsp).toLowerCase().includes(q);
        return nameMatch || campMatch || bodyMatch || branchMatch || bspMatch;
      });
    }

    // 2. Filter by BSP
    if (filterBsp !== 'All') {
      list = list.filter(tpl => {
        const meta = parseTemplateMeta(tpl.company);
        return meta.bsp === filterBsp.toLowerCase();
      });
    }

    // 3. Filter by Branch
    if (filterBranch !== 'All') {
      list = list.filter(tpl => {
        const meta = parseTemplateMeta(tpl.company);
        return meta.branch.toLowerCase().includes(filterBranch.toLowerCase());
      });
    }

    return list;
  }, [templates, templateSearch, filterBsp, filterBranch]);

  // Total pages
  const totalTemplatePages = Math.max(1, Math.ceil(filteredTemplates.length / templatePerPage));

  // Current page items
  const paginatedTemplates = React.useMemo(() => {
    const startIdx = (templatePage - 1) * templatePerPage;
    return filteredTemplates.slice(startIdx, startIdx + templatePerPage);
  }, [filteredTemplates, templatePage, templatePerPage]);

  // Keep page within bounds when filters change
  useEffect(() => {
    if (templatePage > totalTemplatePages) {
      setTemplatePage(totalTemplatePages);
    }
  }, [totalTemplatePages, templatePage]);

  // Selection handlers
  const handleToggleSelectTemplate = (id) => {
    setSelectedTemplateIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisibleTemplates = () => {
    const visibleIds = paginatedTemplates.map(t => t.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTemplateIds.includes(id));
    if (allSelected) {
      setSelectedTemplateIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTemplateIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleSelectAllFilteredTemplates = () => {
    const allFilteredIds = filteredTemplates.map(t => t.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedTemplateIds.includes(id));
    if (allSelected) {
      setSelectedTemplateIds([]);
    } else {
      setSelectedTemplateIds(allFilteredIds);
    }
  };

  const handleBulkDeleteTemplates = async () => {
    if (selectedTemplateIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedTemplateIds.length} selected template(s)? Automations linked to them may break.`)) return;
    setDeletingBulkTemplates(true);
    let successCount = 0;
    for (const id of selectedTemplateIds) {
      const res = await deleteWhatsappTemplate(id);
      if (res.success) successCount++;
    }
    setDeletingBulkTemplates(false);
    setSelectedTemplateIds([]);
    alert(`Successfully deleted ${successCount} template(s).`);
    loadAllData();
  };

  // --- AUTOMATIONS LOGIC ---
  const handleSaveAutomation = async () => {
    if (!currentAuto.template_id) {
      alert('Please select a template');
      return;
    }
    if (!currentAuto.stage_name) {
      alert('Please select a target stage');
      return;
    }
    setSavingAuto(true);
    const res = await saveWhatsappAutomation(currentAuto);
    if (res.success) {
      setShowAutoForm(false);
      setCurrentAuto({ stage_name: '', template_id: '', frequency: 'Once', company: 'All', is_active: true });
      const autoRes = await getWhatsappAutomations();
      if (autoRes.success && Array.isArray(autoRes.data)) {
        setAutomations(autoRes.data);
      }
    } else {
      alert('Error saving automation: ' + res.error);
    }
    setSavingAuto(false);
  };

  const handleDeleteAutomation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    const res = await deleteWhatsappAutomation(id);
    if (res.success) {
      setSelectedAutoIds(prev => prev.filter(x => x !== id));
      const autoRes = await getWhatsappAutomations();
      if (autoRes.success && Array.isArray(autoRes.data)) {
        setAutomations(autoRes.data);
      }
    } else {
      alert('Error deleting automation: ' + res.error);
    }
  };

  const handleToggleSelectAuto = (id) => {
    setSelectedAutoIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllAutomations = () => {
    if (filteredAutomations.length === 0) return;
    const visibleIds = paginatedAutomations.map(a => a.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedAutoIds.includes(id));
    if (allVisibleSelected) {
      setSelectedAutoIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedAutoIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkToggleAutoStatus = async (isActive) => {
    if (selectedAutoIds.length === 0) return;
    const actionName = isActive ? 'activate' : 'pause';
    if (!window.confirm(`Are you sure you want to ${actionName} ${selectedAutoIds.length} selected rule(s)?`)) return;
    
    setUpdatingBulkAuto(true);
    // Optimistic update
    setAutomations(prev => prev.map(a => selectedAutoIds.includes(a.id) ? { ...a, is_active: isActive } : a));

    const res = await bulkUpdateWhatsappAutomationStatus(selectedAutoIds, isActive);
    if (!res.success) {
      alert(`Error updating rules: ${res.error}`);
      // Revert from server
      const autoRes = await getWhatsappAutomations();
      if (autoRes.success && Array.isArray(autoRes.data)) {
        setAutomations(autoRes.data);
      }
    }
    setUpdatingBulkAuto(false);
    setSelectedAutoIds([]);
  };

  const handleQuickToggleAutoStatus = async (auto) => {
    const newStatus = !auto.is_active;
    // Optimistic update
    setAutomations(prev => prev.map(a => a.id === auto.id ? { ...a, is_active: newStatus } : a));

    const res = await toggleWhatsappAutomationStatus(auto.id, newStatus);
    if (!res.success) {
      alert(`Error changing rule status: ${res.error}`);
      setAutomations(prev => prev.map(a => a.id === auto.id ? { ...a, is_active: auto.is_active } : a));
    }
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
    <CRMPage style={{ minHeight: '80vh' }}>
      
      {/* Enterprise B2B SaaS Segmented Sub-Tab Navigation */}
      <CRMTabs id="wa-official" label="WhatsApp Official pages" items={visibleTabs} value={activeTab} onChange={handleTabChange} />
      <CRMTabPanel tabsId="wa-official" value={activeTab}>

      {activeTab === 'sent_logs' && visibleTabs.some(tab => tab.id === 'sent_logs') && (
        <ErrorBoundary>
          <WhatsappOfficialMessageLogs
            userId={userId}
            tenantId={tenantId}
            userCompany={userCompany}
            userRole={userRole}
            moduleAccess={moduleAccess}
            isMasterAdmin={isMasterAdmin}
            isActive={isActive}
            allowedLogViews={allowedLogViews}
          />
        </ErrorBoundary>
      )}

      {/* SETTINGS, CATALOG & ALLOCATIONS TABS */}
      {['settings', 'catalog', 'allocations'].includes(activeTab) && (
        <div style={{ minWidth: 0 }}>
          <CRMPageHeader icon={activeTab === 'catalog' ? Layers : activeTab === 'allocations' ? Users : Settings}
            title={activeTab === 'catalog' ? 'Master BSP Gateway Catalog (20+ Gateways)' : activeTab === 'allocations' ? 'Client & Branch WhatsApp Allocation Matrix' : 'WhatsApp API Credentials & Gateway Setup'}
            description={activeTab === 'catalog' ? 'Browse official WhatsApp Business Solution Providers (BSPs) or add custom HTTP webhook gateways.' : activeTab === 'allocations' ? 'Assign permitted BSP gateways and default sender endpoints to each Headquarters and Operational Branch Office.' : isAdmin ? 'Configure official WhatsApp Business API credentials per Headquarters and Branch Office.' : 'Configure official WhatsApp Business API credentials for your assigned workspace.'}
            actions={isClientScoped && <CRMStatusBadge tone="info"><Building2 size={12} /> Workspace: {userCompany || 'New Swan Group'}</CRMStatusBadge>} />

          {/* ======================================================== */}
          {/* TIER 1: MASTER BSP CATALOG (ALL 20+ GLOBAL GATEWAYS)    */}
          {/* ======================================================== */}
          {isMasterAdmin && activeTab === 'catalog' && (
            <div>
              {/* TOP ACTIONS & SEARCH */}
              <CRMToolbar style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input className={crmStyles.field}
                      type="text"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search by BSP name, category, or vendor (e.g. Twilio, Gupshup, Meta, Infobip)..."
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {enabledProviders.length} of {combinedCatalog.length} Active
                  </span>
                  {settingsPerms.edit && (
                    <button className={crmStyles.button}
                      type="button"
                      onClick={handleOpenAddCustomBsp}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem 0.9rem',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        color: 'var(--accent-color, #2563eb)',
                        border: '1px solid rgba(37, 99, 235, 0.3)',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={16} /> Add Custom BSP Gateway
                    </button>
                  )}
                </div>
              </CRMToolbar>

              {/* GLOBAL BSP GRID */}
              <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {combinedCatalog
                  .filter(b => {
                    if (!catalogSearch.trim()) return true;
                    const q = catalogSearch.toLowerCase();
                    return (
                      b.name?.toLowerCase().includes(q) ||
                      b.id?.toLowerCase().includes(q) ||
                      b.vendor?.toLowerCase().includes(q) ||
                      b.category?.toLowerCase().includes(q)
                    );
                  })
                  .map(b => {
                    const isEnabled = enabledProviders.includes(b.id);
                    return (
                      <CRMCard className={`${crmStyles.interactiveCard}`} data-selected={isEnabled}
                        key={b.id}
                        style={{
                          padding: '1.15rem',
                          borderRadius: '10px',
                          border: isEnabled ? (b.isCustom ? '2px solid #8b5cf6' : '2px solid var(--accent-color, #2563eb)') : '1px solid var(--border-light)',
                          backgroundColor: isEnabled ? (b.isCustom ? 'rgba(139, 92, 246, 0.04)' : 'rgba(37, 99, 235, 0.04)') : 'var(--bg-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: isEnabled ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                              {b.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              {b.vendor || 'Independent Provider'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                            {b.hasOverride && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.45rem',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(234, 88, 12, 0.15)',
                                color: '#ea580c',
                                border: '1px solid rgba(234, 88, 12, 0.3)'
                              }}>
                                ⚡ Upgraded
                              </span>
                            )}
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: b.isCustom ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface)',
                              color: b.isCustom ? '#7c3aed' : 'var(--text-secondary)',
                              border: '1px solid var(--border-light)'
                            }}>
                              {b.category || (b.isCustom ? 'Custom BSP' : 'Meta BSP')}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.35', minHeight: '38px' }}>
                          {b.note || 'Meta verified WhatsApp Business Solution Provider gateway.'}
                        </div>

                        <div style={{ fontSize: '0.72rem', backgroundColor: 'var(--bg-surface)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-color, #2563eb)' }}>{b.method || 'POST'}</span> {b.default_endpoint || b.endpoint_url || 'Endpoint configured in credentials'}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {b.website && (
                              <a
                                href={b.website}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.74rem', color: 'var(--accent-color, #2563eb)', textDecoration: 'none', fontWeight: 600 }}
                              >
                                Docs <ExternalLink size={12} />
                              </a>
                            )}
                            {settingsPerms.edit && (
                              <button className={crmStyles.button}
                                type="button"
                                onClick={(e) => handleOpenEditBsp(b, e)}
                                style={{ background: 'none', border: 'none', color: b.hasOverride ? '#ea580c' : (b.isCustom ? '#7c3aed' : 'var(--accent-color, #2563eb)'), fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                title="Edit / Upgrade API endpoint, method, headers, or payload template"
                              >
                                <Edit3 size={12} /> {b.hasOverride ? 'Edit Upgrade' : 'Edit / Upgrade'}
                              </button>
                            )}
                            {b.hasOverride && settingsPerms.edit && (
                              <button className={crmStyles.button}
                                type="button"
                                onClick={(e) => handleResetBspOverride(b.id, b.name, e)}
                                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                title="Reset back to official catalog defaults"
                              >
                                <RotateCcw size={12} /> Reset
                              </button>
                            )}
                            {b.isCustom && settingsPerms.edit && (
                              <button className={crmStyles.button}
                                type="button"
                                onClick={(e) => handleDeleteCustomBsp(b.id, b.name, e)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.74rem', cursor: 'pointer' }}
                                title="Delete custom BSP"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>

                          {settingsPerms.edit && (
                            <button className={crmStyles.button}
                              type="button"
                              onClick={() => toggleProvider(b.id)}
                              style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '6px',
                                border: isEnabled ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                                backgroundColor: isEnabled ? 'var(--accent-color, #2563eb)' : 'transparent',
                                color: isEnabled ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}
                            >
                              {isEnabled ? <CheckCircle2 size={14} /> : null}
                              {isEnabled ? 'Active Gateway' : 'Enable'}
                            </button>
                          )}
                        </div>
                      </CRMCard>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TIER 2: CLIENT / WORKSPACE ALLOCATION MATRIX            */}
          {/* ======================================================== */}
          {isMasterAdmin && (activeTab === 'allocations' || (activeTab === 'settings' && activeAdminSubTab === 'allocations')) && (
            <div style={{ marginBottom: '2rem' }}>
              <CRMCard style={{
                padding: '1.25rem', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '10px', 
                border: '1px solid var(--border-light)',
                marginBottom: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Headquarters & Branch WhatsApp Gateway Allocation Matrix
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Assign permitted BSP gateways and default sender endpoints to each Headquarters and Operational Branch Office. Workspace users in that branch will strictly route through their assigned gateways.
                    </p>
                  </div>

                  {/* 2 LINKED CASCADING FILTERS: HEADQUARTERS -> USKE ANUSAR BRANCH */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    {/* FILTER 1: HEADQUARTERS */}
                    <div className={crmStyles.scopeField} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>🏢</span> Headquarters:
                      </label>
                      <select className={crmStyles.field}
                        value={selectedHqForAllocation}
                        onChange={(e) => handleHqChange(e.target.value)}
                        style={{
                          padding: '0.55rem 0.85rem',
                          borderRadius: '6px',
                          border: '1.5px solid var(--accent-color, #2563eb)',
                          backgroundColor: 'var(--bg-surface)',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          color: 'var(--text-primary)',
                          minWidth: '220px',
                          cursor: 'pointer'
                        }}
                      >
                        {hqOptions.map(hq => (
                          <option key={hq.code} value={hq.code}>
                            {hq.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* FILTER 2: USKE ANUSAR BRANCH / OFFICE */}
                    <div className={crmStyles.scopeField} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>🏭</span> Branch / Office:
                      </label>
                      <select className={crmStyles.field}
                        value={selectedClientForAllocation}
                        onChange={(e) => setSelectedClientForAllocation(e.target.value)}
                        style={{
                          padding: '0.55rem 0.85rem',
                          borderRadius: '6px',
                          border: '1.5px solid var(--accent-color, #2563eb)',
                          backgroundColor: 'var(--bg-surface)',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          color: 'var(--text-primary)',
                          minWidth: '240px',
                          cursor: 'pointer'
                        }}
                      >
                        {branchOptionsForSelectedHq.length > 0 ? (
                          branchOptionsForSelectedHq.map(b => (
                            <option key={b.id || b.code} value={b.code || b.name}>
                              {b.name}
                            </option>
                          ))
                        ) : (
                          <option value={selectedHqForAllocation}>
                            {selectedHqForAllocation} (Headquarters)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SELECTED CLIENT CONFIGURATION BOX */}
                <CRMCard style={{
                  padding: '1rem', 
                  borderRadius: '8px', 
                  backgroundColor: 'var(--bg-surface)', 
                  border: '1px solid var(--border-light)',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                      Assigned BSP Gateways for: <span style={{ color: 'var(--accent-color, #2563eb)' }}>{selectedClientForAllocation}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className={crmStyles.button}
                        type="button"
                        onClick={() => {
                          const allIds = [...catalog, ...customBsps].map(b => b.id);
                          setClientAllocations(prev => ({
                            ...prev,
                            [selectedClientForAllocation]: {
                              ...(prev[selectedClientForAllocation] || {}),
                              allowed_bsps: allIds,
                              default_bsp: allIds[0] || 'aisensy',
                              account_limit: allIds.length
                            }
                          }));
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                      >
                        Select All 20+
                      </button>
                      <button className={crmStyles.button}
                        type="button"
                        onClick={() => {
                          setClientAllocations(prev => ({
                            ...prev,
                            [selectedClientForAllocation]: {
                              ...(prev[selectedClientForAllocation] || {}),
                              allowed_bsps: ['aisensy', 'nextel'],
                              default_bsp: 'aisensy',
                              account_limit: 2
                            }
                          }));
                        }}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                      >
                        Reset to Standard (AiSensy + Nextel)
                      </button>
                    </div>
                  </div>

                  {/* CHECKBOX MATRIX OF ALL 20+ BSPS */}
                  <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
                    {[...catalog, ...customBsps].map(b => {
                      const isAllowed = (currentClientAlloc.allowed_bsps || []).includes(b.id);
                      return (
                        <div
                          key={b.id}
                          onClick={() => toggleClientBsp(b.id)}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: '6px',
                            border: isAllowed ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                            backgroundColor: isAllowed ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            userSelect: 'none'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.84rem', color: isAllowed ? 'var(--accent-color, #2563eb)' : 'var(--text-primary)' }}>
                              {b.name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {b.category || 'Official BSP'}
                            </div>
                          </div>
                          {isAllowed ? (
                            <CheckCircle2 size={16} color="var(--accent-color, #2563eb)" />
                          ) : (
                            <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid var(--border-light)' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* CLIENT DEFAULT GATEWAY & ACCOUNT LIMIT */}
                  <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                        Client Default BSP Gateway:
                      </label>
                      <select className={crmStyles.field}
                        value={currentClientAlloc.default_bsp || (currentClientAlloc.allowed_bsps || [])[0] || 'aisensy'}
                        onChange={(e) => setClientDefaultBsp(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem', fontWeight: 600 }}
                      >
                        {(currentClientAlloc.allowed_bsps || []).map(pId => (
                          <option key={pId} value={pId}>
                            {getBspDisplayName(pId)} (Client Default)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                        Allowed Active Account Limit:
                      </label>
                      <input className={crmStyles.field}
                        type="number"
                        min="1"
                        max="20"
                        value={currentClientAlloc.account_limit || 1}
                        onChange={(e) => setClientAccountLimit(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </CRMCard>

                {/* SAVE ALLOCATION BUTTON & FEEDBACK */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className={crmStyles.button}
                    type="button"
                    onClick={handleSaveClientAllocations}
                    disabled={savingAllocations}
                    style={{
                      padding: '0.65rem 1.4rem',
                      borderRadius: '6px',
                      backgroundColor: 'var(--accent-color, #2563eb)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      cursor: savingAllocations ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem'
                    }}
                  >
                    <Save size={16} /> {savingAllocations ? 'Saving Allocations...' : `Save Allocations for ${selectedClientForAllocation}`}
                  </button>

                  {allocationFeedback && (
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: allocationFeedback.success ? '#10b981' : '#ef4444' }}>
                      {allocationFeedback.message}
                    </span>
                  )}
                </div>
              </CRMCard>

              {/* OVERVIEW TABLE OF ALL ALLOCATIONS WITH HQ FILTER & RESIZABLE COLUMNS */}
              <CRMCard style={{ padding: '1.25rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
                      Active Headquarters & Branch Allocation Matrix Overview
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      All registered headquarters and branch units with assigned WhatsApp gateways.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        Filter by Headquarters:
                      </label>
                      <select className={crmStyles.field}
                        value={overviewTableHqFilter}
                        onChange={(e) => { setOverviewTableHqFilter(e.target.value); setAllocationPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-surface)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="All">All Headquarters ({allClients.length})</option>
                        {hqOptions.map(hq => (
                          <option key={hq.code} value={hq.code}>{hq.name}</option>
                        ))}
                      </select>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.25rem 0.65rem', borderRadius: '12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      {filteredTableClients.length} Offices
                    </span>
                  </div>
                </div>

                <div className={crmStyles.tableScroll} style={{ overflowX: 'auto' }}>
                  <table data-column-resize-managed="true" className={crmStyles.table} style={{ width: allocationResize.getTotalTableWidth(), borderCollapse: 'collapse', fontSize: '0.83rem', tableLayout: 'fixed' , minWidth: allocationResize.getTotalTableWidth()}}>
                  <colgroup>{Object.entries(allocationResize.colWidths).map(([key, width]) => <col key={key} style={{ width }} />)}</colgroup>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        {/* 1. Office Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.office }}>
                          <span>Headquarters / Branch Office</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="office" isResizing={allocationResize.resizingCol === 'office'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>

                        {/* 2. Type Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.type }}>
                          <span>Office Type</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="type" isResizing={allocationResize.resizingCol === 'type'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>

                        {/* 3. Assigned BSPs Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.bsps }}>
                          <span>Assigned BSP Gateways</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="bsps" isResizing={allocationResize.resizingCol === 'bsps'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>

                        {/* 4. Default Gateway Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.defaultBsp }}>
                          <span>Default Gateway</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="defaultBsp" isResizing={allocationResize.resizingCol === 'defaultBsp'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>

                        {/* 5. Quota Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.quota }}>
                          <span>Quota</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="quota" isResizing={allocationResize.resizingCol === 'quota'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>

                        {/* 6. Action Header */}
                        <th scope="col" style={{ width: allocationResize.colWidths.action }}>
                          <span>Action</span>

                        <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="action" isResizing={allocationResize.resizingCol === 'action'} onResizeStart={allocationResize.handleResizeStart} onReset={allocationResize.resetColWidth} /></span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTableClients.map(c => {
                        const alloc = clientAllocations[c.code] || clientAllocations[c.name] || getInitialClientAlloc(c.code);
                        const isHQ = c.type === 'headquarters';
                        const isNstlp = (c.code || '').toUpperCase().includes('NSTLP');
                        return (
                          <tr key={c.id || c.code} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                              {c.name}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <span style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                backgroundColor: isHQ ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: isHQ ? 'var(--accent-color, #2563eb)' : '#059669',
                                border: isHQ ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
                                whiteSpace: 'nowrap'
                              }}>
                                {isHQ ? '🏢 Headquarters' : '🏭 Branch Office'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {(alloc.allowed_bsps || []).map(pId => (
                                  <span key={pId} style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-color, #2563eb)', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {getBspDisplayName(pId)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                              <span style={{
                                color: isNstlp || alloc.default_bsp === 'nextel' ? '#7c3aed' : 'var(--accent-color, #2563eb)',
                                fontWeight: 700
                              }}>
                                {getBspDisplayName(alloc.default_bsp)}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                              {alloc.account_limit || (alloc.allowed_bsps || []).length} gateway(s)
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button className={crmStyles.button}
                                  type="button"
                                  onClick={() => {
                                    if (c.hqCode) setSelectedHqForAllocation(c.hqCode);
                                    setSelectedClientForAllocation(c.code || c.name);
                                    window.scrollTo({ top: 150, behavior: 'smooth' });
                                  }}
                                  style={{ padding: '0.3rem 0.55rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                                <button className={crmStyles.button}
                                  type="button"
                                  onClick={() => {
                                    if (c.hqCode) setSelectedHqForCredentials(c.hqCode);
                                    const code = c.code || c.name;
                                    setSelectedClientForCredentials(code);
                                    loadClientCredentials(code);
                                    handleTabChange('settings');
                                  }}
                                  style={{ padding: '0.3rem 0.55rem', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)', backgroundColor: 'rgba(37, 99, 235, 0.08)', color: 'var(--accent-color, #2563eb)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                  title="Configure API Keys for this office"
                                >
                                  <Key size={12} /> Keys
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <StandardTablePagination className={crmStyles.pagination} currentPage={currentAllocationPage} totalRecords={filteredTableClients.length} pageSize={allocationPageSize} onPageChange={setAllocationPage} onPageSizeChange={setAllocationPageSize} />
              </CRMCard>
            </div>
          )}

          {/* ======================================================== */}
          {/* TIER 3: WORKSPACE API SETUP & CREDENTIALS               */}
          {/* ======================================================== */}
          {(!isAdmin || activeTab === 'settings') && (() => {
            const activeClientObj = allClients.find(c => 
              (c.code || '').toLowerCase() === (selectedClientForCredentials || '').toLowerCase() || 
              (c.name || '').toLowerCase() === (selectedClientForCredentials || '').toLowerCase()
            );
            const activeClientName = activeClientObj?.name || selectedClientForCredentials || userCompany || 'New Swan Group';
            const targetClientStr = String(selectedClientForCredentials || userCompany || 'NEW_SWAN_GROUP').toUpperCase();
            const isNewSwan = targetClientStr === 'NEW_SWAN_GROUP' || targetClientStr.includes('NSMLR') || targetClientStr.includes('NSTLP') || targetClientStr.includes('NEW SWAN');

            return (
              <div>
                {/* 2 LINKED CASCADING FILTERS FOR CREDENTIALS: HEADQUARTERS -> USKE ANUSAR BRANCH */}
                {isMasterAdmin && (
                  <div style={{
                    marginBottom: '1.5rem',
                    padding: '1.15rem 1.25rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1.5px solid rgba(37, 99, 235, 0.25)',
                    borderRadius: '10px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                        <Building2 size={18} color="var(--accent-color, #2563eb)" />
                        Select Workspace to Configure API Keys:
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Choose Headquarters and Branch Office to manage its dedicated WhatsApp API credentials.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      {/* FILTER 1: HEADQUARTERS */}
                      <div className={crmStyles.scopeField} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>🏢</span> Headquarters:
                        </label>
                        <select className={crmStyles.field}
                          value={selectedHqForCredentials}
                          onChange={(e) => handleCredentialsHqChange(e.target.value)}
                          style={{
                            padding: '0.55rem 0.85rem',
                            borderRadius: '6px',
                            border: '1.5px solid var(--accent-color, #2563eb)',
                            backgroundColor: 'var(--bg-surface)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: 'var(--text-primary)',
                            minWidth: '200px',
                            cursor: 'pointer'
                          }}
                        >
                          {hqOptions.map(hq => (
                            <option key={hq.code} value={hq.code}>
                              {hq.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* FILTER 2: BRANCH / OFFICE */}
                      <div className={crmStyles.scopeField} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>🏭</span> Branch / Office:
                        </label>
                        <select className={crmStyles.field}
                          value={selectedClientForCredentials}
                          onChange={(e) => handleCredentialsClientChange(e.target.value)}
                          style={{
                            padding: '0.55rem 0.85rem',
                            borderRadius: '6px',
                            border: '1.5px solid var(--accent-color, #2563eb)',
                            backgroundColor: 'var(--bg-surface)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: 'var(--text-primary)',
                            minWidth: '230px',
                            cursor: 'pointer'
                          }}
                        >
                          {branchOptionsForSelectedCredentialsHq.length > 0 ? (
                            branchOptionsForSelectedCredentialsHq.map(b => (
                              <option key={b.id || b.code} value={b.code || b.name}>
                                {b.name}
                              </option>
                            ))
                          ) : (
                            <option value={selectedHqForCredentials}>
                              {selectedHqForCredentials} (Headquarters)
                            </option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACTIVE WORKSPACE STATUS BADGE */}
                <div style={{ 
                  marginBottom: '1.25rem', 
                  padding: '0.85rem 1.15rem', 
                  backgroundColor: isNewSwan ? 'rgba(37, 99, 235, 0.07)' : 'rgba(16, 185, 129, 0.08)', 
                  border: isNewSwan ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid rgba(16, 185, 129, 0.3)', 
                  borderRadius: '8px', 
                  fontSize: '0.83rem', 
                  color: isNewSwan ? '#1e40af' : '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  <div>
                    🔒 <strong>Active Workspace:</strong> Configuring credentials for <strong>{activeClientName}</strong>
                    {assignedBsps.length > 0 && ` (${assignedBsps.length} assigned gateway(s))`}.
                  </div>
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>
                    {isNewSwan ? '🏢 Global & Master Internal Routing' : '🏭 Dedicated Isolated Tenant'}
                  </span>
                </div>

                {/* OPTION C: PRIMARY DEFAULT PROVIDER SELECTOR */}
                <CRMToolbar style={{
                  marginBottom: '1.5rem', 
                  padding: '1rem 1.25rem', 
                  backgroundColor: 'var(--bg-primary)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '8px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      Primary Default Dispatch Gateway for {activeClientName}
                    </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    When a template or campaign has no specific provider selected, messages will dispatch through this primary gateway.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select className={crmStyles.field}
                    value={defaultProvider}
                    onChange={(e) => setDefaultProvider(e.target.value)}
                    disabled={!settingsPerms.edit}
                    style={{ 
                      padding: '0.5rem 0.85rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-light)', 
                      backgroundColor: 'var(--bg-surface)', 
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).map(p => (
                      <option key={p} value={p}>
                        {getBspDisplayName(p)} (Default)
                      </option>
                    ))}
                  </select>
                </div>
              </CRMToolbar>

              {/* CREDENTIALS CARDS */}
              {/* 1. Meta Direct */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('meta') && (
                <CRMCard style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#2563eb' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Meta Cloud API Credentials (v21.0)</h3>
                  </div>
                  <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                        Phone Number ID <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input className={crmStyles.field}
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
                      <input className={crmStyles.field}
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
                      <button className={crmStyles.button}
                        type="button" 
                        onClick={() => setShowSecretToken(!showSecretToken)} 
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
                      >
                        {showSecretToken ? <EyeOff size={14} /> : <Eye size={14} />} {showSecretToken ? 'Hide Token' : 'Show Token'}
                      </button>
                    </div>
                    <textarea className={crmStyles.field}
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
                </CRMCard>
              )}

              {/* 2. AiSensy */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('aisensy') && (
                <CRMCard style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#0284c7' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>AiSensy WhatsApp API Credentials {isNewSwan ? '(NSMLR / Global)' : `(${activeClientName})`}</h3>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      AiSensy API Key <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea className={crmStyles.field}
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
                    <input className={crmStyles.field}
                      type="text"
                      value={aisensyConfig.user_name}
                      onChange={(e) => setAisensyConfig({ ...aisensyConfig, user_name: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder={`e.g. ${activeClientName}`}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                    />
                  </div>
                </CRMCard>
              )}

              {/* 3. Interakt */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('interakt') && (
                <CRMCard style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#7c3aed' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Interakt (Jio Haptik) API Credentials</h3>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      Interakt Secret API Key <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input className={crmStyles.field}
                      type="password"
                      value={interaktConfig.api_key}
                      onChange={(e) => setInteraktConfig({ ...interaktConfig, api_key: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder="e.g. a1b2c3d4e5f6..."
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                </CRMCard>
              )}

              {/* 4. Wati */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('wati') && (
                <CRMCard style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#059669' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Wati (Clare.ai) API Credentials</h3>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      Wati API Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input className={crmStyles.field}
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
                    <textarea className={crmStyles.field}
                      value={watiConfig.access_token}
                      onChange={(e) => setWatiConfig({ ...watiConfig, access_token: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder="Bearer token from Wati..."
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.82rem', minHeight: '65px' }}
                    />
                  </div>
                </CRMCard>
              )}

              {/* 5. Nextel */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('nextel') && (
                <CRMCard style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Nextel.io API Credentials {isNewSwan ? '(NSTLP)' : `(${activeClientName})`}</h3>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                      Nextel Session Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea className={crmStyles.field}
                      value={nextelConfig.endpoint_url}
                      onChange={(e) => setNextelConfig({ ...nextelConfig, endpoint_url: e.target.value })}
                      disabled={!settingsPerms.edit}
                      placeholder="https://api.nextel.io/API_V2/Whatsapp/send_session/..."
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.82rem', minHeight: '75px' }}
                    />
                  </div>
                </CRMCard>
              )}

              {/* 6. ALL OTHER GLOBAL CATALOG BSPS (Gupshup, Twilio, DoubleTick, Gallabox, Infobip, Kaleyra, CM.com, MessageBird, Sinch, Zoko, Yellow.ai, Karix, ValueFirst, BhashSMS) */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders)
                .filter(pId => !['meta', 'aisensy', 'interakt', 'wati', 'nextel'].includes(pId) && !pId.startsWith('custom_'))
                .map(pId => {
                  const bspInfo = catalog.find(b => b.id === pId) || { id: pId, name: pId.toUpperCase() };
                  const creds = bspCredentials[pId] || {};
                  return (
                    <CRMCard key={pId} style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0284c7' }}>
                          <ShieldCheck size={20} />
                          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{bspInfo.name} API Credentials</h3>
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                            {bspInfo.category || 'Meta BSP'}
                          </span>
                        </div>
                        {bspInfo.website && (
                          <a href={bspInfo.website} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--accent-color, #2563eb)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                            Provider Console <ExternalLink size={12} />
                          </a>
                        )}
                      </div>

                      <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                            API Key / Auth Token <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input className={crmStyles.field}
                            type="password"
                            value={creds.api_key || creds.access_token || ''}
                            onChange={(e) => handleUpdateBspCredential(pId, 'api_key', e.target.value)}
                            disabled={!settingsPerms.edit}
                            placeholder="Enter API Key / Token"
                            style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                            API Endpoint URL
                          </label>
                          <input className={crmStyles.field}
                            type="text"
                            value={creds.endpoint_url || bspInfo.default_endpoint || ''}
                            onChange={(e) => handleUpdateBspCredential(pId, 'endpoint_url', e.target.value)}
                            disabled={!settingsPerms.edit}
                            placeholder={bspInfo.default_endpoint || 'https://api.provider.com/...'}
                            style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>

                      {/* Provider Specific Helper Fields */}
                      {pId === 'twilio' && (
                        <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Twilio Account SID
                            </label>
                            <input className={crmStyles.field}
                              type="text"
                              value={creds.account_sid || ''}
                              onChange={(e) => handleUpdateBspCredential(pId, 'account_sid', e.target.value)}
                              disabled={!settingsPerms.edit}
                              placeholder="AC..."
                              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Twilio From WhatsApp Number
                            </label>
                            <input className={crmStyles.field}
                              type="text"
                              value={creds.from_number || ''}
                              onChange={(e) => handleUpdateBspCredential(pId, 'from_number', e.target.value)}
                              disabled={!settingsPerms.edit}
                              placeholder="+14155238886"
                              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                            />
                          </div>
                        </div>
                      )}

                      {pId === 'gupshup' && (
                        <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Gupshup App Name
                            </label>
                            <input className={crmStyles.field}
                              type="text"
                              value={creds.app_name || ''}
                              onChange={(e) => handleUpdateBspCredential(pId, 'app_name', e.target.value)}
                              disabled={!settingsPerms.edit}
                              placeholder="e.g. MyWhatsAppApp"
                              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Source / Sender Number
                            </label>
                            <input className={crmStyles.field}
                              type="text"
                              value={creds.source_number || ''}
                              onChange={(e) => handleUpdateBspCredential(pId, 'source_number', e.target.value)}
                              disabled={!settingsPerms.edit}
                              placeholder="e.g. 919876543210"
                              style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }}
                            />
                          </div>
                        </div>
                      )}
                    </CRMCard>
                  );
                })}

              {/* 7. CUSTOM BSPS */}
              {customBsps.filter(b => ((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes(b.id)).map(cb => (
                <div key={cb.id} style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed' }}>
                      <Globe size={20} />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{cb.name} Gateway Configuration</h3>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#6d28d9' }}>Custom BSP</span>
                    </div>
                    {settingsPerms.edit && (
                      <button className={crmStyles.button}
                        type="button"
                        onClick={(e) => handleOpenEditCustomBsp(cb, e)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.4rem 0.8rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          border: '1px solid #8b5cf6',
                          backgroundColor: 'transparent',
                          color: '#7c3aed',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit3 size={14} /> Edit Endpoint & Payload Template
                      </button>
                    )}
                  </div>
                  <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                        API Endpoint URL:
                      </label>
                      <div style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', fontFamily: 'monospace', fontSize: '0.82rem', wordBreak: 'break-all' }}>
                        <span style={{ fontWeight: 700, color: '#7c3aed', marginRight: '0.4rem' }}>{cb.method || 'POST'}</span> {cb.endpoint_url}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                        Authentication:
                      </label>
                      <div style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', fontSize: '0.82rem' }}>
                        {cb.auth_type === 'Bearer' ? 'Bearer Token' : cb.auth_type === 'HeaderKey' ? `Header (${cb.auth_header_name || 'apikey'})` : cb.auth_type === 'Basic' ? 'Basic Auth' : 'None / URL'}
                        {' '}• {cb.auth_token ? '•••••••• (Configured)' : 'No Token'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                      Payload Template Format:
                    </label>
                    <pre style={{ margin: 0, padding: '0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', fontFamily: 'monospace', fontSize: '0.78rem', maxHeight: '110px', overflowY: 'auto' }}>
                      {cb.payload_format}
                    </pre>
                  </div>
                </div>
              ))}

              {/* DUAL COMPANY BACKWARD COMPATIBILITY / DEDICATED TENANT NOTICE */}
              {isNewSwan ? (
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
              ) : (
                <div style={{ 
                  marginBottom: '1.5rem', 
                  padding: '1rem 1.25rem', 
                  backgroundColor: 'rgba(16, 185, 129, 0.05)', 
                  border: '1px dashed rgba(16, 185, 129, 0.35)', 
                  borderRadius: '8px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', color: '#059669', fontWeight: 600, fontSize: '0.88rem' }}>
                    <ShieldCheck size={16} /> Dedicated Tenant Credentials ({activeClientName})
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                    Credentials configured here are securely isolated and dedicated exclusively to <strong>{activeClientName}</strong>. All broadcasts and automated templates for this company/branch will dispatch using these API keys.
                  </p>
                </div>
              )}

              {/* LIVE TEST CONNECTION CARD */}
              <CRMCard style={{
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
                  Select an enabled provider and verify connectivity before broadcasting messages.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: testFeedback ? '0.75rem' : 0 }}>
                  <select className={crmStyles.field}
                    value={testProvider}
                    onChange={(e) => setTestProvider(e.target.value)}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-surface)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)'
                    }}
                  >
                    {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).map(p => (
                      <option key={p} value={p}>
                        Test {getBspDisplayName(p)} Gateway
                      </option>
                    ))}
                  </select>

                  <input className={crmStyles.field}
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Recipient Mobile (e.g. 9876543210)"
                    style={{ 
                      flex: '1 1 200px', 
                      padding: '0.65rem 0.85rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-light)', 
                      backgroundColor: 'var(--bg-surface)', 
                      fontSize: '0.85rem' 
                    }}
                  />
                  <button className={crmStyles.button}
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
                    {testingConnection ? 'Verifying...' : `Test ${getBspDisplayName(testProvider)}`}
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
              </CRMCard>

              {/* ACTION BUTTON */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: '0.5rem' }}>
                {settingsPerms.edit ? (
                  <button className={crmStyles.button}
                    onClick={() => handleSaveSettings()}
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
                    <Save size={18} /> {loading ? 'Saving Settings...' : `Save Configuration for ${activeClientName}`}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔒 Read-only view. Contact administrator to update API keys.</span>
                )}
              </div>
            </div>
          );
        })()}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div>
          <CRMPageHeader icon={MessageSquare} title="Message Templates Library" description="Create and manage official WhatsApp templates mapped to your Client Main Office / Branches and selected BSP provider." actions={templatesPerms.add && (
            <button type="button" onClick={handleOpenCreateTemplate} className={`${crmStyles.button} ${crmStyles.primaryButton}`}><Plus size={16} /> Create New Template</button>
          )} />

          {/* SEARCH, FILTERS, PER PAGE & VIEW MODE TOOLBAR */}
          <CRMToolbar >
            {/* LEFT: SEARCH INPUT */}
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
              <Search size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className={crmStyles.field}
                type="text"
                value={templateSearch}
                onChange={(e) => {
                  setTemplateSearch(e.target.value);
                  setTemplatePage(1);
                }}
                placeholder="Search templates by name, campaign, message, branch..."
                style={{
                  width: '100%',
                  padding: '0.55rem 2rem 0.55rem 2.2rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)'
                }}
              />
              {templateSearch && (
                <button className={crmStyles.button}
                  type="button"
                  onClick={() => { setTemplateSearch(''); setTemplatePage(1); }}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* MIDDLE: FILTERS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {/* Filter by BSP */}
              <select aria-label="Filter templates by gateway" className={crmStyles.field}
                value={filterBsp}
                onChange={(e) => {
                  setFilterBsp(e.target.value);
                  setTemplatePage(1);
                }}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                <option value="All">All BSP Gateways</option>
                {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).map(pId => (
                  <option key={pId} value={pId}>{getBspDisplayName(pId)}</option>
                ))}
              </select>

              {/* Filter by Branch */}
              <select aria-label="Filter templates by branch" className={crmStyles.field}
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setTemplatePage(1);
                }}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                <option value="All">All Offices / Branches</option>
                <option value="New Swan Group (Headquarters)">New Swan Group (Headquarters)</option>
                <option value="NSMLR">🏢 NSMLR</option>
                <option value="NSTLP">🏢 NSTLP</option>
                {branches.filter(b => !['New Swan Group', 'New Swan Group (Headquarters)', 'NSMLR', 'NSTLP'].includes(b.branch_name)).map(b => (
                  <option key={b.id || b.branch_name} value={b.branch_name}>
                    🏢 {b.branch_name}
                  </option>
                ))}
              </select>

              {/* PER PAGE SELECTOR */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Show:</span>
                <select aria-label="Templates per page" className={crmStyles.field}
                  value={templatePerPage}
                  onChange={(e) => {
                    const newLimit = parseInt(e.target.value, 10);
                    setTemplatePerPage(newLimit);
                    setTemplatePage(1);
                    try { localStorage.setItem('crm_wa_templates_per_page', String(newLimit)); } catch (_) {}
                  }}
                  style={{ padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  {templatePageSizes.map(size => <option key={size} value={size}>{size === 100000 ? 'All' : `${size} / page`}</option>)}
                </select>
              </div>

              {/* VIEW MODE TOGGLE */}
              <CRMViewToggle label="Template layout" value={templateViewMode} onChange={setTemplateViewMode} items={[{ id: 'grid', label: 'Grid', icon: LayoutGrid }, { id: 'table', label: 'Table', icon: List, title: 'Table Selection List View' }]} />
            </div>
          </CRMToolbar>

          {/* SELECTION ACTIONS BAR */}
          {selectedTemplateIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(37, 99, 235, 0.08)',
              border: '1.5px solid rgba(37, 99, 235, 0.35)',
              borderRadius: '8px',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-color, #2563eb)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckSquare size={16} />
                  {selectedTemplateIds.length} template(s) selected
                </span>

                <button className={crmStyles.button}
                  type="button"
                  onClick={handleSelectAllVisibleTemplates}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-color, #2563eb)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {paginatedTemplates.length > 0 && paginatedTemplates.every(t => selectedTemplateIds.includes(t.id)) ? 'Deselect Page' : `Select Page (${paginatedTemplates.length})`}
                </button>

                {filteredTemplates.length > paginatedTemplates.length && (
                  <button className={crmStyles.button}
                    type="button"
                    onClick={handleSelectAllFilteredTemplates}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--accent-color, #2563eb)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Select All {filteredTemplates.length} Matching
                  </button>
                )}

                <button className={crmStyles.button}
                  type="button"
                  onClick={() => setSelectedTemplateIds([])}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Clear Selection
                </button>
              </div>

              {templatesPerms.delete && (
                <button className={crmStyles.button}
                  type="button"
                  onClick={handleBulkDeleteTemplates}
                  disabled={deletingBulkTemplates}
                  style={{
                    padding: '0.45rem 0.85rem',
                    backgroundColor: '#fee2e2',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: deletingBulkTemplates ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Trash2 size={14} />
                  {deletingBulkTemplates ? 'Deleting...' : `Delete Selected (${selectedTemplateIds.length})`}
                </button>
              )}
            </div>
          )}

          {showTemplateForm && (
            <CRMCard style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.75rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1.15rem', fontWeight: 700 }}>
                {currentTemplate.id ? 'Edit Template' : 'Create New WhatsApp Template'}
              </h3>
              
              <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                {/* 1. Selected BSP Name */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    <Zap size={15} color="#2563eb" /> Selected BSP Provider
                  </label>
                  <select className={crmStyles.field}
                    value={selectedTemplateBsp} 
                    onChange={e => setSelectedTemplateBsp(e.target.value)} 
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    {isClientScoped && assignedBsps.length > 0 ? (
                      <optgroup label="Assigned BSP Gateways">
                        {assignedBsps.map(pId => (
                          <option key={pId} value={pId}>
                            {getBspDisplayName(pId)}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup label="Active Workspace Gateways">
                        {enabledProviders.map(pId => (
                          <option key={pId} value={pId}>
                            {getBspDisplayName(pId)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'block' }}>
                    Auto-selected to active workspace default ({getBspDisplayName(defaultProvider)}).
                  </span>
                </div>

                {/* 2. Client Main Office & Branch List */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    <Building2 size={15} color="#10b981" /> Client Office / Branch List
                  </label>
                  <select className={crmStyles.field}
                    value={selectedTemplateBranch} 
                    onChange={e => setSelectedTemplateBranch(e.target.value)} 
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    <option value="New Swan Group (Headquarters)">🏢 New Swan Group (Headquarters)</option>
                    <option value="NSMLR">🏢 NSMLR (Branch)</option>
                    <option value="NSTLP">🏢 NSTLP (Branch)</option>
                    <option value="All Branches (Universal)">🏢 All Branches (Universal)</option>
                    {branches.filter(b => !['New Swan Group', 'New Swan Group (Headquarters)', 'NSMLR', 'NSTLP'].includes(b.branch_name)).map(b => (
                      <option key={b.id || b.branch_name} value={b.branch_name}>
                        🏢 {b.branch_name} ({b.location_type || 'Branch'})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'block' }}>
                    New Swan Group (Headquarters) is selected by default.
                  </span>
                </div>

                {/* 3. Template Name */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    Template Name (CRM Display) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input className={crmStyles.field}
                    type="text" 
                    value={currentTemplate.template_name} 
                    onChange={e => setCurrentTemplate({...currentTemplate, template_name: e.target.value})} 
                    placeholder="e.g. welcome_offer" 
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.85rem' }} 
                  />
                </div>

                {/* 4. Campaign / API ID */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    API Campaign ID / Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input className={crmStyles.field}
                    type="text" 
                    value={currentTemplate.campaign_name} 
                    onChange={e => setCurrentTemplate({...currentTemplate, campaign_name: e.target.value})} 
                    placeholder="Exact template name in BSP" 
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: '0.85rem' }} 
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                  Message Content Body <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea className={crmStyles.field}
                  value={currentTemplate.message_body} 
                  onChange={e => setCurrentTemplate({...currentTemplate, message_body: e.target.value})} 
                  placeholder="Paste template message body here. Use {{1}} for customer name..." 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', minHeight: '120px', fontSize: '0.85rem' }} 
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                  Header Media Image Attachment (Optional)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ padding: '0.5rem 1rem', background: 'var(--th-hover-bg, #f1f5f9)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 500, border: '1px solid var(--border-light)' }}>
                    <Upload size={16} /> {uploadingImage ? 'Uploading...' : 'Upload Image File'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                  
                  {currentTemplate.image_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#10b981' }}>
                      <ImageIcon size={16} /> Image Attached
                      <img src={currentTemplate.image_url} alt="preview" style={{ height: '32px', width: '32px', objectFit: 'cover', borderRadius: '4px', marginLeft: '0.5rem', border: '1px solid #10b981' }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className={crmStyles.button}
                  onClick={handleSaveTemplate} 
                  disabled={loading} 
                  style={{ padding: '0.65rem 1.6rem', background: 'var(--accent-color, #2563eb)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
                >
                  {loading ? 'Saving...' : 'Save Template'}
                </button>
                <button className={crmStyles.button}
                  onClick={() => setShowTemplateForm(false)} 
                  style={{ padding: '0.65rem 1.4rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.88rem' }}
                >
                  Cancel
                </button>
              </div>
            </CRMCard>
          )}

          {/* TEMPLATES DISPLAY (GRID VIEW OR TABLE LIST VIEW) */}
          {paginatedTemplates.length === 0 ? (
            <div className={crmStyles.empty} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📄</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {templateSearch.trim() || filterBsp !== 'All' || filterBranch !== 'All'
                  ? 'No templates match your filters or search.'
                  : 'No templates created yet.'}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                {templateSearch.trim() || filterBsp !== 'All' || filterBranch !== 'All'
                  ? 'Try clearing the search text or resetting the gateway/branch filters.'
                  : 'Click "Create New Template" above to start broadcasting.'}
              </p>
              {(templateSearch.trim() || filterBsp !== 'All' || filterBranch !== 'All') && (
                <button className={crmStyles.button}
                  type="button"
                  onClick={() => { setTemplateSearch(''); setFilterBsp('All'); setFilterBranch('All'); setTemplatePage(1); }}
                  style={{ marginTop: '1rem', padding: '0.45rem 0.95rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : templateViewMode === 'grid' ? (
            /* ======================================================== */
            /* VIEW MODE A: GRID CARDS VIEW                             */
            /* ======================================================== */
            <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {paginatedTemplates.map(tpl => {
                const meta = parseTemplateMeta(tpl.company);
                const isSelected = selectedTemplateIds.includes(tpl.id);
                return (
                  <CRMCard className={`${crmStyles.interactiveCard} ${crmStyles.flushCard}`} data-selected={isSelected}
                    key={tpl.id} 
                    style={{ 
                      border: isSelected ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)', 
                      borderRadius: '10px', 
                      overflow: 'hidden', 
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.025)' : 'var(--bg-surface)', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    {/* TOP BAR WITH CHECKBOX & BADGES */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '0.65rem 0.85rem', 
                      backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--th-bg)', 
                      borderBottom: '1px solid var(--border-light)' 
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', userSelect: 'none', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectTemplate(tpl.id)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)' }}>
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </label>

                      <span style={{ 
                        fontSize: '0.72rem', 
                        fontWeight: 700, 
                        padding: '0.15rem 0.45rem', 
                        borderRadius: '4px', 
                        backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                        color: '#2563eb',
                        border: '1px solid rgba(37, 99, 235, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <Zap size={11} /> {getBspDisplayName(meta.bsp)}
                      </span>
                    </div>

                    {tpl.image_url && (
                      <div style={{ height: '120px', width: '100%', overflow: 'hidden', backgroundColor: 'var(--th-bg)' }}>
                        <img src={tpl.image_url} alt="Template" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}

                    <div style={{ padding: '1.15rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem', gap: '0.5rem' }}>
                        <h4 style={{ margin: '0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {tpl.template_name}
                        </h4>
                      </div>

                      {/* BRANCH BADGE */}
                      <div style={{ marginBottom: '0.65rem' }}>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 600, 
                          padding: '0.18rem 0.5rem', 
                          borderRadius: '4px', 
                          backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                          color: '#065f46',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <Building2 size={11} /> {meta.branch}
                        </span>
                      </div>

                      <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        API Campaign: <strong>{tpl.campaign_name}</strong>
                      </p>
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', flex: 1, whiteSpace: 'pre-wrap', maxHeight: '95px', overflowY: 'auto' }}>
                        {tpl.message_body.substring(0, 140)}{tpl.message_body.length > 140 ? '...' : ''}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                        {templatesPerms.edit && (
                          <button className={crmStyles.button}
                            onClick={() => handleOpenEditTemplate(tpl)} 
                            style={{ flex: 1, padding: '0.45rem', background: 'var(--th-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            Edit
                          </button>
                        )}
                        {templatesPerms.delete && (
                          <button className={crmStyles.button}
                            onClick={() => handleDeleteTemplate(tpl.id)} 
                            style={{ padding: '0.45rem 0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Delete Template"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </CRMCard>
                );
              })}
            </div>
          ) : (
            /* ======================================================== */
            /* VIEW MODE B: INTERACTIVE TABLE / SELECTION LIST VIEW      */
            /* ======================================================== */
            <div ref={templateContainerRef} className={`${crmStyles.tableScroll} ${crmStyles.fittedTableScroll}`} style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <table data-column-resize-managed="true" className={crmStyles.table} style={{ width: templateResize.getTotalTableWidth(), borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' , minWidth: templateResize.getTotalTableWidth()}}>
                  <colgroup>{Object.entries(templateResize.colWidths).map(([key, width]) => <col key={key} style={{ width }} />)}</colgroup>
                <thead>
                  <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1.5px solid var(--border-light)' }}>
                    {/* SELECT ALL COLUMN */}
                    <th scope="col" className={crmStyles.selectionColumn} style={{ width: templateResize.colWidths.select,  textAlign: 'center'  }}>
                      <input
                        type="checkbox"
                        checked={paginatedTemplates.length > 0 && paginatedTemplates.every(t => selectedTemplateIds.includes(t.id))}
                        onChange={handleSelectAllVisibleTemplates}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        title="Select/Deselect visible templates"
                      />

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="select" isResizing={templateResize.resizingCol === 'select'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* TEMPLATE NAME */}
                    <th scope="col" style={{ width: templateResize.colWidths.name }}>
                      <span>Template Name</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="name" isResizing={templateResize.resizingCol === 'name'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* BSP GATEWAY */}
                    <th scope="col" style={{ width: templateResize.colWidths.provider }}>
                      <span>BSP Gateway</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="provider" isResizing={templateResize.resizingCol === 'provider'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* OFFICE / BRANCH */}
                    <th scope="col" style={{ width: templateResize.colWidths.branch }}>
                      <span>Branch / Office</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="branch" isResizing={templateResize.resizingCol === 'branch'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* CAMPAIGN / API ID */}
                    <th scope="col" style={{ width: templateResize.colWidths.campaign }}>
                      <span>API Campaign ID</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="campaign" isResizing={templateResize.resizingCol === 'campaign'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* MESSAGE PREVIEW */}
                    <th scope="col" style={{ width: templateResize.colWidths.preview }}>
                      <span>Message Preview</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="preview" isResizing={templateResize.resizingCol === 'preview'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>

                    {/* ACTIONS */}
                    <th scope="col" className={crmStyles.actionsColumn} style={{ width: templateResize.colWidths.actions }}>
                      <span>Actions</span>

                    <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="actions" isResizing={templateResize.resizingCol === 'actions'} onResizeStart={templateResize.handleResizeStart} onReset={templateResize.resetColWidth} /></span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTemplates.map(tpl => {
                    const meta = parseTemplateMeta(tpl.company);
                    const isSelected = selectedTemplateIds.includes(tpl.id);
                    return (
                      <tr data-selected={isSelected}
                        key={tpl.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        {/* SELECT CHECKBOX */}
                        <td className={crmStyles.selectionColumn} style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectTemplate(tpl.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>

                        {/* NAME */}
                        <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {tpl.image_url && (
                              <img src={tpl.image_url} alt="img" style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
                            )}
                            <span>{tpl.template_name}</span>
                          </div>
                        </td>

                        {/* BSP */}
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 700, 
                            padding: '0.15rem 0.45rem', 
                            borderRadius: '4px', 
                            backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                            color: '#2563eb',
                            border: '1px solid rgba(37, 99, 235, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            whiteSpace: 'nowrap'
                          }}>
                            <Zap size={11} /> {getBspDisplayName(meta.bsp)}
                          </span>
                        </td>

                        {/* BRANCH */}
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            fontWeight: 600, 
                            padding: '0.15rem 0.45rem', 
                            borderRadius: '4px', 
                            backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                            color: '#065f46',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            whiteSpace: 'nowrap'
                          }}>
                            <Building2 size={11} /> {meta.branch}
                          </span>
                        </td>

                        {/* CAMPAIGN */}
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {tpl.campaign_name}
                        </td>

                        {/* PREVIEW */}
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '300px' }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tpl.message_body}>
                            {tpl.message_body}
                          </div>
                        </td>

                        {/* ACTIONS */}
                        <td className={crmStyles.actionsColumn} style={{ padding: '0.75rem' }}>
                          <div className={crmStyles.rowActions}>
                            {templatesPerms.edit && (
                              <button className={crmStyles.button}
                                type="button"
                                onClick={() => handleOpenEditTemplate(tpl)}
                                style={{ padding: '0.28rem 0.55rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                            )}
                            {templatesPerms.delete && (
                              <button className={crmStyles.button}
                                type="button"
                                onClick={() => handleDeleteTemplate(tpl.id)}
                                style={{ padding: '0.28rem 0.45rem', borderRadius: '4px', border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title="Delete Template"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINATION NAVIGATION BAR */}
          {filteredTemplates.length > 0 && (
            <StandardTablePagination className={crmStyles.pagination}
              currentPage={templatePage}
              totalRecords={filteredTemplates.length}
              pageSize={templatePerPage === 'All' ? 100000 : Number(templatePerPage)}
              onPageChange={setTemplatePage}
              onPageSizeChange={(newSize) => {
                setTemplatePerPage(newSize);
                setTemplatePage(1);
              }}
              style={{ marginTop: '1.5rem', borderRadius: '8px' }}
            />
          )}
        </div>
      )}

      {/* AUTOMATIONS TAB */}
      {activeTab === 'automations' && (
        <div>
          <CRMPageHeader icon={Repeat} title="Stage-Based Automation Rules" description="Map your templates to specific CRM stages to send automated drip campaigns." actions={automationsPerms.add && (
            <button type="button" onClick={() => { setCurrentAuto({ stage_name: '', template_id: '', frequency: 'Once', company: 'All', is_active: true }); setShowAutoForm(true); }} className={`${crmStyles.button} ${crmStyles.primaryButton}`}><Plus size={16} /> Add New Rule</button>
          )} />

          {showAutoForm && (
            <div 
              style={{ 
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
              }}
              onClick={() => setShowAutoForm(false)}
            >
              <div 
                style={{ 
                  backgroundColor: 'var(--bg-surface)', 
                  borderRadius: '12px', 
                  width: '100%', 
                  maxWidth: '620px', 
                  maxHeight: '90vh',
                  overflowY: 'auto', 
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-light)'
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--accent-subtle, rgba(37,99,235,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                      <Zap size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{currentAuto.id ? 'Edit' : 'New'} Automation Rule</h3>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {currentAuto.id ? 'Update trigger stage and template for this rule' : 'Configure a new automated WhatsApp message rule'}
                      </p>
                    </div>
                  </div>
                  <button className={crmStyles.button}
                    onClick={() => setShowAutoForm(false)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form Body */}
                <div style={{ padding: '1.5rem' }}>
                  <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Company</label>
                      <select className={crmStyles.field}
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
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Status</label>
                      <select className={crmStyles.field}
                        value={currentAuto.is_active ? 'active' : 'inactive'} 
                        onChange={e => setCurrentAuto({...currentAuto, is_active: e.target.value === 'active'})}
                        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: currentAuto.is_active ? '#16a34a' : '#ef4444', fontWeight: 600 }}
                      >
                        <option value="active">Active (Sending)</option>
                        <option value="inactive">Paused (Inactive)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>If Lead is in Stage:</label>
                      <select className={crmStyles.field} value={currentAuto.stage_name} onChange={e => setCurrentAuto({...currentAuto, stage_name: e.target.value})} style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
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

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Send this Template:</label>
                      <select className={crmStyles.field}
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

                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Frequency:</label>
                      <select className={crmStyles.field}
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

                  {/* Footer Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
                    <button className={crmStyles.button}
                      type="button"
                      onClick={() => setShowAutoForm(false)} 
                      style={{ padding: '0.6rem 1.25rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Cancel
                    </button>
                    <button className={crmStyles.button}
                      type="button"
                      onClick={handleSaveAutomation} 
                      disabled={savingAuto} 
                      style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: savingAuto ? 'not-allowed' : 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      {savingAuto ? 'Saving...' : (currentAuto.id ? 'Update Rule' : 'Save Rule')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Selection Action Bar */}
          {selectedAutoIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1.25rem',
              backgroundColor: 'var(--accent-subtle, rgba(37,99,235,0.08))',
              border: '1px solid var(--accent-color, #2563eb)',
              borderRadius: '8px',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <span style={{ 
                  backgroundColor: 'var(--accent-color, #2563eb)', 
                  color: 'white', 
                  borderRadius: '50%', 
                  width: '22px', 
                  height: '22px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '0.75rem' 
                }}>
                  {selectedAutoIds.length}
                </span>
                <span>rule{selectedAutoIds.length > 1 ? 's' : ''} selected</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button className={crmStyles.button}
                  type="button"
                  onClick={() => handleBulkToggleAutoStatus(false)}
                  disabled={updatingBulkAuto}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.9rem',
                    backgroundColor: '#fff1f2',
                    color: '#e11d48',
                    border: '1px solid #fecdd3',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: updatingBulkAuto ? 'not-allowed' : 'pointer'
                  }}
                  title="Pause all selected rules"
                >
                  <PauseCircle size={16} /> {updatingBulkAuto ? 'Updating...' : `Pause Selected (${selectedAutoIds.length})`}
                </button>

                <button className={crmStyles.button}
                  type="button"
                  onClick={() => handleBulkToggleAutoStatus(true)}
                  disabled={updatingBulkAuto}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.9rem',
                    backgroundColor: '#f0fdf4',
                    color: '#16a34a',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: updatingBulkAuto ? 'not-allowed' : 'pointer'
                  }}
                  title="Activate all selected rules"
                >
                  <PlayCircle size={16} /> {updatingBulkAuto ? 'Updating...' : `Activate Selected (${selectedAutoIds.length})`}
                </button>

                <button className={crmStyles.button}
                  type="button"
                  onClick={() => setSelectedAutoIds([])}
                  style={{
                    padding: '0.45rem 0.75rem',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Filter & Search Toolbar */}
          <CRMToolbar >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
              {/* Search input */}
              <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input className={crmStyles.field}
                  type="text"
                  value={autoSearch}
                  onChange={(e) => {
                    setAutoSearch(e.target.value);
                    setAutoPage(1);
                  }}
                  placeholder="Search by stage, template, or company..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 2rem 0.45rem 2.1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
                {autoSearch && (
                  <button className={crmStyles.button}
                    type="button"
                    onClick={() => { setAutoSearch(''); setAutoPage(1); }}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Company Filter */}
              <select aria-label="Filter automation company" className={crmStyles.field}
                value={autoCompanyFilter}
                onChange={(e) => {
                  setAutoCompanyFilter(e.target.value);
                  setAutoPage(1);
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Companies</option>
                {autoCompanyOptions.map(comp => (
                  <option key={comp} value={comp}>{comp}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select aria-label="Filter automation status" className={crmStyles.field}
                value={autoStatusFilter}
                onChange={(e) => {
                  setAutoStatusFilter(e.target.value);
                  setAutoPage(1);
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">🟢 Active Only</option>
                <option value="PAUSED">⚪ Paused Only</option>
              </select>

              {/* Frequency Filter */}
              <select aria-label="Filter automation frequency" className={crmStyles.field}
                value={autoFrequencyFilter}
                onChange={(e) => {
                  setAutoFrequencyFilter(e.target.value);
                  setAutoPage(1);
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Frequencies</option>
                <option value="Once">Once</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
              </select>

              {/* Clear Filters Button */}
              {(autoSearch || autoCompanyFilter !== 'ALL' || autoStatusFilter !== 'ALL' || autoFrequencyFilter !== 'ALL') && (
                <button className={crmStyles.button}
                  type="button"
                  onClick={() => {
                    setAutoSearch('');
                    setAutoCompanyFilter('ALL');
                    setAutoStatusFilter('ALL');
                    setAutoFrequencyFilter('ALL');
                    setAutoPage(1);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px dashed var(--border-light)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                  title="Reset all filters"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}
            </div>

            {/* Right: TableViewToggle & Results Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <CRMViewToggle label="Automation layout" value={autoTableView} onChange={setAutoTableView} items={[{ id: 'table', label: 'Table', icon: List }, { id: 'tiles', label: 'Tiles', icon: LayoutGrid }]} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                <span>{filteredAutomations.length} of {automations.length} rules</span>
              </div>
            </div>
          </CRMToolbar>

          <div ref={automationContainerRef} className={autoTableView === 'tiles' ? crmStyles.tiles : `${crmStyles.tableScroll} ${crmStyles.fittedTableScroll}`} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', borderRadius: '8px 8px 0 0', border: '1px solid var(--border-light)', borderBottom: 'none' }}>
            <MobileTableView id="WhatsappOfficial-1" view={autoTableView} hideToggle={true}><table data-column-resize-managed="true" className={crmStyles.table} style={{ width: automationResize.getTotalTableWidth(), borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'var(--bg-surface)' , minWidth: automationResize.getTotalTableWidth()}}>
                  <colgroup>{Object.entries(automationResize.colWidths).map(([key, width]) => <col key={key} style={{ width }} />)}</colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th scope="col" className={crmStyles.selectionColumn} style={{ width: automationResize.colWidths.select,  textAlign: 'center'  }}>
                    <input 
                      type="checkbox"
                      checked={paginatedAutomations.length > 0 && paginatedAutomations.every(a => selectedAutoIds.includes(a.id))}
                      onChange={handleSelectAllAutomations}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      title="Select / Deselect Visible Rules"
                    />
                  <span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="select" isResizing={automationResize.resizingCol === 'select'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" style={{ width: automationResize.colWidths.company }}>Company<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="company" isResizing={automationResize.resizingCol === 'company'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" style={{ width: automationResize.colWidths.stage }}>Target Stage<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="stage" isResizing={automationResize.resizingCol === 'stage'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" style={{ width: automationResize.colWidths.template }}>Template Assigned<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="template" isResizing={automationResize.resizingCol === 'template'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" style={{ width: automationResize.colWidths.frequency }}>Frequency<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="frequency" isResizing={automationResize.resizingCol === 'frequency'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" style={{ width: automationResize.colWidths.status }}>Status<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="status" isResizing={automationResize.resizingCol === 'status'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                  <th scope="col" className={crmStyles.actionsColumn} style={{ width: automationResize.colWidths.actions }}>Actions<span style={{ position: 'absolute', right: 4, top: 0, width: 12, height: '100%' }}><ColumnResizer colKey="actions" isResizing={automationResize.resizingCol === 'actions'} onResizeStart={automationResize.handleResizeStart} onReset={automationResize.resetColWidth} /></span></th>
                </tr>
              </thead>
              <tbody>
                {filteredAutomations.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                        <Filter size={26} style={{ opacity: 0.35 }} />
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {automations.length === 0 ? 'No automation rules defined yet.' : 'No automation rules match your filters or search.'}
                        </div>
                        {(autoSearch || autoCompanyFilter !== 'ALL' || autoStatusFilter !== 'ALL' || autoFrequencyFilter !== 'ALL') && (
                          <button className={crmStyles.button}
                            type="button"
                            onClick={() => {
                              setAutoSearch('');
                              setAutoCompanyFilter('ALL');
                              setAutoStatusFilter('ALL');
                              setAutoFrequencyFilter('ALL');
                              setAutoPage(1);
                            }}
                            style={{
                              marginTop: '0.35rem',
                              padding: '0.35rem 0.85rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedAutomations.map(auto => {
                    const isSelected = selectedAutoIds.includes(auto.id);
                    return (
                      <tr data-selected={isSelected}
                        key={auto.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? 'var(--accent-subtle, rgba(37,99,235,0.06))' : 'transparent'
                        }}
                      >
                        <td className={crmStyles.selectionColumn} style={{ padding: '1rem', textAlign: 'center' }}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectAuto(auto.id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <CRMStatusBadge>{auto.company || 'All'}</CRMStatusBadge>
                        </td>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{auto.stage_name}</td>
                        <td style={{ padding: '1rem' }}>
                          {auto.whatsapp_templates?.template_name || <span style={{color: '#ef4444'}}>Missing Template</span>}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <CRMStatusBadge tone="info">{auto.frequency}</CRMStatusBadge>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {automationsPerms.edit ? (
                            <button type="button" className={crmStyles.badgeButton} onClick={() => handleQuickToggleAutoStatus(auto)} title={auto.is_active ? 'Click to Pause this rule' : 'Click to Activate this rule'}>
                              <CRMStatusBadge tone={auto.is_active ? 'success' : 'neutral'}>{auto.is_active ? 'Active' : 'Paused'}</CRMStatusBadge>
                            </button>
                          ) : <CRMStatusBadge tone={auto.is_active ? 'success' : 'neutral'}>{auto.is_active ? 'Active' : 'Paused'}</CRMStatusBadge>}
                        </td>
                        <td className={crmStyles.actionsColumn} style={{ padding: '1rem' }}>
                          <div className={crmStyles.rowActions}>
                          {automationsPerms.edit && (
                            <button className={crmStyles.button} onClick={() => { const { whatsapp_templates, ...cleanAuto } = auto; setCurrentAuto(cleanAuto); setShowAutoForm(true); }} style={{ padding: '0.4rem', background: 'transparent', color: '#475569', border: 'none', cursor: 'pointer' }}>Edit</button>
                          )}
                          {automationsPerms.delete && (
                            <button className={crmStyles.button} onClick={() => handleDeleteAutomation(auto.id)} style={{ padding: '0.4rem', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>Delete</button>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table></MobileTableView>
          </div>

          {/* Unified Standard Bottom Page Navigation */}
          <StandardTablePagination className={crmStyles.pagination}
            currentPage={autoPage}
            totalRecords={filteredAutomations.length}
            pageSize={autoPageSize}
            onPageChange={setAutoPage}
            onPageSizeChange={setAutoPageSize}
            style={{ borderRadius: '0 0 8px 8px', border: '1px solid var(--border-light)' }}
          />

        </div>
      )}

      {/* ======================================================== */}
      {/* CUSTOM BSP MODAL / FORM DIALOG                          */}
      {/* ======================================================== */}
      {showCustomBspModal && (
        <div 
          style={{ 
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
          }}
          onClick={() => setShowCustomBspModal(false)}
        >
          <div 
            style={{ 
              backgroundColor: 'var(--bg-surface)', 
              borderRadius: '12px', 
              width: '100%', 
              maxWidth: '680px', 
              maxHeight: '90vh',
              overflowY: 'auto', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-light)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Globe size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {customBspForm.id ? `Edit & Upgrade BSP Gateway: ${customBspForm.name}` : 'Add New Custom WhatsApp BSP Gateway'}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {customBspForm.id 
                      ? 'Modify endpoint URL, HTTP method, authentication headers, or JSON payload format when provider updates.' 
                      : 'Self-serve webhook/API integration for Gupshup, Twilio, DoubleTick, Gallabox, etc.'}
                  </span>
                </div>
              </div>
              <button className={crmStyles.button}
                type="button"
                onClick={() => setShowCustomBspModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem', borderRadius: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem' }}>
              
              {/* Presets Bar */}
              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Fill Preset Templates:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {[
                    {
                      label: 'Gupshup Enterprise',
                      name: 'Gupshup',
                      url: 'https://api.gupshup.io/wa/api/v1/msg',
                      method: 'POST',
                      authType: 'HeaderKey',
                      headerName: 'apikey',
                      payload: '{\n  "channel": "whatsapp",\n  "source": "917834811114",\n  "destination": "{{PHONE}}",\n  "message": "{\\"type\\":\\"text\\",\\"text\\":\\"{{MESSAGE}}\\"}"\n}'
                    },
                    {
                      label: 'Twilio WhatsApp',
                      name: 'Twilio',
                      url: 'https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json',
                      method: 'POST',
                      authType: 'Basic',
                      headerName: 'Authorization',
                      payload: '{\n  "To": "whatsapp:+{{PHONE}}",\n  "From": "whatsapp:+14155238886",\n  "Body": "{{MESSAGE}}"\n}'
                    },
                    {
                      label: 'DoubleTick / Gallabox',
                      name: 'DoubleTick',
                      url: 'https://public-api.doubletick.io/v1/whatsapp/message/template',
                      method: 'POST',
                      authType: 'HeaderKey',
                      headerName: 'key',
                      payload: '{\n  "to": "+{{PHONE}}",\n  "template": {\n    "name": "{{TEMPLATE_NAME}}",\n    "components": [\n      {\n        "type": "body",\n        "parameters": [\n          { "type": "text", "text": "{{NAME}}" }\n        ]\n      }\n    ]\n  }\n}'
                    },
                    {
                      label: 'Generic JSON Webhook',
                      name: 'Custom BSP',
                      url: 'https://api.yourprovider.com/v1/messages',
                      method: 'POST',
                      authType: 'Bearer',
                      headerName: 'Authorization',
                      payload: '{\n  "to": "{{PHONE}}",\n  "template_name": "{{TEMPLATE_NAME}}",\n  "customer_name": "{{NAME}}",\n  "message": "{{MESSAGE}}",\n  "media_url": "{{IMAGE_URL}}"\n}'
                    }
                  ].map(preset => (
                    <button className={crmStyles.button}
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setCustomBspForm(prev => ({
                          ...prev,
                          name: prev.name || preset.name,
                          endpoint_url: prev.endpoint_url || preset.url,
                          method: preset.method,
                          auth_type: preset.authType,
                          auth_header_name: preset.headerName,
                          payload_format: preset.payload
                        }));
                      }}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                    >
                      ⚡ {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Grid */}
              <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    BSP Display Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input className={crmStyles.field}
                    type="text"
                    value={customBspForm.name}
                    onChange={e => setCustomBspForm({ ...customBspForm, name: e.target.value })}
                    placeholder="e.g. Gupshup, Twilio, DoubleTick"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    HTTP Method
                  </label>
                  <select className={crmStyles.field}
                    value={customBspForm.method}
                    onChange={e => setCustomBspForm({ ...customBspForm, method: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    <option value="POST">POST (Standard for message dispatch)</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </div>

              {/* Endpoint URL */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  API Endpoint URL <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input className={crmStyles.field}
                  type="text"
                  value={customBspForm.endpoint_url}
                  onChange={e => setCustomBspForm({ ...customBspForm, endpoint_url: e.target.value })}
                  placeholder="https://api.yourprovider.com/v1/messages"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </div>

              {/* Auth Settings */}
              <div className={crmStyles.formGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Authentication Type
                  </label>
                  <select className={crmStyles.field}
                    value={customBspForm.auth_type}
                    onChange={e => setCustomBspForm({ ...customBspForm, auth_type: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="Bearer">Bearer Token (Authorization: Bearer ...)</option>
                    <option value="HeaderKey">Custom Header Key (e.g. apikey / x-api-key)</option>
                    <option value="Basic">Basic Auth (Authorization: Basic ...)</option>
                    <option value="None">None / Included in Endpoint URL</option>
                  </select>
                </div>

                {customBspForm.auth_type === 'HeaderKey' && (
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                      Auth Header Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input className={crmStyles.field}
                      type="text"
                      value={customBspForm.auth_header_name}
                      onChange={e => setCustomBspForm({ ...customBspForm, auth_header_name: e.target.value })}
                      placeholder="e.g. apikey, x-api-key, key"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>

              {customBspForm.auth_type !== 'None' && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      API Token / Secret Key <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <button className={crmStyles.button}
                      type="button" 
                      onClick={() => setShowCustomToken(!showCustomToken)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                    >
                      {showCustomToken ? <EyeOff size={13} /> : <Eye size={13} />} {showCustomToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input className={crmStyles.field}
                    type={showCustomToken ? 'text' : 'password'}
                    value={customBspForm.auth_token}
                    onChange={e => setCustomBspForm({ ...customBspForm, auth_token: e.target.value })}
                    placeholder="Enter API token or Secret Key"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontFamily: 'monospace', fontSize: '0.82rem' }}
                  />
                </div>
              )}

              {/* Payload Template Format */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    Dynamic JSON Payload Format <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {['{{PHONE}}', '{{NAME}}', '{{TEMPLATE_NAME}}', '{{MESSAGE}}', '{{IMAGE_URL}}'].map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-primary)',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          color: '#2563eb'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <textarea className={crmStyles.field}
                  value={customBspForm.payload_format}
                  onChange={e => setCustomBspForm({ ...customBspForm, payload_format: e.target.value })}
                  rows={7}
                  placeholder="Enter JSON payload template..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.4' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                  Variables <code>{'{{PHONE}}'}</code>, <code>{'{{NAME}}'}</code>, <code>{'{{TEMPLATE_NAME}}'}</code>, <code>{'{{MESSAGE}}'}</code>, <code>{'{{IMAGE_URL}}'}</code> will be safely substituted when sending messages.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                <button className={crmStyles.button}
                  type="button"
                  onClick={() => setShowCustomBspModal(false)}
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button className={crmStyles.button}
                  type="button"
                  onClick={handleSaveCustomBsp}
                  disabled={loading}
                  style={{
                    padding: '0.6rem 1.6rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #2563eb)',
                    color: 'white',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  <Save size={16} /> {loading ? 'Saving...' : 'Save & Activate BSP Gateway'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </CRMTabPanel>
    </CRMPage>
  );
}
