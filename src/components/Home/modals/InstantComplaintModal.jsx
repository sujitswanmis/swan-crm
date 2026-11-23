'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, AlertTriangle, Search, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { getPartyList } from '@/app/actions/partyMaster';
import { createComplaintTicketDirect } from '@/app/actions/orderFulfillment';

const COMPLAINT_CATEGORIES = [
  { id: 'MANUFACTURING_DEFECT', label: 'Manufacturing Defect', dept: 'QUALITY_ASSURANCE' },
  { id: 'TRANSIT_DAMAGE', label: 'Transit Damage & Breakage', dept: 'LOGISTICS_DISPATCH' },
  { id: 'SHORTAGE_PRODUCT_SPAREPART', label: 'Shortage / Missing Parts', dept: 'LOGISTICS_DISPATCH' },
  { id: 'DELIVERY_DELAY', label: 'Delivery Delay / Transporter Lag', dept: 'LOGISTICS_DISPATCH' },
  { id: 'BILLING_ISSUES', label: 'Billing / Pricing Dispute', dept: 'ACCOUNTS_BILLING' },
  { id: 'SERVICE_ISSUES', label: 'Service / Field Engineer Support', dept: 'SERVICE_SUPPORT' },
  { id: 'WARRANTY_CLAIM', label: 'Warranty Claim / Replacement', dept: 'QUALITY_ASSURANCE' }
];

