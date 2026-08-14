'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, Save, Plus, Trash2, Edit3, Send, CheckCircle2, AlertCircle, 
  RefreshCw, Shield, Key, Eye, EyeOff, Server, Play, Clock, 
  Sparkles, Briefcase, Database, Tag, Copy, Check, ChevronRight, X
} from 'lucide-react';
import { 
  getEmailConfig, 
  saveEmailConfig, 
  saveEmailTemplate, 
  deleteEmailTemplate, 
  saveEmailAutomation, 
  deleteEmailAutomation, 
  sendTestEmail 
} from '@/app/actions/emailConfig';

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

export default function EmailConfigModule({ moduleAccess = {}, userRole = '' }) {
  const [activeTab, setActiveTab] = useState('smtp');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Config State
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
  const [showPassword, setShowPassword] = useState(false);

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
    is_active: true,
    delay_minutes: 0
  });

  // Logs State
  const [logs, setLogs] = useState([]);

  // Test Email State
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
      const res = await getEmailConfig();
      if (res.success && res.data) {
        setSmtp(res.data.smtp || {});
        setTemplates(res.data.templates || []);
        setAutomations(res.data.automations || []);
        setLogs(res.data.logs || []);
      }
    } catch (e) {
      console.error('loadConfig error:', e);
      setErrorMsg('Failed to load email configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSaving(true);
    setSaveSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await saveEmailConfig({
        smtp,
        templates,
        automations,
        logs
      });
      if (res.success) {
        setSaveSuccessMsg('SMTP Server settings saved successfully!');
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      } else {
        setErrorMsg(res.error || 'Failed to save SMTP settings.');
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setSmtp(prev => ({
      ...prev,
      provider: preset.name,
      host: preset.host,
      port: preset.port,
      secure: preset.secure
    }));
    setSaveSuccessMsg(`Applied "${preset.name}" preset!`);
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient) {
      setTestResult({ success: false, message: 'Please enter a test recipient email address.' });
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await sendTestEmail(testEmailRecipient, smtp);
      if (res.success) {
        setTestResult({ success: true, message: res.message });
        loadConfig(); // Refresh sent logs
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

  const filteredTemplates = templates.filter(t => {
    if (templateFilter === 'all') return true;
    if (templateFilter === 'sales') return t.target_pipeline === 'sales' || t.category === 'Sales Pipeline';
    if (templateFilter === 'recruiter') return t.target_pipeline === 'recruiter' || t.category === 'HR & Recruitment';
    return true;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      
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
          { id: 'smtp', label: '⚙️ SMTP Server Settings', count: null },
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
      {/* TAB 1: SMTP SERVER SETTINGS */}
      {/* ========================================================================= */}
      {activeTab === 'smtp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Quick Presets */}
          <div className="card" style={{ padding: '1.5rem', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} style={{ color: 'var(--accent-color)' }} />
              <span>1-Click SMTP Presets</span>
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 1rem 0' }}>
              Click any provider below to automatically configure the recommended host, port, and security settings.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {SMTP_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    border: smtp.host === preset.host ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                    background: smtp.host === preset.host ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    {preset.host}:{preset.port}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Detailed SMTP Settings Form */}
          <div className="card" style={{ padding: '1.75rem', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Key size={18} style={{ color: 'var(--accent-color)' }} />
              <span>SMTP Connection & Credentials</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>SMTP Host Server *</label>
                <input
                  type="text"
                  value={smtp.host || ''}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="e.g. smtp.gmail.com or smtp.hostinger.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>SMTP Port *</label>
                <input
                  type="number"
                  value={smtp.port || 587}
                  onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
                  placeholder="587 or 465"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>SMTP Username / Login Email *</label>
                <input
                  type="text"
                  value={smtp.username || ''}
                  onChange={(e) => setSmtp({ ...smtp, username: e.target.value })}
                  placeholder="you@yourcompany.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>SMTP Password / App Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={smtp.password || ''}
                    onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                    placeholder="Enter SMTP password"
                    style={{ width: '100%', padding: '0.6rem 2.4rem 0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(prev => !prev)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Sender Name (Display Name)</label>
                <input
                  type="text"
                  value={smtp.from_name || ''}
                  onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
                  placeholder="e.g. SuPuja Creations Sales"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>From Email Address (Sender)</label>
                <input
                  type="email"
                  value={smtp.from_email || ''}
                  onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                  placeholder="Leave empty to use username"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>Reply-To Email Address</label>
                <input
                  type="email"
                  value={smtp.reply_to || ''}
                  onChange={(e) => setSmtp({ ...smtp, reply_to: e.target.value })}
                  placeholder="replies@yourcompany.com"
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={handleSaveSmtp}
                disabled={saving}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem', fontSize: '0.92rem', borderRadius: '8px' }}
              >
                <Save size={16} />
                <span>{saving ? 'Saving Settings...' : 'Save SMTP Settings'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('test')}
                className="btn-action-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.25rem', fontSize: '0.92rem' }}
              >
                <Send size={16} />
                <span>Send Live Test Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: EMAIL TEMPLATES */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { id: 'all', label: 'All Templates' },
                { id: 'sales', label: '📊 Sales Pipeline' },
                { id: 'recruiter', label: '💼 Recruiter & HR' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTemplateFilter(f.id)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: templateFilter === f.id ? 700 : 500,
                    border: templateFilter === f.id ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                    background: templateFilter === f.id ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                    color: templateFilter === f.id ? 'var(--accent-color)' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

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
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.15rem', fontSize: '0.88rem', borderRadius: '8px' }}
            >
              <Plus size={16} />
              <span>Create Email Template</span>
            </button>
          </div>

          {/* Templates Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {filteredTemplates.map(tpl => (
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
                  border: '1px solid var(--border-light)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
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
            ))}
          </div>
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

          <div style={{ background: 'var(--bg-primary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <div><strong>Active Host:</strong> {smtp.host || 'Not configured'} (Port: {smtp.port})</div>
            <div><strong>Active Sender:</strong> {smtp.from_name} &lt;{smtp.from_email || smtp.username}&gt;</div>
          </div>

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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
              </table>
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

    </div>
  );
}
