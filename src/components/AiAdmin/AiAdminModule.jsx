import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Bot, Save, Users, Zap, AlertTriangle, CheckCircle2, Edit2, X, FileText, Trash2, Loader2, ChevronDown, Search, Plus, Sparkles, Check, Key, Eye, EyeOff, ShieldCheck, RefreshCw, BarChart3, Shield } from 'lucide-react';
import { PremiumProgressLoader } from '../PremiumProgressLoader';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { getTenantAiConfig, saveTenantAiConfig, testAiProviderKey } from '@/app/actions/aiConfig';
import { getAiBillingSummary } from '@/app/actions/aiBilling';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';

const AI_ADMIN_TABS = [
  { id: 'users', label: 'AI Chatbot Users', Icon: Users },
  { id: 'billing', label: 'API Usage & Billing', Icon: BarChart3 },
  { id: 'models', label: 'AI Model Setup', Icon: Bot }
];
const AI_PROVIDERS = [
  { id: 'openai', label: 'OpenAI (ChatGPT)', desc: 'GPT models' },
  { id: 'gemini', label: 'Google Gemini', desc: 'Gemini models' },
  { id: 'claude', label: 'Anthropic Claude', desc: 'Claude models' }
];
const USD_FORMAT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

const DEFAULT_AI_USERS_COL_WIDTHS = {
  employee: 240,
  role: 120,
  token_usage: 220,
  token_limit: 130,
  premium_limit: 130,
  ai_models: 260,
  actions: 120
};

const MIN_AI_USERS_COL_WIDTHS = {
  employee: 140,
  role: 80,
  token_usage: 150,
  token_limit: 90,
  premium_limit: 90,
  ai_models: 160,
  actions: 90
};

function getModelDropdownPosition(rect) {
  const width = Math.min(320, window.innerWidth - 16);
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const openAbove = spaceBelow < 340 && spaceAbove > spaceBelow;
  const availableSpace = openAbove ? spaceAbove : spaceBelow;
  return {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    top: openAbove ? 'auto' : rect.bottom + 8,
    bottom: openAbove ? window.innerHeight - rect.top + 8 : 'auto',
    width,
    maxHeight: Math.max(120, Math.min(380, availableSpace - 8))
  };
}

