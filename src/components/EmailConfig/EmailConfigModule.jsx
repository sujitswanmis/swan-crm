'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect } from 'react';
import { 
  Mail, Save, Plus, Trash2, Edit3, Send, CheckCircle2, AlertCircle, 
  RefreshCw, Shield, Key, Eye, EyeOff, Server, Play, Clock, 
  Sparkles, Briefcase, Database, Tag, Copy, Check, ChevronRight, X,
  LayoutGrid, List, ChevronLeft, ChevronsLeft, ChevronsRight, CheckSquare, Square,
  Search, Star, Building2
} from 'lucide-react';
import { 
  getEmailConfig, 
  saveEmailConfig, 
  saveEmailTemplate, 
  deleteEmailTemplate,
  deleteBulkEmailTemplates,
  saveSmtpAccount,
  deleteSmtpAccount,
  setDefaultSmtpAccount,
  saveEmailAutomation, 
  deleteEmailAutomation, 
  sendTestEmail 
} from '@/app/actions/emailConfig';
import { getAllTenantBranches } from '@/app/actions/tenantBranches';

const SMTP_PRESETS = [
  {
    name: 'Gmail / Google Workspace',
    icon: '🔴',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    tip: 'Use your Google account email and an App Password (generated in Google Account Security).'
  },
  {
    name: 'Microsoft 365 / Outlook',
    icon: '🔵',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    tip: 'Use your Microsoft 365 corporate email and App Password.'
  },
  {
    name: 'Amazon SES',
    icon: '🟠',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    tip: 'Use your AWS SES SMTP credentials.'
  },
  {
    name: 'SendGrid',
    icon: '🔷',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    tip: 'Username is "apikey" and password is your SendGrid API key.'
  },
  {
    name: 'Brevo (Sendinblue)',
    icon: '🟢',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    tip: 'Use your Brevo SMTP login credentials.'
  },
  {
    name: 'Hostinger / Custom Domain',
    icon: '🟣',
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    tip: 'Use your domain email address (e.g. info@yourdomain.com) and mailbox password.'
  }
];

const SALES_STAGES = [
  '01 - New Stage',
  '02 - Contact Stage',
  '03 - Qualification Stage',
  '04 - Follow Up Stage',
  '05 - Sales Process Stage',
  '06 - Conversion Stage',
  '07 - Final Stage'
];

const RECRUITER_STAGES = [
  { id: 'S00', label: 'S00 - Requirements Received' },
  { id: 'S01', label: 'S01 - JDs Prepared & Posted' },
  { id: 'S02', label: 'S02 - Resume Filtered' },
  { id: 'S03', label: 'S03 - Interview Executed' },
  { id: 'S04', label: 'S04 - Test Result Updated' },
  { id: 'S05', label: 'S05 - ED Approval Pending' },
  { id: 'S06', label: 'S06 - Salary Negotiating' },
  { id: 'S07', label: 'S07 - Shortlisted' },
  { id: 'S08', label: 'S08 - LOI Released' },
  { id: 'S09', label: 'S09 - Joined' }
];

