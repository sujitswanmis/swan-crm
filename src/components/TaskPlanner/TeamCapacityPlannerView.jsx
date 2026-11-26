'use client';

import React, { useState } from 'react';
import {
  Users, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Plus, Shield, User, Sparkles
} from 'lucide-react';

export default function TeamCapacityPlannerView({
  teamCapacity = [],
  selectedDate = '',
  loading = false,
  onAssignTaskToMember
}) {
  const [expandedEmails, setExpandedEmails] = useState(new Set());

  const toggleExpand = (email) => {
    setExpandedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #64748b)' }}>
        Loading team capacity radar...
      </div>
    );
  }

  if (teamCapacity.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #e2e8f0)',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: 'var(--text-secondary, #64748b)'
      }}>
        <Users size={36} style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }} />
        <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 600 }}>No Team Planner Activity on {selectedDate}</h4>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>
          Team members have not yet scheduled tasks for this date, or no reporting members found.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Summary */}
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #e2e8f0)',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Users size={20} style={{ color: 'var(--task-accent)' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Team Workload & Bandwidth Radar ({selectedDate})
            </h4>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              Standard 8-Hour Workday Capacity Analysis per Employee
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--task-info)' }} />
            <span>Light (&lt;4h)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--task-success)' }} />
            <span>Balanced (4–8h)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--task-danger)' }} />
            <span>Overloaded (&gt;8h)</span>
          </div>
        </div>
      </div>

      {/* Team Member Cards Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {teamCapacity.map((member) => {
          const isExpanded = expandedEmails.has(member.employee_email);
          const estHours = member.estimated_hours || 0;
          const pctOf8Hours = Math.min(100, Math.round((estHours / 8) * 100));

          let statusColor = 'var(--task-success)';
          let statusBg = 'var(--task-success-bg)';
          let statusLabel = 'Balanced Capacity';
          if (member.workload_status === 'OVERLOADED') {
            statusColor = 'var(--task-danger)';
            statusBg = 'var(--task-danger-bg)';
            statusLabel = '⚠️ Overloaded (>8 hrs)';
          } else if (member.workload_status === 'LIGHT') {
            statusColor = 'var(--task-info)';
            statusBg = 'var(--task-info-bg)';
            statusLabel = 'Available Bandwidth (<4 hrs)';
          }

          return (
            <div
              key={member.employee_email}
              style={{
                background: 'var(--bg-surface, #ffffff)',
                borderRadius: '10px',
                border: '1px solid var(--border-light, #e2e8f0)',
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              {/* Member Summary Row */}
              <div
                style={{
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--bg-subtle)' : 'transparent'
                }}
                onClick={() => toggleExpand(member.employee_email)}
              >
                {/* Left: Avatar + Name + Department */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--task-accent-bg)',
                    color: 'var(--task-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.95rem'
                  }}>
                    {member.employee_name ? member.employee_name.charAt(0).toUpperCase() : 'E'}
                  </div>
                  <div>
                    <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                      {member.employee_name}
                    </h5>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                      {member.department || 'Operations'} • {member.employee_email}
                    </p>
                  </div>
                </div>

                {/* Middle: Workload Capacity Bar */}
                <div style={{ flex: '1 1 200px', maxWidth: '300px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>{estHours} hrs planned</span>
                    <span style={{ color: 'var(--text-secondary, #64748b)' }}>{pctOf8Hours}% of 8h day</span>
                  </div>
                  <div style={{ height: '7px', background: 'var(--task-track)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pctOf8Hours}%`,
                      background: statusColor,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* Right: Status Badge + Task Count + Chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: '12px',
                    background: statusBg,
                    color: statusColor
                  }}>
                    {statusLabel}
                  </span>

                  <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                      {member.completed_tasks}/{member.total_tasks} Done
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>
                      {member.completion_rate}% Achieved
                    </div>
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                </div>
              </div>

              {/* Expanded Tasks List */}
              {isExpanded && (
                <div style={{
                  padding: '1rem 1.25rem',
                  borderTop: '1px solid var(--border-light, #f1f5f9)',
                  background: 'var(--bg-page, #fafafa)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>
                      Scheduled Tasks for {member.employee_name} ({member.tasks.length}):
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignTaskToMember(member);
                      }}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid var(--task-accent-border)',
                        background: 'var(--task-action)',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Plus size={13} /> Assign Task
                    </button>
                  </div>

                  {member.tasks.map(t => (
                    <div
                      key={t.id}
                      style={{
                        padding: '0.6rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        background: 'var(--bg-surface, #ffffff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: t.status === 'COMPLETED' ? 'var(--task-success)' : 'var(--task-warning)'
                        }} />
                        <span style={{ fontWeight: 500, color: t.status === 'COMPLETED' ? 'var(--text-secondary)' : 'var(--text-primary, #1e293b)' }}>
                          {t.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                        {t.time_slot_start && <span>{t.time_slot_start}</span>}
                        <span>{t.estimated_minutes}m</span>
                        <span style={{ fontWeight: 600, color: t.status === 'COMPLETED' ? 'var(--task-success)' : 'var(--task-info)' }}>
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
