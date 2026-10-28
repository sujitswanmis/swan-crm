'use client';

import React, { useState } from 'react';
import {
  X, CheckCircle2, AlertTriangle, ArrowRight, UserCheck, Wrench,
  Shield, Calendar, FileText, Camera, Upload, Star, Clock
} from 'lucide-react';

export default function ComplaintStageActionModal({
  isOpen,
  onClose,
  ticket,
  targetStage,
  onSuccess,
  teamMembers = [],
  userName = 'Operations',
  userId = ''
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Action Form States
  const [formState, setFormState] = useState({
    notes: '',

    // C02 fields
    rca_root_cause: '',
    action_path: 'Field Technician Visit Required',

    // C03 fields (Technician)
    technician_type: 'IN_HOUSE', // 'IN_HOUSE' | 'EXTERNAL_VENDOR'
    technician_id: '',
    technician_name: '',
    technician_phone: '',
    vendor_firm_name: '',
    scheduled_visit_date: new Date().toISOString().split('T')[0],
    visit_time_slot: '11:00 AM - 02:00 PM',
    spares_to_carry: '',

    // C04 fields (Job Card)
    job_card_no: '',
    action_taken_type: 'Part Replaced Under Warranty',
    spares_consumed: '',
    job_card_photos: [],

    // C05 fields (Verification)
    verification_method: 'Customer 4-digit OTP',
    customer_otp_entered: '',
    customer_rating: 5,
    signed_slip_url: '',

    // C06 fields (Closure)
    closure_audit_remarks: '',
    warranty_claim_status: 'SETTLED_PASSED'
  });

  if (!isOpen || !ticket || !targetStage) return null;

  const handleSelectInHouseTech = (empId) => {
    const emp = teamMembers.find(m => String(m.user_id || m.id) === String(empId));
    if (emp) {
      setFormState(prev => ({
        ...prev,
        technician_id: empId,
        technician_name: emp.emp_name || emp.name,
        technician_phone: emp.mobile_1 || emp.phone || emp.mobile || ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Specific Stage Validations
    if (targetStage.id === 'C03') {
      if (formState.technician_type === 'IN_HOUSE' && !formState.technician_name) {
        setErrorMsg('Please select a Service Engineer from the team list.');
        return;
      }
      if (formState.technician_type === 'EXTERNAL_VENDOR' && !formState.technician_name) {
        setErrorMsg('Please enter external technician name.');
        return;
      }
    }

    if (targetStage.id === 'C04') {
      if (!formState.job_card_no.trim()) {
        setErrorMsg('Job Card / Service Slip number is required.');
        return;
      }
    }

    if (targetStage.id === 'C05') {
      if (formState.verification_method === 'Customer 4-digit OTP' && !formState.customer_otp_entered) {
        setErrorMsg('Customer OTP is required for sign-off.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (onSuccess) {
        await onSuccess({
          ticketId: ticket.id,
          targetStage,
          formState,
          executedBy: userName,
          executedById: userId
        });
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to advance stage.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #1e293b)',
        border: '1px solid var(--border-light, #334155)',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-light, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-primary, #0f172a)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: targetStage.color || '#3b82f6',
                background: `${targetStage.color || '#3b82f6'}20`,
                padding: '0.15rem 0.45rem',
                borderRadius: '4px'
              }}>
                {targetStage.id}
              </span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Advance to: {targetStage.name}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Ticket #{ticket.ticket_number} — {ticket.customer_name || ticket.party?.firm_name}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.35rem'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}>
              <AlertTriangle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STAGE C02: RCA & Path */}
          {targetStage.id === 'C02' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Root Cause Analysis (RCA) Finding <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gearbox bearing misalignment / Transit shock / Electrical surge"
                  value={formState.rca_root_cause}
                  onChange={e => setFormState({ ...formState, rca_root_cause: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Recommended Action Path
                </label>
                <select
                  value={formState.action_path}
                  onChange={e => setFormState({ ...formState, action_path: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="Field Technician Visit Required">🧑‍🔧 Field Technician Visit Required (Proceed to C03)</option>
                  <option value="Replacement Part Dispatch">📦 Direct Replacement Part Dispatch (Logistics)</option>
                  <option value="Credit Note Adjustment">📑 Credit Note / Scheme Adjustment (Accounts)</option>
                  <option value="Telephonic Guidance / Resolved">📞 Telephonic Guidance Given to Partner</option>
                </select>
              </div>
            </div>
          )}

          {/* STAGE C03: Service Engineer Deputation */}
          {targetStage.id === 'C03' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="tech_type"
                    checked={formState.technician_type === 'IN_HOUSE'}
                    onChange={() => setFormState({ ...formState, technician_type: 'IN_HOUSE' })}
                  />
                  <span>In-House Service Engineer</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="tech_type"
                    checked={formState.technician_type === 'EXTERNAL_VENDOR'}
                    onChange={() => setFormState({ ...formState, technician_type: 'EXTERNAL_VENDOR' })}
                  />
                  <span>Authorized Third-Party / Local Vendor</span>
                </label>
              </div>

              {formState.technician_type === 'IN_HOUSE' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Select Service Engineer (from Team Master) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formState.technician_id}
                    onChange={e => handleSelectInHouseTech(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    <option value="">-- Choose Active Service Engineer --</option>
                    {teamMembers.map(m => (
                      <option key={m.id || m.user_id} value={m.id || m.user_id}>
                        {m.emp_name || m.name} ({m.role || 'Service Team'}) - {m.mobile_1 || m.phone || ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Technician Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Jaswinder Singh"
                      value={formState.technician_name}
                      onChange={e => setFormState({ ...formState, technician_name: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Technician Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="10-digit mobile"
                      value={formState.technician_phone}
                      onChange={e => setFormState({ ...formState, technician_phone: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Scheduled Visit Date (IST) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.scheduled_visit_date}
                    onChange={e => setFormState({ ...formState, scheduled_visit_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Visit Time Slot Window
                  </label>
                  <select
                    value={formState.visit_time_slot}
                    onChange={e => setFormState({ ...formState, visit_time_slot: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    <option value="09:00 AM - 12:00 PM">Morning (09:00 AM - 12:00 PM)</option>
                    <option value="12:00 PM - 03:00 PM">Afternoon (12:00 PM - 03:00 PM)</option>
                    <option value="03:00 PM - 06:00 PM">Evening (03:00 PM - 06:00 PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Tools / Spares to Carry Checklist
                </label>
                <input
                  type="text"
                  placeholder="e.g. Seal Kit #2, Grease gun, Multi-meter"
                  value={formState.spares_to_carry}
                  onChange={e => setFormState({ ...formState, spares_to_carry: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          )}

          {/* STAGE C04: Job Card Execution */}
          {targetStage.id === 'C04' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Job Card / Service Slip No <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. JC-2026-0421"
                    value={formState.job_card_no}
                    onChange={e => setFormState({ ...formState, job_card_no: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Action Taken On-Site
                  </label>
                  <select
                    value={formState.action_taken_type}
                    onChange={e => setFormState({ ...formState, action_taken_type: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    <option value="Part Replaced Under Warranty">Part Replaced Under Warranty</option>
                    <option value="On-Site Repair & Tuning">On-Site Repair &amp; Tuning</option>
                    <option value="Calibration Done">Calibration / Pressure Reset</option>
                    <option value="Software Reflashed">Software / Sensor Reflashed</option>
                    <option value="Customer Guidance Given">Customer Guidance / Setting Rectified</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Spares Consumed (Name &amp; Qty)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bearing #6205 (2 pcs), Gasket (1 pc)"
                  value={formState.spares_consumed}
                  onChange={e => setFormState({ ...formState, spares_consumed: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          )}

          {/* STAGE C05: Customer Verification & OTP */}
          {targetStage.id === 'C05' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Verification Method <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formState.verification_method}
                  onChange={e => setFormState({ ...formState, verification_method: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="Customer 4-digit OTP">Customer 4-digit OTP (Live Verification)</option>
                  <option value="Signed Physical Job Sheet Upload">Signed Physical Job Sheet Photo</option>
                  <option value="Telephonic Confirmation by CRM Desk">Telephonic Confirmation by CRM Desk</option>
                </select>
              </div>

              {formState.verification_method === 'Customer 4-digit OTP' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Enter 4-Digit Customer OTP <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    required
                    placeholder="4-digit OTP"
                    value={formState.customer_otp_entered}
                    onChange={e => setFormState({ ...formState, customer_otp_entered: e.target.value.replace(/\D/g, '') })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: '4px', fontWeight: 800 }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '3px', display: 'block' }}>
                    Sent to: {ticket.customer_phone || ticket.party?.primary_mobile || 'Customer'}
                  </span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Customer Satisfaction Rating
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setFormState({ ...formState, customer_rating: star })}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        background: formState.customer_rating >= star ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-primary)',
                        border: `1px solid ${formState.customer_rating >= star ? '#f59e0b' : 'var(--border-light)'}`,
                        color: formState.customer_rating >= star ? '#f59e0b' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700
                      }}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STAGE C06: Audit & Closure */}
          {targetStage.id === 'C06' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Warranty Claim Audit Status
                </label>
                <select
                  value={formState.warranty_claim_status}
                  onChange={e => setFormState({ ...formState, warranty_claim_status: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="SETTLED_PASSED">Warranty Claim Passed &amp; Settled by Factory QA</option>
                  <option value="CHARGEABLE_PAID">Chargeable Repair - Customer Paid</option>
                  <option value="DISMISS_MISUSE">Claim Rejected - Customer Misuse / Non-OEM Part</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Final Closure Audit Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Final audit notes, root cause verified, CAPA closed..."
                  value={formState.closure_audit_remarks}
                  onChange={e => setFormState({ ...formState, closure_audit_remarks: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          )}

          {/* General Stage Action Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Stage Transition Notes / Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Enter operational notes for this stage transition..."
              value={formState.notes}
              onChange={e => setFormState({ ...formState, notes: e.target.value })}
              style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            />
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.82rem'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${targetStage.color || '#2563eb'} 0%, #1e40af 100%)`,
                border: 'none',
                color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
            >
              {submitting ? 'Updating Stage...' : `Confirm & Move to ${targetStage.id}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