export default function AiAdminModule({ userRole, userId, userCompany, tenantId, isMasterAdmin, moduleAccess = {} }) {
  const pathname = usePathname();
  const sectionPath = pathname?.toLowerCase().replace(/\/$/, '');

  const visibleTabs = useMemo(() => {
    return filterVisibleSubTabs(moduleAccess, userRole, 'aiadmin', AI_ADMIN_TABS);
  }, [moduleAccess, userRole]);

  const [currentSection, setCurrentSection] = useState(() => {
    const isAllowed = (s) => visibleTabs.some(vt => vt.id === s);
    const candidate = sectionPath === '/aiadmin/users' ? 'users' : sectionPath === '/aiadmin/billing' ? 'billing' : 'models';
    return isAllowed(candidate) ? candidate : (visibleTabs[0]?.id || 'users');
  });

  useEffect(() => {
    const isAllowed = (s) => visibleTabs.some(vt => vt.id === s);
    const candidate = sectionPath === '/aiadmin/users' ? 'users' : sectionPath === '/aiadmin/billing' ? 'billing' : 'models';
    if (isAllowed(candidate)) {
      setCurrentSection(candidate);
    } else if (visibleTabs.length > 0 && !visibleTabs.some(vt => vt.id === currentSection)) {
      setCurrentSection(visibleTabs[0]?.id || 'users');
    }
  }, [sectionPath, visibleTabs, currentSection]);

  const activeSection = visibleTabs.some(vt => vt.id === currentSection) ? currentSection : (visibleTabs[0]?.id || 'users');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimitValue, setNewLimitValue] = useState("");
  const [newPremiumLimitValue, setNewPremiumLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Multi-Provider AI API Keys & Settings State
  const effectiveWorkspace = userCompany || tenantId || 'Default Workspace';
  const [aiConfig, setAiConfig] = useState({
    active_provider: 'openai',
    openai: { api_key: '', default_model: 'gpt-4o-mini', is_configured: false, masked_key: '' },
    gemini: { api_key: '', default_model: 'gemini-2.0-flash', is_configured: false, masked_key: '' },
    claude: { api_key: '', default_model: 'claude-3-5-sonnet', is_configured: false, masked_key: '' }
  });
  const [showKeys, setShowKeys] = useState({ openai: false, gemini: false, claude: false });
  const [testingProvider, setTestingProvider] = useState(null);
  const [testStatus, setTestStatus] = useState({});
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);
  const [availableProviderIds, setAvailableProviderIds] = useState([]);
  const [addingProvider, setAddingProvider] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configLoadError, setConfigLoadError] = useState('');
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const billingRequestId = useRef(0);

  // Dynamic AI Models State
  const [availableModels, setAvailableModels] = useState([]);
  const [liveSynced, setLiveSynced] = useState(false);
  const [openDropdownUserId, setOpenDropdownUserId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const [modelSearch, setModelSearch] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  const [documents, setDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Column Resizing Hook (Lead Data Pattern)
  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'ai_admin_users_col_widths',
    DEFAULT_AI_USERS_COL_WIDTHS,
    MIN_AI_USERS_COL_WIDTHS
  );

  const dropdownRef = useRef(null);
  const dropdownTriggerRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetchDocuments();
    fetchModels();
    loadAiConfig();

  }, [userCompany, tenantId]);

  useEffect(() => {
    if (openDropdownUserId === null) return;

    const handleClickOutside = (event) => {
      if (!dropdownRef.current?.contains(event.target) && !dropdownTriggerRef.current?.contains(event.target)) {
        setOpenDropdownUserId(null);
      }
    };
    const handleScroll = (event) => {
      if (dropdownRef.current?.contains(event.target)) return;
      const trigger = dropdownTriggerRef.current;
      if (!trigger?.isConnected) {
        setOpenDropdownUserId(null);
        return;
      }
      setDropdownPosition(getModelDropdownPosition(trigger.getBoundingClientRect()));
    };
    const closeDropdown = () => setOpenDropdownUserId(null);

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', closeDropdown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', closeDropdown);
    };
  }, [openDropdownUserId]);

  const loadAiConfig = async () => {
    setConfigLoaded(false);
    setConfigLoadError('');
    try {
      const res = await getTenantAiConfig(tenantId || userCompany);
      if (res.success && res.config) {
        setAvailableProviderIds(AI_PROVIDERS.filter(provider => res.config[provider.id]?.is_available).map(provider => provider.id));
        setAiConfig(prev => ({
          ...prev,
          ...res.config,
          openai: { ...prev.openai, ...res.config.openai, api_key: res.config.openai.masked_key || '' },
          gemini: { ...prev.gemini, ...res.config.gemini, api_key: res.config.gemini.masked_key || '' },
          claude: { ...prev.claude, ...res.config.claude, api_key: res.config.claude.masked_key || '' }
        }));
      } else {
        setConfigLoadError(res.error || 'Could not load workspace AI settings.');
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
      setConfigLoadError('Could not load workspace AI settings.');
    } finally {
      setConfigLoaded(true);
    }
  };

  const handleSaveAiConfig = async () => {
    if (addingProvider && String(aiConfig[addingProvider]?.api_key || '').trim().length <= 5) {
      alert('Enter the provider API key before saving.');
      return;
    }
    setSavingAiConfig(true);
    setConfigSaveSuccess(false);
    try {
      const res = await saveTenantAiConfig(tenantId || userCompany, aiConfig);
      if (res.success) {
        setConfigSaveSuccess(true);
        setTimeout(() => setConfigSaveSuccess(false), 3500);
        await loadAiConfig();
        setAddingProvider(null);
      } else {
        alert(res.error || 'Failed to save AI configuration');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingAiConfig(false);
    }
  };

  const loadBilling = useCallback(async () => {
    const requestId = ++billingRequestId.current;
    setBillingLoading(true);
    try {
      const result = await getAiBillingSummary(tenantId || userCompany);
      if (requestId === billingRequestId.current) setBilling(result);
    } catch {
      if (requestId === billingRequestId.current) setBilling({ success: false, error: 'Billing data unavailable. Try again later.' });
    } finally {
      if (requestId === billingRequestId.current) setBillingLoading(false);
    }
  }, [tenantId, userCompany]);

  useEffect(() => {
    if (activeSection === 'billing') {
      setBilling(null);
      loadBilling();
    }
    return () => { billingRequestId.current += 1; };
  }, [activeSection, loadBilling]);

  const handleTestProvider = async (provider) => {
    setTestingProvider(provider);
    setTestStatus(prev => ({ ...prev, [provider]: null }));
    try {
      const key = aiConfig[provider]?.api_key;
      const model = aiConfig[provider]?.default_model;
      const res = await testAiProviderKey(provider, key, model, tenantId || userCompany);
      setTestStatus(prev => ({
        ...prev,
        [provider]: {
          success: res.success,
          message: res.success ? (res.message || 'Key verified & connected!') : (res.error || 'Connection failed')
        }
      }));
    } catch (err) {
      setTestStatus(prev => ({
        ...prev,
        [provider]: { success: false, message: err.message }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/ai/models');
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models || []);
        setLiveSynced(!!data.liveSynced);
      }
    } catch (e) {
      console.error("Failed to fetch AI models:", e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const q = new URLSearchParams();
      if (tenantId) q.set('tenantId', tenantId);
      if (userCompany) q.set('company', userCompany);
      const res = await fetch(`/api/ai/knowledge${q.toString() ? `?${q.toString()}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadDocument = async () => {
    if (!docTitle.trim() || !docContent.trim()) return alert("Title and content are required.");
    setUploadingDoc(true);
    try {
      const res = await fetch('/api/ai/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: docTitle, 
          content: docContent,
          tenantId: tenantId || null,
          company: userCompany || null
        })
      });
      if (res.ok) {
        setDocTitle("");
        setDocContent("");
        await fetchDocuments();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to upload document");
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const res = await fetch(`/api/ai/knowledge?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    try {
      const q = new URLSearchParams();
      if (userCompany) q.set('company', userCompany);
      if (tenantId) q.set('tenantId', tenantId);
      const res = await fetch(`/api/ai/admin${q.toString() ? `?${q.toString()}` : ''}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLimit = async (userId) => {
    if (!newLimitValue || isNaN(newLimitValue)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          tokenLimit: parseInt(newLimitValue),
          premiumLimit: newPremiumLimitValue ? parseInt(newPremiumLimitValue) : 10000 
        })
      });
      if (res.ok) {
        await fetchUsers();
        setEditingLimit(null);
        setNewLimitValue("");
        setNewPremiumLimitValue("");
      } else {
        alert("Failed to update limit.");
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (userId, newModels) => {
    // Optimistic UI Update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ai_models: newModels } : u));

    try {
      const res = await fetch('/api/ai/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, aiModels: newModels })
      });
      if (!res.ok) {
        alert("Failed to update AI Model.");
        await fetchUsers(); // Revert on failure
      }
    } catch (e) {
      alert(e.message);
      await fetchUsers(); // Revert on failure
    }
  };

  const handleAddCustomModel = (userId, currentSelected) => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;
    
    // Add to availableModels list if not already present
    if (!availableModels.includes(trimmed)) {
      setAvailableModels(prev => [trimmed, ...prev]);
    }
    
    // Select this model for the current user
    const updated = Array.from(new Set([...currentSelected, trimmed]));
    handleModelChange(userId, updated);
    setCustomModelInput("");
  };

  // Filter users by search query
  const filteredUsers = users.filter(user => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    const name = (user.name || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    return name.includes(q) || email.includes(q) || role.includes(q);
  });

  const switchSection = (section) => {
    if (!visibleTabs.some(vt => vt.id === section)) return;
    setOpenDropdownUserId(null);
    setCurrentSection(section);
    const route = `/aiadmin/${section}`;
    if (window.location.pathname !== route) window.history.pushState(null, '', route);
  };

  const toggleModelDropdown = (event, userId) => {
    if (openDropdownUserId === userId) {
      setOpenDropdownUserId(null);
      return;
    }

    dropdownTriggerRef.current = event.currentTarget;
    setDropdownPosition(getModelDropdownPosition(event.currentTarget.getBoundingClientRect()));
    setModelSearch('');
    setOpenDropdownUserId(userId);
  };

  const handleSectionKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = visibleTabs.findIndex(tab => tab.id === activeSection);
    if (currentIndex === -1 || visibleTabs.length === 0) return;
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? visibleTabs.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + visibleTabs.length) % visibleTabs.length;
    const nextSection = visibleTabs[nextIndex].id;
    switchSection(nextSection);
    event.currentTarget.querySelector(`[data-ai-admin-tab="${nextSection}"]`)?.focus();
  };

  if (loading) {
    return <PremiumProgressLoader message="Loading AI Stats" active={loading} />;
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Bot size={24} />
          </div>
          <div>
            <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>AI Admin Dashboard</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Monitor and manage AI token usage, model access & API keys</p>
              {effectiveWorkspace && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: 'var(--accent-color)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  border: '1px solid rgba(37, 99, 235, 0.2)'
                }}>
                  🏢 Workspace: {effectiveWorkspace}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Sync Status Badge */}
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          padding: '0.4rem 0.8rem', 
          borderRadius: '20px', 
          background: liveSynced ? '#ecfdf5' : '#fef3c7', 
          border: `1px solid ${liveSynced ? '#a7f3d0' : '#fde68a'}`,
          fontSize: '0.8rem',
          fontWeight: 600,
          color: liveSynced ? '#047857' : '#b45309'
        }}>
          <Sparkles size={14} />
          {liveSynced ? `Auto-Synced with OpenAI (${availableModels.length} models)` : `Loaded Models (${availableModels.length})`}
        </div>
      </div>

      <div role="tablist" aria-label="AI admin sections" onKeyDown={handleSectionKeyDown} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
        {visibleTabs.map(({ id, label, Icon }) => {
          const selected = activeSection === id;
          return (
            <button
              key={id}
              id={`ai-admin-${id}-tab`}
              data-ai-admin-tab={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`ai-admin-${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => switchSection(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.7rem 1rem', border: 'none',
                borderBottom: selected ? '3px solid var(--accent-color)' : '3px solid transparent',
                background: selected ? 'var(--bg-surface)' : 'transparent',
                color: selected ? 'var(--accent-color)' : 'var(--text-secondary)',
                fontSize: '0.9rem', fontWeight: selected ? 700 : 600,
                cursor: 'pointer', borderRadius: '8px 8px 0 0'
              }}
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          );
        })}
      </div>

      {/* Access Denied Card if current tab is not allowed */}
      {!visibleTabs.some(vt => vt.id === activeSection) && (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', margin: '2rem 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <Shield size={28} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Access Restricted</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto' }}>
            You do not have permission to view this section of AI Admin. Please contact your administrator.
          </p>
        </div>
      )}

      <div id="ai-admin-models-panel" role="tabpanel" aria-labelledby="ai-admin-models-tab" hidden={activeSection !== 'models' || !visibleTabs.some(vt => vt.id === 'models')}>
      {/* Multi-Provider AI API Keys & Workspace Setup Card */}
      <div style={{
        background: 'var(--bg-primary)',
        borderRadius: '14px',
        border: '1px solid var(--border-light)',
        padding: '1.25rem',
        marginBottom: '1.75rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: isConfigExpanded ? '1.25rem' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Key size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Available AI Providers
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  Workspace Scoped
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Workspace keys and active system API keys for <strong>{effectiveWorkspace}</strong> appear here.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              onClick={() => setIsConfigExpanded(!isConfigExpanded)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              {isConfigExpanded ? 'Collapse' : 'Expand Setup'}
              <ChevronDown size={14} style={{ transform: isConfigExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            <button
              onClick={handleSaveAiConfig}
              disabled={savingAiConfig || !configLoaded || Boolean(configLoadError)}
              style={{
                background: 'var(--accent-color)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: savingAiConfig ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
              }}
            >
              {savingAiConfig ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {savingAiConfig ? 'Saving...' : 'Save AI Settings'}
            </button>
          </div>
        </div>

        {configSaveSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '0.85rem',
            fontWeight: 500,
            marginBottom: '1rem'
          }}>
            <CheckCircle2 size={16} color="#10b981" />
            Workspace AI Configuration saved successfully for {effectiveWorkspace}!
          </div>
        )}

        {configLoadError && (
          <div role="alert" style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: '8px', color: '#b91c1c', background: '#fef2f2' }}>
            {configLoadError}
          </div>
        )}

        {isConfigExpanded && configLoaded && !configLoadError && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {availableProviderIds.length} provider{availableProviderIds.length === 1 ? '' : 's'} available
              </div>
              {availableProviderIds.length < AI_PROVIDERS.length && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Add Provider:</span>
                  {AI_PROVIDERS.filter(provider => !availableProviderIds.includes(provider.id)).map(provider => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setAddingProvider(provider.id)}
                      aria-pressed={addingProvider === provider.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: addingProvider === provider.id ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                    >
                      <Plus size={14} /> {provider.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {availableProviderIds.length === 0 && !addingProvider && (
              <div style={{ padding: '1.25rem', marginBottom: '1rem', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px dashed var(--border-light)', color: 'var(--text-secondary)' }}>
                No workspace or system API key is available. Choose a provider above, enter its key, then save AI settings.
              </div>
            )}
            {/* Primary Provider Selector */}
            {availableProviderIds.length > 0 && <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Primary Active AI Engine:
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {AI_PROVIDERS.filter(provider => availableProviderIds.includes(provider.id)).map(p => {
                  const isSelected = aiConfig.active_provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAiConfig(prev => ({ ...prev, active_provider: p.id }))}
                      style={{
                        flex: '1',
                        minWidth: '200px',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                        background: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                          {p.label}
                        </span>
                        {isSelected && <Check size={16} color="var(--accent-color)" />}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {p.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!availableProviderIds.includes(aiConfig.active_provider) && (
                <div style={{ marginTop: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                  Current engine uses the system fallback. Select a connected provider and save to change it.
                </div>
              )}
            </div>}

            {/* Provider Grid Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              
              {/* 1. OpenAI (ChatGPT) Card */}
              {(availableProviderIds.includes('openai') || addingProvider === 'openai') && (
              <div style={{
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                      GPT
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>ChatGPT (OpenAI)</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>api.openai.com</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    background: aiConfig.openai.is_available ? '#ecfdf5' : '#f3f4f6',
                    color: aiConfig.openai.is_available ? '#047857' : '#6b7280',
                    border: `1px solid ${aiConfig.openai.is_available ? '#a7f3d0' : '#e5e7eb'}`
                  }}>
                    {aiConfig.openai.is_configured ? 'Workspace Key' : aiConfig.openai.has_system_fallback ? 'System API Key' : 'New Provider'}
                  </span>
                </div>

                {aiConfig.openai.has_system_fallback && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Using the system API key. Enter and save a workspace key here to override it.</div>}

                {/* API Key Input */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    OpenAI API Key
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showKeys.openai ? 'text' : 'password'}
                      placeholder="sk-proj-..."
                      value={aiConfig.openai.api_key || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiConfig(prev => ({
                          ...prev,
                          openai: { ...prev.openai, api_key: val }
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '0.45rem 2.2rem 0.45rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys(prev => ({ ...prev, openai: !prev.openai }))}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      {showKeys.openai ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Default Model */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Default Model
                  </label>
                  <select
                    value={aiConfig.openai.default_model || 'gpt-4o-mini'}
                    onChange={(e) => setAiConfig(prev => ({ ...prev, openai: { ...prev.openai, default_model: e.target.value } }))}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Fast & Cost-Effective)</option>
                    <option value="gpt-4o">gpt-4o (High Intelligence)</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini (Next-Gen Mini)</option>
                    <option value="gpt-4.1">gpt-4.1 (Next-Gen Flagship)</option>
                    <option value="o3-mini">o3-mini (Reasoning & Math)</option>
                    <option value="o1">o1 (Deep Reasoning)</option>
                  </select>
                </div>

                {/* Test Connection Button & Status */}
                <div style={{ marginTop: 'auto', paddingTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('openai')}
                    disabled={testingProvider === 'openai'}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.08)',
                      color: '#065f46',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: testingProvider === 'openai' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {testingProvider === 'openai' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {testingProvider === 'openai' ? 'Testing...' : 'Test OpenAI Connection'}
                  </button>

                  {testStatus.openai && (
                    <div style={{
                      marginTop: '0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: testStatus.openai.success ? '#047857' : '#b91c1c',
                      background: testStatus.openai.success ? '#ecfdf5' : '#fef2f2',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                      border: `1px solid ${testStatus.openai.success ? '#a7f3d0' : '#fecaca'}`
                    }}>
                      {testStatus.openai.message}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 2. Google Gemini Card */}
              {(availableProviderIds.includes('gemini') || addingProvider === 'gemini') && (
              <div style={{
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                      GEM
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Google Gemini</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>generativelanguage.googleapis.com</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    background: aiConfig.gemini.is_available ? '#ecfdf5' : '#f3f4f6',
                    color: aiConfig.gemini.is_available ? '#047857' : '#6b7280',
                    border: `1px solid ${aiConfig.gemini.is_available ? '#a7f3d0' : '#e5e7eb'}`
                  }}>
                    {aiConfig.gemini.is_configured ? 'Workspace Key' : aiConfig.gemini.has_system_fallback ? 'System API Key' : 'New Provider'}
                  </span>
                </div>

                {aiConfig.gemini.has_system_fallback && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Using the system API key. Enter and save a workspace key here to override it.</div>}

                {/* API Key Input */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Google AI / Gemini API Key
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showKeys.gemini ? 'text' : 'password'}
                      placeholder="AIzaSy..."
                      value={aiConfig.gemini.api_key || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiConfig(prev => ({
                          ...prev,
                          gemini: { ...prev.gemini, api_key: val }
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '0.45rem 2.2rem 0.45rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      {showKeys.gemini ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Default Model */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Default Model
                  </label>
                  <select
                    value={aiConfig.gemini.default_model || 'gemini-2.0-flash'}
                    onChange={(e) => setAiConfig(prev => ({ ...prev, gemini: { ...prev.gemini, default_model: e.target.value } }))}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Recommended, Superfast)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Adaptive Reasoning)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Lightweight)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Large 1M Context)</option>
                  </select>
                </div>

                {/* Test Connection Button & Status */}
                <div style={{ marginTop: 'auto', paddingTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('gemini')}
                    disabled={testingProvider === 'gemini'}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #3b82f6',
                      background: 'rgba(59, 130, 246, 0.08)',
                      color: '#1d4ed8',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: testingProvider === 'gemini' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {testingProvider === 'gemini' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {testingProvider === 'gemini' ? 'Testing...' : 'Test Gemini Connection'}
                  </button>

                  {testStatus.gemini && (
                    <div style={{
                      marginTop: '0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: testStatus.gemini.success ? '#047857' : '#b91c1c',
                      background: testStatus.gemini.success ? '#ecfdf5' : '#fef2f2',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                      border: `1px solid ${testStatus.gemini.success ? '#a7f3d0' : '#fecaca'}`
                    }}>
                      {testStatus.gemini.message}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 3. Anthropic Claude Card */}
              {(availableProviderIds.includes('claude') || addingProvider === 'claude') && (
              <div style={{
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                      ANT
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Anthropic Claude</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>api.anthropic.com</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    background: aiConfig.claude.is_available ? '#ecfdf5' : '#f3f4f6',
                    color: aiConfig.claude.is_available ? '#047857' : '#6b7280',
                    border: `1px solid ${aiConfig.claude.is_available ? '#a7f3d0' : '#e5e7eb'}`
                  }}>
                    {aiConfig.claude.is_configured ? 'Workspace Key' : aiConfig.claude.has_system_fallback ? 'System API Key' : 'New Provider'}
                  </span>
                </div>

                {aiConfig.claude.has_system_fallback && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Using the system API key. Enter and save a workspace key here to override it.</div>}

                {/* API Key Input */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Anthropic API Key
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showKeys.claude ? 'text' : 'password'}
                      placeholder="sk-ant-api03-..."
                      value={aiConfig.claude.api_key || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiConfig(prev => ({
                          ...prev,
                          claude: { ...prev.claude, api_key: val }
                        }));
                      }}
                      style={{
                        width: '100%',
                        padding: '0.45rem 2.2rem 0.45rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys(prev => ({ ...prev, claude: !prev.claude }))}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      {showKeys.claude ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Default Model */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                    Default Model
                  </label>
                  <select
                    value={aiConfig.claude.default_model || 'claude-3-5-sonnet'}
                    onChange={(e) => setAiConfig(prev => ({ ...prev, claude: { ...prev.claude, default_model: e.target.value } }))}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Hybrid Reasoning)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (State of the Art)</option>
                    <option value="claude-3-5-haiku">Claude 3.5 Haiku (Ultra Fast)</option>
                  </select>
                </div>

                {/* Test Connection Button & Status */}
                <div style={{ marginTop: 'auto', paddingTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => handleTestProvider('claude')}
                    disabled={testingProvider === 'claude'}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #8b5cf6',
                      background: 'rgba(139, 92, 246, 0.08)',
                      color: '#6d28d9',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: testingProvider === 'claude' ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    {testingProvider === 'claude' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {testingProvider === 'claude' ? 'Testing...' : 'Test Claude Connection'}
                  </button>

                  {testStatus.claude && (
                    <div style={{
                      marginTop: '0.4rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: testStatus.claude.success ? '#047857' : '#b91c1c',
                      background: testStatus.claude.success ? '#ecfdf5' : '#fef2f2',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                      border: `1px solid ${testStatus.claude.success ? '#a7f3d0' : '#fecaca'}`
                    }}>
                      {testStatus.claude.message}
                    </div>
                  )}
                </div>
              </div>
              )}

            </div>
          </div>
        )}
      </div>
      </div>

      <div id="ai-admin-users-panel" role="tabpanel" aria-labelledby="ai-admin-users-tab" hidden={activeSection !== 'users' || !visibleTabs.some(vt => vt.id === 'users')}>
      {/* User Search Bar Container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', flex: '1', maxWidth: '380px' }}>
          <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', zIndex: 5, pointerEvents: 'none' }} />
          <input 
            type="text" 
            placeholder="Search by name, email, or role..." 
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            className="search-input-field"
            style={{
              width: '100%',
              paddingLeft: '2.85rem',
              paddingRight: '2.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
              outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          />
          {userSearchQuery && (
            <button 
              onClick={() => setUserSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Showing {filteredUsers.length} of {users.length} users
        </div>
      </div>

      <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        <MobileTableView id="AiAdmin/AiAdminModule-1"><table style={{ width: `${getTotalTableWidth()}px`, borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: 'var(--th-bg)' }}>
            <tr>
              <th style={{ width: `${colWidths.employee}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Employee</span>
                </div>
                <ColumnResizer colKey="employee" isResizing={resizingCol === 'employee'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.role}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Role</span>
                </div>
                <ColumnResizer colKey="role" isResizing={resizingCol === 'role'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.token_usage}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Token Usage</span>
                </div>
                <ColumnResizer colKey="token_usage" isResizing={resizingCol === 'token_usage'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.token_limit}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Token Limit</span>
                </div>
                <ColumnResizer colKey="token_limit" isResizing={resizingCol === 'token_limit'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.premium_limit}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Premium Limit</span>
                </div>
                <ColumnResizer colKey="premium_limit" isResizing={resizingCol === 'premium_limit'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.ai_models}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>AI Models</span>
                </div>
                <ColumnResizer colKey="ai_models" isResizing={resizingCol === 'ai_models'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
              <th style={{ width: `${colWidths.actions}px`, padding: '1rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Actions</span>
                </div>
                <ColumnResizer colKey="actions" isResizing={resizingCol === 'actions'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const usagePercent = Math.min(100, Math.round((user.total_tokens / user.token_limit) * 100)) || 0;
              const isDanger = usagePercent >= 90;
              const isWarning = usagePercent >= 75 && usagePercent < 90;
              const selectedModels = user.ai_models || ['gpt-4o-mini'];
              const isDropdownOpen = openDropdownUserId === user.id;

              // Filtered models for dropdown search
              const filteredModels = availableModels.filter(m => 
                m.toLowerCase().includes(modelSearch.toLowerCase())
              );

              return (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ width: `${colWidths.employee}px`, padding: '1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }} title={user.name || 'Unknown User'}>{user.name || 'Unknown User'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3, marginTop: '0.2rem' }} title={user.email}>{user.email}</div>
                  </td>
                  <td style={{ width: `${colWidths.role}px`, padding: '1rem', boxSizing: 'border-box' }}>
                    <span style={{ padding: '0.25rem 0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ width: `${colWidths.token_usage}px`, padding: '1rem', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600, color: isDanger ? '#ef4444' : 'var(--text-primary)' }}>{user.total_tokens.toLocaleString()}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{usagePercent}%</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${usagePercent}%`, background: isDanger ? '#ef4444' : isWarning ? '#f59e0b' : 'var(--accent-color)', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                  </td>
                  <td style={{ width: `${colWidths.token_limit}px`, padding: '1rem', boxSizing: 'border-box' }}>
                    {editingLimit === user.id ? (
                      <input 
                        type="number" 
                        value={newLimitValue} 
                        onChange={(e) => setNewLimitValue(e.target.value)}
                        style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--accent-color)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.token_limit.toLocaleString()}</span>
                    )}
                  </td>
                  <td style={{ width: `${colWidths.premium_limit}px`, padding: '1rem', boxSizing: 'border-box' }}>
                    {editingLimit === user.id ? (
                      <input 
                        type="number" 
                        value={newPremiumLimitValue} 
                        onChange={(e) => setNewPremiumLimitValue(e.target.value)}
                        placeholder="Premium limit"
                        style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--accent-color)', outline: 'none' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, color: '#8b5cf6' }}>{user.premium_limit ? user.premium_limit.toLocaleString() : 'N/A'}</span>
                    )}
                  </td>
                  
                  {/* Multi-Select Dropdown Column */}
                  <td style={{ width: `${colWidths.ai_models}px`, padding: '1rem', position: 'relative', boxSizing: 'border-box' }}>
                    <button
                      ref={isDropdownOpen ? dropdownTriggerRef : null}
                      type="button"
                      aria-label={`Select AI models for ${user.name || 'user'}`}
                      aria-expanded={isDropdownOpen}
                      aria-haspopup="dialog"
                      onClick={(event) => toggleModelDropdown(event, user.id)}
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        border: isDropdownOpen ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                        background: 'var(--bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        minWidth: '200px',
                        maxWidth: '240px',
                        boxShadow: isDropdownOpen ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', overflow: 'hidden', maxHeight: '28px' }}>
                        {selectedModels.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select Models...</span>}
                        {selectedModels.slice(0, 2).map(m => (
                          <span key={m} style={{
                            fontSize: '0.72rem',
                            background: '#e0e7ff',
                            color: '#3730a3',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            {m}
                          </span>
                        ))}
                        {selectedModels.length > 2 && (
                          <span style={{
                            fontSize: '0.72rem',
                            background: '#f3f4f6',
                            color: '#4b5563',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}>
                            +{selectedModels.length - 2} more
                          </span>
                        )}
                      </div>
                      <ChevronDown size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0, transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>

                    {/* Popover Dropdown Menu */}
                    {isDropdownOpen && dropdownPosition && typeof document !== 'undefined' && createPortal(
                      <div 
                        ref={dropdownRef}
                        role="dialog"
                        aria-label={`AI models for ${user.name || 'user'}`}
                        style={{
                          position: 'fixed',
                          ...dropdownPosition,
                          overflowY: 'auto',
                          boxSizing: 'border-box',
                          background: 'var(--bg-primary, #ffffff)',
                          border: '1px solid var(--border-light, #e5e7eb)',
                          borderRadius: '10px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          zIndex: 9999,
                          padding: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.6rem'
                        }}
                      >
                        {/* Search Header */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: '#9ca3af' }} />
                          <input 
                            type="text" 
                            placeholder="Search AI models..." 
                            value={modelSearch} 
                            onChange={(e) => setModelSearch(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.5rem 0.4rem 2rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light, #d1d5db)',
                              fontSize: '0.8rem',
                              outline: 'none',
                              background: 'var(--bg-surface, #f9fafb)'
                            }}
                          />
                        </div>

                        {/* Quick Selection Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '0 0.1rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {selectedModels.length} of {availableModels.length} selected
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              onClick={() => handleModelChange(user.id, [...availableModels])}
                              style={{ border: 'none', background: 'transparent', color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Select All
                            </button>
                            <button 
                              onClick={() => handleModelChange(user.id, ['gpt-4o-mini'])}
                              style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>

                        {/* Scrollable Model Checkbox List */}
                        <div style={{
                          maxHeight: '180px',
                          overflowY: 'auto',
                          border: '1px solid var(--border-light, #f3f4f6)',
                          borderRadius: '6px',
                          padding: '0.25rem',
                          background: 'var(--bg-surface, #f9fafb)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.15rem'
                        }}>
                          {filteredModels.map(model => {
                            const checked = selectedModels.includes(model);
                            return (
                              <label key={model} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.5rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                background: checked ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                color: checked ? '#4338ca' : 'var(--text-primary)',
                                fontWeight: checked ? 600 : 400,
                                transition: 'background 0.1s'
                              }}>
                                <input 
                                  type="checkbox" 
                                  checked={checked}
                                  onChange={(e) => {
                                    let newModels;
                                    if (e.target.checked) {
                                      newModels = [...selectedModels, model];
                                    } else {
                                      newModels = selectedModels.filter(m => m !== model);
                                    }
                                    if (newModels.length === 0) newModels = ['gpt-4o-mini'];
                                    handleModelChange(user.id, newModels);
                                  }}
                                  style={{ cursor: 'pointer', accentColor: '#4f46e5' }}
                                />
                                {model}
                              </label>
                            );
                          })}
                          {filteredModels.length === 0 && (
                            <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                              No matching models found.
                            </div>
                          )}
                        </div>

                        {/* Add Custom Model Field */}
                        <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border-light, #eee)', paddingTop: '0.5rem' }}>
                          <input 
                            type="text" 
                            placeholder="+ Add model name (e.g. gpt-4.1)"
                            value={customModelInput}
                            onChange={(e) => setCustomModelInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddCustomModel(user.id, selectedModels);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.35rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-light, #d1d5db)',
                              fontSize: '0.75rem',
                              outline: 'none'
                            }}
                          />
                          <button 
                            onClick={() => handleAddCustomModel(user.id, selectedModels)}
                            style={{
                              background: '#4f46e5',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <Plus size={12} /> Add
                          </button>
                        </div>
                      </div>, document.body
                    )}
                  </td>

                  <td style={{ width: `${colWidths.actions}px`, padding: '1rem', boxSizing: 'border-box' }}>
                    {editingLimit === user.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button 
                          onClick={() => handleSaveLimit(user.id)}
                          disabled={saving}
                          style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button 
                          onClick={() => { setEditingLimit(null); setNewLimitValue(""); setNewPremiumLimitValue(""); }}
                          disabled={saving}
                          style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '0.4rem 0.6rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => { setEditingLimit(user.id); setNewLimitValue(user.token_limit.toString()); setNewPremiumLimitValue(user.premium_limit ? user.premium_limit.toString() : "10000"); }}
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
                      >
                        <Edit2 size={14} /> Edit Limits
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {userSearchQuery ? `No users found matching "${userSearchQuery}"` : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table></MobileTableView>
      </div>
      </div>

      <div id="ai-admin-billing-panel" role="tabpanel" aria-labelledby="ai-admin-billing-tab" hidden={activeSection !== 'billing' || !visibleTabs.some(vt => vt.id === 'billing')}>
        <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>API Usage & Billing</h3>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Provider reported spend for connected workspace accounts. This is usage cost, not wallet balance.
              </p>
            </div>
            <button type="button" onClick={loadBilling} disabled={billingLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontWeight: 600, cursor: billingLoading ? 'not-allowed' : 'pointer' }}>
              {billingLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
          </div>

          {billingLoading && !billing && <div role="status" style={{ color: 'var(--text-secondary)', padding: '1rem 0' }}>Loading provider billing reports…</div>}
          {billing && !billing.success && <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.8rem', borderRadius: '8px' }}>{billing.error}</div>}
          {billing?.success && (
            <>
              <div style={{ padding: '0.7rem 0.85rem', borderRadius: '8px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                Provider billing month to date: {billing.periodLabel}. Daily billing buckets begin at 05:30 IST. Reports can arrive with a delay.
              </div>
              {Object.keys(billing.providers || {}).length === 0 ? (
                <div style={{ border: '1px dashed var(--border-light)', borderRadius: '10px', padding: '1.25rem', color: 'var(--text-secondary)' }}>
                  No workspace API key is saved. Add a provider in AI Model Setup to see its billing setup and usage here.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                  {AI_PROVIDERS.filter(provider => billing.providers?.[provider.id]).map(provider => {
                    const report = billing.providers[provider.id];
                    return (
                      <section key={provider.id} aria-label={`${provider.label} billing`} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem', background: 'var(--bg-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{provider.label}</strong>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: report.status === 'ready' ? '#047857' : '#9a3412' }}>
                            {report.status === 'ready' ? 'Billing connected' : report.status === 'error' ? 'Report unavailable' : 'Setup needed'}
                          </span>
                        </div>
                        {report.status === 'ready' ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                              <div style={{ padding: '0.7rem', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Latest available day</div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.15rem', marginTop: '0.2rem' }}>
                                  {report.latestDay ? USD_FORMAT.format(report.latestDay.amount) : 'No report yet'}
                                </div>
                              </div>
                              <div style={{ padding: '0.7rem', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Month to date</div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.15rem', marginTop: '0.2rem' }}>
                                  {report.monthAmount === null ? 'No report yet' : USD_FORMAT.format(report.monthAmount)}
                                </div>
                              </div>
                            </div>
                            {report.latestDay && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Latest day: {report.latestDay.label}</div>}
                            {report.daily?.length > 0 && (
                              <div style={{ marginTop: '0.9rem' }}>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem' }}>Daily spend</div>
                                <div style={{ maxHeight: '230px', overflowY: 'auto', display: 'grid', gap: '0.3rem' }}>
                                  {report.daily.map(day => (
                                    <div key={day.start} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem 0.55rem', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.75rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>{day.label}</span>
                                      <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{USD_FORMAT.format(day.amount)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {provider.id === 'claude' && <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', margin: '0.65rem 0 0' }}>Claude Cost API excludes Priority Tier charges.</p>}
                          </>
                        ) : (
                          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{report.message}</div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}