export default function InstantComplaintModal({
  isOpen,
  onClose,
  tenantId = '',
  userId = '',
  userName = 'Employee'
}) {
  const [complaintType, setComplaintType] = useState('CHANNEL_PARTNER');
  const [parties, setParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [selectedParty, setSelectedParty] = useState(null);

  // End customer fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Complaint details
  const [category, setCategory] = useState('MANUFACTURING_DEFECT');
  const [priority, setPriority] = useState('HIGH');
  const [assignedDepartment, setAssignedDepartment] = useState('QUALITY_ASSURANCE');
  const [issueDescription, setIssueDescription] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-sync department when category changes
  const handleCategoryChange = (catId) => {
    setCategory(catId);
    const found = COMPLAINT_CATEGORIES.find(c => c.id === catId);
    if (found?.dept) setAssignedDepartment(found.dept);
  };

  // Fetch party list on modal open
  useEffect(() => {
    if (!isOpen) {
      setSelectedParty(null);
      setPartySearch('');
      setErrorMsg('');
      setSuccessMsg('');
      setCustomerName('');
      setCustomerPhone('');
      setIssueDescription('');
      return;
    }

    let active = true;
    async function loadParties() {
      setLoadingParties(true);
      try {
        const res = await getPartyList(tenantId, { limit: 200 });
        if (active && Array.isArray(res)) {
          setParties(res);
        } else if (active && res?.data && Array.isArray(res.data)) {
          setParties(res.data);
        }
      } catch (e) {
        console.warn('Failed to load parties for quick complaint:', e);
      } finally {
        if (active) setLoadingParties(false);
      }
    }
    loadParties();
    return () => { active = false; };
  }, [isOpen, tenantId]);

  const filteredParties = useMemo(() => {
    if (!partySearch.trim()) return parties.slice(0, 30);
    const q = partySearch.toLowerCase().trim();
    return parties.filter(p => 
      (p.firm_name || '').toLowerCase().includes(q) ||
      (p.party_universal_code || '').toLowerCase().includes(q) ||
      (p.primary_mobile || '').includes(q) ||
      (p.city || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [parties, partySearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (complaintType === 'CHANNEL_PARTNER' && !selectedParty) {
      setErrorMsg('Please select a Channel Partner.');
      return;
    }
    if (complaintType === 'END_CUSTOMER' && !customerName.trim()) {
      setErrorMsg('Please enter Customer Name.');
      return;
    }
    if (!issueDescription.trim()) {
      setErrorMsg('Please enter complaint details or issue description.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createComplaintTicketDirect({
        complaint_type: complaintType,
        party_id: selectedParty ? selectedParty.id : null,
        customer_name: complaintType === 'END_CUSTOMER' ? customerName.trim() : (selectedParty?.firm_name || ''),
        customer_phone: complaintType === 'END_CUSTOMER' ? customerPhone.trim() : (selectedParty?.primary_mobile || ''),
        complaint_source: 'DIRECT_PHONE',
        category,
        priority,
        assigned_department: assignedDepartment,
        assigned_employee_name: userName || 'Employee',
        issue_description: `[Instant Home Ticket] ${issueDescription.trim()}`
      }, tenantId);

      if (res?.success) {
        setSuccessMsg(`✓ Complaint ticket logged! Ticket #${res.ticket?.ticket_number || 'OPEN'}.`);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg('Failed to log complaint: ' + (res?.error || 'Unknown error occurred'));
      }
    } catch (err) {
      setErrorMsg('Error creating ticket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #ffffff)',
        color: 'var(--text-primary, #0f172a)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--border-light, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Instant Complaint Entry
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
                Log customer complaints & dispatch issues directly into C01 ticket queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #64748b)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#16a34a',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Type Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'var(--bg-subtle, #f8fafc)', padding: '0.25rem', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setComplaintType('CHANNEL_PARTNER')}
              style={{
                flex: 1,
                padding: '0.45rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: complaintType === 'CHANNEL_PARTNER' ? '#ffffff' : 'transparent',
                boxShadow: complaintType === 'CHANNEL_PARTNER' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                fontWeight: complaintType === 'CHANNEL_PARTNER' ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                color: complaintType === 'CHANNEL_PARTNER' ? '#dc2626' : 'var(--text-secondary, #64748b)'
              }}
            >
              Channel Partner / Dealer
            </button>
            <button
              type="button"
              onClick={() => setComplaintType('END_CUSTOMER')}
              style={{
                flex: 1,
                padding: '0.45rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: complaintType === 'END_CUSTOMER' ? '#ffffff' : 'transparent',
                boxShadow: complaintType === 'END_CUSTOMER' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                fontWeight: complaintType === 'END_CUSTOMER' ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                color: complaintType === 'END_CUSTOMER' ? '#dc2626' : 'var(--text-secondary, #64748b)'
              }}
            >
              End Customer / Farmer
            </button>
          </div>

          {/* Party or End Customer Selector */}
          {complaintType === 'CHANNEL_PARTNER' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                Select Channel Partner <span style={{ color: '#ef4444' }}>*</span>
              </label>
              {selectedParty ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#dc2626' }}>
                      {selectedParty.firm_name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                      {selectedParty.party_universal_code} • {selectedParty.primary_mobile || 'No Mobile'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedParty(null)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                      placeholder="Search channel partner..."
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        fontSize: '0.88rem',
                        outline: 'none',
                        backgroundColor: 'var(--bg-card, #ffffff)'
                      }}
                    />
                  </div>
                  <div style={{
                    maxHeight: '130px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    borderRadius: '8px',
                    marginTop: '0.35rem',
                    backgroundColor: 'var(--bg-card, #ffffff)'
                  }}>
                    {loadingParties ? (
                      <div style={{ padding: '0.8rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748b' }}>
                        <Loader2 size={16} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                        Loading parties...
                      </div>
                    ) : filteredParties.length === 0 ? (
                      <div style={{ padding: '0.8rem', textAlign: 'center', fontSize: '0.82rem', color: '#94a3b8' }}>
                        No parties found.
                      </div>
                    ) : (
                      filteredParties.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedParty(p)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderBottom: '1px solid var(--border-light, #f1f5f9)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.84rem'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{ fontWeight: 600 }}>{p.firm_name}</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {p.party_universal_code} • {p.city || '-'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Customer Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer / Farmer Name"
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Customer Mobile Phone
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>
          )}

          {/* Category & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Defect / Issue Category <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-card, #ffffff)'
                }}
              >
                {COMPLAINT_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Priority Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-card, #ffffff)'
                }}
              >
                <option value="MEDIUM">Medium (Normal)</option>
                <option value="HIGH">High Priority</option>
                <option value="URGENT">Urgent / Critical</option>
              </select>
            </div>
          </div>

          {/* Issue Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Issue Description & Symptoms <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Describe product defect, broken part, delivery shortage details..."
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                fontSize: '0.85rem',
                resize: 'none'
              }}
            />
          </div>

          {/* Modal Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                background: 'none',
                color: 'var(--text-secondary, #64748b)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (complaintType === 'CHANNEL_PARTNER' && !selectedParty)}
              style={{
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: (complaintType === 'END_CUSTOMER' || selectedParty)
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : '#cbd5e1',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: (complaintType === 'END_CUSTOMER' || selectedParty) && !submitting ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: (complaintType === 'END_CUSTOMER' || selectedParty) ? '0 2px 4px rgba(239, 68, 68, 0.2)' : 'none'
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Logging Ticket...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Log Complaint Ticket</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
