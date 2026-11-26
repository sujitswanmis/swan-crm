'use client';

import React from 'react';
import {
  Flame, Calendar, Users, Sparkles, CheckCircle2, Circle,
  Plus, Edit3, Trash2, Clock
} from 'lucide-react';

const QUADRANTS = [
  {
    id: 'URGENT_IMPORTANT',
    title: 'Q1: Do First (Urgent & Important)',
    subtitle: 'Crises, critical deadlines, pressing customer issues',
    color: 'var(--task-danger)',
    bg: 'var(--task-danger-bg)',
    border: 'var(--task-danger-border)',
    badge: '🔥 Do First'
  },
  {
    id: 'IMPORTANT_NOT_URGENT',
    title: 'Q2: Schedule (Important, Not Urgent)',
    subtitle: 'Strategic planning, deep work, system improvements',
    color: 'var(--task-info)',
    bg: 'var(--task-info-bg)',
    border: 'var(--task-info-border)',
    badge: '⭐ Schedule'
  },
  {
    id: 'URGENT_NOT_IMPORTANT',
    title: 'Q3: Delegate (Urgent, Not Important)',
    subtitle: 'Interruptions, immediate requests, routine handoffs',
    color: 'var(--task-warning)',
    bg: 'var(--task-warning-bg)',
    border: 'var(--task-warning-border)',
    badge: '⚡ Delegate'
  },
  {
    id: 'LOW',
    title: 'Q4: Eliminate / Low (Neither)',
    subtitle: 'Time wasters, non-essential items, backlog ideas',
    color: 'var(--text-secondary)',
    bg: 'var(--bg-page)',
    border: 'var(--border-light)',
    badge: '☕ Low Priority'
  }
];

export default function EisenhowerMatrixView({
  tasks = [],
  onStatusChange,
  onEditTask,
  onDeleteTask,
  onAddTaskInQuadrant
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '1.25rem'
    }}>
      {QUADRANTS.map((quad) => {
        const quadTasks = tasks.filter(t => t.priority === quad.id);

        return (
          <div
            key={quad.id}
            style={{
              background: 'var(--bg-surface, #ffffff)',
              borderRadius: '12px',
              border: `1px solid ${quad.border}`,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '380px'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '0.85rem 1rem',
              background: quad.bg,
              borderBottom: `1px solid ${quad.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: quad.color }}>
                  {quad.title}
                </h4>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                  {quad.subtitle}
                </p>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--bg-surface, #ffffff)',
                color: quad.color,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}>
                {quadTasks.length}
              </span>
            </div>

            {/* Tasks in Quadrant */}
            <div style={{
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              flex: 1
            }}>
              {quadTasks.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '2.5rem 1rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  fontSize: '0.8rem',
                  fontStyle: 'italic'
                }}>
                  No tasks in this quadrant
                </div>
              ) : (
                quadTasks.map(task => {
                  const isDone = task.status === 'COMPLETED';

                  return (
                    <div
                      key={task.id}
                      style={{
                        background: isDone ? 'var(--bg-subtle)' : 'var(--bg-surface, #ffffff)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        padding: '0.7rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        opacity: isDone ? 0.65 : 1
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => onStatusChange(task.id, isDone ? 'PLANNED' : 'COMPLETED')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            color: isDone ? 'var(--task-success)' : 'var(--text-secondary)',
                            marginTop: '2px'
                          }}
                        >
                          {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: isDone ? 'var(--text-secondary)' : 'var(--text-primary, #1e293b)',
                            textDecoration: isDone ? 'line-through' : 'none'
                          }}>
                            {task.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)' }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--task-danger)' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {task.time_slot_start && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '1.4rem' }}>
                          <Clock size={11} /> {task.time_slot_start} {task.time_slot_end ? `- ${task.time_slot_end}` : ''}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Add Task in Quadrant button */}
              <button
                type="button"
                onClick={() => onAddTaskInQuadrant(quad.id)}
                style={{
                  padding: '0.45rem',
                  borderRadius: '6px',
                  border: '1px dashed var(--border-light, #cbd5e1)',
                  background: 'transparent',
                  color: 'var(--text-secondary, #64748b)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.3rem',
                  marginTop: 'auto'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = quad.color; e.currentTarget.style.color = quad.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <Plus size={13} /> Add to {quad.badge}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
