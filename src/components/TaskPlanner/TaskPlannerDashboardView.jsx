'use client';

import React, { useMemo } from 'react';
import {
  BarChart3, CheckCircle2, Clock, AlertCircle, ArrowUpRight, TrendingUp,
  Layers, UserCheck, MessageSquare, Phone, Users, Mail, Flame, Target,
  CalendarCheck, ArrowRight, Zap, RefreshCw, Sparkles, PieChart
} from 'lucide-react';

export default function TaskPlannerDashboardView({
  tasks = [],
  analytics = null,
  loading = false,
  dateLabel = '',
  onTabChange,
  onRefresh
}) {
  // Compute analytics dynamically from active tasks if analytics prop is not fully populated
  const stats = useMemo(() => {
    if (analytics && analytics.total !== undefined) {
      return analytics;
    }

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const carriedForward = tasks.filter(t => t.status === 'CARRIED_FORWARD').length;
    const planned = tasks.filter(t => t.status === 'PLANNED').length;

    const totalEstMinutes = tasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
    const totalActMinutes = tasks.reduce((sum, t) => sum + (t.actual_minutes || 0), 0);
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const inwardTasks = tasks.filter(t => t.requested_by_name && t.requested_by_name.trim() !== '').length;
    const selfTasks = total - inwardTasks;

    const channels = {
      VERBAL: tasks.filter(t => t.requested_by_channel === 'VERBAL').length,
      WHATSAPP: tasks.filter(t => t.requested_by_channel === 'WHATSAPP').length,
      MEETING: tasks.filter(t => t.requested_by_channel === 'MEETING').length,
      PHONE: tasks.filter(t => t.requested_by_channel === 'PHONE').length,
      EMAIL: tasks.filter(t => t.requested_by_channel === 'EMAIL').length,
      OTHER: tasks.filter(t => !['VERBAL', 'WHATSAPP', 'MEETING', 'PHONE', 'EMAIL'].includes(t.requested_by_channel) && t.requested_by_name).length
    };

    const priorities = {
      URGENT_IMPORTANT: tasks.filter(t => t.priority === 'URGENT_IMPORTANT').length,
      IMPORTANT_NOT_URGENT: tasks.filter(t => t.priority === 'IMPORTANT_NOT_URGENT').length,
      URGENT_NOT_IMPORTANT: tasks.filter(t => t.priority === 'URGENT_NOT_IMPORTANT').length,
      NOT_URGENT_NOT_IMPORTANT: tasks.filter(t => t.priority === 'NOT_URGENT_NOT_IMPORTANT').length
    };

    return {
      total,
      completed,
      inProgress,
      carriedForward,
      planned,
      totalEstMinutes,
      totalActMinutes,
      completionRate,
      selfTasks,
      inwardTasks,
      channels,
      priorities
    };
  }, [tasks, analytics]);

  const estHours = (stats.totalEstMinutes / 60).toFixed(1);
  const actHours = (stats.totalActMinutes / 60).toFixed(1);
  const timeDiff = (stats.totalEstMinutes - stats.totalActMinutes) / 60;

  const selfPercent = stats.total > 0 ? Math.round((stats.selfTasks / stats.total) * 100) : 0;
  const inwardPercent = stats.total > 0 ? Math.round((stats.inwardTasks / stats.total) * 100) : 0;

  // Health Score Rating
  const healthLabel = useMemo(() => {
    if (stats.completionRate >= 80) return { text: 'Outstanding Efficiency', color: 'var(--task-success, #10b981)', bg: 'var(--task-success-bg, #ecfdf5)' };
    if (stats.completionRate >= 50) return { text: 'On Track', color: 'var(--task-info, #3b82f6)', bg: 'var(--task-info-bg, #eff6ff)' };
    if (stats.total === 0) return { text: 'No Tasks Scheduled', color: 'var(--text-secondary, #94a3b8)', bg: 'var(--bg-subtle, #f1f5f9)' };
    return { text: 'Needs Execution Focus', color: 'var(--task-warning, #f59e0b)', bg: 'var(--task-warning-bg, #fffbeb)' };
  }, [stats.completionRate, stats.total]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary, #64748b)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
        <div>Compiling task planner analytics...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {/* Top Banner / Filter Info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.65rem 1rem',
        borderRadius: '10px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--task-accent-bg, #ede9fe)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--task-accent, #6366f1)'
          }}>
            <BarChart3 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Executive Task Analytics & Performance MIS
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Live metrics across time-allocation, completion velocity, work sources & channels
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            padding: '0.25rem 0.6rem',
            borderRadius: '6px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: healthLabel.bg,
            color: healthLabel.color,
            border: `1px solid ${healthLabel.color}30`
          }}>
            ● {healthLabel.text}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh Analytics"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.32rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #cbd5e1)',
                background: 'transparent',
                color: 'var(--text-secondary, #475569)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* Row 1: High Level KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.6rem'
      }}>
        {/* Total Tasks */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.85rem 1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Planned Workload</span>
            <div style={{ padding: '0.3rem', borderRadius: '6px', background: 'var(--bg-subtle, #f1f5f9)', color: 'var(--text-secondary)' }}>
              <CalendarCheck size={16} />
            </div>
          </div>
          <div style={{ marginTop: '0.4rem' }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {stats.total}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Est. Duration: <strong>{estHours} hrs</strong> ({stats.totalEstMinutes} mins)
            </div>
          </div>
        </div>

        {/* Completed Rate */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.85rem 1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--task-success, #047857)' }}>Completed Tasks</span>
            <div style={{ padding: '0.3rem', borderRadius: '6px', background: 'var(--task-success-bg, #ecfdf5)', color: 'var(--task-success, #047857)' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ marginTop: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--task-success, #047857)' }}>
                {stats.completed}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--task-success, #047857)' }}>
                ({stats.completionRate}%)
              </span>
            </div>
            <div style={{ height: '5px', background: 'var(--task-success-bg, #d1fae5)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.4rem' }}>
              <div style={{ height: '100%', width: `${stats.completionRate}%`, background: 'var(--task-success, #047857)', borderRadius: '3px' }} />
            </div>
          </div>
        </div>

        {/* In Progress */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.85rem 1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--task-warning, #d97706)' }}>In Progress</span>
            <div style={{ padding: '0.3rem', borderRadius: '6px', background: 'var(--task-warning-bg, #fffbeb)', color: 'var(--task-warning, #d97706)' }}>
              <Clock size={16} />
            </div>
          </div>
          <div style={{ marginTop: '0.4rem' }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--task-warning, #d97706)' }}>
              {stats.inProgress}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Active execution in current period
            </div>
          </div>
        </div>

        {/* Carried Forward */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.85rem 1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--task-violet, #8b5cf6)' }}>Carried Forward</span>
            <div style={{ padding: '0.3rem', borderRadius: '6px', background: 'var(--task-violet-bg, #f5f3ff)', color: 'var(--task-violet, #8b5cf6)' }}>
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div style={{ marginTop: '0.4rem' }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--task-violet, #8b5cf6)' }}>
              {stats.carriedForward}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Spillover tasks rescheduled
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Deep Dive Analytics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '0.65rem'
      }}>
        {/* Card 1: Time Estimation vs Actual Time Logged */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Clock size={16} style={{ color: 'var(--task-accent, #6366f1)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Time Estimation & Adherence
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Actual vs Estimated
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{
              padding: '0.65rem',
              borderRadius: '8px',
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Planned / Estimated</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {estHours} <span style={{ fontSize: '0.72rem', fontWeight: 400 }}>hrs</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{stats.totalEstMinutes} mins</div>
            </div>

            <div style={{
              padding: '0.65rem',
              borderRadius: '8px',
              background: 'var(--task-accent-bg, #eef2ff)',
              border: '1px solid var(--task-accent-border, #c7d2fe)'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--task-accent, #6366f1)', fontWeight: 600 }}>Actual Logged Time</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--task-accent, #6366f1)', marginTop: '0.15rem' }}>
                {actHours} <span style={{ fontSize: '0.72rem', fontWeight: 400 }}>hrs</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{stats.totalActMinutes} mins</div>
            </div>
          </div>

          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            background: 'var(--bg-subtle, #f8fafc)',
            fontSize: '0.74rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Time Variance Status:</span>
            <strong style={{
              color: timeDiff >= 0 ? 'var(--task-success, #047857)' : 'var(--task-danger, #b91c1c)'
            }}>
              {timeDiff >= 0 ? `+${timeDiff.toFixed(1)} hrs saved or pending` : `${Math.abs(timeDiff).toFixed(1)} hrs overtime`}
            </strong>
          </div>
        </div>

        {/* Card 2: Work Source Breakdown (Self vs Inward Tasks) */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Users size={16} style={{ color: 'var(--task-accent, #6366f1)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Work Source: Self vs Inward Tasks
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Origin Breakdown
            </span>
          </div>

          {/* Stacked Ratio Bar */}
          <div style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              <span style={{ color: 'var(--task-info, #1c4ea4)' }}>🙋 Self Created ({selfPercent}%)</span>
              <span style={{ color: 'var(--task-success, #12643b)' }}>👥 Inward / Assigned ({inwardPercent}%)</span>
            </div>
            <div style={{ height: '9px', display: 'flex', borderRadius: '4.5px', overflow: 'hidden', background: 'var(--bg-subtle, #e2e8f0)' }}>
              <div style={{ width: `${selfPercent}%`, background: 'var(--task-info, #3b82f6)' }} title={`Self: ${stats.selfTasks}`} />
              <div style={{ width: `${inwardPercent}%`, background: 'var(--task-success, #10b981)' }} title={`Inward: ${stats.inwardTasks}`} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              background: 'var(--task-info-bg, #eff6ff)',
              border: '1px solid var(--task-info-border, #bfdbfe)'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--task-info, #1d4ed8)', fontWeight: 600 }}>Self Planned</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--task-info, #1d4ed8)' }}>
                {stats.selfTasks} <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>tasks</span>
              </div>
            </div>

            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              background: 'var(--task-success-bg, #ecfdf5)',
              border: '1px solid var(--task-success-border, #a7f3d0)'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--task-success, #047857)', fontWeight: 600 }}>Given by Others</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--task-success, #047857)' }}>
                {stats.inwardTasks} <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>tasks</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Inward Request Channels */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <MessageSquare size={16} style={{ color: 'var(--task-accent, #6366f1)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Inward Request Channels
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              How Work Arrives
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>🗣️ Verbal</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.channels?.VERBAL || 0}
              </div>
            </div>

            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--task-success-bg, #ecfdf5)', border: '1px solid var(--task-success-border, #a7f3d0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--task-success, #047857)' }}>💬 WhatsApp</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--task-success, #047857)', marginTop: '0.1rem' }}>
                {stats.channels?.WHATSAPP || 0}
              </div>
            </div>

            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>🤝 Meeting</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.channels?.MEETING || 0}
              </div>
            </div>

            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>📞 Phone</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.channels?.PHONE || 0}
              </div>
            </div>

            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>✉️ Email</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.channels?.EMAIL || 0}
              </div>
            </div>

            <div style={{ padding: '0.45rem 0.5rem', borderRadius: '6px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border-light, #e2e8f0)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>📌 Other</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.channels?.OTHER || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Priority & Urgency Distribution */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Flame size={16} style={{ color: 'var(--task-danger, #ef4444)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Priority & Focus Matrix
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Eisenhower Quadrants
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
            {/* Urgent & Important */}
            <div style={{
              padding: '0.5rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--task-danger-bg, #fef2f2)',
              border: '1px solid var(--task-danger-border, #fecaca)'
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--task-danger, #b91c1c)', fontWeight: 700 }}>
                🔥 Urgent & Important
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--task-danger, #b91c1c)', marginTop: '0.1rem' }}>
                {stats.priorities?.URGENT_IMPORTANT || 0}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Do First</div>
            </div>

            {/* Important Not Urgent */}
            <div style={{
              padding: '0.5rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--task-info-bg, #eff6ff)',
              border: '1px solid var(--task-info-border, #bfdbfe)'
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--task-info, #1d4ed8)', fontWeight: 700 }}>
                🎯 Important, Not Urgent
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--task-info, #1d4ed8)', marginTop: '0.1rem' }}>
                {stats.priorities?.IMPORTANT_NOT_URGENT || 0}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Schedule</div>
            </div>

            {/* Urgent Not Important */}
            <div style={{
              padding: '0.5rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--task-warning-bg, #fffbeb)',
              border: '1px solid var(--task-warning-border, #fde68a)'
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--task-warning, #b45309)', fontWeight: 700 }}>
                ⚡ Urgent, Not Important
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--task-warning, #b45309)', marginTop: '0.1rem' }}>
                {stats.priorities?.URGENT_NOT_IMPORTANT || 0}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Delegate</div>
            </div>

            {/* Neither */}
            <div style={{
              padding: '0.5rem 0.65rem',
              borderRadius: '8px',
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)'
            }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #64748b)', fontWeight: 700 }}>
                💤 Low Priority
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                {stats.priorities?.NOT_URGENT_NOT_IMPORTANT || 0}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Eliminate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Quick Navigation Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Quick Action Shortcuts:
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onTabChange && onTabChange('day')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-subtle, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Clock size={13} /> Day Time-Block <ArrowRight size={12} />
          </button>

          <button
            type="button"
            onClick={() => onTabChange && onTabChange('kanban')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-subtle, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Layers size={13} /> Kanban Board <ArrowRight size={12} />
          </button>

          <button
            type="button"
            onClick={() => onTabChange && onTabChange('table')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-subtle, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <CalendarCheck size={13} /> All Tasks (Table) <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
