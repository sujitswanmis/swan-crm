'use client';

import React, { useState, useEffect } from 'react';
import { getInstances, sendDirectTestMessage } from '@/app/actions/whatsappUnofficialDb';
import { Send, Phone, MessageSquare, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Clock } from 'lucide-react';

const PRESET_MESSAGES = [
  { id: '1', title: 'Connection Verification', text: 'Hello! This is a test WhatsApp message from our Swan CRM system. WhatsApp unofficial gateway connection verified successfully!' },
  { id: '2', title: 'Lead Notification Alert', text: 'Dear Client, thank you for reaching out to us. Our sales manager has received your inquiry and will connect with you shortly.' },
  { id: '3', title: 'Payment & Billing Confirmation', text: 'Hi, this is a confirmation that your payment has been processed successfully. Thank you for your business!' }
];

export default function TestMessage() {
  const [instances, setInstances] = useState([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [recipientNumber, setRecipientNumber] = useState('');
  const [messageText, setMessageText] = useState(PRESET_MESSAGES[0].text);
  const [loading, setLoading] = useState(false);
  const [fetchingInstances, setFetchingInstances] = useState(true);
  const [response, setResponse] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    setFetchingInstances(true);
    const res = await getInstances();
    if (res.success && res.data) {
      setInstances(res.data);
      // Select first connected instance if available, otherwise first instance
      const connected = res.data.find(i => i.status === 'CONNECTED');
      if (connected) {
        setSelectedInstanceId(connected.id);
      } else if (res.data.length > 0) {
        setSelectedInstanceId(res.data[0].id);
      }
    }
    setFetchingInstances(false);
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!recipientNumber.trim()) {
      alert('Please enter a recipient mobile number.');
      return;
    }
    if (!messageText.trim()) {
      alert('Please enter a message text.');
      return;
    }

    setLoading(true);
    setResponse(null);

    const cleanNumber = recipientNumber.replace(/[^0-9]/g, '');
    const res = await sendDirectTestMessage({
      instanceId: selectedInstanceId,
      toNumber: cleanNumber,
      messageText: messageText.trim()
    });

    setLoading(false);
    setResponse(res);

    if (res.success) {
      const newHistoryItem = {
        id: Date.now(),
        number: cleanNumber,
        text: messageText.trim(),
        time: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
        messageId: res.messageId
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 10));
    }
  };

  return (
    <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
      
      {/* Top Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Test WhatsApp Message Dispatch</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.3rem 0 0 0' }}>
          Test direct outbound WhatsApp messaging through your linked AK Nexus / unofficial gateway instances.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.2fr) minmax(300px, 0.8fr)', gap: '1.5rem' }}>
        
        {/* Left: Test Message Form */}
        <div className="card" style={{ padding: '1.75rem', borderRadius: '12px' }}>
          <form onSubmit={handleSend}>
            
            {/* Instance Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Select WhatsApp Instance / Account *
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                  disabled={fetchingInstances || instances.length === 0}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
                >
                  {instances.length === 0 ? (
                    <option value="">No instances found. Create one in Instance Management.</option>
                  ) : (
                    instances.map(inst => (
                      <option key={inst.id} value={inst.id}>
                        {inst.instance_name} ({inst.instance_key}) &bull; {inst.status}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={loadInstances}
                  title="Refresh instances"
                  className="btn-secondary"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px' }}
                >
                  <RefreshCw size={15} className={fetchingInstances ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Recipient Number */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Recipient Mobile Number (with country code) *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={recipientNumber}
                  onChange={(e) => setRecipientNumber(e.target.value)}
                  placeholder="e.g. 917261902348"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                />
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Include country code without &apos;+&apos; sign (e.g. 91 for India followed by 10-digit number).
              </span>
            </div>

            {/* Quick Templates */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Sparkles size={13} color="#059669" /> QUICK TEST TEMPLATES
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {PRESET_MESSAGES.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setMessageText(tpl.text)}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      cursor: 'pointer',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Text */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Message Text *
              </label>
              <textarea
                rows={5}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your WhatsApp message here..."
                style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: '1.4' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {messageText.length} characters
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !recipientNumber.trim() || !messageText.trim()}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                backgroundColor: '#059669',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Sending via WhatsApp Gateway...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send Test WhatsApp Message
                </>
              )}
            </button>
          </form>

          {/* Response Alert */}
          {response && (
            <div style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: '8px',
              border: `1px solid ${response.success ? '#a7f3d0' : '#fecaca'}`,
              backgroundColor: response.success ? '#f0fdf4' : '#fef2f2',
              color: response.success ? '#15803d' : '#b91c1c'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                {response.success ? <CheckCircle2 size={16} color="#15803d" /> : <AlertCircle size={16} color="#b91c1c" />}
                {response.success ? 'Message Dispatched Successfully!' : 'Dispatch Failed'}
              </div>
              <div style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                {response.message || response.error}
              </div>
              {response.messageId && (
                <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', opacity: 0.85 }}>
                  Message ID: <code>{response.messageId}</code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Message Preview & Recent History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Live Phone Bubble Preview */}
          <div className="card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MessageSquare size={14} /> LIVE MESSAGE BUBBLE PREVIEW
            </h4>
            <div style={{ background: '#e5ddd5', borderRadius: '8px', padding: '1rem', minHeight: '120px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                background: '#dcf8c6',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px 0px 8px 8px',
                maxWidth: '90%',
                alignSelf: 'flex-end',
                boxShadow: '0 1px 1px rgba(0,0,0,0.15)',
                fontSize: '0.82rem',
                lineHeight: '1.4',
                color: '#111827',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap'
              }}>
                {messageText || 'Type a message on the left to preview...'}
                <div style={{ textAlign: 'right', fontSize: '0.68rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date())} &bull; ✓✓
                </div>
              </div>
            </div>
          </div>

          {/* Recent Session History */}
          <div className="card" style={{ padding: '1.25rem', borderRadius: '12px', flex: 1 }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={14} /> RECENT SESSION SENDS
            </h4>
            {history.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                No messages dispatched in this session yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {history.map(item => (
                  <div key={item.id} style={{ padding: '0.6rem', borderRadius: '6px', background: 'var(--th-filtered-bg)', border: '1px solid var(--border-light)', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '0.2rem' }}>
                      <span style={{ color: '#059669' }}>+{item.number}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{item.time}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
