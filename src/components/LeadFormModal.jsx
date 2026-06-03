'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function LeadFormModal({ isOpen, onClose }) {
  const [sources, setSources] = useState(['Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 'Customer Reference', 'Exhibition', 'Other']);
  const [priorities, setPriorities] = useState([
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ]);
  const [stages, setStages] = useState([
    { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] }
  ]);

  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.sources) setSources(parsed.sources);
          if (parsed.priorities) setPriorities(parsed.priorities);
          if (parsed.stages && parsed.stages.length > 0 && typeof parsed.stages[0] === 'object' && parsed.stages[0].substages) {
            setStages(parsed.stages);
          }
        } catch (e) { console.error(e); }
      }
    };
    
    if (isOpen) {
      loadConfig();
    }
    
    window.addEventListener('crm_config_updated', loadConfig);
    return () => window.removeEventListener('crm_config_updated', loadConfig);
  }, [isOpen]);
  const [formData, setFormData] = useState({
    source: '',
    source_name: '',
    priority: '',
    business_type: '',
    company: '',
    business_contact_1: '',
    business_email_1: '',
    name: '',
    phone: '',
    email: '',
    status: '1;01>New Stage>New Lead'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase
      .from('leads')
      .insert([formData]);
      
    setIsSubmitting(false);
    
    if (error) {
      alert('Error adding lead: ' + error.message);
    } else {
      setFormData({
        source: '', source_name: '', priority: '', business_type: '', company: '', 
        business_contact_1: '', business_email_1: '', name: '', phone: '', email: '', status: '1;01>New Stage>New Lead'
      });
      onClose();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Instant Client Registration</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
          
          {/* Source & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Lead Source</label>
              <select name="source" value={formData.source} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                <option value="">Select Lead Source</option>
                {sources.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Source Name</label>
              <input type="text" name="source_name" value={formData.source_name} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
          </div>

          {/* Business Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Business Type</label>
              <select name="business_type" value={formData.business_type} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                <option value="">Select Business Type</option>
                <option value="Dealer">Dealer</option>
                <option value="Distributor">Distributor</option>
                <option value="Retailer">Retailer</option>
                <option value="Farmer">Farmer</option>
                <option value="Trader">Trader</option>
                <option value="Manufacturer">Manufacturer</option>
                <option value="Service Provider">Service Provider</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Business Name</label>
              <input type="text" name="company" value={formData.company} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Business Contact Number</label>
              <input type="tel" name="business_contact_1" value={formData.business_contact_1} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Business Mail ID</label>
              <input type="email" name="business_email_1" value={formData.business_email_1} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
          </div>

          {/* Contact Person Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Contact Person Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} required style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Contact Person Mobile Number</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Contact Person ID (Email)</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
          </div>

          {/* Status & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Lead Status</label>
                <select name="status" value={formData.status} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  {stages.map((stageObj, i) => {
                    const stageNum = i + 1;
                    const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                    return (
                      <React.Fragment key={`stage-${i}`}>
                        <option disabled style={{ fontWeight: 'bold', color: '#000' }}>{stageObj.name}</option>
                        {stageObj.substages.map((sub, j) => {
                          const subNum = String(j + 1).padStart(2, '0');
                          const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                          // if user already prefixed it, keep it, else prefix it
                          const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </React.Fragment>
                    );
                  })}
                </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Lead Priority Type</label>
              <select name="priority" value={formData.priority} onChange={handleChange} style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                <option value="">Select Priority</option>
                {priorities.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" onClick={onClose} style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-surface)', cursor: 'pointer', fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ padding: '0.75rem 1.5rem' }}>
              {isSubmitting ? 'Saving...' : 'Register Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
