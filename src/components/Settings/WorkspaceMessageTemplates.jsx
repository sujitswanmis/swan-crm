'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Save, Phone, Mail, Sparkles, CheckCircle2,
  Copy, RefreshCw, Send, Eye, FileText, Check, AlertCircle, HelpCircle
} from 'lucide-react';
import { getTenantMessageTemplates, saveTenantMessageTemplates } from '@/app/actions/tenantMessageTemplates';

const VARIABLE_TAGS = [
  { tag: '{{name}}', label: 'Client / Lead Name' },
  { tag: '{{company}}', label: 'Your Company Name' },
  { tag: '{{phone}}', label: 'Client Phone' },
  { tag: '{{quote_no}}', label: 'Quotation / Ref #' },
  { tag: '{{invoice_no}}', label: 'Invoice Number' },
  { tag: '{{amount}}', label: 'Amount (₹)' }
];

export default function WorkspaceMessageTemplates({ userCompany = '' }) {
  const effectiveCompany = userCompany || 'Swan Hosting';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [activeTplKey, setActiveTplKey] = useState('welcome');

  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');

  const [templates, setTemplates] = useState({
    welcome: {
      enabled: true,
      title: 'Lead Welcome & Initial Greeting',
      content: 'Namaste {{name}} Ji! Thank you for contacting {{company}}. Our representative will get in touch with you shortly. You can also reply to this message for immediate assistance.'
    },
    followup: {
      enabled: true,
      title: 'Follow-Up Reminder',
      content: 'Hello {{name}} Ji, this is a follow-up reminder from {{company}} regarding our discussion about your requirement. Kindly let us know a suitable time to connect today.'
    },
    quotation: {
      enabled: true,
      title: 'Quotation / Proposal Shared',
      content: 'Dear {{name}}, your quotation #{{quote_no}} from {{company}} has been generated and sent to your email. Please review the proposal and let us know your confirmation.'
    },
    payment: {
      enabled: true,
      title: 'Payment Receipt & Invoice Confirmation',
      content: 'Dear {{name}}, we have received your payment of ₹{{amount}} for Invoice #{{invoice_no}}. Thank you for your business with {{company}}!'
    }
  });

  useEffect(() => {
    loadData();
  }, [effectiveCompany]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getTenantMessageTemplates(effectiveCompany);
      if (res.success) {
        if (res.templates) setTemplates(res.templates);
        if (res.senderPhone) setSenderPhone(res.senderPhone);
        if (res.senderEmail) setSenderEmail(res.senderEmail);
      }
    } catch (e) {
      console.error('Error loading message templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertTag = (tag) => {
    const curContent = templates[activeTplKey]?.content || '';
    setTemplates({
      ...templates,
      [activeTplKey]: {
        ...templates[activeTplKey],
        content: curContent + (curContent.endsWith(' ') ? '' : ' ') + tag + ' '
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await saveTenantMessageTemplates({
        company: effectiveCompany,
        templates,
        senderPhone,
        senderEmail
      });

      if (res.success) {
        setSaveMessage(res.message);
        setTimeout(() => setSaveMessage(null), 3500);
      } else {
        alert(res.error || 'Failed to save templates');
      }
    } catch (err) {
      alert(err.message || 'Error saving templates');
    } finally {
      setSaving(false);
    }
  };

  // Live WhatsApp preview renderer
  const previewText = React.useMemo(() => {
    const raw = templates[activeTplKey]?.content || '';
    return raw
      .replace(/{{name}}/g, 'Rahul Sharma')
      .replace(/{{company}}/g, effectiveCompany)
      .replace(/{{phone}}/g, '+91 98765 43210')
      .replace(/{{quote_no}}/g, 'QT-2026-089')
      .replace(/{{invoice_no}}/g, 'INV-2026-041')
      .replace(/{{amount}}/g, '25,000');
  }, [templates, activeTplKey, effectiveCompany]);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: 'var(--accent-color)' }} />
        <div>Loading message templates for {effectiveCompany}...</div>
      </div>
    );
  }

  const currentTpl = templates[activeTplKey] || { enabled: true, title: '', content: '' };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.35rem' }}>
          <MessageSquare size={22} color="var(--accent-color)" />
          Message & WhatsApp Templates
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>
          Configure your workspace's official WhatsApp, SMS, and Email response templates for leads, follow-ups, and quotation dispatches.
        </p>
      </div>

      {saveMessage && (
        <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
          <CheckCircle2 size={16} />
          {saveMessage}
        </div>
      )}

      {/* Section 1: Sender Identity */}
      <div style={{ background: 'var(--bg-primary)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '0.98rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Phone size={16} color="#16a34a" />
          Sender Contact Channels ({effectiveCompany})
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Official WhatsApp Helpline Number
            </label>
            <input
              type="text"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder="+91 98765 XXXXX"
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Customer Support / Dispatch Email
            </label>
            <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="sales@yourcompany.com"
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Template Type Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {Object.keys(templates).map((key) => {
          const t = templates[key];
          const isActive = activeTplKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTplKey(key)}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: `1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-light)'}`,
                background: isActive ? 'var(--accent-color)' : 'var(--bg-surface)',
                color: isActive ? '#fff' : 'var(--text-primary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{t.title}</span>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: t.enabled ? '#22c55e' : '#94a3b8'
              }} />
            </button>
          );
        })}
      </div>

      {/* Section 3: Template Editor & Live Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
        {/* Editor Box */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {currentTpl.title}
            </h4>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={currentTpl.enabled}
                onChange={(e) => {
                  setTemplates({
                    ...templates,
                    [activeTplKey]: { ...currentTpl, enabled: e.target.checked }
                  });
                }}
                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
              />
              Enable Template
            </label>
          </div>

          {/* Quick Insert Variables */}
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              INSERT VARIABLE TAGS:
            </span>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {VARIABLE_TAGS.map(v => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsertTag(v.tag)}
                  title={v.label}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  +{v.tag}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            rows={5}
            value={currentTpl.content}
            onChange={(e) => {
              setTemplates({
                ...templates,
                [activeTplKey]: { ...currentTpl, content: e.target.value }
              });
            }}
            placeholder="Write message template..."
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              resize: 'vertical'
            }}
          />
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
            Character Count: {currentTpl.content?.length || 0}
          </div>
        </div>

        {/* Live Preview Box (WhatsApp Chat Bubble) */}
        <div style={{ background: '#e5ddd5', padding: '1.25rem', borderRadius: '10px', border: '1px solid #d1d5db' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem', color: '#374151', fontSize: '0.78rem', fontWeight: 700 }}>
            <Eye size={14} />
            LIVE WHATSAPP PREVIEW:
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: '8px 8px 8px 0px',
            padding: '0.85rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            fontSize: '0.82rem',
            lineHeight: 1.45,
            color: '#111827',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            borderLeft: '4px solid #25d366'
          }}>
            {previewText}
            <div style={{ textAlign: 'right', fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.4rem' }}>
              10:30 AM ✓✓
            </div>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#4b5563', marginTop: '0.85rem', background: '#f3f4f6', padding: '0.5rem 0.65rem', borderRadius: '6px' }}>
            💡 <strong>Note:</strong> When sent to a real customer, variables like <code>{'{{name}}'}</code> will be dynamically replaced with the customer's actual details.
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.65rem 2rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-color)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            opacity: saving ? 0.7 : 1
          }}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save All Templates'}
        </button>
      </div>
    </div>
  );
}
