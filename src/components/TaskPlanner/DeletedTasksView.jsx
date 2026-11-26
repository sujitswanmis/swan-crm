'use client';

import React, { useState, useMemo } from 'react';
import {
  Trash2, RotateCcw, AlertTriangle, Search, X, Calendar, Clock,
  User, CheckCircle2, ShieldAlert, Sparkles, Filter
} from 'lucide-react';

export default function DeletedTasksView({
  deletedTasks = [],
  loading = false,
  onRestoreTask,
  onPermanentDeleteTask,
  onRefresh
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [taskToPurge, setTaskToPurge] = useState(null);
  const [isPurging, setIsPurging] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  // Filtered deleted tasks by search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return deletedTasks;
    const q = searchQuery.toLowerCase().trim();
    return deletedTasks.filter(t => {
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const descMatch = (t.description || '').toLowerCase().includes(q);
      const reqMatch = (t.requested_by_name || '').toLowerCase().includes(q);
      const catMatch = (t.category || '').toLowerCase().includes(q);
      return titleMatch || descMatch || reqMatch || catMatch;
    });
  }, [deletedTasks, searchQuery]);

  // Handle Restore Click
  const handleRestore = async (task) => {
    setRestoringId(task.id);
    try {
      if (onRestoreTask) {
        await onRestoreTask(task.id);
      }
    } finally {
      setRestoringId(null);
    }
  };

  // Handle Permanent Delete Confirm
  const handleConfirmPurge = async () => {
    if (!taskToPurge) return;
    setIsPurging(true);
    try {
      if (onPermanentDeleteTask) {
        await onPermanentDeleteTask(taskToPurge.id);
      }
      setTaskToPurge(null);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
      {/* Top Banner & Search Bar */}
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
            background: 'var(--task-danger-bg, #fef2f2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--task-danger, #ef4444)'
          }}>
            <Trash2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Deleted Tasks & Trash Bin
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Soft-deleted tasks can be restored to your schedule anytime or permanently removed
            </div>
          </div>
        </div>

        {/* Search within trash */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          minWidth: '220px',
          maxWidth: '320px',
          flex: '1 1 auto'
        }}>
          <Search size={14} style={{
            position: 'absolute',
            left: '0.6rem',
            color: 'var(--text-secondary, #94a3b8)',
            pointerEvents: 'none'
          }} />
          <input
            type="text"
            placeholder="Search deleted tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.32rem 1.7rem 0.32rem 1.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              fontSize: '0.78rem',
              fontWeight: 500,
              color: 'var(--text-primary, #1e293b)',
              outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              style={{
                position: 'absolute',
                right: '0.4rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-secondary, #94a3b8)'
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Deleted Tasks List / Table */}
      {loading ? (
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '3rem',
          textAlign: 'center',
          color: 'var(--text-secondary, #64748b)'
        }}>
          <div>Loading trash bin items...</div>
        </div>
      ) : filteredList.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px dashed var(--border-light, #cbd5e1)',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          color: 'var(--text-secondary, #64748b)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--task-success-bg, #ecfdf5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--task-success, #10b981)',
            marginBottom: '0.25rem'
          }}>
            <Sparkles size={24} />
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Trash Bin is Clean
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '360px' }}>
            {searchQuery ? 'No deleted tasks match your search filter.' : 'You have no deleted tasks. Active tasks from any view can be safely moved here.'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem'
        }}>
          {filteredList.map((task) => {
            const isSelf = !task.requested_by_name;
            const deletedIST = task.updated_at
              ? new Date(task.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
              : '';

            return (
              <div
                key={task.id}
                style={{
                  background: 'var(--bg-surface, #ffffff)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  transition: 'background-color 0.15s ease'
                }}
              >
                {/* Left: Task Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px', flex: '1 1 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      textDecoration: 'line-through',
                      opacity: 0.85
                    }}>
                      {task.title}
                    </span>

                    {task.category && (
                      <span style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        background: 'var(--bg-subtle, #f1f5f9)',
                        color: 'var(--text-secondary)'
                      }}>
                        {task.category}
                      </span>
                    )}

                    <span style={{
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      background: isSelf ? 'var(--task-info-bg, #eff6ff)' : 'var(--task-success-bg, #ecfdf5)',
                      color: isSelf ? 'var(--task-info, #1d4ed8)' : 'var(--task-success, #047857)'
                    }}>
                      {isSelf ? '🙋 Self' : `👥 From: ${task.requested_by_name}`}
                    </span>
                  </div>

                  {task.description && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                      {task.description}
                    </div>
                  )}

                  {/* Meta: Planned Date, Time Slot, Deleted Timestamp */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    {task.planned_date && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Calendar size={12} /> Was planned: {task.planned_date}
                      </span>
                    )}
                    {task.time_slot_start && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> Slot: {task.time_slot_start} ({task.estimated_minutes || 30}m)
                      </span>
                    )}
                    {deletedIST && (
                      <span style={{ color: 'var(--task-danger, #b91c1c)' }}>
                        Deleted on: {deletedIST}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions (Restore & Permanent Delete) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  {/* Restore Button */}
                  <button
                    type="button"
                    onClick={() => handleRestore(task)}
                    disabled={restoringId === task.id}
                    title="Restore task back to planned schedule"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      border: '1px solid var(--task-success-border, #a7f3d0)',
                      background: 'var(--task-success-bg, #ecfdf5)',
                      color: 'var(--task-success, #047857)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: restoringId === task.id ? 'not-allowed' : 'pointer',
                      opacity: restoringId === task.id ? 0.6 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>{restoringId === task.id ? 'Restoring...' : 'Restore'}</span>
                  </button>

                  {/* Permanent Delete Button */}
                  <button
                    type="button"
                    onClick={() => setTaskToPurge(task)}
                    title="Permanently remove task from database"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      border: '1px solid var(--task-danger-border, #fecaca)',
                      background: 'var(--task-danger-bg, #fef2f2)',
                      color: 'var(--task-danger, #b91c1c)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete Forever</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Centered Permanent Delete Confirmation Modal */}
      {taskToPurge && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border-light, #e2e8f0)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '100%',
            maxWidth: '430px',
            padding: '1.4rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {/* Header with Danger Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'var(--task-danger-bg, #fee2e2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--task-danger, #b91c1c)',
                flexShrink: 0
              }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Permanently Delete Task?
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                  This action is permanent and cannot be undone.
                </div>
              </div>
            </div>

            {/* Task Preview Card */}
            <div style={{
              background: 'var(--bg-subtle, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #e2e8f0)',
              padding: '0.75rem 0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem'
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {taskToPurge.title}
              </div>
              {taskToPurge.description && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  {taskToPurge.description}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.55rem' }}>
              <button
                type="button"
                onClick={() => setTaskToPurge(null)}
                disabled={isPurging}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '7px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: isPurging ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmPurge}
                disabled={isPurging}
                style={{
                  padding: '0.45rem 1.15rem',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--task-danger, #b91c1c)',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: isPurging ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 4px rgba(185, 28, 28, 0.25)'
                }}
              >
                <Trash2 size={14} />
                <span>{isPurging ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
