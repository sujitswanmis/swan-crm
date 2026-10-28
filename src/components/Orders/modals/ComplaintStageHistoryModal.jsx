'use client';

import React from 'react';
import { X, Clock, CheckCircle2, User, Wrench, Shield, Star, AlertTriangle, ArrowRight } from 'lucide-react';

function formatIST(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (_) {
    return String(isoDate).slice(0, 16);
  }
}

export default function ComplaintStageHistoryModal({
  isOpen,
  onClose,
  ticket
}) {
  if (!isOpen || !ticket) return null;

  const history = Array.isArray(ticket.stage_history) ? ticket.stage_history : [];

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
        maxWidth: '620px',
        maxHeight: '85vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <Clock size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Complaint Stage Audit History (IST)
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Ticket #{ticket.ticket_number} — {ticket.customer_name || ticket.party?.firm_name}
              </p>
            </div>
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

        {/* Timeline Body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
              <Clock size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
              <p style={{ fontSize: '0.85rem' }}>No stage transition history recorded yet.</p>
              <span style={{ fontSize: '0.74rem' }}>Created on: {formatIST(ticket.created_at)}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Vertical line indicator */}
              <div style={{
                position: 'absolute',
                top: '12px',
                bottom: '12px',
                left: '17px',
                width: '2px',
                background: 'var(--border-light, #334155)',
                zIndex: 1
              }} />

              {history.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', position: 'relative', zIndex: 2 }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: item.stage_color ? `${item.stage_color}25` : 'rgba(59, 130, 246, 0.2)',
                    border: `2px solid ${item.stage_color || '#3b82f6'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.stage_color || '#3b82f6',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    flexShrink: 0
                  }}>
                    {item.stage_id || `C0${idx + 1}`}
                  </div>

                  <div style={{
                    flex: 1,
                    background: 'var(--bg-primary, #0f172a)',
                    border: '1px solid var(--border-light, #334155)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                        {item.stage_name || item.stage_id}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} />
                        {formatIST(item.executed_at || item.timestamp)}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                      Updated by: <strong style={{ color: 'var(--text-primary)' }}>{item.executed_by || 'Operations'}</strong>
                    </div>

                    {item.notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', background: 'var(--bg-surface)', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                        {item.notes}
                      </div>
                    )}

                    {/* Metadata chips */}
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                        {item.metadata.technician_name && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                            🧑‍🔧 Tech: {item.metadata.technician_name} ({item.metadata.technician_phone})
                          </span>
                        )}
                        {item.metadata.scheduled_visit_date && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                            📅 Visit: {item.metadata.scheduled_visit_date}
                          </span>
                        )}
                        {item.metadata.job_card_no && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                            📋 Job Card #{item.metadata.job_card_no}
                          </span>
                        )}
                        {item.metadata.action_taken_type && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            ✓ {item.metadata.action_taken_type}
                          </span>
                        )}
                        {item.metadata.customer_rating && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #f59e0b' }}>
                            ★ {item.metadata.customer_rating}/5 CSAT
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-light, #334155)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-primary, #0f172a)' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.1rem',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
