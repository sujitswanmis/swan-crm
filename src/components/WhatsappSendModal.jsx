'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { getWhatsappTemplates, sendWhatsappMessage } from '@/app/actions/whatsapp';

export default function WhatsappSendModal({ lead, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  
  // Extract all available phones
  const allPhones = Array.from(new Set([
    lead.phone, lead.cp1_mobile_2, lead.cp1_alt_1, lead.cp1_alt_2,
    lead.cp2_mobile_1, lead.cp2_mobile_2, lead.cp2_alt_1, lead.cp2_alt_2,
    lead.cp3_mobile_1, lead.cp3_mobile_2, lead.cp3_alt_1, lead.cp3_alt_2,
    lead.business_contact_1, lead.business_contact_2, lead.business_alt_1, lead.business_alt_2
  ].filter(p => p && String(p).trim() !== '')));

  const [selectedPhones, setSelectedPhones] = useState(allPhones.length > 0 ? [allPhones[0]] : []);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function loadTemplates() {
      const res = await getWhatsappTemplates();
      if (res.success) {
        setTemplates(res.data || []);
      }
      setLoading(false);
    }
    loadTemplates();
  }, []);

  const handleSend = async () => {
    if (!selectedTemplateId) {
      alert("Please select a template first.");
      return;
    }
    if (selectedPhones.length === 0) {
      alert("Please select at least one phone number.");
      return;
    }

    setSending(true);
    setResult(null);

    const res = await sendWhatsappMessage(lead.id, selectedTemplateId, selectedPhones);
    
    if (res.success) {
      setResult({ type: 'success', message: 'Message sent successfully to AiSensy!' });
      setTimeout(() => onClose(), 2000);
    } else {
      setResult({ type: 'error', message: res.error || 'Failed to send message.' });
    }
    
    setSending(false);
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '8px', width: '90%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Send Official WhatsApp</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Sending to: <strong>{lead.name || lead.company || lead.business_type}</strong>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Select Numbers to Send</label>
            {allPhones.length === 0 ? (
              <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>No phone numbers found for this lead.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                {allPhones.map(phone => (
                  <label key={phone} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedPhones.includes(phone)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedPhones([...selectedPhones, phone]);
                        else setSelectedPhones(selectedPhones.filter(p => p !== phone));
                      }}
                    />
                    {phone}
                  </label>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading templates...</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: '6px' }}>
              No templates found. Please create templates in the Message Config menu first.
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Select Template</label>
                <select 
                  value={selectedTemplateId} 
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                >
                  <option value="">-- Choose Template --</option>
                  {templates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>{tpl.template_name}</option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <div style={{ backgroundColor: 'var(--th-bg)', padding: '1rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                  <strong>Preview:</strong><br/>
                  {selectedTemplate.message_body.replace('{{1}}', lead.name || lead.company || lead.business_type || 'Customer')}
                </div>
              )}

              {result && (
                <div style={{ padding: '0.75rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', backgroundColor: result.type === 'success' ? '#dcfce7' : '#fee2e2', color: result.type === 'success' ? '#166534' : '#991b1b' }}>
                  {result.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {result.message}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: 'var(--bg-primary)' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button 
            onClick={handleSend} 
            disabled={!selectedTemplateId || sending || templates.length === 0 || selectedPhones.length === 0}
            style={{ padding: '0.5rem 1.5rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: (selectedTemplateId && !sending && selectedPhones.length > 0) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, opacity: (!selectedTemplateId || sending || selectedPhones.length === 0) ? 0.6 : 1 }}
          >
            <Send size={16} /> {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
