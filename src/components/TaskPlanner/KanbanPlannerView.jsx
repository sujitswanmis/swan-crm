'use client';

import React from 'react';
import {
  Clock, CheckCircle2, Circle, AlertCircle, ArrowRight,
  RotateCcw, Plus, Trash2, Edit3, Flame, Check, Play
} from 'lucide-react';

const KANBAN_COLUMNS = [
  { id: 'PLANNED', label: 'Planned Today', color: 'var(--task-info)', bg: 'var(--task-info-bg)', border: 'var(--task-info-border)' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'var(--task-warning)', bg: 'var(--task-warning-bg)', border: 'var(--task-warning-border)' },
  { id: 'COMPLETED', label: 'Completed', color: 'var(--task-success)', bg: 'var(--task-success-bg)', border: 'var(--task-success-border)' },
  { id: 'CARRIED_FORWARD', label: 'Carried Forward', color: 'var(--task-violet)', bg: 'var(--task-violet-bg)', border: 'var(--task-violet-border)' }
];

const PRIORITY_BADGES = {
  URGENT_IMPORTANT: { label: 'Urgent & Important', color: 'var(--task-danger)', bg: 'var(--task-danger-bg)' },
  IMPORTANT_NOT_URGENT: { label: 'Important', color: 'var(--task-info)', bg: 'var(--task-info-bg)' },
  URGENT_NOT_IMPORTANT: { label: 'Urgent (Delegate)', color: 'var(--task-warning)', bg: 'var(--task-warning-bg)' },
  LOW: { label: 'Low', color: 'var(--text-secondary)', bg: 'var(--bg-subtle)' }
};

export default function KanbanPlannerView({
  tasks = [],
  onStatusChange,
  onCarryForward,
  onEditTask,
  onDeleteTask,
  onAddTask
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '1rem',
      alignItems: 'start'
    }}>
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter(t => t.status === col.id);

        return (
          <div
            key={col.id}
            style={{
              background: 'var(--bg-surface, #ffffff)',
              borderRadius: '12px',
              border: `1px solid ${col.border}`,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '450px'
            }}
          >
            {/* Column Header */}
            <div style={{
              padding: '0.85rem 1rem',
              background: col.bg,
              borderBottom: `1px solid ${col.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: col.color
                }} />
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: col.color }}>
                  {col.label}
                </h4>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--bg-surface, #ffffff)',
                color: col.color,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}>
                {colTasks.length}
              </span>
            </div>

            {/* Column Task Cards */}
            <div style={{
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              flex: 1
            }}>
              {colTasks.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  color: 'var(--text-secondary, #94a3b8)',
                  fontSize: '0.8rem',
                  fontStyle: 'italic'
                }}>
                  No tasks in {col.label.toLowerCase()}
                </div>
              ) : (
                colTasks.map(task => {
                  const badge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.IMPORTANT_NOT_URGENT;
                  return (
                    <div
                      key={task.id}
                      style={{
                        background: 'var(--bg-surface, #ffffff)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.4rem' }}>
                        <h5 style={{
                          margin: 0,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--text-primary, #1e293b)',
                          lineHeight: 1.3
                        }}>
                          {task.title}
                        </h5>
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

                      {task.description && (
                        <p style={{
                          margin: 0,
                          fontSize: '0.75rem',
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

                      {/* Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center', fontSize: '0.7rem' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 600
                        }}>
                          {badge.label}
                        </span>

                        {task.time_slot_start && (
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }}>
                            <Clock size={10} /> {task.time_slot_start}
                          </span>
                        )}

                        {task.carry_forward_count > 0 && (
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--task-danger-bg)',
                            color: 'var(--task-danger)',
                            fontWeight: 600
                          }}>
                            🔁 {task.carry_forward_count}x
                          </span>
                        )}

                        {task.requested_by_name && (
                          <span style={{
                            padding: '2px 6px',
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
                      </div>

                      {/* State Transition Action Bar */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '0.35rem',
                        paddingTop: '0.35rem',
                        borderTop: '1px solid var(--border-light, #f1f5f9)',
                        fontSize: '0.72rem'
                      }}>
                        {col.id === 'PLANNED' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(task.id, 'IN_PROGRESS')}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--task-warning-border)',
                              background: 'var(--task-warning-bg)',
                              color: 'var(--task-warning)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            Start Task <ArrowRight size={11} />
                          </button>
                        )}

                        {col.id === 'IN_PROGRESS' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(task.id, 'COMPLETED')}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--task-success-border)',
                              background: 'var(--task-success-bg)',
                              color: 'var(--task-success)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            Mark Done <Check size={11} />
                          </button>
                        )}

                        {col.id === 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(task.id, 'PLANNED')}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-page)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <RotateCcw size={11} /> Reopen
                          </button>
                        )}

                        {col.id !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => onCarryForward(task.id)}
                            style={{
                              padding: '0.25rem 0.45rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-light)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              marginLeft: 'auto'
                            }}
                            title="Carry forward to tomorrow"
                          >
                            Carry ➔
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Add task button in Planned column */}
              {col.id === 'PLANNED' && (
                <button
                  type="button"
                  onClick={onAddTask}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px dashed var(--border-light)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    marginTop: 'auto'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = 'var(--task-info)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <Plus size={14} /> Add Planned Task
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
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
