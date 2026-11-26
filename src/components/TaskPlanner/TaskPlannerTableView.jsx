'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock, CheckCircle2, Circle, AlertCircle, ArrowRight,
  RotateCcw, Trash2, Edit3, Flame, Search, Filter, Shield
} from 'lucide-react';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import styles from './TaskPlanner.module.css';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const DEFAULT_COL_WIDTHS = {
  status: 100,
  title: 320,
  planned_date: 130,
  time_slot: 130,
  priority: 160,
  source: 130,
  duration: 130,
  actions: 110
};

const MIN_COL_WIDTHS = {
  status: 80,
  title: 180,
  planned_date: 90,
  time_slot: 90,
  priority: 110,
  source: 80,
  duration: 90,
  actions: 80
};

const PRIORITY_BADGES = {
  URGENT_IMPORTANT: { label: '🔥 Urgent & Important', color: 'var(--task-danger)', bg: 'var(--task-danger-bg)' },
  IMPORTANT_NOT_URGENT: { label: '⭐ Important', color: 'var(--task-info)', bg: 'var(--task-info-bg)' },
  URGENT_NOT_IMPORTANT: { label: '⚡ Urgent (Delegate)', color: 'var(--task-warning)', bg: 'var(--task-warning-bg)' },
  LOW: { label: '☕ Low Priority', color: 'var(--text-secondary)', bg: 'var(--bg-subtle)' }
};

export default function TaskPlannerTableView({
  tasks = [],
  onStatusChange,
  onCarryForward,
  onEditTask,
  onDeleteTask
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const { colWidths, startResize, resetWidth } = useTableColumnResize(
    'task_planner_table_col_widths_v1',
    DEFAULT_COL_WIDTHS,
    MIN_COL_WIDTHS
  );

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const reqMatch = (t.requested_by_name || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !reqMatch) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, priorityFilter, searchQuery, pageSize]);

  // Paginate tasks
  const totalRecords = filteredTasks.length;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

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
      {/* Top Filter Bar */}
      <div style={{
        padding: '0.85rem 1.25rem',
        borderBottom: '1px solid var(--border-light, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        background: 'var(--bg-page, #f8fafc)'
      }}>
        {/* Search Input */}
        <div style={{
          position: 'relative',
          flex: '1 1 240px',
          maxWidth: '360px'
        }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search by task title, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              fontSize: '0.825rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Quick Dropdown Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              fontSize: '0.825rem'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PLANNED">Planned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CARRIED_FORWARD">Carried Forward</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              fontSize: '0.825rem'
            }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT_IMPORTANT">🔥 Urgent & Important</option>
            <option value="IMPORTANT_NOT_URGENT">⭐ Important</option>
            <option value="URGENT_NOT_IMPORTANT">⚡ Urgent (Delegate)</option>
            <option value="LOW">☕ Low Priority</option>
          </select>
        </div>
      </div>

      {/* Frozen Sticky Header Table Container */}
      <div style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 360px)',
        minHeight: '380px'
      }}>
        <table className={styles.table} style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '0.85rem'
        }}>
          <thead>
            <tr style={{
              background: 'var(--bg-surface, #f8fafc)',
              boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)'
            }}>
              {/* Status Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.status}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Status
                <ColumnResizer onMouseDown={(e) => startResize('status', e)} onDoubleClick={() => resetWidth('status')} />
              </th>

              {/* Title Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.title}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Task Details
                <ColumnResizer onMouseDown={(e) => startResize('title', e)} onDoubleClick={() => resetWidth('title')} />
              </th>

              {/* Date Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.planned_date}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Planned Date (IST)
                <ColumnResizer onMouseDown={(e) => startResize('planned_date', e)} onDoubleClick={() => resetWidth('planned_date')} />
              </th>

              {/* Time Slot Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.time_slot}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Time Slot
                <ColumnResizer onMouseDown={(e) => startResize('time_slot', e)} onDoubleClick={() => resetWidth('time_slot')} />
              </th>

              {/* Priority Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.priority}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Priority (Matrix)
                <ColumnResizer onMouseDown={(e) => startResize('priority', e)} onDoubleClick={() => resetWidth('priority')} />
              </th>

              {/* Source Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.source}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Source
                <ColumnResizer onMouseDown={(e) => startResize('source', e)} onDoubleClick={() => resetWidth('source')} />
              </th>

              {/* Duration Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.duration}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Est / Actual
                <ColumnResizer onMouseDown={(e) => startResize('duration', e)} onDoubleClick={() => resetWidth('duration')} />
              </th>

              {/* Actions Col */}
              <th style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)',
                width: `${colWidths.actions}px`,
                padding: '0.75rem 1rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)'
              }}>
                Actions
                <ColumnResizer onMouseDown={(e) => startResize('actions', e)} onDoubleClick={() => resetWidth('actions')} />
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedTasks.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  No planned tasks found matching current filters.
                </td>
              </tr>
            ) : (
              paginatedTasks.map((task) => {
                const isCompleted = task.status === 'COMPLETED';
                const badge = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.IMPORTANT_NOT_URGENT;

                return (
                  <tr
                    key={task.id}
                    data-completed={isCompleted ? true : undefined}
                    style={{
                      borderBottom: '1px solid var(--border-light, #f1f5f9)',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Status */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button
                        type="button"
                        onClick={() => onStatusChange(task.id, isCompleted ? 'PLANNED' : 'COMPLETED')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: isCompleted ? 'var(--task-success)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isCompleted ? 'var(--task-success)' : 'var(--text-secondary)' }}>
                          {task.status}
                        </span>
                      </button>
                    </td>

                    {/* Title */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{
                        fontWeight: 600,
                        color: isCompleted ? 'var(--text-secondary)' : 'var(--text-primary, #1e293b)',
                        textDecoration: isCompleted ? 'line-through' : 'none'
                      }}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary, #64748b)',
                          marginTop: '0.15rem'
                        }}>
                          {task.description}
                        </div>
                      )}
                      {task.requested_by_name && (
                        <div style={{
                          marginTop: '0.3rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'var(--task-success-bg)',
                          color: 'var(--task-success)',
                          border: '1px solid var(--task-success-border)',
                          fontSize: '0.7rem',
                          fontWeight: 600
                        }}>
                          <span>{getChannelIcon(task.requested_by_channel)}</span>
                          <span>Requested by: {task.requested_by_name}</span>
                        </div>
                      )}
                    </td>

                    {/* Planned Date */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary, #475569)' }}>
                      {task.planned_date}
                    </td>

                    {/* Time Slot */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                      {task.time_slot_start ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--task-accent)', background: 'var(--task-accent-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                          <Clock size={11} /> {task.time_slot_start}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>Anytime</span>
                      )}
                    </td>

                    {/* Priority */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: 600
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    {/* Source */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                      }}>
                        {task.source_type}
                      </span>
                    </td>

                    {/* Duration */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary, #475569)' }}>
                      {task.actual_minutes > 0 ? `${task.actual_minutes}m / ` : ''}{task.estimated_minutes}m
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => onCarryForward(task.id)}
                            title="Carry forward to tomorrow"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px', color: 'var(--task-accent)' }}
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          title="Edit Task"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px', color: 'var(--text-secondary)' }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          title="Delete Task"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px', color: 'var(--task-danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Standard Table Pagination */}
      <StandardTablePagination
        className={styles.pagination}
        totalRecords={totalRecords}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={(page) => setCurrentPage(page)}
        onPageSizeChange={(newSize) => setPageSize(newSize)}
      />
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
