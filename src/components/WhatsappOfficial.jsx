'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Image as ImageIcon, Upload, PlayCircle, Settings, MessageSquare, Repeat,
  CheckCircle2, AlertCircle, Eye, EyeOff, Send, ShieldCheck, Users, HelpCircle, RefreshCw, Zap,
  Building2, Filter, Briefcase, Edit3, Globe, Code2, X, ExternalLink, Check, Search, Layers, Key
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
  testWhatsappProviderConnection,
  getGlobalBspCatalog,
  getClientBspAllocations,
  saveClientBspAllocations
} from '@/app/actions/whatsapp';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';

const ALL_WA_TABS = [
  { id: 'templates', label: 'Templates Library', icon: MessageSquare },
  { id: 'automations', label: 'Stage Automations', icon: Repeat },
  { id: 'catalog', label: 'Master BSP Catalog (20+)', icon: Layers },
  { id: 'allocations', label: 'Client Allocation Matrix', icon: Users },
  { id: 'settings', label: 'API Credentials & Setup', icon: Settings }
];

export default function WhatsappOfficial({ moduleAccess = {}, userRole = '', userCompany = '' }) {
  const rLower = String(userRole || '').trim().toLowerCase();
  const isAdmin = !userRole || rLower === 'admin' || rLower === 'superadmin' || rLower === 'super_admin' || rLower === 'masteradmin' || rLower === 'owner' || rLower.includes('admin');

  const visibleTabs = React.useMemo(() => {
    let list = ALL_WA_TABS;
    if (!isAdmin) {
      list = list.filter(t => t.id !== 'catalog' && t.id !== 'allocations');
    }
    return filterVisibleSubTabs(moduleAccess, userRole, 'whatsapp_official', list);
  }, [moduleAccess, userRole, isAdmin]);

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
  const [aisensyConfig, setAisensyConfig] = useState({ api_key: '', user_name: 'New Swan MultiTech Limited-Swan Agro' });
  const [interaktConfig, setInteraktConfig] = useState({ api_key: '' });
  const [watiConfig, setWatiConfig] = useState({ endpoint_url: '', access_token: '' });
  const [nextelConfig, setNextelConfig] = useState({ endpoint_url: '' });

  // 3-Tier Multi-Tenant State (Catalog, Allocations, Workspace Setup)
  const [catalog, setCatalog] = useState([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [clientAllocations, setClientAllocations] = useState({});
  const [tenantsList, setTenantsList] = useState([]);
  const [selectedClientForAllocation, setSelectedClientForAllocation] = useState('Swan Agro');
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

  // Branches & Office State
  const [branches, setBranches] = useState([]);
  const [selectedTemplateBsp, setSelectedTemplateBsp] = useState('aisensy');
  const [selectedTemplateBranch, setSelectedTemplateBranch] = useState('Headquarters (Main Office)');
  const [filterBsp, setFilterBsp] = useState('All');
  const [filterBranch, setFilterBranch] = useState('All');

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
  }, [userCompany]);

  const loadAllData = async () => {
    setLoading(true);
    const effectiveComp = userCompany || 'Swan Agro';
    const [setRes, tplRes, autoRes, branchRes, catRes, allocRes] = await Promise.all([
      getWhatsappSettings(effectiveComp),
      getWhatsappTemplates(),
      getWhatsappAutomations(),
      getTenantBranches(effectiveComp),
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

  // --- CLIENT ALLOCATION HELPERS (TIER 2) ---
  const allClients = React.useMemo(() => {
    const list = [
      { id: 'Swan Agro', name: 'Swan Agro (Headquarters)', code: 'Swan Agro' },
      { id: 'NSMLR', name: 'NSMLR (Main Unit)', code: 'NSMLR' },
      { id: 'NSTLP', name: 'NSTLP (Plant 2)', code: 'NSTLP' }
    ];
    (tenantsList || []).forEach(t => {
      const code = t.tenant_code || t.name;
      if (!list.some(x => x.code?.toLowerCase() === code?.toLowerCase())) {
        list.push({ id: t.id, name: t.name, code: code });
      }
    });
    return list;
  }, [tenantsList]);

  const currentClientAlloc = clientAllocations[selectedClientForAllocation] || {
    allowed_bsps: ['aisensy', 'nextel'],
    default_bsp: 'aisensy',
    account_limit: 1
  };

  const toggleClientBsp = (bspId) => {
    const existing = clientAllocations[selectedClientForAllocation] || {
      allowed_bsps: ['aisensy', 'nextel'],
      default_bsp: 'aisensy',
      account_limit: 1
    };
    const currentAllowed = Array.isArray(existing.allowed_bsps) ? existing.allowed_bsps : [];
    let updatedAllowed;
    if (currentAllowed.includes(bspId)) {
      if (currentAllowed.length === 1) {
        alert('Each client must have at least one assigned BSP gateway.');
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
    const existing = clientAllocations[selectedClientForAllocation] || {
      allowed_bsps: ['aisensy', 'nextel'],
      default_bsp: 'aisensy',
      account_limit: 1
    };
    setClientAllocations(prev => ({
      ...prev,
      [selectedClientForAllocation]: {
        ...existing,
        default_bsp: defBsp
      }
    }));
  };

  const setClientAccountLimit = (limit) => {
    const existing = clientAllocations[selectedClientForAllocation] || {
      allowed_bsps: ['aisensy', 'nextel'],
      default_bsp: 'aisensy',
      account_limit: 1
    };
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
    const payload = {
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
        alert('WhatsApp multi-provider settings saved securely!');
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

  const handleOpenEditCustomBsp = (bsp, e) => {
    if (e) e.stopPropagation();
    setCustomBspForm({
      id: bsp.id,
      name: bsp.name || '',
      endpoint_url: bsp.endpoint_url || '',
      method: bsp.method || 'POST',
      auth_type: bsp.auth_type || 'Bearer',
      auth_header_name: bsp.auth_header_name || 'apikey',
      auth_token: bsp.auth_token || '',
      payload_format: bsp.payload_format || '{\n  "to": "{{PHONE}}",\n  "template_name": "{{TEMPLATE_NAME}}",\n  "customer_name": "{{NAME}}",\n  "message": "{{MESSAGE}}",\n  "media_url": "{{IMAGE_URL}}"\n}'
    });
    setShowCustomBspModal(true);
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
    if (customBspForm.id) {
      updatedCustomBsps = customBsps.map(b => b.id === customBspForm.id ? newBsp : b);
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

  const getBspDisplayName = (bspId) => {
    if (!bspId) return 'AiSensy';
    const lower = String(bspId).toLowerCase();
    const catalogItem = catalog.find(b => b.id.toLowerCase() === lower);
    if (catalogItem) return catalogItem.name;
    const custom = customBsps.find(b => b.id.toLowerCase() === lower || (b.name && b.name.toLowerCase() === lower));
    if (custom) return custom.name;
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
    let branch = 'Headquarters (Main Office)';

    const match = raw.match(/\[(.*?)\]/);
    if (match && match[1]) {
      bsp = match[1];
      branch = raw.replace(/\[.*?\]/, '').trim() || 'Headquarters (Main Office)';
    } else if (raw.toLowerCase() === 'nstlp') {
      bsp = 'nextel';
      branch = 'NSTLP (Plant 2)';
    } else if (raw.toLowerCase() === 'nsmlr') {
      bsp = 'aisensy';
      branch = 'NSMLR (Main Unit)';
    } else if (['aisensy', 'interakt', 'meta', 'wati', 'nextel'].includes(raw.toLowerCase())) {
      bsp = raw.toLowerCase();
      branch = 'Headquarters (Main Office)';
    } else {
      const customMatch = customBsps.find(b => b.id.toLowerCase() === raw.toLowerCase() || (b.name && b.name.toLowerCase() === raw.toLowerCase()));
      if (customMatch) {
        bsp = customMatch.id;
        branch = 'Headquarters (Main Office)';
      } else if (raw && raw !== 'All') {
        branch = raw;
      }
    }
    return { bsp, branch };
  };

  const handleOpenCreateTemplate = () => {
    setSelectedTemplateBsp(defaultProvider || 'aisensy');
    const firstBranch = branches[0]?.branch_name || 'Headquarters (Main Office)';
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
    const branchLabel = selectedTemplateBranch || 'Headquarters (Main Office)';
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

      {/* SETTINGS, CATALOG & ALLOCATIONS TABS */}
      {['settings', 'catalog', 'allocations'].includes(activeTab) && (
        <div style={{ maxWidth: '1080px' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                WhatsApp Business Solutions (BSP) & Gateway Setup
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                {isAdmin 
                  ? 'Manage Master BSP Gateway Catalog, allocate providers to client companies, and configure API credentials.' 
                  : 'Configure official WhatsApp Business API credentials for your assigned workspace.'}
              </p>
            </div>
            {isClientScoped && (
              <span style={{ 
                padding: '0.35rem 0.75rem', 
                borderRadius: '20px', 
                backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                color: 'var(--accent-color, #2563eb)', 
                fontWeight: 600, 
                fontSize: '0.8rem',
                border: '1px solid rgba(37, 99, 235, 0.25)' 
              }}>
                🏢 Workspace: {userCompany || 'Swan Agro'}
              </span>
            )}
          </div>

          {/* ADMIN 3-TIER SUB-TAB SWITCHER */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', overflowX: 'auto' }}>
              <button
                type="button"
                onClick={() => {
                  setActiveAdminSubTab('catalog');
                  handleTabChange('catalog');
                }}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  border: (activeTab === 'catalog' || (activeTab === 'settings' && activeAdminSubTab === 'catalog')) ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                  backgroundColor: (activeTab === 'catalog' || (activeTab === 'settings' && activeAdminSubTab === 'catalog')) ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                  color: (activeTab === 'catalog' || (activeTab === 'settings' && activeAdminSubTab === 'catalog')) ? '#fff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Layers size={16} /> Tier 1: Master BSP Catalog ({catalog.length || 20}+ Gateways)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAdminSubTab('allocations');
                  handleTabChange('allocations');
                }}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  border: (activeTab === 'allocations' || (activeTab === 'settings' && activeAdminSubTab === 'allocations')) ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                  backgroundColor: (activeTab === 'allocations' || (activeTab === 'settings' && activeAdminSubTab === 'allocations')) ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                  color: (activeTab === 'allocations' || (activeTab === 'settings' && activeAdminSubTab === 'allocations')) ? '#fff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Users size={16} /> Tier 2: Client Allocation Matrix
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAdminSubTab('credentials');
                  handleTabChange('settings');
                }}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  border: (activeTab === 'settings' && activeAdminSubTab === 'credentials') ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                  backgroundColor: (activeTab === 'settings' && activeAdminSubTab === 'credentials') ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                  color: (activeTab === 'settings' && activeAdminSubTab === 'credentials') ? '#fff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Key size={16} /> Tier 3: API Setup & Credentials
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TIER 1: MASTER BSP CATALOG (ALL 20+ GLOBAL GATEWAYS)    */}
          {/* ======================================================== */}
          {isAdmin && (activeTab === 'catalog' || (activeTab === 'settings' && activeAdminSubTab === 'catalog')) && (
            <div>
              {/* TOP ACTIONS & SEARCH */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 300px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
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
                    {enabledProviders.length} of {(catalog.length || 20) + customBsps.length} Active
                  </span>
                  {settingsPerms.edit && (
                    <button
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
              </div>

              {/* GLOBAL BSP GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[...catalog, ...customBsps]
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
                    const isCustom = b.id?.startsWith('custom_') || customBsps.some(cb => cb.id === b.id);
                    return (
                      <div
                        key={b.id}
                        style={{
                          padding: '1.15rem',
                          borderRadius: '10px',
                          border: isEnabled ? (isCustom ? '2px solid #8b5cf6' : '2px solid var(--accent-color, #2563eb)') : '1px solid var(--border-light)',
                          backgroundColor: isEnabled ? (isCustom ? 'rgba(139, 92, 246, 0.04)' : 'rgba(37, 99, 235, 0.04)') : 'var(--bg-primary)',
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
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: isCustom ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface)',
                            color: isCustom ? '#7c3aed' : 'var(--text-secondary)',
                            border: '1px solid var(--border-light)'
                          }}>
                            {b.category || (isCustom ? 'Custom BSP' : 'Meta BSP')}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.35', minHeight: '38px' }}>
                          {b.note || 'Meta verified WhatsApp Business Solution Provider gateway.'}
                        </div>

                        <div style={{ fontSize: '0.72rem', backgroundColor: 'var(--bg-surface)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-color, #2563eb)' }}>{b.method || 'POST'}</span> {b.default_endpoint || b.endpoint_url || 'Endpoint configured in credentials'}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                            {isCustom && settingsPerms.edit && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenEditCustomBsp(b, e)}
                                style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                            )}
                            {isCustom && settingsPerms.edit && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteCustomBsp(b.id, b.name, e)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.74rem', cursor: 'pointer' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>

                          {settingsPerms.edit && (
                            <button
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
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TIER 2: CLIENT / WORKSPACE ALLOCATION MATRIX            */}
          {/* ======================================================== */}
          {isAdmin && (activeTab === 'allocations' || (activeTab === 'settings' && activeAdminSubTab === 'allocations')) && (
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ 
                padding: '1.25rem', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '10px', 
                border: '1px solid var(--border-light)',
                marginBottom: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Client / Company WhatsApp Gateway Allocation
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Select a company or tenant workspace to assign permitted BSP gateways. Non-admin workspace users will only see and configure their assigned providers.
                    </p>
                  </div>

                  {/* CLIENT SELECTOR */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Target Client / Tenant:
                    </label>
                    <select
                      value={selectedClientForAllocation}
                      onChange={(e) => setSelectedClientForAllocation(e.target.value)}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--accent-color, #2563eb)',
                        backgroundColor: 'var(--bg-surface)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {allClients.map(c => (
                        <option key={c.id || c.code} value={c.code || c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SELECTED CLIENT CONFIGURATION BOX */}
                <div style={{ 
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
                      <button
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
                      <button
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                        Client Default BSP Gateway:
                      </label>
                      <select
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
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={currentClientAlloc.account_limit || 1}
                        onChange={(e) => setClientAccountLimit(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* SAVE ALLOCATION BUTTON & FEEDBACK */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
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
              </div>

              {/* OVERVIEW TABLE OF ALL ALLOCATIONS */}
              <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
                  Active Client Allocation Matrix Overview
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Client / Company</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Assigned BSP Gateways</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Default Gateway</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Quota</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allClients.map(c => {
                        const alloc = clientAllocations[c.code] || clientAllocations[c.name] || {
                          allowed_bsps: ['aisensy', 'nextel'],
                          default_bsp: 'aisensy',
                          account_limit: 2
                        };
                        return (
                          <tr key={c.id || c.code} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {c.name}
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
                              {getBspDisplayName(alloc.default_bsp)}
                            </td>
                            <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                              {alloc.account_limit || (alloc.allowed_bsps || []).length} lines
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedClientForAllocation(c.code || c.name);
                                  window.scrollTo({ top: 150, behavior: 'smooth' });
                                }}
                                style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TIER 3: WORKSPACE API SETUP & CREDENTIALS               */}
          {/* ======================================================== */}
          {(!isAdmin || (activeTab === 'settings' && activeAdminSubTab === 'credentials') || (!['catalog', 'allocations'].includes(activeTab) && activeAdminSubTab === 'credentials')) && (
            <div>
              {/* SCOPED CLIENT NOTICE */}
              {isClientScoped && (
                <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1.15rem', backgroundColor: 'rgba(37, 99, 235, 0.07)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: '8px', fontSize: '0.83rem', color: '#1e40af' }}>
                  🔒 <strong>Workspace Gateway Access:</strong> Your company (<strong>{userCompany || 'Swan Agro'}</strong>) is configured with dedicated access to {assignedBsps.length} WhatsApp BSP gateway(s). Only your assigned gateways are shown below.
                </div>
              )}

              {/* OPTION C: PRIMARY DEFAULT PROVIDER SELECTOR */}
              <div style={{ 
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
                    Primary Default Dispatch Gateway
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    When a template or campaign has no specific provider selected, messages will dispatch through this primary gateway.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select
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
              </div>

              {/* CREDENTIALS CARDS */}
              {/* 1. Meta Direct */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('meta') && (
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#2563eb' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Meta Cloud API Credentials (v21.0)</h3>
                  </div>
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

              {/* 2. AiSensy */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('aisensy') && (
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#0284c7' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>AiSensy WhatsApp API Credentials</h3>
                  </div>
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

              {/* 3. Interakt */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('interakt') && (
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#7c3aed' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Interakt (Jio Haptik) API Credentials</h3>
                  </div>
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

              {/* 4. Wati */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('wati') && (
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#059669' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Wati (Clare.ai) API Credentials</h3>
                  </div>
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

              {/* 5. Nextel */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).includes('nextel') && (
                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#d97706' }}>
                    <ShieldCheck size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Nextel.io API Credentials (NSTLP)</h3>
                  </div>
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

              {/* 6. ALL OTHER GLOBAL CATALOG BSPS (Gupshup, Twilio, DoubleTick, Gallabox, Infobip, Kaleyra, CM.com, MessageBird, Sinch, Zoko, Yellow.ai, Karix, ValueFirst, BhashSMS) */}
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders)
                .filter(pId => !['meta', 'aisensy', 'interakt', 'wati', 'nextel'].includes(pId) && !pId.startsWith('custom_'))
                .map(pId => {
                  const bspInfo = catalog.find(b => b.id === pId) || { id: pId, name: pId.toUpperCase() };
                  const creds = bspCredentials[pId] || {};
                  return (
                    <div key={pId} style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                            API Key / Auth Token <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input 
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
                          <input 
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Twilio Account SID
                            </label>
                            <input 
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
                            <input 
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                              Gupshup App Name
                            </label>
                            <input 
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
                            <input 
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
                    </div>
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
                      <button
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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
                  Select an enabled provider and verify connectivity before broadcasting messages.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: testFeedback ? '0.75rem' : 0 }}>
                  <select
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

                  <input 
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
              </div>

              {/* ACTION BUTTON */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingTop: '0.5rem' }}>
                {settingsPerms.edit ? (
                  <button 
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
                    <Save size={18} /> {loading ? 'Saving Settings...' : 'Save WhatsApp Configuration'}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔒 Read-only view. Contact administrator to update API keys.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem 0' }}>Message Templates Library</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Create and manage official WhatsApp templates mapped to your Client Main Office / Branches and selected BSP provider.
              </p>
            </div>
            {templatesPerms.add && (
              <button 
                onClick={handleOpenCreateTemplate}
                style={{ padding: '0.55rem 1.15rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.88rem' }}
              >
                <Plus size={18} /> Create New Template
              </button>
            )}
          </div>

          {/* FILTER BAR FOR TEMPLATES */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.75rem', 
            alignItems: 'center', 
            marginBottom: '1.5rem', 
            padding: '0.75rem 1rem', 
            backgroundColor: 'var(--bg-primary)', 
            borderRadius: '8px', 
            border: '1px solid var(--border-light)' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
              <Filter size={15} /> Filter:
            </div>

            {/* Filter by BSP */}
            <select
              value={filterBsp}
              onChange={(e) => setFilterBsp(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 500 }}
            >
              <option value="All">All BSP Gateways</option>
              {((isClientScoped && assignedBsps.length > 0) ? assignedBsps : enabledProviders).map(pId => (
                <option key={pId} value={pId}>{getBspDisplayName(pId)}</option>
              ))}
            </select>

            {/* Filter by Branch */}
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.82rem', fontWeight: 500 }}
            >
              <option value="All">All Offices / Branches</option>
              <option value="Headquarters (Main Office)">Headquarters (Main Office)</option>
              {branches.map(b => (
                <option key={b.id || b.branch_name} value={b.branch_name}>
                  {b.branch_name}
                </option>
              ))}
              <option value="NSMLR (Main Unit)">NSMLR (Main Unit)</option>
              <option value="NSTLP (Plant 2)">NSTLP (Plant 2)</option>
            </select>
          </div>

          {showTemplateForm && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1.75rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1.15rem', fontWeight: 700 }}>
                {currentTemplate.id ? 'Edit Template' : 'Create New WhatsApp Template'}
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                {/* 1. Selected BSP Name */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    <Zap size={15} color="#2563eb" /> Selected BSP Provider
                  </label>
                  <select 
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
                  <select 
                    value={selectedTemplateBranch} 
                    onChange={e => setSelectedTemplateBranch(e.target.value)} 
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    <option value="Headquarters (Main Office)">🏢 Headquarters (Main Office)</option>
                    {branches.filter(b => b.branch_name !== 'Headquarters (Main Office)').map(b => (
                      <option key={b.id || b.branch_name} value={b.branch_name}>
                        🏢 {b.branch_name} ({b.location_type || 'Branch'})
                      </option>
                    ))}
                    <option value="All Branches (Universal)">🏢 All Branches (Universal)</option>
                    <option value="NSMLR (Main Unit)">🏢 NSMLR (Main Unit)</option>
                    <option value="NSTLP (Plant 2)">🏢 NSTLP (Plant 2)</option>
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'block' }}>
                    Headquarters (Main Office) is selected by default.
                  </span>
                </div>

                {/* 3. Template Name */}
                <div className="form-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.45rem', color: 'var(--text-primary)' }}>
                    Template Name (CRM Display) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input 
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
                  <input 
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
                <textarea 
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
                <button 
                  onClick={handleSaveTemplate} 
                  disabled={loading} 
                  style={{ padding: '0.65rem 1.6rem', background: 'var(--accent-color, #2563eb)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
                >
                  {loading ? 'Saving...' : 'Save Template'}
                </button>
                <button 
                  onClick={() => setShowTemplateForm(false)} 
                  style={{ padding: '0.65rem 1.4rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.88rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* TEMPLATES CARDS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {templates
              .filter(tpl => {
                const meta = parseTemplateMeta(tpl.company);
                if (filterBsp !== 'All' && meta.bsp !== filterBsp.toLowerCase()) return false;
                if (filterBranch !== 'All' && !meta.branch.toLowerCase().includes(filterBranch.toLowerCase())) return false;
                return true;
              })
              .map(tpl => {
                const meta = parseTemplateMeta(tpl.company);
                return (
                  <div key={tpl.id} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    {tpl.image_url && (
                      <div style={{ height: '120px', width: '100%', overflow: 'hidden', backgroundColor: 'var(--th-bg)' }}>
                        <img src={tpl.image_url} alt="Template" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.5rem' }}>
                        <h4 style={{ margin: '0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{tpl.template_name}</h4>
                      </div>

                      {/* DUAL BADGES: BSP NAME + CLIENT OFFICE / BRANCH */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 700, 
                          padding: '0.18rem 0.5rem', 
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

                      <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        API ID: <strong>{tpl.campaign_name}</strong>
                      </p>
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', flex: 1, whiteSpace: 'pre-wrap', maxHeight: '95px', overflowY: 'auto' }}>
                        {tpl.message_body.substring(0, 140)}{tpl.message_body.length > 140 ? '...' : ''}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                        {templatesPerms.edit && (
                          <button 
                            onClick={() => handleOpenEditTemplate(tpl)} 
                            style={{ flex: 1, padding: '0.45rem', background: 'var(--th-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            Edit
                          </button>
                        )}
                        {templatesPerms.delete && (
                          <button 
                            onClick={() => handleDeleteTemplate(tpl.id)} 
                            style={{ padding: '0.45rem 0.75rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            {templates.length === 0 && !showTemplateForm && (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                No templates created yet. Click "Create New Template" above.
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
                    {customBspForm.id ? `Edit Custom BSP: ${customBspForm.name}` : 'Add New Custom WhatsApp BSP Gateway'}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Self-serve webhook/API integration for Gupshup, Twilio, DoubleTick, Gallabox, etc.
                  </span>
                </div>
              </div>
              <button 
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
                    <button
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    BSP Display Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
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
                  <select
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
                <input
                  type="text"
                  value={customBspForm.endpoint_url}
                  onChange={e => setCustomBspForm({ ...customBspForm, endpoint_url: e.target.value })}
                  placeholder="https://api.yourprovider.com/v1/messages"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </div>

              {/* Auth Settings */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Authentication Type
                  </label>
                  <select
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
                    <input
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
                    <button 
                      type="button" 
                      onClick={() => setShowCustomToken(!showCustomToken)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                    >
                      {showCustomToken ? <EyeOff size={13} /> : <Eye size={13} />} {showCustomToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
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
                <textarea
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
                <button
                  type="button"
                  onClick={() => setShowCustomBspModal(false)}
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
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

    </div>
  );
}
