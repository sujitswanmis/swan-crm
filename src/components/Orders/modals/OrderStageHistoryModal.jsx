'use client';

import React, { useMemo } from 'react';
import {
  X, Clock, CheckCircle2, AlertTriangle, User, Calendar, ShieldCheck,
  Truck, FileText, IndianRupee, Layers, Check, ArrowRight
} from 'lucide-react';

// Format ISO date string to readable IST (+05:30)
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
    return isoDate;
  }
}

// Calculate human elapsed hours/days
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 hrs';
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours} hr(s)`;
  const days = (hours / 24).toFixed(1);
  return `${days} day(s)`;
}

export default function OrderStageHistoryModal({
  order,
  isOpen,
  onClose,
  masterStages = []
}) {
  if (!isOpen || !order) return null;

  const history = Array.isArray(order.stage_history) ? order.stage_history : [];

  // SLA Performance Scorecard metrics
  const scorecard = useMemo(() => {
    let onTimeCount = 0;
    let delayedCount = 0;

    history.forEach(h => {
      if (h.tat_breached) {
        delayedCount++;
      } else {
        onTimeCount++;
      }
    });

    const createdTime = order.created_at ? new Date(order.created_at).getTime() : Date.now();
    const lastTime = history.length > 0 && history[history.length - 1].actual_timestamp
      ? new Date(history[history.length - 1].actual_timestamp).getTime()
      : Date.now();
    const elapsedMs = Math.max(0, lastTime - createdTime);

    return {
      totalCompleted: history.length,
      onTimeCount,
      delayedCount,
      elapsedFormatted: formatDuration(elapsedMs)
    };
  }, [order, history]);

  // Identify completed stage IDs
  const completedStageIds = new Set(history.map(h => (h.stage_id || '').toUpperCase()));

  // Pending stages from master stages list
  const pendingStages = useMemo(() => {
    if (!Array.isArray(masterStages) || masterStages.length === 0) return [];
    return masterStages.filter(s => !completedStageIds.has(s.id.toUpperCase()) && !s.is_cancelled);
  }, [masterStages, completedStageIds]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1150,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        width: '96%',
        maxWidth: '860px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 35px -5px rgba(0, 0, 0, 0.45)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '0.2rem 0.55rem',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#0284c7',
                border: '1px solid rgba(56, 189, 248, 0.3)'
              }}>
                AUDIT TIMELINE
              </span>
              <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Order Pipeline History — {order.order_number}
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Channel Partner: <strong style={{ color: 'var(--text-primary)' }}>{order.party?.firm_name || 'Channel Partner'}</strong>
              {' '}• Ordered: <strong>{order.total_ordered_qty || 1} Unit(s)</strong>
              {' '}• Amount: <strong style={{ color: '#059669' }}>₹{Number(order.total_amount || 0).toLocaleString('en-IN')}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{
          padding: '1.25rem 1.5rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          {/* SLA Performance Scorecard */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '0.75rem'
          }}>
            <div style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Stages Completed</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {scorecard.totalCompleted} Action(s)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>SLA On-Time</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '0.15rem' }}>
                {scorecard.onTimeCount} Stages (Within TAT)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: scorecard.delayedCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-primary)',
              border: `1px solid ${scorecard.delayedCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-light)'}`,
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: scorecard.delayedCount > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: 600 }}>
                SLA Breached / Delayed
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: scorecard.delayedCount > 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {scorecard.delayedCount} Stage(s)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Elapsed Pipeline Time</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                {scorecard.elapsedFormatted}
              </div>
            </div>
          </div>

          {/* Stepper Timeline Section */}
          <div>
            <h4 style={{
              margin: '0 0 1rem 0',
              fontSize: '0.88rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}>
              <Clock size={16} style={{ color: '#2563eb' }} />
              Chronological Audit Trail (Who did what, when &amp; SLA Status):
            </h4>

            <div style={{ position: 'relative', paddingLeft: '1.75rem' }}>
              {/* Vertical connecting line */}
              <div style={{
                position: 'absolute',
                top: '12px',
                bottom: '12px',
                left: '9px',
                width: '2px',
                background: 'var(--border-light)'
              }} />

              {/* Step 0: Order Booked Creation Event */}
              <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
                {/* Node icon */}
                <div style={{
                  position: 'absolute',
                  left: '-1.75rem',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.68rem',
                  boxShadow: '0 0 0 3px var(--bg-surface)'
                }}>
                  <Check size={11} />
                </div>

                {/* Card */}
                <div style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(37,99,235,0.12)',
                        color: '#2563eb'
                      }}>
                        STAGE S00
                      </span>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        Order Booked &amp; Punched into Pipeline
                      </strong>
                    </div>

                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      📅 {formatIST(order.created_at)}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Initial order booked with {order.total_ordered_qty || 1} unit(s) totaling ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}.
                  </div>
                </div>
              </div>

              {/* Completed Stage History Events */}
              {history.map((entry, idx) => {
                const isDelayed = entry.tat_breached;
                const formattedTime = formatIST(entry.actual_timestamp || entry.created_at);

                return (
                  <div key={idx} style={{ position: 'relative', marginBottom: '1.25rem' }}>
                    {/* Node Icon */}
                    <div style={{
                      position: 'absolute',
                      left: '-1.75rem',
                      top: '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isDelayed ? '#ef4444' : '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 0 3px var(--bg-surface)'
                    }}>
                      <Check size={11} />
                    </div>

                    {/* Step Card */}
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: isDelayed ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-light)',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      {/* Step Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: isDelayed ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                            color: isDelayed ? '#ef4444' : '#10b981'
                          }}>
                            {entry.stage_id || `STEP #${idx + 1}`}
                          </span>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {entry.stage_name || 'Stage Action Completed'}
                          </strong>
                        </div>

                        {/* SLA Badge */}
                        <div>
                          {isDelayed ? (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <AlertTriangle size={11} />
                              Delayed / TAT Breached
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#059669',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <CheckCircle2 size={11} />
                              ✓ On Time (Within SLA)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metadata Row: Action By + Date + Department */}
                      <div style={{
                        marginTop: '0.45rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        flexWrap: 'wrap',
                        fontSize: '0.76rem',
                        color: 'var(--text-secondary)'
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <User size={13} style={{ color: '#2563eb' }} />
                          Action By: <strong style={{ color: 'var(--text-primary)' }}>{entry.action_by || 'User'}</strong>
                        </span>

                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Calendar size={13} />
                          {formattedTime}
                        </span>

                        {entry.tat_hours ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={12} />
                            Target TAT: {entry.tat_hours} Hours
                          </span>
                        ) : null}
                      </div>

                      {/* Notes / Remarks */}
                      {entry.notes && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.45rem 0.65rem',
                          background: 'var(--bg-surface)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.78rem',
                          color: 'var(--text-primary)',
                          fontStyle: 'italic'
                        }}>
                          &quot;{entry.notes}&quot;
                        </div>
                      )}

                      {/* Captured Custom Fields Pills */}
                      {entry.custom_fields_data && Object.keys(entry.custom_fields_data).length > 0 && (
                        <div style={{
                          marginTop: '0.5rem',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem'
                        }}>
                          {Object.entries(entry.custom_fields_data).map(([k, v]) => {
                            if (v === null || v === undefined || v === '') return null;
                            return (
                              <span
                                key={k}
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(148, 163, 184, 0.12)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-light)'
                                }}
                              >
                                <strong style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                                  {k.replace(/_/g, ' ')}:
                                </strong>{' '}
                                {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Product Allocations (Split Lot) */}
                      {Array.isArray(entry.product_allocations) && entry.product_allocations.length > 0 && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.45rem 0.65rem',
                          background: 'rgba(37,99,235,0.06)',
                          border: '1px solid rgba(37,99,235,0.2)',
                          borderRadius: '6px',
                          fontSize: '0.74rem'
                        }}>
                          <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: '0.2rem' }}>
                            📦 Product-Wise Split Lot Breakdown:
                          </div>
                          {entry.product_allocations.map((alloc, aidx) => (
                            <div key={aidx} style={{ color: 'var(--text-primary)' }}>
                              • <strong>{alloc.product}</strong>: {alloc.ready_qty} of {alloc.ordered_qty} Ready to Dispatch
                              {alloc.remaining_qty > 0 && (
                                <span style={{ color: '#d97706', fontWeight: 600 }}> ({alloc.remaining_qty} in Assembly)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Upcoming / Pending Stages (Dashed Outline) */}
              {pendingStages.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '0.65rem'
                  }}>
                    Upcoming Stages in Pipeline:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {pendingStages.map((stg) => (
                      <div
                        key={stg.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px dashed var(--border-medium)',
                          background: 'rgba(148, 163, 184, 0.04)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.78rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(148,163,184,0.15)',
                            color: 'var(--text-secondary)'
                          }}>
                            {stg.id}
                          </span>
                          <span style={{ fontWeight: 600 }}>{stg.name}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.72rem' }}>
                          <span>Target TAT: <strong>{stg.tat_hours || 4}h</strong></span>
                          <span>Dept: {stg.department || 'Matrix'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.85rem 1.5rem',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--bg-surface)'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 1.25rem',
              background: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Close Audit View
          </button>
        </div>
      </div>
    </div>
  );
}
