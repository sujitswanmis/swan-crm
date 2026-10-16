import React, { useState, useEffect } from 'react';
import { 
  Workflow, 
  Webhook, 
  Code, 
  Copy, 
  CheckCircle, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  ShieldCheck, 
  Save, 
  Globe, 
  Layers, 
  Check, 
  Terminal,
  AlertCircle
} from 'lucide-react';

export default function AutomationAPI() {
  const [origin, setOrigin] = useState('');
  const [apiKey, setApiKey] = useState('sk_crm_live_9b2a8d7e6f5c4b3a2910');
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState('curl');
  const [confirmRoll, setConfirmRoll] = useState(false);

  // Ingestion settings
  const [defaultSource, setDefaultSource] = useState('Website Webhook');
  const [defaultStage, setDefaultStage] = useState('1;01>New Stage>New Lead');
  const [dedupePhone, setDedupePhone] = useState(true);
  const [notifyOnLead, setNotifyOnLead] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
      const storedKey = localStorage.getItem('crm_webhook_api_key');
      if (storedKey) setApiKey(storedKey);
      const storedSettings = localStorage.getItem('crm_webhook_settings');
      if (storedSettings) {
        try {
          const parsed = JSON.parse(storedSettings);
          if (parsed.defaultSource) setDefaultSource(parsed.defaultSource);
          if (parsed.defaultStage) setDefaultStage(parsed.defaultStage);
          if (typeof parsed.dedupePhone === 'boolean') setDedupePhone(parsed.dedupePhone);
          if (typeof parsed.notifyOnLead === 'boolean') setNotifyOnLead(parsed.notifyOnLead);
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const webhookEndpoint = `${origin || 'https://crm.newswan.in'}/api/webhooks/leads`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookEndpoint);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRollKey = () => {
    const chars = 'abcdef0123456789';
    let rand = '';
    for (let i = 0; i < 20; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const newKey = `sk_crm_live_${rand}`;
    setApiKey(newKey);
    localStorage.setItem('crm_webhook_api_key', newKey);
    setConfirmRoll(false);
  };

  const handleSaveSettings = () => {
    setSaving(true);
    const settings = {
      defaultSource,
      defaultStage,
      dedupePhone,
      notifyOnLead
    };
    localStorage.setItem('crm_webhook_settings', JSON.stringify(settings));
    setTimeout(() => {
      setSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }, 600);
  };

  const curlCode = `curl -X POST "${webhookEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "email": "rajesh@example.com",
    "company": "Apex Manufacturing Ltd",
    "city": "Ludhiana",
    "source": "${defaultSource}",
    "notes": "Interested in sheet metal components and CNC machining"
  }'`;

  const jsCode = `const response = await fetch("${webhookEndpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${apiKey}"
  },
  body: JSON.stringify({
    name: "Rajesh Kumar",
    phone: "9876543210",
    email: "rajesh@example.com",
    company: "Apex Manufacturing Ltd",
    city: "Ludhiana",
    source: "${defaultSource}",
    notes: "Interested in sheet metal components and CNC machining"
  })
});

const data = await response.json();
console.log(data);`;

  const jsonCode = `{
  "name": "Rajesh Kumar",
  "phone": "9876543210",
  "email": "rajesh@example.com",
  "company": "Apex Manufacturing Ltd",
  "city": "Ludhiana",
  "state": "Punjab",
  "source": "${defaultSource}",
  "notes": "Interested in sheet metal components and CNC machining"
}`;

  const responseCode = `{
  "success": true,
  "status": "created",
  "message": "Lead created successfully via Inbound Webhook",
  "lead_id": 10428,
  "lead_ref_id": "202610170010428"
}`;

  const getActiveCode = () => {
    if (activeCodeTab === 'curl') return curlCode;
    if (activeCodeTab === 'javascript') return jsCode;
    if (activeCodeTab === 'json') return jsonCode;
    return responseCode;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.35rem' }}>
            <Workflow size={24} style={{ color: 'var(--accent-color, #4f46e5)' }} />
            Inbound Webhook & Developer API Hub
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Ingest leads automatically from websites, landing pages, WordPress forms, Zapier, and marketing campaigns directly into CRM.
          </p>
        </div>
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          background: 'rgba(16, 185, 129, 0.1)', 
          color: '#059669', 
          border: '1px solid rgba(16, 185, 129, 0.3)', 
          padding: '0.4rem 0.85rem', 
          borderRadius: '9999px',
          fontSize: '0.82rem',
          fontWeight: 600
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          Webhook Gateway: Active & Listening
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Section 1: Inbound Webhook Endpoint & Secret Key */}
        <div style={{ background: 'var(--bg-primary, #ffffff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <Webhook size={20} style={{ color: 'var(--accent-color, #4f46e5)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Live Inbound Lead Webhook Endpoint
            </h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Configure this HTTPS endpoint in your forms, Zapier, or landing page webhooks. All incoming POST requests are parsed and saved straight to your Lead Pool.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Endpoint Row */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Webhook URL (POST)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ 
                  background: '#3b82f6', 
                  color: 'white', 
                  padding: '0.6rem 0.85rem', 
                  borderRadius: '6px', 
                  fontSize: '0.78rem', 
                  fontWeight: 700, 
                  letterSpacing: '0.05em' 
                }}>
                  POST
                </span>
                <div style={{ 
                  flex: 1, 
                  padding: '0.65rem 1rem', 
                  background: 'var(--bg-surface, #f8fafc)', 
                  border: '1px solid var(--border-light, #cbd5e1)', 
                  borderRadius: '6px', 
                  fontFamily: 'monospace', 
                  color: 'var(--text-primary)', 
                  fontSize: '0.88rem',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap'
                }}>
                  {webhookEndpoint}
                </div>
                <button 
                  onClick={handleCopyUrl}
                  style={{ 
                    padding: '0.65rem 1.2rem', 
                    background: copiedUrl ? '#10b981' : 'var(--bg-surface, #f8fafc)', 
                    border: `1px solid ${copiedUrl ? '#10b981' : 'var(--border-light, #cbd5e1)'}`, 
                    borderRadius: '6px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.45rem', 
                    color: copiedUrl ? 'white' : 'var(--text-primary)', 
                    fontWeight: 600, 
                    fontSize: '0.85rem',
                    transition: 'all 0.15s ease' 
                  }}
                >
                  {copiedUrl ? <CheckCircle size={16} /> : <Copy size={16} />}
                  {copiedUrl ? 'Copied' : 'Copy Endpoint'}
                </button>
              </div>
            </div>

            {/* Secret API Key Row */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Secret Bearer API Key
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ 
                  flex: 1, 
                  padding: '0.65rem 1rem', 
                  background: 'var(--bg-surface, #f8fafc)', 
                  border: '1px solid var(--border-light, #cbd5e1)', 
                  borderRadius: '6px', 
                  fontFamily: 'monospace', 
                  color: 'var(--text-primary)', 
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>{showKey ? apiKey : '••••••••••••••••••••••••••••••••••••••••'}</span>
                  <button 
                    onClick={() => setShowKey(!showKey)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0.25rem', display: 'flex', alignItems: 'center' }}
                    title={showKey ? 'Hide Secret Key' : 'Reveal Secret Key'}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button 
                  onClick={handleCopyKey}
                  style={{ 
                    padding: '0.65rem 1.2rem', 
                    background: copiedKey ? '#10b981' : 'var(--bg-surface, #f8fafc)', 
                    border: `1px solid ${copiedKey ? '#10b981' : 'var(--border-light, #cbd5e1)'}`, 
                    borderRadius: '6px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.45rem', 
                    color: copiedKey ? 'white' : 'var(--text-primary)', 
                    fontWeight: 600, 
                    fontSize: '0.85rem',
                    transition: 'all 0.15s ease' 
                  }}
                >
                  {copiedKey ? <CheckCircle size={16} /> : <Copy size={16} />}
                  {copiedKey ? 'Copied' : 'Copy Key'}
                </button>
                {!confirmRoll ? (
                  <button 
                    onClick={() => setConfirmRoll(true)}
                    style={{ 
                      padding: '0.65rem 1rem', 
                      background: 'transparent', 
                      border: '1px solid #ef4444', 
                      color: '#ef4444', 
                      borderRadius: '6px', 
                      cursor: 'pointer', 
                      fontWeight: 600, 
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <RefreshCw size={14} />
                    Roll Key
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <button 
                      onClick={handleRollKey}
                      style={{ padding: '0.65rem 0.9rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
                    >
                      Confirm Reset
                    </button>
                    <button 
                      onClick={() => setConfirmRoll(false)}
                      style={{ padding: '0.65rem 0.75rem', background: 'var(--bg-surface, #f1f5f9)', color: 'var(--text-secondary)', border: '1px solid var(--border-light, #cbd5e1)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Security Notice */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              fontSize: '0.8rem', 
              color: 'var(--text-secondary)', 
              background: 'var(--bg-surface, #f8fafc)', 
              padding: '0.5rem 0.85rem', 
              borderRadius: '6px', 
              border: '1px dashed var(--border-light, #cbd5e1)' 
            }}>
              <ShieldCheck size={16} style={{ color: '#059669', flexShrink: 0 }} />
              <span>
                <strong>Authorization Header:</strong> Include <code>Authorization: Bearer &lt;API_KEY&gt;</code> or <code>x-api-key: &lt;API_KEY&gt;</code> in all webhook requests.
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Developer Integration & Schema */}
        <div style={{ background: 'var(--bg-primary, #ffffff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Code size={20} style={{ color: 'var(--accent-color, #4f46e5)' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                Developer Integration & Payload Spec
              </h3>
            </div>
            
            {/* Code Tabs */}
            <div style={{ display: 'flex', background: 'var(--bg-surface, #f1f5f9)', padding: '0.25rem', borderRadius: '8px', gap: '0.25rem' }}>
              {[
                { id: 'curl', label: 'cURL' },
                { id: 'javascript', label: 'JavaScript' },
                { id: 'json', label: 'JSON Body' },
                { id: 'response', label: '200 Response' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCodeTab(tab.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: activeCodeTab === tab.id ? 'var(--bg-primary, #ffffff)' : 'transparent',
                    color: activeCodeTab === tab.id ? 'var(--accent-color, #4f46e5)' : 'var(--text-secondary)',
                    boxShadow: activeCodeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Code Viewer Container */}
          <div style={{ position: 'relative' }}>
            <pre style={{ 
              margin: 0, 
              background: '#0f172a', 
              color: '#e2e8f0', 
              padding: '1.1rem', 
              borderRadius: '8px', 
              fontFamily: 'Consolas, Monaco, monospace', 
              fontSize: '0.84rem', 
              lineHeight: 1.55, 
              overflowX: 'auto',
              border: '1px solid #1e293b'
            }}>
              <code>{getActiveCode()}</code>
            </pre>
            <button
              onClick={handleCopyCode}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'white',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease'
              }}
            >
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              {copiedCode ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Schema Mapping Table */}
          <div style={{ marginTop: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Supported Payload Fields
            </h4>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface, #f8fafc)', borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Field Name</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Requirement</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Description & Aliases</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>name</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: '#10b981', fontWeight: 600 }}>Required*</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>Lead full name. Also accepts <code>full_name</code>, <code>contact_name</code>.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>phone</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: '#10b981', fontWeight: 600 }}>Required*</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>10-digit mobile number. Also accepts <code>mobile</code>, <code>contact_number</code>.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>email</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>Optional</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>Valid email address. Also accepts <code>email_address</code>.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>company</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>Optional</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>Company, business, or firm name. Also accepts <code>firm_name</code>.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>city</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>Optional</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>City, town, or district. Also accepts <code>city_name</code>, <code>district</code>.</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>source</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>Optional</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>Source label (e.g. Website Form, Google Ads, Zapier). Defaults to setting below.</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.6rem 0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color, #4f46e5)' }}>notes</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>string</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>Optional</td>
                    <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-primary)' }}>Inquiry requirement, message, or notes. Logged automatically as lead notes.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
              * At least one contact identifier (<code>phone</code> or <code>email</code> or <code>name</code>) is required per payload.
            </div>
          </div>
        </div>

        {/* Section 3: Supported No-Code & Form Connectors */}
        <div style={{ background: 'var(--bg-primary, #ffffff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <Layers size={20} style={{ color: 'var(--accent-color, #4f46e5)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Zero-Code Integration Guides
            </h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Easily attach this webhook to your existing landing pages or CMS forms without custom programming.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {/* WordPress / CF7 */}
            <div style={{ padding: '1rem', background: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Globe size={18} style={{ color: '#0284c7' }} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>WordPress & Webflow</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                Use WPForms Webhooks or CF7 Webhook plugin. Set Action URL to your Webhook endpoint and add Authorization header.
              </p>
            </div>

            {/* Elementor Forms */}
            <div style={{ padding: '1rem', background: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Workflow size={18} style={{ color: '#8b5cf6' }} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Elementor Pro Forms</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                In Elementor form settings, select <em>Actions After Submit &gt; Webhook</em>. Paste the Webhook URL and send form fields.
              </p>
            </div>

            {/* Zapier & Make */}
            <div style={{ padding: '1rem', background: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Terminal size={18} style={{ color: '#f97316' }} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Zapier & Make (Integromat)</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                Create a zap with <em>Webhooks by Zapier &gt; Custom Request (POST)</em>, paste the endpoint, and pass mapped JSON values.
              </p>
            </div>

            {/* Meta Lead Ads */}
            <div style={{ padding: '1rem', background: 'var(--bg-surface, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <ShieldCheck size={18} style={{ color: '#10b981' }} />
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Meta & Google Ads</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                Bridge your Facebook Instant Forms or Google Lead Extension directly into this webhook via Zapier or Make webhook listener.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Webhook Ingestion Configuration & Defaults */}
        <div style={{ background: 'var(--bg-primary, #ffffff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <Save size={20} style={{ color: 'var(--accent-color, #4f46e5)' }} />
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Incoming Webhook Defaults & Lead Routing
            </h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Configure default attributes applied to all leads arriving via this webhook.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Default Lead Source
              </label>
              <input 
                type="text" 
                value={defaultSource} 
                onChange={(e) => setDefaultSource(e.target.value)}
                placeholder="e.g. Website Webhook, Landing Page"
                style={{ 
                  width: '100%', 
                  padding: '0.65rem 0.85rem', 
                  border: '1px solid var(--border-light, #cbd5e1)', 
                  borderRadius: '6px', 
                  background: 'var(--bg-surface, #f8fafc)', 
                  color: 'var(--text-primary)', 
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Used when the payload doesn't provide a specific <code>source</code>.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Default Pipeline Stage
              </label>
              <select 
                value={defaultStage}
                onChange={(e) => setDefaultStage(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.65rem 0.85rem', 
                  border: '1px solid var(--border-light, #cbd5e1)', 
                  borderRadius: '6px', 
                  background: 'var(--bg-surface, #f8fafc)', 
                  color: 'var(--text-primary)', 
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="1;01>New Stage>New Lead">1;01&gt;New Stage&gt;New Lead</option>
                <option value="1;02>New Stage>In Review">1;02&gt;New Stage&gt;In Review</option>
                <option value="2;01>Contacted>Attempted Contact">2;01&gt;Contacted&gt;Attempted Contact</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Initial status assigned to ingested leads.
              </span>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={dedupePhone} 
                onChange={(e) => setDedupePhone(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color, #4f46e5)', cursor: 'pointer' }}
              />
              <span>
                <strong>Smart Deduplication:</strong> If an existing lead matches the phone number, log the new submission into lead notes instead of creating duplicate records.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={notifyOnLead} 
                onChange={(e) => setNotifyOnLead(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-color, #4f46e5)', cursor: 'pointer' }}
              />
              <span>
                <strong>Instant Alert:</strong> Dispatch immediate dashboard notification to sales desk when an inbound lead is captured.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', alignItems: 'center', gap: '1rem' }}>
            {saveSuccess && (
              <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle size={16} />
                Settings saved successfully!
              </span>
            )}
            <button 
              onClick={handleSaveSettings}
              disabled={saving}
              style={{ 
                padding: '0.7rem 1.75rem', 
                background: 'var(--accent-color, #4f46e5)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: saving ? 'not-allowed' : 'pointer', 
                fontWeight: 600, 
                fontSize: '0.9rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)', 
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s ease'
              }}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
