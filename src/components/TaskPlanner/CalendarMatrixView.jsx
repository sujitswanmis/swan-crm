'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Plus,
  CheckCircle2, Circle, Flame, Sparkles
} from 'lucide-react';

const PRIORITY_COLORS = {
  URGENT_IMPORTANT: 'var(--task-danger)',
  IMPORTANT_NOT_URGENT: 'var(--task-info)',
  URGENT_NOT_IMPORTANT: 'var(--task-warning)',
  LOW: 'var(--text-secondary)'
};

export default function CalendarMatrixView({
  tasks = [],
  currentDate = '',
  onSelectDate,
  onAddTaskOnDate,
  onStatusChange
}) {
  const [viewType, setViewType] = useState('week'); // 'week' | 'month'

  // Parse reference date
  const baseDate = useMemo(() => {
    return currentDate ? new Date(currentDate + 'T00:00:00+05:30') : new Date();
  }, [currentDate]);

  // Compute 7 days of the current week (Monday to Sunday)
  const weekDays = useMemo(() => {
    const curr = new Date(baseDate);
    const day = curr.getDay(); // 0 is Sun, 1 is Mon
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(curr.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
      const dateNum = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      days.push({ iso, dayName, dateNum, fullDate: d });
    }
    return days;
  }, [baseDate]);

  // Map tasks by date
  const tasksByDate = useMemo(() => {
    const map = {};
    (tasks || []).forEach(t => {
      const d = t.planned_date;
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return map;
  }, [tasks]);

  return (
    <div style={{
      background: 'var(--bg-surface, #ffffff)',
      borderRadius: '12px',
      border: '1px solid var(--border-light, #e2e8f0)',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Calendar Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid var(--border-light, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        background: 'var(--bg-page, #f8fafc)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Calendar size={18} style={{ color: 'var(--task-accent)' }} />
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            Weekly Planning Matrix & Workload Overview
          </h4>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
            Showing 7 Days (Mon – Sun)
          </span>
        </div>
      </div>

      {/* 7-Day Matrix Columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))',
        overflowX: 'auto',
        minHeight: '480px'
      }}>
        {weekDays.map((day) => {
          const dayTasks = tasksByDate[day.iso] || [];
          const isSelected = day.iso === currentDate;
          const completedCount = dayTasks.filter(t => t.status === 'COMPLETED').length;
          const progress = dayTasks.length > 0 ? Math.round((completedCount / dayTasks.length) * 100) : 0;

          return (
            <div
              key={day.iso}
              style={{
                borderRight: '1px solid var(--border-light, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                background: isSelected ? 'var(--task-accent-bg)' : 'var(--bg-surface, #ffffff)',
                minWidth: '150px'
              }}
            >
              {/* Day Header */}
              <div
                onClick={() => onSelectDate(day.iso)}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderBottom: '1px solid var(--border-light, #e2e8f0)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--task-accent-bg)' : 'var(--bg-page, #f8fafc)',
                  borderTop: isSelected ? '3px solid var(--task-accent-border)' : '3px solid transparent'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>
                  {day.dayName}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: isSelected ? 'var(--task-accent)' : 'var(--text-primary, #1e293b)' }}>
                  {day.dateNum}
                </div>
                {dayTasks.length > 0 && (
                  <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                    <div style={{
                      height: '4px',
                      width: '40px',
                      background: 'var(--task-track)',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: progress === 100 ? 'var(--task-success)' : 'var(--task-accent)'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {completedCount}/{dayTasks.length}
                    </span>
                  </div>
                )}
              </div>

              {/* Tasks List within Day */}
              <div style={{
                padding: '0.5rem',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem'
              }}>
                {dayTasks.map(task => {
                  const isDone = task.status === 'COMPLETED';
                  const dotColor = PRIORITY_COLORS[task.priority] || 'var(--task-info)';

                  return (
                    <div
                      key={task.id}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        background: isDone ? 'var(--bg-subtle)' : 'var(--bg-surface, #ffffff)',
                        fontSize: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        borderLeft: `3px solid ${dotColor}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                        <span style={{
                          fontWeight: 600,
                          color: isDone ? 'var(--text-secondary)' : 'var(--text-primary, #1e293b)',
                          textDecoration: isDone ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={task.title}>
                          {task.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => onStatusChange(task.id, isDone ? 'PLANNED' : 'COMPLETED')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            color: isDone ? 'var(--task-success)' : 'var(--text-secondary)'
                          }}
                        >
                          {isDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                        </button>
                      </div>

                      {task.time_slot_start && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Clock size={10} /> {task.time_slot_start}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Quick Add Button */}
                <button
                  type="button"
                  onClick={() => onAddTaskOnDate(day.iso)}
                  style={{
                    padding: '0.35rem',
                    borderRadius: '6px',
                    border: '1px dashed var(--border-light, #cbd5e1)',
                    background: 'transparent',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.2rem',
                    marginTop: 'auto'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--task-accent)'; e.currentTarget.style.borderColor = 'var(--task-accent-border)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