export default function EmailConfigModule({ moduleAccess = {}, userRole = '', userCompany = '', isMasterAdmin = false }) {
  const [activeTab, setActiveTab] = useState('smtp');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Addon Quota State
  const [smtpLimit, setSmtpLimit] = useState(1);
  const [isUnlimitedQuota, setIsUnlimitedQuota] = useState(false);

  // Config State & Multiple SMTP Accounts
  const [smtp, setSmtp] = useState({
    enabled: true,
    provider: 'Custom SMTP',
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from_name: 'SuPuja Creations Team',
    from_email: '',
    reply_to: '',
    signature: ''
  });
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [editingSmtp, setEditingSmtp] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Per-account test modal
  const [testModalAccount, setTestModalAccount] = useState(null);
  const [testModalRecipient, setTestModalRecipient] = useState('');
  const [testModalSending, setTestModalSending] = useState(false);
  const [testModalResult, setTestModalResult] = useState(null);
  const [selectedTestSmtpId, setSelectedTestSmtpId] = useState('');

  // Templates State
  const [templates, setTemplates] = useState([]);
  const [templateFilter, setTemplateFilter] = useState('all');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({
    id: '',
    category: 'Sales Pipeline',
    template_name: '',
    subject: '',
    message_body: '',
    target_pipeline: 'sales',
    target_stage: '01 - New Stage'
  });

  // Template Search, Selection, Pagination & Resizing States
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [templatePerPage, setTemplatePerPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_email_templates_per_page');
      if (saved) return Number(saved) || 12;
    }
    return 12;
  });
  const [templatePage, setTemplatePage] = useState(1);
  const [templateViewMode, setTemplateViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm_email_templates_view_mode') || 'grid';
    }
    return 'grid';
  });
  const [deletingBulkTemplates, setDeletingBulkTemplates] = useState(false);

  // Column Resizing for Template Table View (Mandatory Lead Data Table Rule)
  const [emailColWidths, setEmailColWidths] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('crm_email_templates_col_widths');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      select: 50,
      name: 180,
      category: 130,
      stage: 130,
      subject: 220,
      preview: 280,
      actions: 120
    };
  });
  const [resizingCol, setResizingCol] = useState(null);

  // Automations State
  const [automations, setAutomations] = useState([]);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [currentAuto, setCurrentAuto] = useState({
    id: '',
    name: '',
    pipeline: 'sales',
    stage_id: '01 - New Stage',
    stage_label: '01 - New Stage',
    template_id: '',
    smtp_account_id: '',
    is_active: true,
    delay_minutes: 0
  });

  // Logs State
  const [logs, setLogs] = useState([]);

  // Test Email State (Tab 4)
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Copied placeholder feedback
  const [copiedTag, setCopiedTag] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [res, branchRes] = await Promise.all([
        getEmailConfig(userCompany, isMasterAdmin),
        getAllTenantBranches().catch(() => ({ success: false, branches: [] }))
      ]);
      if (res.success && res.data) {
        setSmtp(res.data.smtp || {});
        const accounts = res.data.smtp_accounts || [];
        setSmtpAccounts(accounts);
        setSmtpLimit(res.data.smtp_limit || 1);
        setIsUnlimitedQuota(!!res.data.is_unlimited);
        if (accounts.length > 0) {
          const def = accounts.find(a => a.is_default) || accounts[0];
          setSelectedTestSmtpId(def.id);
        }
        setTemplates(res.data.templates || []);
        setAutomations(res.data.automations || []);
        setLogs(res.data.logs || []);
      }
      if (branchRes.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
      }
    } catch (e) {
      console.error('loadConfig error:', e);
      setErrorMsg('Failed to load email configuration.');
    } finally {
      setLoading(false);
    }
  };

  // --- SMTP Server Accounts Handlers ---
  const handleOpenAddSmtp = () => {
    if (!isUnlimitedQuota && !isMasterAdmin && smtpAccounts.length >= smtpLimit) {
      alert(`SMTP Server Quota Reached!\n\nYour current subscription plan allows up to ${smtpLimit} active SMTP server account(s).\n\nTo connect additional outbound email servers or branches, please contact your Master Admin to increase your quota.`);
      return;
    }
    setEditingSmtp({
      id: '',
      account_name: '',
      provider: 'Custom SMTP',
      is_default: smtpAccounts.length === 0,
      enabled: true,
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from_name: smtp.from_name || 'SuPuja Creations Team',
      from_email: '',
      reply_to: '',
      signature: smtp.signature || '',
      branch: 'All Branches'
    });
    setShowPassword(false);
    setShowSmtpModal(true);
  };

  const handleOpenEditSmtp = (acc) => {
    setEditingSmtp({ ...acc });
    setShowPassword(false);
    setShowSmtpModal(true);
  };

  const handleSaveSmtpAccountData = async () => {
    if (!editingSmtp) return;
    if (!editingSmtp.account_name?.trim() || !editingSmtp.host?.trim() || !editingSmtp.username?.trim() || !editingSmtp.password?.trim()) {
      alert('Account Name, SMTP Host, Username, and Password are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveSmtpAccount(editingSmtp, userCompany, isMasterAdmin);
      if (res.success) {
        setSaveSuccessMsg(`SMTP Server "${editingSmtp.account_name}" saved successfully!`);
        setShowSmtpModal(false);
        setEditingSmtp(null);
        await loadConfig();
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err) {
      alert('Failed to save SMTP server: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSmtpAccount = async (accId, accName) => {
    if (!confirm(`Are you sure you want to delete SMTP Server "${accName}"?`)) return;
    try {
      const res = await deleteSmtpAccount(accId);
      if (res.success) {
        setSaveSuccessMsg(`SMTP Server "${accName}" deleted.`);
        await loadConfig();
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err) {
      alert('Failed to delete SMTP server: ' + err.message);
    }
  };

  const handleSetDefaultSmtp = async (accId, accName) => {
    try {
      const res = await setDefaultSmtpAccount(accId);
      if (res.success) {
        setSaveSuccessMsg(`Set "${accName}" as default primary SMTP server.`);
        await loadConfig();
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err) {
      alert('Failed to set default SMTP server: ' + err.message);
    }
  };

  const handleApplyPresetToEditing = (preset) => {
    if (!editingSmtp) return;
    setEditingSmtp(prev => ({
      ...prev,
      provider: preset.name,
      host: preset.host,
      port: preset.port,
      secure: preset.secure
    }));
  };

  const handleOpenTestModal = (acc) => {
    setTestModalAccount(acc);
    setTestModalRecipient('');
    setTestModalResult(null);
    setTestModalSending(false);
  };

  const handleRunModalTest = async () => {
    if (!testModalRecipient || !testModalRecipient.includes('@')) {
      setTestModalResult({ success: false, message: 'Please enter a valid recipient email address.' });
      return;
    }
    setTestModalSending(true);
    setTestModalResult(null);
    try {
      const res = await sendTestEmail(testModalRecipient, testModalAccount);
      if (res.success) {
        setTestModalResult({ success: true, message: res.message });
        loadConfig();
      } else {
        setTestModalResult({ success: false, message: res.error });
      }
    } catch (err) {
      setTestModalResult({ success: false, message: err.message });
    } finally {
      setTestModalSending(false);
    }
  };

  // --- Column Resize Handlers for Table (Mandatory Lead Data Pattern) ---
  const handleColumnResizeMouseDown = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = emailColWidths[colKey] || 150;
    setResizingCol(colKey);

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const minW = colKey === 'select' ? 40 : 80;
      const newWidth = Math.max(minW, startWidth + deltaX);
      setEmailColWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('crm_email_templates_col_widths', JSON.stringify(updated));
        } catch (err) {}
        return updated;
      });
    };

    const onMouseUp = () => {
      setResizingCol(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetColumnWidth = (colKey) => {
    const defaults = {
      select: 50,
      name: 180,
      category: 130,
      stage: 130,
      subject: 220,
      preview: 280,
      actions: 120
    };
    setEmailColWidths(prev => {
      const updated = { ...prev, [colKey]: defaults[colKey] || 150 };
      try {
        localStorage.setItem('crm_email_templates_col_widths', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // --- Template Multi-Selection & Pagination Handlers ---
  const filteredTemplates = templates.filter(t => {
    if (templateFilter === 'sales' && !(t.target_pipeline === 'sales' || t.category === 'Sales Pipeline')) return false;
    if (templateFilter === 'recruiter' && !(t.target_pipeline === 'recruiter' || t.category === 'HR & Recruitment')) return false;

    if (!templateSearch.trim()) return true;
    const q = templateSearch.toLowerCase().trim();
    return (
      (t.template_name || '').toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      (t.message_body || '').toLowerCase().includes(q) ||
      (t.target_stage || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  });

  const totalTemplatePages = Math.max(1, Math.ceil(filteredTemplates.length / templatePerPage));
  const paginatedTemplates = filteredTemplates.slice(
    (templatePage - 1) * templatePerPage,
    templatePage * templatePerPage
  );

  useEffect(() => {
    setTemplatePage(1);
  }, [templateFilter, templateSearch, templatePerPage]);

  const handlePerPageChange = (size) => {
    setTemplatePerPage(size);
    setTemplatePage(1);
    try {
      localStorage.setItem('crm_email_templates_per_page', String(size));
    } catch (e) {}
  };

  const handleViewModeChange = (mode) => {
    setTemplateViewMode(mode);
    try {
      localStorage.setItem('crm_email_templates_view_mode', mode);
    } catch (e) {}
  };

  const handleToggleSelectTemplate = (id) => {
    setSelectedTemplateIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = paginatedTemplates.map(t => t.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTemplateIds.includes(id));
    if (allVisibleSelected) {
      setSelectedTemplateIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTemplateIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredTemplates.map(t => t.id);
    setSelectedTemplateIds(allFilteredIds);
  };

  const handleClearSelection = () => {
    setSelectedTemplateIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedTemplateIds.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedTemplateIds.length} selected email template(s)?`)) return;
    setDeletingBulkTemplates(true);
    try {
      const res = await deleteBulkEmailTemplates(selectedTemplateIds);
      if (res.success) {
        setSaveSuccessMsg(`Deleted ${res.count || selectedTemplateIds.length} template(s) successfully.`);
        setSelectedTemplateIds([]);
        await loadConfig();
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        alert('Error: ' + res.error);
      }
    } catch (err) {
      alert('Failed to delete templates: ' + err.message);
    } finally {
      setDeletingBulkTemplates(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient) {
      setTestResult({ success: false, message: 'Please enter a test recipient email address.' });
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const targetAccount = smtpAccounts.find(a => a.id === selectedTestSmtpId) || smtp;
      const res = await sendTestEmail(testEmailRecipient, targetAccount);
      if (res.success) {
        setTestResult({ success: true, message: res.message });
        loadConfig();
      } else {
        setTestResult({ success: false, message: res.error });
      }
    } catch (e) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate.template_name || !currentTemplate.subject || !currentTemplate.message_body) {
      alert('Template Name, Subject, and Message Body are required.');
      return;
    }
    const res = await saveEmailTemplate(currentTemplate);
    if (res.success) {
      setShowTemplateModal(false);
      loadConfig();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!confirm('Are you sure you want to delete this email template?')) return;
    const res = await deleteEmailTemplate(templateId);
    if (res.success) {
      loadConfig();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleSaveAutomation = async () => {
    if (!currentAuto.name || !currentAuto.template_id) {
      alert('Automation Name and Selected Template are required.');
      return;
    }
    const res = await saveEmailAutomation(currentAuto);
    if (res.success) {
      setShowAutoModal(false);
      loadConfig();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleDeleteAutomation = async (autoId) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    const res = await deleteEmailAutomation(autoId);
    if (res.success) {
      loadConfig();
    } else {
      alert('Error: ' + res.error);
    }
  };

  const copyToClipboard = (tag) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  return (
    <div style={{ width: '100%', paddingBottom: '3rem' }}>
      
      {/* Header Banner */}
      <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem', borderRadius: '16px', background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-primary) 100%)', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #4338ca 0%, #3b82f6 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(67, 56, 202, 0.3)' }}>
              <Mail size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Email Messaging & SMTP Gateway
              </h1>
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Configure outbound email gateway, manage dynamic email templates for Leads & Recruiter candidates, and automate stage-triggered emails.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={loadConfig}
              className="btn-action-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}
              title="Refresh configuration"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {saveSuccessMsg && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#dcfce7', color: '#166534', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
            <CheckCircle2 size={16} />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-light)', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {[
          { id: 'smtp', label: '⚙️ SMTP Server Settings', count: smtpAccounts.length },
          { id: 'templates', label: '📝 Email Templates', count: templates.length },
          { id: 'automations', label: '⚡ Stage Automations', count: automations.length },
          { id: 'test', label: '🚀 Live Email Test', count: null },
          { id: 'logs', label: '📜 Sent History', count: logs.length }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.15rem',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-color)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: '-2px',
              transition: 'all 0.15s'
            }}
          >
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '12px', background: activeTab === tab.id ? 'var(--nav-active-bg)' : 'var(--bg-primary)', color: 'inherit', fontWeight: 700 }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MULTIPLE SMTP SERVER SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'smtp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Header Action Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Server size={18} style={{ color: 'var(--accent-color)' }} />
                  <span>Configured SMTP Server Accounts</span>
                </h3>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  background: (!isUnlimitedQuota && !isMasterAdmin && smtpAccounts.length >= smtpLimit) ? '#fef2f2' : '#ecfdf5',
                  color: (!isUnlimitedQuota && !isMasterAdmin && smtpAccounts.length >= smtpLimit) ? '#b91c1c' : '#047857',
                  border: `1px solid ${(!isUnlimitedQuota && !isMasterAdmin && smtpAccounts.length >= smtpLimit) ? '#fecaca' : '#a7f3d0'}`
                }}>
                  Quota: {smtpAccounts.length} / {isUnlimitedQuota || isMasterAdmin ? '∞ Unlimited' : `${smtpLimit} Allowed`}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                Add and manage multiple outbound email gateways. Assign primary defaults, set branch scopes, and run live verification tests.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddSmtp}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.15rem', fontSize: '0.88rem', borderRadius: '8px' }}
            >
              <Plus size={16} />
              <span>Add SMTP Server</span>
            </button>
          </div>

          {/* Quota limit warning notice if reached */}
          {!isUnlimitedQuota && !isMasterAdmin && smtpAccounts.length >= smtpLimit && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.84rem'
            }}>
              <AlertCircle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <strong>Addon Quota Reached:</strong> You have reached your allocated SMTP server limit (<strong>{smtpAccounts.length}/{smtpLimit}</strong>). To connect additional branches or multiple SMTP gateways, please contact Master Admin to increase your quota.
              </div>
            </div>
          )}

          {/* SMTP Server Accounts Cards */}
          {smtpAccounts.length === 0 ? (
            <div className="card" style={{ padding: '3rem 1.5rem', textAlign: 'center', borderRadius: '14px', border: '1px dashed var(--border-light)' }}>
              <Server size={42} style={{ opacity: 0.35, margin: '0 auto 0.75rem auto', color: 'var(--accent-color)' }} />
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>No SMTP Servers Configured</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
                Configure your first SMTP email gateway to start sending outbound emails to leads and candidates.
              </p>
              <button
                type="button"
                onClick={handleOpenAddSmtp}
                className="btn-primary"
                style={{ padding: '0.6rem 1.35rem', fontSize: '0.88rem', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={16} /> Add First SMTP Server
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {smtpAccounts.map((acc) => {
                const isDef = !!acc.is_default;
                const presetInfo = SMTP_PRESETS.find(p => p.name === acc.provider);

                return (
                  <div
                    key={acc.id}
                    className="card"
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: isDef ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      background: isDef ? 'var(--nav-active-bg, rgba(37,99,235,0.03))' : 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>
                            {presetInfo?.icon || '📧'}
                          </span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {acc.provider || 'Custom SMTP'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {isDef && (
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              background: '#fef3c7',
                              color: '#b45309',
                              border: '1px solid #fde68a',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <Star size={11} fill="#b45309" /> Default Primary
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '6px',
                            background: acc.enabled !== false ? '#dcfce7' : '#f3f4f6',
                            color: acc.enabled !== false ? '#166534' : '#6b7280'
                          }}>
                            {acc.enabled !== false ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </div>

                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                        {acc.account_name}
                      </h4>

                      <div style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                        background: 'var(--bg-primary)',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <div><strong>Host:</strong> {acc.host || 'Not set'}:{acc.port || 587} {acc.secure ? '(SSL 465)' : '(TLS 587)'}</div>
                        <div><strong>Sender:</strong> {acc.from_name || 'CRM'} &lt;{acc.from_email || acc.username}&gt;</div>
                        <div><strong>Username:</strong> {acc.username || '—'}</div>
                        {acc.branch && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                            <Building2 size={12} />
                            <span><strong>Branch:</strong> {acc.branch}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                      <div>
                        {!isDef && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultSmtp(acc.id, acc.account_name)}
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                            title="Make this the default primary SMTP account"
                          >
                            <Star size={12} /> Set Default
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenTestModal(acc)}
                          className="btn-action-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Test connection for this server"
                        >
                          <Send size={12} /> Test
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSmtp(acc)}
                          className="btn-action-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Edit SMTP Server"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        {smtpAccounts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSmtpAccount(acc.id, acc.account_name)}
                            style={{
                              padding: '0.35rem 0.55rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#fee2e2',
                              color: '#ef4444',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="Delete SMTP Server"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: EMAIL TEMPLATES LIBRARY (SEARCH, MULTI-SELECT, PER-PAGE & VIEWS) */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* TOOLBAR: Filter Tabs, Real-Time Search, Items Per Page & View Mode Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)'
          }}>
            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All (${templates.length})` },
                { id: 'sales', label: `📊 Sales (${templates.filter(t => t.target_pipeline === 'sales' || t.category === 'Sales Pipeline').length})` },
                { id: 'recruiter', label: `💼 HR & Recruiter (${templates.filter(t => t.target_pipeline === 'recruiter' || t.category === 'HR & Recruitment').length})` }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTemplateFilter(f.id)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: templateFilter === f.id ? 700 : 500,
                    border: templateFilter === f.id ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                    background: templateFilter === f.id ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                    color: templateFilter === f.id ? 'var(--accent-color)' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Box, Per-Page Selector & View Mode Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              
              {/* Search Input */}
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search templates, subjects, stages..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 2rem 0.45rem 2.2rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.84rem',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                />
                {templateSearch && (
                  <button
                    type="button"
                    onClick={() => setTemplateSearch('')}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Items Per Page Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Per page:</span>
                <select
                  value={templatePerPage}
                  onChange={(e) => handlePerPageChange(Number(e.target.value))}
                  style={{
                    padding: '0.45rem 0.6rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* View Mode Toggle (Grid vs Table) */}
              <div style={{ display: 'flex', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('grid')}
                  style={{
                    padding: '0.45rem 0.65rem',
                    border: 'none',
                    background: templateViewMode === 'grid' ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                    color: templateViewMode === 'grid' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Grid Cards View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleViewModeChange('table')}
                  style={{
                    padding: '0.45rem 0.65rem',
                    border: 'none',
                    borderLeft: '1px solid var(--border-light)',
                    background: templateViewMode === 'table' ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                    color: templateViewMode === 'table' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Table / Selection List View"
                >
                  <List size={15} />
                </button>
              </div>

              {/* Create Template Button */}
              <button
                type="button"
                onClick={() => {
                  setCurrentTemplate({
                    id: '',
                    category: templateFilter === 'recruiter' ? 'HR & Recruitment' : 'Sales Pipeline',
                    template_name: '',
                    subject: '',
                    message_body: '',
                    target_pipeline: templateFilter === 'recruiter' ? 'recruiter' : 'sales',
                    target_stage: templateFilter === 'recruiter' ? 'S03' : '01 - New Stage'
                  });
                  setShowTemplateModal(true);
                }}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.48rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}
              >
                <Plus size={15} />
                <span>Create Template</span>
              </button>
            </div>
          </div>

          {/* MULTI-SELECTION ACTION BAR */}
          {selectedTemplateIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1.25rem',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              fontSize: '0.88rem',
              fontWeight: 500,
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckSquare size={18} style={{ color: '#2563eb' }} />
                <span>
                  <strong>{selectedTemplateIds.length}</strong> template(s) selected
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', color: '#1e40af', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Select Page ({paginatedTemplates.length})
                </button>

                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', color: '#1e40af', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Select All Filtered ({filteredTemplates.length})
                </button>

                <button
                  type="button"
                  onClick={handleClearSelection}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', color: '#64748b', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Clear Selection
                </button>

                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={deletingBulkTemplates}
                  style={{
                    padding: '0.3rem 0.85rem',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <Trash2 size={13} />
                  <span>{deletingBulkTemplates ? 'Deleting...' : `Delete Selected (${selectedTemplateIds.length})`}</span>
                </button>
              </div>
            </div>
          )}

          {/* EMPTY STATE */}
          {filteredTemplates.length === 0 && (
            <div className="card" style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Mail size={42} style={{ opacity: 0.3, margin: '0 auto 0.75rem auto' }} />
              <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>No Email Templates Found</div>
              <div style={{ fontSize: '0.82rem' }}>
                {templateSearch ? `No templates matched "${templateSearch}". Try clearing your search.` : 'Click "Create Template" to add your first email template.'}
              </div>
            </div>
          )}

          {/* 1. GRID CARDS VIEW */}
          {filteredTemplates.length > 0 && templateViewMode === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {paginatedTemplates.map(tpl => {
                const isSelected = selectedTemplateIds.includes(tpl.id);

                return (
                  <div
                    key={tpl.id}
                    className="card"
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      border: isSelected ? '2px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? 'var(--nav-active-bg, rgba(37,99,235,0.02))' : 'var(--bg-surface)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTemplate(tpl.id)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)' }}
                            title={isSelected ? "Deselect" : "Select"}
                          >
                            {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                          </button>

                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '6px',
                            background: tpl.target_pipeline === 'recruiter' ? '#fdf2f8' : '#eff6ff',
                            color: tpl.target_pipeline === 'recruiter' ? '#db2777' : '#2563eb',
                            border: tpl.target_pipeline === 'recruiter' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                          }}>
                            {tpl.target_pipeline === 'recruiter' ? 'HR & Recruiter' : 'Sales Pipeline'}
                          </span>
                        </div>

                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Stage: <strong>{tpl.target_stage}</strong>
                        </span>
                      </div>

                      <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
                        {tpl.template_name}
                      </h4>

                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-color)', marginBottom: '0.5rem' }}>
                        Subject: {tpl.subject}
                      </div>

                      <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        backgroundColor: 'var(--bg-primary)',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.45,
                        border: '1px solid var(--border-light)'
                      }}>
                        {tpl.message_body}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTemplate(tpl);
                          setShowTemplateModal(true);
                        }}
                        className="btn-action-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.78rem',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. TABLE / SELECTION LIST VIEW (MANDATORY LEAD DATA COLUMN RESIZING PATTERN) */}
          {filteredTemplates.length > 0 && templateViewMode === 'table' && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    
                    {/* Checkbox Header */}
                    <th style={{ width: `${emailColWidths.select}px`, padding: '0.75rem 0.6rem', textAlign: 'center', position: 'relative' }}>
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: paginatedTemplates.every(t => selectedTemplateIds.includes(t.id)) ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)' }}
                        title="Toggle Select Page"
                      >
                        {paginatedTemplates.length > 0 && paginatedTemplates.every(t => selectedTemplateIds.includes(t.id)) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'select')}
                        onDoubleClick={() => handleResetColumnWidth('select')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'select' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                      />
                    </th>

                    {/* Template Name Header */}
                    <th style={{ width: `${emailColWidths.name}px`, padding: '0.75rem', position: 'relative', fontWeight: 600 }}>
                      Template Name
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'name')}
                        onDoubleClick={() => handleResetColumnWidth('name')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'name' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>

                    {/* Pipeline / Category Header */}
                    <th style={{ width: `${emailColWidths.category}px`, padding: '0.75rem', position: 'relative', fontWeight: 600 }}>
                      Pipeline
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'category')}
                        onDoubleClick={() => handleResetColumnWidth('category')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'category' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>

                    {/* Target Stage Header */}
                    <th style={{ width: `${emailColWidths.stage}px`, padding: '0.75rem', position: 'relative', fontWeight: 600 }}>
                      Target Stage
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'stage')}
                        onDoubleClick={() => handleResetColumnWidth('stage')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'stage' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>

                    {/* Subject Header */}
                    <th style={{ width: `${emailColWidths.subject}px`, padding: '0.75rem', position: 'relative', fontWeight: 600 }}>
                      Subject Line
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'subject')}
                        onDoubleClick={() => handleResetColumnWidth('subject')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'subject' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>

                    {/* Preview Header */}
                    <th style={{ width: `${emailColWidths.preview}px`, padding: '0.75rem', position: 'relative', fontWeight: 600 }}>
                      Message Preview
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'preview')}
                        onDoubleClick={() => handleResetColumnWidth('preview')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'preview' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>

                    {/* Actions Header */}
                    <th style={{ width: `${emailColWidths.actions}px`, padding: '0.75rem', position: 'relative', fontWeight: 600, textAlign: 'center' }}>
                      Actions
                      <div
                        onMouseDown={(e) => handleColumnResizeMouseDown(e, 'actions')}
                        onDoubleClick={() => handleResetColumnWidth('actions')}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none', backgroundColor: resizingCol === 'actions' ? 'var(--accent-color, #2563eb)' : 'transparent' }}
                        title="Drag to resize, double-click to reset"
                      />
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedTemplates.map((tpl) => {
                    const isSelected = selectedTemplateIds.includes(tpl.id);

                    return (
                      <tr
                        key={tpl.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? 'var(--nav-active-bg, rgba(37,99,235,0.03))' : 'transparent',
                          transition: 'background-color 0.12s'
                        }}
                      >
                        {/* Checkbox Cell */}
                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTemplate(tpl.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)' }}
                          >
                            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>

                        {/* Name Cell */}
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tpl.template_name}>
                          {tpl.template_name}
                        </td>

                        {/* Pipeline Cell */}
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '6px',
                            background: tpl.target_pipeline === 'recruiter' ? '#fdf2f8' : '#eff6ff',
                            color: tpl.target_pipeline === 'recruiter' ? '#db2777' : '#2563eb',
                            border: tpl.target_pipeline === 'recruiter' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                          }}>
                            {tpl.target_pipeline === 'recruiter' ? 'HR & Recruiter' : 'Sales'}
                          </span>
                        </td>

                        {/* Target Stage Cell */}
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <strong>{tpl.target_stage}</strong>
                        </td>

                        {/* Subject Cell */}
                        <td style={{ padding: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tpl.subject}>
                          {tpl.subject}
                        </td>

                        {/* Body Preview Cell */}
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tpl.message_body}>
                          {tpl.message_body ? tpl.message_body.replace(/\n/g, ' ').slice(0, 120) : '—'}
                        </td>

                        {/* Actions Cell */}
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentTemplate(tpl);
                                setShowTemplateModal(true);
                              }}
                              style={{ padding: '0.28rem 0.55rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              style={{ padding: '0.28rem 0.45rem', borderRadius: '4px', border: 'none', backgroundColor: '#fee2e2', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                              title="Delete Template"
                            >
                              <Trash2 size={14} />
                            </button>
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
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              marginTop: '0.5rem',
              padding: '0.85rem 1.15rem',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '8px',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Showing <strong>{(templatePage - 1) * templatePerPage + 1}</strong> to <strong>{Math.min(templatePage * templatePerPage, filteredTemplates.length)}</strong> of <strong>{filteredTemplates.length}</strong> template(s)
                {templateSearch && <span> (filtered from {templates.length} total)</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setTemplatePage(1)}
                  disabled={templatePage === 1}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: templatePage === 1 ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-primary)',
                    cursor: templatePage === 1 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                  title="First Page"
                >
                  <ChevronsLeft size={14} /> First
                </button>

                <button
                  type="button"
                  onClick={() => setTemplatePage(prev => Math.max(1, prev - 1))}
                  disabled={templatePage === 1}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: templatePage === 1 ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-primary)',
                    cursor: templatePage === 1 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                  title="Previous Page"
                >
                  <ChevronLeft size={14} /> Prev
                </button>

                {/* NUMBERED PAGE PILLS WITH ELLIPSIS */}
                {Array.from({ length: totalTemplatePages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalTemplatePages || Math.abs(p - templatePage) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) {
                      acc.push('ellipsis-' + p);
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map(item => {
                    if (typeof item === 'string' && item.startsWith('ellipsis')) {
                      return <span key={item} style={{ padding: '0 0.35rem', color: 'var(--text-secondary)' }}>...</span>;
                    }
                    const isCurrent = item === templatePage;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setTemplatePage(item)}
                        style={{
                          minWidth: '32px',
                          height: '32px',
                          borderRadius: '4px',
                          border: isCurrent ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                          backgroundColor: isCurrent ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface)',
                          color: isCurrent ? '#fff' : 'var(--text-primary)',
                          fontWeight: isCurrent ? 700 : 500,
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        {item}
                      </button>
                    );
                  })}

                <button
                  type="button"
                  onClick={() => setTemplatePage(prev => Math.min(totalTemplatePages, prev + 1))}
                  disabled={templatePage === totalTemplatePages}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: templatePage === totalTemplatePages ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-primary)',
                    cursor: templatePage === totalTemplatePages ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                  title="Next Page"
                >
                  Next <ChevronRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setTemplatePage(totalTemplatePages)}
                  disabled={templatePage === totalTemplatePages}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface)',
                    color: templatePage === totalTemplatePages ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-primary)',
                    cursor: templatePage === totalTemplatePages ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                  title="Last Page"
                >
                  Last <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STAGE AUTOMATIONS (SALES & RECRUITER) */}
      {/* ========================================================================= */}
      {activeTab === 'automations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Automated Stage Trigger Rules
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                When a Lead or Recruiter Candidate enters a specific stage, automatically dispatch the assigned email template.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCurrentAuto({
                  id: '',
                  name: '',
                  pipeline: 'sales',
                  stage_id: '01 - New Stage',
                  stage_label: '01 - New Stage',
                  template_id: templates[0]?.id || '',
                  is_active: true,
                  delay_minutes: 0
                });
                setShowAutoModal(true);
              }}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.15rem', fontSize: '0.88rem', borderRadius: '8px' }}
            >
              <Plus size={16} />
              <span>Add Stage Automation</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {automations.map(auto => {
              const matchedTemplate = templates.find(t => t.id === auto.template_id);

              return (
                <div
                  key={auto.id}
                  className="card"
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: auto.pipeline === 'recruiter' ? '#fdf2f8' : '#eff6ff',
                      color: auto.pipeline === 'recruiter' ? '#db2777' : '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {auto.pipeline === 'recruiter' ? <Briefcase size={20} /> : <Database size={20} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {auto.name}
                        </span>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '6px',
                          background: auto.is_active ? '#dcfce7' : '#f3f4f6',
                          color: auto.is_active ? '#166534' : '#4b5563'
                        }}>
                          {auto.is_active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>Trigger: <strong>{auto.stage_label || auto.stage_id}</strong></span>
                        <span>•</span>
                        <span>Template: <strong>{matchedTemplate ? matchedTemplate.template_name : 'No Template'}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentAuto(auto);
                        setShowAutoModal(true);
                      }}
                      className="btn-action-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <Edit3 size={13} />
                      <span style={{ marginLeft: '0.3rem' }}>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAutomation(auto.id)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={13} />
                      <span style={{ marginLeft: '0.3rem' }}>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LIVE TEST EMAIL SENDER */}
      {/* ========================================================================= */}
      {activeTab === 'test' && (
        <div className="card" style={{ padding: '1.75rem', borderRadius: '14px', maxWidth: '650px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Send size={18} style={{ color: 'var(--accent-color)' }} />
            <span>Send Live SMTP Test Email</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Dispatch a live verification email to any inbox to verify that your SMTP host, credentials, and SSL/TLS certificates are working 100%.
          </p>

          {smtpAccounts.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Select SMTP Server to Test
              </label>
              <select
                value={selectedTestSmtpId}
                onChange={(e) => setSelectedTestSmtpId(e.target.value)}
                style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.92rem', backgroundColor: 'var(--bg-surface)' }}
              >
                {smtpAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_name} — {a.host}:{a.port} {a.is_default ? '⭐ (Default Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Recipient Email Address *
            </label>
            <input
              type="email"
              value={testEmailRecipient}
              onChange={(e) => setTestEmailRecipient(e.target.value)}
              placeholder="you@company.com or personal@gmail.com"
              style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.92rem' }}
            />
          </div>

          {(() => {
            const currentTestAcc = smtpAccounts.find(a => a.id === selectedTestSmtpId) || smtp;
            return (
              <div style={{ background: 'var(--bg-primary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <div><strong>Testing Gateway:</strong> {currentTestAcc.account_name || 'Primary Gateway'} ({currentTestAcc.provider || 'Custom SMTP'})</div>
                <div><strong>Host & Port:</strong> {currentTestAcc.host || 'Not configured'}:{currentTestAcc.port || 587} {currentTestAcc.secure ? '(SSL 465)' : '(TLS 587)'}</div>
                <div><strong>Sender:</strong> {currentTestAcc.from_name} &lt;{currentTestAcc.from_email || currentTestAcc.username}&gt;</div>
              </div>
            );
          })()}

          <button
            type="button"
            onClick={handleSendTestEmail}
            disabled={sendingTest || !testEmailRecipient}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', fontSize: '0.92rem', borderRadius: '8px' }}
          >
            <Send size={16} />
            <span>{sendingTest ? 'Sending Test Email...' : 'Send Live Test Email'}</span>
          </button>

          {testResult && (
            <div style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: testResult.success ? '#dcfce7' : '#fee2e2',
              color: testResult.success ? '#166534' : '#b91c1c',
              border: testResult.success ? '1px solid #bbf7d0' : '1px solid #fecaca',
              fontSize: '0.88rem'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                {testResult.success ? '✅ Test Email Delivered!' : '❌ SMTP Delivery Failed'}
              </div>
              <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                {testResult.message}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SENT HISTORY / LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
            Recent Dispatched Emails History
          </h3>

          {logs.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Mail size={36} style={{ opacity: 0.3, margin: '0 auto 0.75rem auto' }} />
              <div>No dispatched emails recorded yet.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <MobileTableView id="EmailConfig/EmailConfigModule-1"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Recipient</th>
                    <th style={{ padding: '0.75rem' }}>Subject</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{log.recipient}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{log.subject}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></MobileTableView>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT EMAIL TEMPLATE */}
      {/* ========================================================================= */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {currentTemplate.id ? 'Edit Email Template' : 'Create New Email Template'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Target Pipeline *</label>
                <select
                  value={currentTemplate.target_pipeline || 'sales'}
                  onChange={(e) => setCurrentTemplate({
                    ...currentTemplate,
                    target_pipeline: e.target.value,
                    target_stage: e.target.value === 'recruiter' ? 'S03' : '01 - New Stage'
                  })}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                >
                  <option value="sales">📊 Sales Pipeline (Leads)</option>
                  <option value="recruiter">💼 HR & Recruitment (Candidates)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Target Stage *</label>
                <select
                  value={currentTemplate.target_stage || ''}
                  onChange={(e) => setCurrentTemplate({ ...currentTemplate, target_stage: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                >
                  {currentTemplate.target_pipeline === 'recruiter' ? (
                    RECRUITER_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)
                  ) : (
                    SALES_STAGES.map(s => <option key={s} value={s}>{s}</option>)
                  )}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Template Name *</label>
              <input
                type="text"
                value={currentTemplate.template_name || ''}
                onChange={(e) => setCurrentTemplate({ ...currentTemplate, template_name: e.target.value })}
                placeholder="e.g. Welcome Email or Interview Schedule"
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Email Subject Line *</label>
              <input
                type="text"
                value={currentTemplate.subject || ''}
                onChange={(e) => setCurrentTemplate({ ...currentTemplate, subject: e.target.value })}
                placeholder="e.g. Welcome to SuPuja Creations, {{name}}!"
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
              />
            </div>

            {/* Placeholders Helper Box */}
            <div style={{ background: 'var(--bg-primary)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                💡 Click to Copy Dynamic Placeholders:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {(currentTemplate.target_pipeline === 'recruiter' ? [
                  '{{candidate_name}}', '{{candidate_email}}', '{{candidate_phone}}', '{{job_title}}', '{{candidate_id}}', '{{recruiter_name}}'
                ] : [
                  '{{name}}', '{{phone}}', '{{company}}', '{{lead_ref_id}}', '{{stage}}', '{{rep_name}}'
                ]).map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => copyToClipboard(tag)}
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '6px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-light)',
                      color: copiedTag === tag ? '#16a34a' : 'var(--accent-color)',
                      cursor: 'pointer'
                    }}
                  >
                    {tag} {copiedTag === tag ? '✓' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Message Body (Text / HTML) *</label>
              <textarea
                rows={8}
                value={currentTemplate.message_body || ''}
                onChange={(e) => setCurrentTemplate({ ...currentTemplate, message_body: e.target.value })}
                placeholder="Dear {{name}},\n\nThank you for reaching out..."
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="btn-action-secondary"
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontSize: '0.88rem', borderRadius: '8px' }}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT AUTOMATION RULE */}
      {/* ========================================================================= */}
      {showAutoModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {currentAuto.id ? 'Edit Stage Automation' : 'New Stage Automation Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAutoModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Automation Name *</label>
              <input
                type="text"
                value={currentAuto.name || ''}
                onChange={(e) => setCurrentAuto({ ...currentAuto, name: e.target.value })}
                placeholder="e.g. Auto-send Welcome Email on New Lead"
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Pipeline Type</label>
                <select
                  value={currentAuto.pipeline || 'sales'}
                  onChange={(e) => {
                    const pipe = e.target.value;
                    setCurrentAuto({
                      ...currentAuto,
                      pipeline: pipe,
                      stage_id: pipe === 'recruiter' ? 'S03' : '01 - New Stage',
                      stage_label: pipe === 'recruiter' ? 'S03 - Interview Executed' : '01 - New Stage'
                    });
                  }}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                >
                  <option value="sales">📊 Sales Pipeline (Leads)</option>
                  <option value="recruiter">💼 HR & Recruitment (Candidates)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Trigger Stage</label>
                <select
                  value={currentAuto.stage_id || ''}
                  onChange={(e) => {
                    const stId = e.target.value;
                    let stLabel = stId;
                    if (currentAuto.pipeline === 'recruiter') {
                      const found = RECRUITER_STAGES.find(s => s.id === stId);
                      if (found) stLabel = found.label;
                    }
                    setCurrentAuto({ ...currentAuto, stage_id: stId, stage_label: stLabel });
                  }}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                >
                  {currentAuto.pipeline === 'recruiter' ? (
                    RECRUITER_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)
                  ) : (
                    SALES_STAGES.map(s => <option key={s} value={s}>{s}</option>)
                  )}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Assigned Email Template *</label>
              <select
                value={currentAuto.template_id || ''}
                onChange={(e) => setCurrentAuto({ ...currentAuto, template_id: e.target.value })}
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
              >
                <option value="">-- Select Template --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.template_name} ({t.target_pipeline})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                type="checkbox"
                id="autoActiveCheck"
                checked={currentAuto.is_active}
                onChange={(e) => setCurrentAuto({ ...currentAuto, is_active: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)', cursor: 'pointer' }}
              />
              <label htmlFor="autoActiveCheck" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                Enable this automation rule
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowAutoModal(false)}
                className="btn-action-secondary"
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAutomation}
                className="btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontSize: '0.88rem', borderRadius: '8px' }}
              >
                Save Automation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT SMTP SERVER ACCOUNT */}
      {/* ========================================================================= */}
      {showSmtpModal && editingSmtp && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server size={20} style={{ color: 'var(--accent-color)' }} />
                <span>{editingSmtp.id ? 'Edit SMTP Server Gateway' : 'Add New SMTP Server Gateway'}</span>
              </h3>
              <button
                type="button"
                onClick={() => { setShowSmtpModal(false); setEditingSmtp(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 1-Click Presets inside modal */}
            <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Quick Fill with 1-Click SMTP Presets:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {SMTP_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPresetToEditing(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: editingSmtp.host === preset.host ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                      background: editingSmtp.host === preset.host ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Account Name / Label *
                </label>
                <input
                  type="text"
                  value={editingSmtp.account_name || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, account_name: e.target.value })}
                  placeholder="e.g. Primary Company Mail or HR Recruitment Desk"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Provider / Gateway Name
                </label>
                <input
                  type="text"
                  value={editingSmtp.provider || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, provider: e.target.value })}
                  placeholder="e.g. Gmail, Outlook, Hostinger, Custom SMTP"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  SMTP Host Server *
                </label>
                <input
                  type="text"
                  value={editingSmtp.host || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, host: e.target.value })}
                  placeholder="e.g. smtp.gmail.com or smtp.hostinger.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Port *
                </label>
                <input
                  type="number"
                  value={editingSmtp.port || 587}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, port: Number(e.target.value) })}
                  placeholder="587 or 465"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.4rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingSmtp.secure || editingSmtp.port === 465}
                    onChange={(e) => setEditingSmtp({ ...editingSmtp, secure: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
                  />
                  <span>SSL (Port 465)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  SMTP Username / Login Email *
                </label>
                <input
                  type="text"
                  value={editingSmtp.username || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, username: e.target.value })}
                  placeholder="you@yourcompany.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  SMTP Password / App Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editingSmtp.password || ''}
                    onChange={(e) => setEditingSmtp({ ...editingSmtp, password: e.target.value })}
                    placeholder="Enter password or App Password"
                    style={{ width: '100%', padding: '0.6rem 2.4rem 0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Display Sender Name
                </label>
                <input
                  type="text"
                  value={editingSmtp.from_name || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, from_name: e.target.value })}
                  placeholder="e.g. SuPuja HR Team"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  From Email Address
                </label>
                <input
                  type="email"
                  value={editingSmtp.from_email || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, from_email: e.target.value })}
                  placeholder="Leave blank to use username"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Reply-To Email Address
                </label>
                <input
                  type="email"
                  value={editingSmtp.reply_to || ''}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, reply_to: e.target.value })}
                  placeholder="replies@yourcompany.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.88rem' }}
                />
              </div>
            </div>

            {/* Branch Scope & Default Setting */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem', padding: '0.85rem 1rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Assigned Branch / Scope
                </label>
                <select
                  value={editingSmtp.branch || 'All Branches'}
                  onChange={(e) => setEditingSmtp({ ...editingSmtp, branch: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', backgroundColor: 'var(--bg-surface)' }}
                >
                  <option value="All Branches">🌐 All Branches (Global)</option>
                  {(branches || []).filter(b => b.branch_name).map(b => (
                    <option key={b.id || b.branch_name} value={b.branch_name}>
                      🏢 {b.branch_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingSmtp.is_default || smtpAccounts.length === 0}
                    onChange={(e) => setEditingSmtp({ ...editingSmtp, is_default: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
                  />
                  <span>⭐ Set as Default Primary Server</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingSmtp.enabled !== false}
                    onChange={(e) => setEditingSmtp({ ...editingSmtp, enabled: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
                  />
                  <span>Active / Enabled Gateway</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Default Email Signature (Optional)
              </label>
              <textarea
                rows={3}
                value={editingSmtp.signature || ''}
                onChange={(e) => setEditingSmtp({ ...editingSmtp, signature: e.target.value })}
                placeholder="Best regards,&#10;SuPuja Creations Team&#10;https://swanagro.in"
                style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => { setShowSmtpModal(false); setEditingSmtp(null); }}
                className="btn-action-secondary"
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSmtpAccountData}
                disabled={saving}
                className="btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontSize: '0.88rem', borderRadius: '8px' }}
              >
                {saving ? 'Saving...' : 'Save SMTP Server'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LIVE SMTP TEST PER ACCOUNT */}
      {/* ========================================================================= */}
      {testModalAccount && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '1.75rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={18} style={{ color: 'var(--accent-color)' }} />
                <span>Test SMTP: {testModalAccount.account_name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setTestModalAccount(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: 'var(--bg-primary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <div><strong>Host:</strong> {testModalAccount.host}:{testModalAccount.port} {testModalAccount.secure ? '(SSL)' : '(TLS)'}</div>
              <div><strong>Sender:</strong> {testModalAccount.from_name} &lt;{testModalAccount.from_email || testModalAccount.username}&gt;</div>
              <div><strong>Username:</strong> {testModalAccount.username}</div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Recipient Email Address *
              </label>
              <input
                type="email"
                value={testModalRecipient}
                onChange={(e) => setTestModalRecipient(e.target.value)}
                placeholder="Enter your email to receive test message"
                style={{ width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.92rem' }}
              />
            </div>

            {testModalResult && (
              <div style={{
                marginBottom: '1.25rem',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                backgroundColor: testModalResult.success ? '#dcfce7' : '#fee2e2',
                color: testModalResult.success ? '#166534' : '#b91c1c',
                border: testModalResult.success ? '1px solid #bbf7d0' : '1px solid #fecaca',
                fontSize: '0.85rem'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
                  {testModalResult.success ? '✅ Verified Successfully!' : '❌ SMTP Connection Error'}
                </div>
                <div>{testModalResult.message}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setTestModalAccount(null)}
                className="btn-action-secondary"
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleRunModalTest}
                disabled={testModalSending || !testModalRecipient}
                className="btn-primary"
                style={{ padding: '0.6rem 1.5rem', fontSize: '0.88rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Send size={15} />
                <span>{testModalSending ? 'Dispatching...' : 'Send Live Test'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
