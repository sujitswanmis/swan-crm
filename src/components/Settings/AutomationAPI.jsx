import React, { useState } from 'react';
import { Workflow, Webhook, Mail, Code, Save, Copy, CheckCircle } from 'lucide-react';

export default function AutomationAPI() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiKey = 'sk_crm_live_9b2a8d7e6f5c4b3a2910';

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Workflow size={24} color="var(--accent-color)" />
          Automation & API Integrations
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Connect your CRM to external services and automate repetitive tasks.</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
        
        {/* API Integration */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Code size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>API Keys (Website Integration)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Use this API key to send leads directly from your Website or Facebook forms into this CRM. 
            Keep this key secret.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1, padding: '0.75rem 1rem', background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '6px', fontFamily: 'monospace', color: '#334155', fontWeight: 'bold' }}>
              {apiKey}
            </div>
            <button 
              onClick={handleCopy}
              style={{ padding: '0.75rem 1.5rem', background: copied ? '#10b981' : 'var(--bg-surface)', border: `1px solid ${copied ? '#10b981' : 'var(--border-light)'}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: copied ? 'white' : 'var(--text-primary)', fontWeight: 500, transition: 'all 0.2s' }}
            >
              {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy API Key'}
            </button>
            <button style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
              Roll Key
            </button>
          </div>
        </div>

        {/* Auto-Responders */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Webhook size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Auto-Responders</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Automatically send messages to leads based on specific trigger events.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Trigger: New Lead Created</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--accent-color)' }}>
                  <input type="checkbox" defaultChecked /> Enable Auto-Welcome
                </span>
              </label>
              <textarea 
                rows={3}
                defaultValue="Hi {{name}}, thank you for contacting Swan Hosting! Our team will reach out to you shortly."
                style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical' }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Available variables: {'{{name}}, {{company}}, {{lead_id}}'}</div>
            </div>
          </div>
        </div>

        {/* SMTP Settings */}
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Mail size={20} color="var(--text-primary)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Email SMTP Configuration</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Configure your official email server (like Google Workspace or Office365) to send emails directly from the CRM.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>SMTP Host</label>
              <input type="text" placeholder="smtp.gmail.com" style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Port</label>
              <input type="text" placeholder="587" style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Username / Email</label>
              <input type="email" placeholder="info@yourcompany.com" style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Password / App Password</label>
              <input type="password" placeholder="••••••••••••" style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-light)', borderRadius: '4px', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button 
            onClick={handleSave}
            disabled={loading}
            style={{ 
              padding: '0.75rem 2rem', background: 'var(--accent-color)', color: 'white', 
              border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: loading ? 0.7 : 1
            }}
          >
            <Save size={18} />
            {loading ? 'Saving...' : 'Save Integrations'}
          </button>
        </div>

      </div>
    </div>
  );
}
