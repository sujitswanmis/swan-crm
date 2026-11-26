'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock, CheckCircle2, Circle, AlertCircle, Play, Square,
  RotateCcw, ArrowRight, Plus, Trash2, Edit3, Flame, Sparkles,
  ExternalLink, Calendar, CheckSquare, ShieldCheck
} from 'lucide-react';

const HOURS = [
  '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'
];

const PRIORITY_BADGES = {
  URGENT_IMPORTANT: { label: 'Urgent & Important', color: 'var(--task-danger)', bg: 'var(--task-danger-bg)' },
  IMPORTANT_NOT_URGENT: { label: 'Important', color: 'var(--task-info)', bg: 'var(--task-info-bg)' },
  URGENT_NOT_IMPORTANT: { label: 'Urgent (Delegate)', color: 'var(--task-warning)', bg: 'var(--task-warning-bg)' },
  LOW: { label: 'Low', color: 'var(--text-secondary)', bg: 'var(--bg-subtle)' }
};

export default function DayTimeBlockView({
  tasks = [],
  currentDate = '',
  onStatusChange,
  onCarryForward,
  onEditTask,
  onDeleteTask,
  onAddSlotTask,
  onUpdateActualTime
}) {
  const [activeTimerTaskId, setActiveTimerTaskId] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Active Timer Effect
  useEffect(() => {
    let interval = null;
    if (activeTimerTaskId) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else {
      setTimerSeconds(0);
    }
    return () => clearInterval(interval);
  }, [activeTimerTaskId]);

  const handleToggleTimer = async (task) => {
    if (activeTimerTaskId === task.id) {
      // Stop timer and persist
      const additionalMinutes = Math.max(1, Math.round(timerSeconds / 60));
      const newTotal = (task.actual_minutes || 0) + additionalMinutes;
      await onUpdateActualTime(task.id, newTotal);
      setActiveTimerTaskId(null);
      setTimerSeconds(0);
    } else {
      // Start timer on this task
      if (activeTimerTaskId) {
        // Stop previous task timer first
        const prevTask = tasks.find(t => t.id === activeTimerTaskId);
        if (prevTask) {
          const additionalMinutes = Math.max(1, Math.round(timerSeconds / 60));
          await onUpdateActualTime(prevTask.id, (prevTask.actual_minutes || 0) + additionalMinutes);
        }
      }
      setActiveTimerTaskId(task.id);
      setTimerSeconds(0);
    }
  };

  // Group tasks by hour slot vs unscheduled (isolated to currentDate when date range loaded)
  const scheduledMap = {};
  HOURS.forEach(h => { scheduledMap[h] = []; });
  const unscheduledTasks = [];

  const dayTasks = currentDate ? tasks.filter(t => !t.planned_date || t.planned_date === currentDate) : tasks;

  dayTasks.forEach(task => {
    const start = task.time_slot_start;
    if (start) {
      // Find matching hour (e.g. 09:30 falls into 09:00)
      const hourPrefix = start.split(':')[0] + ':00';
      if (scheduledMap[hourPrefix]) {
        scheduledMap[hourPrefix].push(task);
      } else {
        unscheduledTasks.push(task);
      }
    } else {
      unscheduledTasks.push(task);
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {/* Floating / Unscheduled Anytime Tasks Bucket */}
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '10px',
        border: '1px solid var(--border-light, #e2e8f0)',
        padding: '0.65rem 1rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.4rem',
          borderBottom: '1px solid var(--border-light, #f1f5f9)',
          paddingBottom: '0.35rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Sparkles size={16} style={{ color: 'var(--task-accent)' }} />
            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>
              Anytime Today / Floating Tasks ({unscheduledTasks.length})
            </h4>
          </div>
          <button
            type="button"
            onClick={() => onAddSlotTask('')}
            style={{
              padding: '0.28rem 0.65rem',
              borderRadius: '6px',
              border: '1px dashed var(--task-accent-border)',
              background: 'var(--task-accent-bg)',
              color: 'var(--task-accent)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <Plus size={13} /> Add Anytime Task
          </button>
        </div>

        {unscheduledTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '0.4rem 1rem', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.8rem' }}>
            No floating tasks. All tasks are time-blocked or you can schedule new ones below.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.5rem' }}>
            {unscheduledTasks.map(task => renderTaskCard(task))}
          </div>
        )}
      </div>

      {/* Hour-by-Hour Time Blocking Matrix */}
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '10px',
        border: '1px solid var(--border-light, #e2e8f0)',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        <div style={{
          padding: '0.55rem 1rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          background: 'var(--bg-page, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} style={{ color: 'var(--task-info)' }} />
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
              Hourly Schedule & Time-Blocks (IST Indian Standard Time)
            </h4>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
            Working Hours: 09:00 AM – 07:00 PM
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {HOURS.map((hour, idx) => {
            const slotTasks = scheduledMap[hour] || [];
            const displayTime = format12Hour(hour);

            return (
              <div
                key={hour}
                style={{
                  display: 'flex',
                  borderBottom: idx < HOURS.length - 1 ? '1px solid var(--border-light, #f1f5f9)' : 'none',
                  minHeight: '80px',
                  transition: 'background 0.15s ease'
                }}
              >
                {/* Time Label Column */}
                <div style={{
                  width: '120px',
                  flexShrink: 0,
                  padding: '1rem',
                  borderRight: '1px solid var(--border-light, #f1f5f9)',
                  background: 'var(--bg-page, #fafafa)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-end',
                  gap: '0.2rem'
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary, #334155)' }}>
                    {displayTime}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)' }}>
                    IST Slot
                  </span>
                </div>

                {/* Slot Content Area */}
                <div style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  alignItems: 'center',
                  background: slotTasks.length > 0 ? 'transparent' : 'var(--bg-page)'
                }}>
                  {slotTasks.map(task => renderTaskCard(task))}

                  {/* Quick Add Button inside slot */}
                  <button
                    type="button"
                    onClick={() => onAddSlotTask(hour)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px dashed var(--border-light, #cbd5e1)',
                      background: 'transparent',
                      color: 'var(--text-secondary, #64748b)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      opacity: slotTasks.length > 0 ? 0.6 : 0.85
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--task-accent-border)'; e.currentTarget.style.color = 'var(--task-accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <Plus size={13} /> {slotTasks.length > 0 ? 'Add another' : 'Block this slot'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  function renderTaskCard(task) {
    const isCompleted = task.status === 'COMPLETED';
    const isTimerActive = activeTimerTaskId === task.id;
    const badge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.IMPORTANT_NOT_URGENT;

    return (
      <div
        key={task.id}
        style={{
          background: isCompleted ? 'var(--bg-subtle)' : 'var(--bg-surface, #ffffff)',
          border: isCompleted ? '1px solid var(--border-light)' : `1px solid ${isTimerActive ? 'var(--task-accent-border)' : 'var(--border-light, #e2e8f0)'}`,
          boxShadow: isTimerActive ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : '0 1px 2px rgba(0,0,0,0.04)',
          borderRadius: '10px',
          padding: '0.85rem',
          minWidth: '280px',
          maxWidth: '420px',
          flex: '1 1 300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          opacity: isCompleted ? 0.7 : 1,
          transition: 'all 0.15s ease'
        }}
      >
        {/* Top Header: Checkbox + Title + Status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={() => onStatusChange(task.id, isCompleted ? 'PLANNED' : 'COMPLETED')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: isCompleted ? 'var(--task-success)' : 'var(--text-secondary)',
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            {isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h5 style={{
              margin: 0,
              fontSize: '0.9rem',
              fontWeight: 600,
              textDecoration: isCompleted ? 'line-through' : 'none',
              color: isCompleted ? 'var(--text-secondary)' : 'var(--text-primary, #1e293b)',
              wordBreak: 'break-word'
            }}>
              {task.title}
            </h5>
            {task.description && (
              <p style={{
                margin: '0.2rem 0 0',
                fontSize: '0.78rem',
                color: 'var(--text-secondary, #64748b)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}>
                {task.description}
              </p>
            )}
          </div>
        </div>

        {/* Badges Bar */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem', fontSize: '0.72rem' }}>
          {/* Priority Badge */}
          <span style={{
            padding: '2px 7px',
            borderRadius: '4px',
            background: badge.bg,
            color: badge.color,
            fontWeight: 600
          }}>
            {badge.label}
          </span>

          {/* Time Slot Badge */}
          {task.time_slot_start && (
            <span style={{
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'var(--task-accent-bg)',
              color: 'var(--task-accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontWeight: 500
            }}>
              <Clock size={11} /> {task.time_slot_start} - {task.time_slot_end || 'End'}
            </span>
          )}

          {/* Source Tag */}
          {task.source_type !== 'STANDALONE' && (
            <span style={{
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'var(--task-warning-bg)',
              color: 'var(--task-warning)',
              fontWeight: 500
            }}>
              {task.source_type === 'DELEGATION' ? '🎯 Delegation' : (task.source_type === 'CHECKLIST' ? '📋 Checklist' : task.source_type)}
            </span>
          )}

          {/* Requested By Badge */}
          {task.requested_by_name && (
            <span style={{
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'var(--task-success-bg)',
              color: 'var(--task-success)',
              border: '1px solid var(--task-success-border)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem'
            }}>
              <span>{getChannelIcon(task.requested_by_channel)}</span>
              <span>By: {task.requested_by_name}</span>
            </span>
          )}

          {/* Carry Forward Count Badge */}
          {task.carry_forward_count > 0 && (
            <span style={{
              padding: '2px 7px',
              borderRadius: '4px',
              background: 'var(--task-danger-bg)',
              color: 'var(--task-danger)',
              fontWeight: 600
            }}>
              🔁 Carried {task.carry_forward_count}x
            </span>
          )}
        </div>

        {/* Footer: Timer + Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '0.4rem',
          borderTop: '1px solid var(--border-light, #f1f5f9)',
          marginTop: 'auto',
          fontSize: '0.78rem'
        }}>
          {/* Timer & Actual Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => handleToggleTimer(task)}
              disabled={isCompleted}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '6px',
                border: 'none',
                background: isTimerActive ? 'var(--task-action-danger)' : 'var(--task-action)',
                color: '#ffffff',
                cursor: isCompleted ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              {isTimerActive ? <Square size={11} /> : <Play size={11} />}
              {isTimerActive ? `${Math.floor(timerSeconds / 60)}:${('0' + (timerSeconds % 60)).slice(-2)}` : 'Timer'}
            </button>
            <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.75rem' }}>
              {task.actual_minutes > 0 ? `${task.actual_minutes}m spent` : `Est ${task.estimated_minutes}m`}
            </span>
          </div>

          {/* Action Icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {/* Carry Forward Button */}
            {!isCompleted && (
              <button
                type="button"
                onClick={() => onCarryForward(task.id)}
                title="Carry forward to tomorrow"
                style={{
                  padding: '0.25rem 0.45rem',
                  borderRadius: '5px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  background: 'transparent',
                  color: 'var(--text-secondary, #475569)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  fontSize: '0.72rem'
                }}
              >
                <ArrowRight size={12} /> Carry
              </button>
            )}

            <button
              type="button"
              onClick={() => onEditTask(task)}
              title="Edit Task"
              style={{
                padding: '4px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <Edit3 size={13} />
            </button>

            <button
              type="button"
              onClick={() => onDeleteTask(task.id)}
              title="Delete Task"
              style={{
                padding: '4px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--task-danger)',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function format12Hour(hour24) {
    const [h] = hour24.split(':');
    const num = parseInt(h, 10);
    const suffix = num >= 12 ? 'PM' : 'AM';
    const displayNum = num % 12 === 0 ? 12 : num % 12;
    return `${displayNum}:00 ${suffix}`;
  }

  function getChannelIcon(channel) {
    switch (channel) {
      case 'PHONE': return '📞';
      case 'WHATSAPP': return '💬';
      case 'MEETING': return '🤝';
      case 'EMAIL': return '📧';
      case 'VERBAL':
      default: return '🗣️';
    }
  }
}
