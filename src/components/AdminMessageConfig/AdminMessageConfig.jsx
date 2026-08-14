'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, MessageSquare, Phone, Mail, Globe, 
  Settings, Send, Save, Eye, EyeOff, CheckCircle2, 
  AlertCircle, RefreshCw, Sparkles, Inbox, Key, UserCheck, 
  FileText, Shield, Layers, Radio
} from 'lucide-react';
import { 
  getAdminMessageConfig, 
  saveAdminMessageConfig, 
  testAdminChannel 
} from '@/app/actions/adminMessageConfig';

export default function AdminMessageConfig({ moduleAccess = {}, userRole = '' }) {
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);

  // Email Sub-state (Template selector & live preview)
  const [selectedEmailTplKey, setSelectedEmailTplKey] = useState('password_reset_otp');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [savingTab, setSavingTab] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testingChannel, setTestingChannel] = useState(false);
  const [testResponse, setTestResponse] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const res = await getAdminMessageConfig();
    if (res.success && res.data) {
      setConfig(res.data);
    }
    setLoading(false);
  };

  const handleSaveTab = async (channelKey) => {
    if (!config) return;
    setSavingTab(true);
    const res = await saveAdminMessageConfig(channelKey, config[channelKey]);
    setSavingTab(false);
    if (res.success) {
      alert(`✅ ${getTabName(channelKey)} configuration saved successfully!`);
    } else {
      alert(`❌ Error saving: ${res.error}`);
    }
  };

  const handleTestDispatch = async (channelKey) => {
    if (!testRecipient) {
      alert("Please enter a test recipient email / mobile number.");
      return;
    }
    setTestingChannel(true);
    setTestResponse(null);
    const res = await testAdminChannel(channelKey, config[channelKey], testRecipient);
    setTestingChannel(false);
    setTestResponse(res);
  };

  const getTabName = (key) => {
    switch (key) {
      case 'wa_official': return 'WhatsApp Official';
      case 'wa_unofficial': return 'WhatsApp Unofficial';
      case 'sms': return 'SMS Configuration';
      case 'rcs': return 'RCS Configuration';
      case 'email': return 'Email Setup';
      default: return key;
    }
  };

  if (loading || !config) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: '#4338ca' }} />
        <div>Loading SuPuja Creations Admin Message Configuration...</div>
      </div>
    );
  }

  // Preview generator for Email Templates
  const getEmailPreview = () => {
    const tpls = config.email.templates || {};
    const cur = tpls[selectedEmailTplKey] || { subject: '', body: '' };
    const dummy = {
      name: 'Pooja Verma',
      otp: '629104',
      company: 'SuPuja Creations / Swan CRM',
      email: 'pooja.verma@newswangroup.com',
      emp_id: 'SP-1008',
      reset_link: 'https://crm.swangroup.com/auth/reset-password?token=sec_98124'
    };

    let subject = cur.subject || '';
    let body = cur.body || '';
    Object.keys(dummy).forEach(k => {
      subject = subject.replace(new RegExp(`{{${k}}}`, 'g'), dummy[k]);
      body = body.replace(new RegExp(`{{${k}}}`, 'g'), dummy[k]);
    });
    return { subject, body };
  };

  const emailPreview = getEmailPreview();

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
        padding: '1.75rem 2rem',
        borderRadius: '16px',
        color: '#ffffff',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 10px 25px -5px rgba(67, 56, 202, 0.3)'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.15)', padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
            <ShieldCheck size={14} /> SUPUJA CREATIONS &bull; ADMIN INFRASTRUCTURE
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
            Admin Message Configuration
          </h1>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem', opacity: 0.9 }}>
            Configure internal system messaging channels for Employee Account Creation, Password Reset Links, Verification OTPs, and Staff Security Alerts.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {[
          { id: 'email', label: 'Email Setup (SMTP & OTPs)', icon: Mail },
          { id: 'wa_official', label: 'WhatsApp Official', icon: MessageSquare },
          { id: 'wa_unofficial', label: 'WhatsApp Unofficial', icon: Phone },
          { id: 'sms', label: 'SMS Configuration', icon: FileText },
          { id: 'rcs', label: 'RCS Configuration', icon: Globe }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setTestResponse(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'none',
                borderBottom: isActive ? '3px solid #4338ca' : '3px solid transparent',
                color: isActive ? '#4338ca' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.92rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. EMAIL SETUP TAB (SuPuja Creations Admin SMTP) */}
      {/* ========================================================================= */}
      {activeTab === 'email' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* SMTP Credentials Card */}
          <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Mail size={20} style={{ color: '#4338ca' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                SuPuja Creations Admin SMTP Credentials
              </h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.25rem' }}>
              These credentials are used exclusively by SuPuja Creations to send official employee invitations, password reset links, and authentication OTPs.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  SMTP Host *
                </label>
                <input
                  type="text"
                  value={config.email.host}
                  onChange={e => setConfig({ ...config, email: { ...config.email, host: e.target.value } })}
                  placeholder="smtp.gmail.com"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  SMTP Port *
                </label>
                <input
                  type="number"
                  value={config.email.port}
                  onChange={e => setConfig({ ...config, email: { ...config.email, port: Number(e.target.value) } })}
                  placeholder="587"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Admin Username / Email *
                </label>
                <input
                  type="email"
                  value={config.email.username}
                  onChange={e => setConfig({ ...config, email: { ...config.email, username: e.target.value } })}
                  placeholder="admin@supujacreations.com"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Password / App Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={config.email.password}
                    onChange={e => setConfig({ ...config, email: { ...config.email, password: e.target.value } })}
                    placeholder="••••••••••••"
                    style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showSmtpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Admin Sender Name
                </label>
                <input
                  type="text"
                  value={config.email.admin_sender_name}
                  onChange={e => setConfig({ ...config, email: { ...config.email, admin_sender_name: e.target.value } })}
                  placeholder="SuPuja Creations / CRM Admin"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Admin Official Sender Email
                </label>
                <input
                  type="email"
                  value={config.email.admin_email}
                  onChange={e => setConfig({ ...config, email: { ...config.email, admin_email: e.target.value } })}
                  placeholder="Leave blank to use Username"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Test Connection Form */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                Test SuPuja Admin SMTP Connection
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  placeholder="Enter test email address..."
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: '#fff' }}
                />
                <button
                  type="button"
                  onClick={() => handleTestDispatch('email')}
                  disabled={testingChannel || !testRecipient}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    backgroundColor: '#4338ca',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: (testingChannel || !testRecipient) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {testingChannel ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Test
                </button>
              </div>

              {testResponse && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  backgroundColor: testResponse.success ? '#dcfce7' : '#fee2e2',
                  color: testResponse.success ? '#166534' : '#991b1b'
                }}>
                  {testResponse.success ? testResponse.message : testResponse.error}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleSaveTab('email')}
                disabled={savingTab}
                className="btn-primary"
                style={{ backgroundColor: '#4338ca', padding: '0.6rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
              >
                <Save size={16} />
                {savingTab ? 'Saving...' : 'Save Email Configuration'}
              </button>
            </div>
          </div>

          {/* Account Security Templates & Live Preview */}
          <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 700 }}>
              Account Security Email Templates
            </h3>

            {/* Template selector pills */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[
                { id: 'password_reset_otp', label: '🔐 Password Reset OTP' },
                { id: 'login_otp', label: '🔑 Login OTP' },
                { id: 'welcome_employee', label: '👋 Welcome Employee' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedEmailTplKey(t.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: selectedEmailTplKey === t.id ? '2px solid #4338ca' : '1px solid var(--border-light)',
                    backgroundColor: selectedEmailTplKey === t.id ? '#e0e7ff' : 'var(--bg-surface)',
                    color: selectedEmailTplKey === t.id ? '#3730a3' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Subject editor */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Subject:
              </label>
              <input
                type="text"
                value={config.email.templates?.[selectedEmailTplKey]?.subject || ''}
                onChange={e => {
                  const updated = { ...config.email.templates };
                  updated[selectedEmailTplKey] = { ...updated[selectedEmailTplKey], subject: e.target.value };
                  setConfig({ ...config, email: { ...config.email, templates: updated } });
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            {/* Body editor */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Body Message:
              </label>
              <textarea
                rows={6}
                value={config.email.templates?.[selectedEmailTplKey]?.body || ''}
                onChange={e => {
                  const updated = { ...config.email.templates };
                  updated[selectedEmailTplKey] = { ...updated[selectedEmailTplKey], body: e.target.value };
                  setConfig({ ...config, email: { ...config.email, templates: updated } });
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem', fontFamily: 'inherit', lineHeight: '1.4' }}
              />
            </div>

            {/* Live Preview Simulation */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Inbox size={14} /> LIVE RECIPIENT INBOX PREVIEW
              </div>
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                  <strong>From:</strong> &quot;{config.email.admin_sender_name || 'SuPuja Creations / CRM Admin'}&quot; &lt;{config.email.admin_email || config.email.username || 'admin@supujacreations.com'}&gt;
                </div>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                  {emailPreview.subject}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: '1.4', background: '#f8fafc', padding: '0.75rem', borderRadius: '4px' }}>
                  {emailPreview.body}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. WHATSAPP OFFICIAL TAB (SuPuja Creations Admin API) */}
      {/* ========================================================================= */}
      {activeTab === 'wa_official' && (
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px', maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <MessageSquare size={22} style={{ color: '#25d366' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              SuPuja Creations Official WhatsApp Cloud API
            </h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.5rem' }}>
            Meta Cloud API settings configured by SuPuja Creations for verified WhatsApp OTP dispatch and critical staff security alerts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Meta Permanent Access Token (SuPuja Creations System) *
              </label>
              <input
                type="password"
                value={config.wa_official.api_key}
                onChange={e => setConfig({ ...config, wa_official: { ...config.wa_official, api_key: e.target.value } })}
                placeholder="EAAGm0PX4ZC50BA..."
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Phone Number ID *
              </label>
              <input
                type="text"
                value={config.wa_official.phone_number_id}
                onChange={e => setConfig({ ...config, wa_official: { ...config.wa_official, phone_number_id: e.target.value } })}
                placeholder="109823485729102"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                WhatsApp Business Account ID (WABA ID) *
              </label>
              <input
                type="text"
                value={config.wa_official.waba_id}
                onChange={e => setConfig({ ...config, wa_official: { ...config.wa_official, waba_id: e.target.value } })}
                placeholder="209485729104820"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Auth OTP Template Name
              </label>
              <input
                type="text"
                value={config.wa_official.otp_template_name}
                onChange={e => setConfig({ ...config, wa_official: { ...config.wa_official, otp_template_name: e.target.value } })}
                placeholder="supuja_admin_otp_auth"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Staff Invite Template Name
              </label>
              <input
                type="text"
                value={config.wa_official.invite_template_name}
                onChange={e => setConfig({ ...config, wa_official: { ...config.wa_official, invite_template_name: e.target.value } })}
                placeholder="supuja_admin_employee_invite"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveTab('wa_official')}
              disabled={savingTab}
              className="btn-primary"
              style={{ backgroundColor: '#25d366', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#fff' }}
            >
              <Save size={16} />
              {savingTab ? 'Saving...' : 'Save Official WhatsApp API'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. WHATSAPP UNOFFICIAL TAB */}
      {/* ========================================================================= */}
      {activeTab === 'wa_unofficial' && (
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px', maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Phone size={22} style={{ color: '#059669' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              SuPuja Creations WhatsApp Unofficial Instance
            </h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.5rem' }}>
            Connect dedicated Admin WhatsApp instances for automated employee dispatch without template approvals.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Gateway Server URL *
              </label>
              <input
                type="text"
                value={config.wa_unofficial.server_url}
                onChange={e => setConfig({ ...config, wa_unofficial: { ...config.wa_unofficial, server_url: e.target.value } })}
                placeholder="http://localhost:3001"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Admin Instance Identifier *
              </label>
              <input
                type="text"
                value={config.wa_unofficial.instance_id}
                onChange={e => setConfig({ ...config, wa_unofficial: { ...config.wa_unofficial, instance_id: e.target.value } })}
                placeholder="supuja_admin_instance_01"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Instance Bearer Token
              </label>
              <input
                type="password"
                value={config.wa_unofficial.api_token}
                onChange={e => setConfig({ ...config, wa_unofficial: { ...config.wa_unofficial, api_token: e.target.value } })}
                placeholder="supuja_bearer_sec_..."
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveTab('wa_unofficial')}
              disabled={savingTab}
              className="btn-primary"
              style={{ backgroundColor: '#059669', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#fff' }}
            >
              <Save size={16} />
              {savingTab ? 'Saving...' : 'Save Unofficial Instance'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SMS CONFIGURATION TAB */}
      {/* ========================================================================= */}
      {activeTab === 'sms' && (
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px', maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <FileText size={22} style={{ color: '#d97706' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              SuPuja Creations DLT Transactional SMS Gateway
            </h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.5rem' }}>
            Fast2SMS / Msg91 / DLT-approved SMS gateway settings for instant mobile OTP delivery during staff login and password resets.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Gateway API Authorization Key *
              </label>
              <input
                type="password"
                value={config.sms.api_key}
                onChange={e => setConfig({ ...config, sms: { ...config.sms, api_key: e.target.value } })}
                placeholder="f2s_sec_api_key_..."
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Approved Sender ID (Header) *
              </label>
              <input
                type="text"
                value={config.sms.sender_id}
                onChange={e => setConfig({ ...config, sms: { ...config.sms, sender_id: e.target.value } })}
                placeholder="SUPUJA"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Principal Entity ID (DLT)
              </label>
              <input
                type="text"
                value={config.sms.entity_id}
                onChange={e => setConfig({ ...config, sms: { ...config.sms, entity_id: e.target.value } })}
                placeholder="1401582910482019"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                DLT Content Template ID (OTP)
              </label>
              <input
                type="text"
                value={config.sms.otp_dlt_template_id}
                onChange={e => setConfig({ ...config, sms: { ...config.sms, otp_dlt_template_id: e.target.value } })}
                placeholder="1207161829104820"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Registered SMS Format
              </label>
              <input
                type="text"
                value={config.sms.otp_sms_format}
                onChange={e => setConfig({ ...config, sms: { ...config.sms, otp_sms_format: e.target.value } })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveTab('sms')}
              disabled={savingTab}
              className="btn-primary"
              style={{ backgroundColor: '#d97706', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#fff' }}
            >
              <Save size={16} />
              {savingTab ? 'Saving...' : 'Save SMS Gateway'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. RCS CONFIGURATION TAB */}
      {/* ========================================================================= */}
      {activeTab === 'rcs' && (
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px', maxWidth: '800px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Globe size={22} style={{ color: '#2563eb' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              SuPuja Creations RCS Business Messaging Agent
            </h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1.5rem' }}>
            Google Jibe / Verified RCS Agent for rich, branded OTP cards with action buttons directly in the Android Messages app.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                RCS Agent Bot ID *
              </label>
              <input
                type="text"
                value={config.rcs.agent_id}
                onChange={e => setConfig({ ...config, rcs: { ...config.rcs, agent_id: e.target.value } })}
                placeholder="supuja-creations-rcs-bot"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Webhook Endpoint URL
              </label>
              <input
                type="text"
                value={config.rcs.webhook_url}
                onChange={e => setConfig({ ...config, rcs: { ...config.rcs, webhook_url: e.target.value } })}
                placeholder="https://crm.swangroup.com/api/rcs-webhook"
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                RCS OAuth / Bearer Token
              </label>
              <input
                type="password"
                value={config.rcs.bearer_token}
                onChange={e => setConfig({ ...config, rcs: { ...config.rcs, bearer_token: e.target.value } })}
                placeholder="ya29.a0AfH6SM..."
                style={{ width: '100%', padding: '0.55rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveTab('rcs')}
              disabled={savingTab}
              className="btn-primary"
              style={{ backgroundColor: '#2563eb', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: '#fff' }}
            >
              <Save size={16} />
              {savingTab ? 'Saving...' : 'Save RCS Configuration'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
