'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, X, Clock, MessageSquare, AlertCircle, RefreshCw, Star, ListChecks } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { acknowledgeBroadcast } from '@/app/actions/broadcastNotifications';
import NotificationPresentation from './NotificationPresentation';
import ErrorBoundary from '@/components/ErrorBoundary';
import { prioritizeNotificationQueue, requiresNotificationResponse } from '@/utils/notificationPresentation';

const timeIST = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

const SNOOZE_OPTIONS = [5, 15, 30, 45, 60];

const DEFAULT_ACTION_BUTTONS = [
  { id: 'understand', label: 'Understand', variant: 'primary' },
  { id: 'not_understand', label: 'Not Understand', variant: 'danger' }
];

const RATING_LABELS = {
  1: '😞 Poor / Kaam nahi ho raha',
  2: '😐 Below Average / Kaafi dikkat hai',
  3: '🙂 Average / Kaam chal raha hai',
  4: '😊 Good / Acha chal raha hai',
  5: '🌟 Excellent / Zabardast performance!'
};

export const NOTIFICATION_TYPES = {
  information: { id: 'information', label: 'Information', icon: 'ℹ️', color: '#2563eb', bg: '#eff6ff', desc: 'General operational announcements' },
  important: { id: 'important', label: 'Important', icon: '⚠️', color: '#d97706', bg: '#fffbeb', desc: 'Important operational notice' },
  urgent: { id: 'urgent', label: 'Urgent', icon: '⏰', color: '#ea580c', bg: '#fff7ed', desc: 'Time-sensitive announcement' },
  critical: { id: 'critical', label: 'Critical', icon: '🚨', color: '#dc2626', bg: '#fef2f2', desc: 'High-priority critical alert' },
  policy_update: { id: 'policy_update', label: 'Policy Update', icon: '📋', color: '#4f46e5', bg: '#eef2ff', desc: 'Policy compliance acknowledgement' },
  feedback_request: { id: 'feedback_request', label: 'Feedback Request', icon: '⭐', color: '#059669', bg: '#ecfdf5', desc: 'Process review & rating survey' }
};

function parseFormattedInline(text) {
  if (!text) return null;
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[') && token.includes('](')) {
      const labelMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (labelMatch) {
        parts.push(<a key={match.index} href={labelMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline' }}>{labelMatch[1]}</a>);
      } else {
        parts.push(token);
      }
    } else if (token.startsWith('http')) {
      parts.push(<a key={match.index} href={token} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline' }}>{token}</a>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length ? parts : text;
}

function renderNotificationBody(message) {
  if (!message) return null;
  const lines = String(message).split('\n');
  return (
    <div className="formatted-message-body">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, margin: '2px 0 2px 4px' }}>
              <span style={{ color: '#6366f1', fontWeight: 800 }}>•</span>
              <span style={{ flex: 1 }}>{parseFormattedInline(trimmed.substring(2))}</span>
            </div>
          );
        }
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, margin: '2px 0 2px 4px' }}>
              <span style={{ fontWeight: 700, color: '#4f46e5', minWidth: 16 }}>{numMatch[1]}.</span>
              <span style={{ flex: 1 }}>{parseFormattedInline(numMatch[2])}</span>
            </div>
          );
        }
        return (
          <p key={idx} style={{ margin: trimmed ? '3px 0' : '6px 0', minHeight: trimmed ? 'auto' : '8px', lineHeight: 1.55 }}>
            {parseFormattedInline(line)}
          </p>
        );
      })}
    </div>
  );
}

export function BroadcastNotificationCard({
  notification,
  onClose,
  onRead,
  onRemind,
  preview = false,
  workspacePreview = false,
  presentation = false
}) {
  // This presentation is opt-in for the composer simulation only.
  const isWorkspacePreview = preview && workspacePreview;
  const isPresentation = presentation || isWorkspacePreview;
  const responseRequired = requiresNotificationResponse(notification);
  const [remaining, setRemaining] = useState(notification.duration_seconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [snoozeNotice, setSnoozeNotice] = useState('');

  // Extract audience configuration
  const aud = notification.audience || {};
  const presetMode = aud.preset_mode || notification.preset_mode || 'single';
  const isButtonMode = ['single', 'announcement', 'acknowledgement', 'approval'].includes(presetMode);
  const processList = useMemo(() => {
    if (Array.isArray(aud.process_list) && aud.process_list.length > 0) return aud.process_list;
    if (Array.isArray(notification.process_list) && notification.process_list.length > 0) return notification.process_list;
    return [];
  }, [aud.process_list, notification.process_list]);

  const ratingPrompt = aud.rating_prompt || notification.rating_prompt || 'Rate your overall experience with SPC Workspace';

  // State for Process Audit Matrix
  const [processAnswers, setProcessAnswers] = useState({});

  // State for SPC Feedback Rating
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  const actionButtons = useMemo(() => {
    if (Array.isArray(aud.action_buttons) && aud.action_buttons.length > 0) {
      return aud.action_buttons;
    }
    if (Array.isArray(notification.action_buttons) && notification.action_buttons.length > 0) {
      return notification.action_buttons;
    }
    return DEFAULT_ACTION_BUTTONS;
  }, [aud.action_buttons, notification.action_buttons]);

  const allowFeedback = aud.allow_feedback !== false && notification.allow_feedback !== false;
  const allowReminder = aud.allow_reminder !== false && notification.allow_reminder !== false;

  useEffect(() => {
    if (preview || !notification.duration_seconds || feedbackOpen || showSnoozeMenu || presetMode === 'process') return;
    const interval = setInterval(() => {
      if (!document.hidden) setRemaining(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [preview, notification.duration_seconds, feedbackOpen, showSnoozeMenu, presetMode]);

  useEffect(() => {
    if (!preview && notification.duration_seconds && remaining === 0 && !busy && !feedbackOpen && !showSnoozeMenu && presetMode !== 'process') {
      const closeBehaviour = aud.close_behaviour || notification.close_behaviour || 'auto_unread';
      if (responseRequired || ['manual', 'manual_close'].includes(closeBehaviour)) return;
      if (['auto_viewed', 'auto_mark_viewed'].includes(closeBehaviour)) {
        onClose({ markViewed: true });
      } else {
        onClose({ markViewed: false });
      }
    }
  }, [preview, remaining, notification.duration_seconds, onClose, busy, feedbackOpen, showSnoozeMenu, presetMode, aud.close_behaviour, notification.close_behaviour, responseRequired]);

  async function handleActionClick(btn) {
    setError('');
    if (allowFeedback && (btn.id === 'not_understand' || btn.variant === 'danger' || btn.require_feedback)) {
      setSelectedAction(btn);
      setFeedbackOpen(true);
      return;
    }
    await submitAction(btn, '');
  }

  async function submitAction(btn, text = '') {
    if (preview) {
      setFeedbackOpen(false);
      return { success: true, preview: true };
    }
    setBusy(true);
    setError('');
    try {
      const result = await onRead({
        preset_mode: 'single',
        action_id: btn?.id || 'understand',
        action_label: btn?.label || 'Understood',
        feedback_text: text ? String(text).trim().slice(0, 500) : ''
      });
      if (result?.success === false) {
        setError('Could not save acknowledgement. Please try again.');
      }
    } catch {
      setError('Could not save acknowledgement. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleProcessStatusChange(procId, status) {
    setProcessAnswers(prev => ({
      ...prev,
      [procId]: { ...(prev[procId] || {}), status }
    }));
  }

  function handleProcessRemarkChange(procId, remark) {
    setProcessAnswers(prev => ({
      ...prev,
      [procId]: { ...(prev[procId] || {}), remark }
    }));
  }

  const completedProcessesCount = processList.filter(p => !!processAnswers[p.id]?.status).length;

  async function submitProcessAudit() {
    if (completedProcessesCount === 0) {
      setError('Kripya kam se kam ek process ka status choose karein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onRead({
        preset_mode: 'process',
        action_id: 'process_audit',
        action_label: `Audit Completed (${completedProcessesCount}/${processList.length})`,
        process_results: processAnswers,
        feedback_text: ''
      });
      if (result?.success === false) {
        setError('Could not save audit. Please try again.');
      }
    } catch {
      setError('Could not save audit. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitRating() {
    if (!selectedRating) {
      setError('Kripya 1 se 5 stars me se rating choose karein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onRead({
        preset_mode: 'spc_feedback_rating',
        action_id: `rating_${selectedRating}`,
        action_label: `${selectedRating} Star Rating`,
        rating: selectedRating,
        feedback_text: ratingComment ? String(ratingComment).trim().slice(0, 500) : ''
      });
      if (result?.success === false) {
        setError('Could not save rating. Please try again.');
      }
    } catch {
      setError('Could not save rating. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSnooze(minutes) {
    if (preview) {
      setSnoozeNotice(`${isWorkspacePreview ? '' : 'Preview: '}Reminder set for ${minutes} minutes.`);
      setTimeout(() => setSnoozeNotice(''), 3000);
      setShowSnoozeMenu(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (onRemind) {
        await onRemind(minutes);
      } else {
        onClose();
      }
    } catch {
      setError('Could not set reminder. Please try again.');
    } finally {
      setBusy(false);
      setShowSnoozeMenu(false);
    }
  }

  const colorTheme = notification.audience?.color_theme || 'indigo';
  const placementStyle = notification.audience?.placement_style || 'top_right';
  const notifType = NOTIFICATION_TYPES[notification.notification_type || aud.notification_type] || NOTIFICATION_TYPES.information;

  return (
    <section className={`broadcast-card theme-${colorTheme} placement-${placementStyle} ${presetMode === 'process' ? 'card-process-mode' : ''}`} role="status" aria-live="polite" aria-label={preview ? 'Notification preview' : 'Admin announcement'}>
      {notification.is_reminder && (
        <div className="reminder-banner">
          <Clock size={14} />
          <span>Reminder: Please test this update and submit your response/feedback</span>
        </div>
      )}

      <header>
        {isPresentation ? (
          <span className="workspace-preview-kind" style={{ color: notifType.color }}>
            {['urgent', 'critical', 'important'].includes(notifType.id) ? <AlertCircle size={16} /> : <Bell size={16} />}
            <span className="workspace-preview-priority">{notifType.label}</span>
          </span>
        ) : <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>
            {presetMode === 'process' ? <ListChecks size={16} /> : presetMode === 'spc_feedback_rating' ? <Star size={16} /> : <Bell size={16} />}
            {' '}
            {preview ? 'Preview · Announcement' : (presetMode === 'process' ? 'Process Health Audit' : presetMode === 'spc_feedback_rating' ? 'SPC Experience Rating' : 'Admin announcement')}
          </span>
          <span className="notif-type-pill" style={{ background: notifType.bg, color: notifType.color, border: `1px solid ${notifType.color}33`, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
            {notifType.icon} {notifType.label}
          </span>
        </div>}
        {(notification.duration_seconds > 0 || preview || isButtonMode) && !(isPresentation && !preview && responseRequired) && (
          <button type="button" onClick={onClose} aria-label="Close announcement without marking read" className="close-x">
            <X size={16} />
          </button>
        )}
      </header>

      <h3>{notification.title}</h3>
      <div className="message-container">
        {renderNotificationBody(notification.message)}
      </div>
      {!isPresentation && <small className="time-caption">{notification.created_at ? timeIST(notification.created_at) + ' IST' : 'Time shown in IST'}</small>}

      {error && <p role="alert" className="error-text"><AlertCircle size={14} /> {error}</p>}
      {snoozeNotice && <p role="status" className="notice-text"><Clock size={14} /> {snoozeNotice}</p>}

      {/* Preset 2: Process Health Audit Matrix */}
      {presetMode === 'process' && (
        <div className="process-matrix-box">
          <div className="process-matrix-header">
            <span className="matrix-title">Check status of processes below:</span>
            <span className="matrix-progress">{completedProcessesCount} of {processList.length} Checked</span>
          </div>
          <div className="process-items-scroll">
            {processList.map((proc, pIdx) => {
              const curAns = processAnswers[proc.id] || {};
              const isProblem = curAns.status === 'proper_not_working' || curAns.status === 'not_working';
              return (
                <div key={proc.id || pIdx} className={`process-row-card ${curAns.status ? `status-${curAns.status}` : ''}`}>
                  <div className="proc-main-line">
                    <span className="proc-num">#{pIdx + 1}</span>
                    <strong className="proc-name">{proc.name}</strong>
                  </div>
                  <div className="proc-radio-group">
                    <label className={`proc-radio-label ${curAns.status === 'working' ? 'selected green' : ''}`}>
                      <input
                        type="radio"
                        name={`proc_${proc.id}`}
                        checked={curAns.status === 'working'}
                        onChange={() => handleProcessStatusChange(proc.id, 'working')}
                      />
                      <span>🟢 Working</span>
                    </label>
                    <label className={`proc-radio-label ${curAns.status === 'proper_not_working' ? 'selected yellow' : ''}`}>
                      <input
                        type="radio"
                        name={`proc_${proc.id}`}
                        checked={curAns.status === 'proper_not_working'}
                        onChange={() => handleProcessStatusChange(proc.id, 'proper_not_working')}
                      />
                      <span>🟡 Proper not working</span>
                    </label>
                    <label className={`proc-radio-label ${curAns.status === 'not_working' ? 'selected red' : ''}`}>
                      <input
                        type="radio"
                        name={`proc_${proc.id}`}
                        checked={curAns.status === 'not_working'}
                        onChange={() => handleProcessStatusChange(proc.id, 'not_working')}
                      />
                      <span>🔴 Not working</span>
                    </label>
                  </div>
                  {isProblem && (
                    <div className="proc-remark-drawer">
                      <input
                        type="text"
                        maxLength={250}
                        placeholder="Problem ya error kya aa rahi hai? (Optional remark)"
                        value={curAns.remark || ''}
                        onChange={e => handleProcessRemarkChange(proc.id, e.target.value)}
                        className="proc-remark-input"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preset 3: SPC Feedback Rating */}
      {presetMode === 'spc_feedback_rating' && (
        <div className="rating-widget-box">
          <span className="rating-prompt-title">{ratingPrompt}</span>
          <div className="stars-row">
            {[1, 2, 3, 4, 5].map(star => {
              const isFilled = (hoverRating || selectedRating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  className={`star-btn ${isFilled ? 'filled' : ''}`}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setSelectedRating(star)}
                  title={`${star} Star`}
                >
                  ★
                </button>
              );
            })}
          </div>
          <div className="rating-active-label">
            {RATING_LABELS[hoverRating || selectedRating] || 'Stars par click karke rating chunein'}
          </div>
          {selectedRating > 0 && (
            <div className="rating-comment-box">
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Apna experience, sujhav ya feedback likhein (Optional)…"
                value={ratingComment}
                onChange={e => setRatingComment(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Feedback Drawer for Action Buttons */}
      {isButtonMode && feedbackOpen && (
        <div className="feedback-drawer">
          <label className="feedback-label">
            <MessageSquare size={14} />
            <span>
              {selectedAction?.id === 'not_understand'
                ? 'Aapko kya samajh nahi aaya? Batayein taaki admin madad kar sake:'
                : `Feedback ya query likhein (${selectedAction?.label}):`}
            </span>
          </label>
          <textarea
            rows={2}
            maxLength={500}
            autoFocus
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            placeholder="Apna doubt, problem ya sujhav yahan likhein (optional)…"
          />
          <div className="feedback-actions">
            <button
              type="button"
              className="btn-feedback-cancel"
              disabled={busy}
              onClick={() => { setFeedbackOpen(false); setFeedbackText(''); }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-feedback-skip"
              disabled={busy}
              onClick={() => submitAction(selectedAction, '')}
            >
              Skip comment
            </button>
            <button
              type="button"
              className="btn-feedback-submit"
              disabled={busy}
              onClick={() => submitAction(selectedAction, feedbackText)}
            >
              <Check size={14} /> {busy ? 'Saving…' : `Submit (${selectedAction?.label})`}
            </button>
          </div>
        </div>
      )}

      {showSnoozeMenu && (
        <div className="snooze-drawer">
          <div className="snooze-header">
            <span><Clock size={13} /> Test karke feedback dene ke liye snooze karein:</span>
            <button type="button" onClick={() => setShowSnoozeMenu(false)} className="snooze-close"><X size={13} /></button>
          </div>
          <div className="snooze-pills">
            {SNOOZE_OPTIONS.map(m => (
              <button
                key={m}
                type="button"
                className="snooze-pill-btn"
                disabled={busy}
                onClick={() => handleSnooze(m)}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      )}

      <footer>
        <div className="footer-meta">
          {!isWorkspacePreview && <small>
            {preview && notification.duration_seconds
              ? `Auto-close: ${notification.duration_seconds}s (paused in preview)`
              : notification.duration_seconds
              ? `Closes in ${remaining}s · stays in inbox`
              : (presetMode === 'process' ? 'Audit checklist' : 'Stays until response')}
          </small>}
          {allowReminder && !feedbackOpen && (
            <button
              type="button"
              className="btn-reminder-toggle"
              disabled={busy}
              onClick={() => setShowSnoozeMenu(v => !v)}
              title="Remind me later to test and give feedback"
            >
              <Clock size={13} /> Remind me later
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {isButtonMode && !feedbackOpen && (
          <div className="action-buttons-row">
            {actionButtons.map(btn => {
              const isPrimary = btn.variant === 'primary';
              const isDanger = btn.variant === 'danger';
              const isWarning = btn.variant === 'warning';
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={busy}
                  className={`btn-action btn-${btn.variant || 'secondary'}`}
                  onClick={() => handleActionClick(btn)}
                >
                  {isPrimary && <Check size={15} />}
                  {isDanger && <X size={15} />}
                  {isWarning && <AlertCircle size={15} />}
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Preset 2 Process Audit Submit */}
        {presetMode === 'process' && (
          <button
            type="button"
            className="btn-submit-process"
            disabled={busy || completedProcessesCount === 0}
            onClick={submitProcessAudit}
          >
            <Check size={16} /> {busy ? 'Saving audit…' : `Submit Process Audit (${completedProcessesCount}/${processList.length})`}
          </button>
        )}

        {/* Preset 3 Rating Submit */}
        {presetMode === 'spc_feedback_rating' && (
          <button
            type="button"
            className="btn-submit-rating"
            disabled={busy || !selectedRating}
            onClick={submitRating}
          >
            <Check size={16} /> {busy ? 'Saving rating…' : `Submit Rating (${selectedRating} ★)`}
          </button>
        )}
      </footer>

      <style jsx>{`
        .broadcast-card {
          background: var(--bg-card, #ffffff);
          color: var(--text-primary, #0f172a);
          border: 1px solid #cbd5e1;
          border-top: 4px solid #6366f1;
          border-radius: 14px;
          box-shadow: 0 16px 40px -10px rgba(15, 23, 42, 0.22);
          padding: 18px 20px;
          width: 100%;
          box-sizing: border-box;
          animation: slideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .broadcast-card.theme-indigo {
          border-top: 4px solid #6366f1;
        }
        .broadcast-card.theme-indigo header {
          color: #4f46e5;
        }
        .broadcast-card.theme-emerald {
          border-top: 4px solid #10b981;
        }
        .broadcast-card.theme-emerald header {
          color: #059669;
        }
        .broadcast-card.theme-amber {
          border-top: 4px solid #f59e0b;
        }
        .broadcast-card.theme-amber header {
          color: #d97706;
        }
        .broadcast-card.theme-rose {
          border-top: 4px solid #f43f5e;
        }
        .broadcast-card.theme-rose header {
          color: #e11d48;
        }
        .broadcast-card.placement-top_banner {
          border-top-left-radius: 0;
          border-top-right-radius: 0;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.25);
        }
        .card-process-mode {
          max-height: 85vh;
          display: flex;
          flex-direction: column;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .reminder-banner {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #fef3c7;
          color: #92400e;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 10px;
          border-radius: 8px;
          margin-bottom: 12px;
          border: 1px solid #fde68a;
        }
        header, header span {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: space-between;
        }
        header {
          font-size: 12px;
          color: #6366f1;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .close-x {
          background: transparent;
          border: 0;
          color: #64748b;
          padding: 4px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .close-x:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        h3 {
          font-size: 17px;
          font-weight: 700;
          color: var(--text-primary, #0f172a);
          margin: 12px 0 8px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }
        p {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          max-height: 38vh;
          overflow-y: auto;
          font-size: 13.5px;
          line-height: 1.55;
          margin: 0 0 10px;
          color: var(--text-secondary, #334155);
        }
        .time-caption {
          font-size: 11px;
          color: #64748b;
          display: block;
          margin-bottom: 14px;
        }
        .error-text {
          color: #dc2626;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 6px 0;
        }
        .notice-text {
          color: #059669;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 6px 0;
        }

        /* Process Audit Matrix Styling */
        .process-matrix-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
        }
        .process-matrix-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
        .matrix-title {
          font-weight: 700;
          color: #1e293b;
        }
        .matrix-progress {
          font-size: 11px;
          font-weight: 700;
          background: #e0e7ff;
          color: #4338ca;
          padding: 3px 8px;
          border-radius: 10px;
        }
        .process-items-scroll {
          max-height: 42vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 4px;
        }
        .process-row-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 9px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .status-working {
          border-left: 3px solid #10b981;
        }
        .status-proper_not_working {
          border-left: 3px solid #f59e0b;
        }
        .status-not_working {
          border-left: 3px solid #ef4444;
        }
        .proc-main-line {
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .proc-num {
          font-size: 10.5px;
          font-weight: 700;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .proc-name {
          font-size: 12.5px;
          color: #0f172a;
        }
        .proc-radio-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .proc-radio-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 8px;
          cursor: pointer;
          color: #475569;
          transition: all 0.15s ease;
        }
        .proc-radio-label input {
          width: auto;
          margin: 0;
          cursor: pointer;
        }
        .proc-radio-label:hover {
          background: #f1f5f9;
        }
        .proc-radio-label.selected.green {
          background: #ecfdf5;
          border-color: #10b981;
          color: #047857;
        }
        .proc-radio-label.selected.yellow {
          background: #fefce8;
          border-color: #f59e0b;
          color: #b45309;
        }
        .proc-radio-label.selected.red {
          background: #fef2f2;
          border-color: #ef4444;
          color: #b91c1c;
        }
        .proc-remark-drawer {
          margin-top: 4px;
        }
        .proc-remark-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #fecaca;
          background: #fffafa;
          border-radius: 6px;
          padding: 6px 9px;
          font-size: 11.5px;
          color: #0f172a;
        }
        .btn-submit-process {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          border: 0;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
          transition: all 0.15s ease;
          width: 100%;
        }
        .btn-submit-process:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* SPC Feedback Rating Widget Styling */
        .rating-widget-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }
        .rating-prompt-title {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
        }
        .stars-row {
          display: flex;
          gap: 8px;
        }
        .star-btn {
          background: transparent;
          border: 0;
          font-size: 28px;
          color: #cbd5e1;
          cursor: pointer;
          padding: 2px 4px;
          transition: all 0.15s ease;
          line-height: 1;
        }
        .star-btn:hover, .star-btn.filled {
          color: #f59e0b;
          transform: scale(1.15);
        }
        .rating-active-label {
          font-size: 12px;
          font-weight: 700;
          color: #d97706;
          min-height: 18px;
        }
        .rating-comment-box {
          width: 100%;
          margin-top: 6px;
        }
        .rating-comment-box textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12px;
          font-family: inherit;
          resize: vertical;
          color: #0f172a;
        }
        .btn-submit-rating {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff;
          border: 0;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
          transition: all 0.15s ease;
          width: 100%;
        }
        .btn-submit-rating:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Feedback Drawer for Preset 1 */
        .feedback-drawer {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px 14px;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: fadeIn 0.15s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .feedback-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #1e293b;
        }
        .feedback-drawer textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 12px;
          font-family: inherit;
          resize: vertical;
          background: #ffffff;
          color: #0f172a;
        }
        .feedback-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
        }
        .btn-feedback-cancel {
          background: transparent;
          border: 0;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 8px;
          cursor: pointer;
        }
        .btn-feedback-skip {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-feedback-submit {
          background: #10b981;
          border: 1px solid #059669;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        /* Snooze Drawer */
        .snooze-drawer {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 10px 12px;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .snooze-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          font-weight: 700;
          color: #92400e;
        }
        .snooze-close {
          background: transparent;
          border: 0;
          color: #92400e;
          cursor: pointer;
          padding: 2px;
        }
        .snooze-pills {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .snooze-pill-btn {
          flex: 1;
          min-width: 48px;
          padding: 6px 8px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 6px;
          background: #ffffff;
          color: #92400e;
          border: 1px solid #fcd34d;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .snooze-pill-btn:hover {
          background: #fef3c7;
          border-color: #f59e0b;
        }

        /* Footer */
        footer {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          border-top: 1px solid #e2e8f0;
          padding-top: 14px;
        }
        .footer-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
        }
        .btn-reminder-toggle {
          background: transparent;
          border: 0;
          color: #6366f1;
          font-size: 11px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .btn-reminder-toggle:hover {
          background: #eef2ff;
        }

        /* Action Buttons */
        .action-buttons-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .btn-action {
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }
        .btn-action:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .btn-primary {
          background: #10b981;
          color: #ffffff;
          border-color: #059669;
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
        }
        .btn-primary:hover:not(:disabled) {
          background: #059669;
          box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
        }
        .btn-danger {
          background: #fff1f2;
          color: #be123c;
          border: 1px solid #fecdd3;
        }
        .btn-danger:hover:not(:disabled) {
          background: #ffe4e6;
          border-color: #fda4af;
          color: #9f1239;
        }
        .btn-warning {
          background: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        .btn-warning:hover:not(:disabled) {
          background: #fef3c7;
          border-color: #fcd34d;
        }
        .btn-secondary {
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
        }
        .btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
          color: #0f172a;
        }
      `}</style>
    </section>
  );
}

export default function BroadcastNotificationReceiver({ userId }) {
  const [inbox, setInbox] = useState([]);
  const [current, setCurrent] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState('unread'); // 'unread' | 'all' | 'pending' | 'acknowledged'
  const [inboxError, setInboxError] = useState('');
  const refreshRef = useRef(null);
  const currentRef = useRef(null);
  const dismissedRef = useRef(new Set());

  // Snooze expiration checker
  useEffect(() => {
    if (!userId) return;
    const checkSnooze = () => {
      if (currentRef.current || !inbox.length) return;
      const now = Date.now();
      for (const item of prioritizeNotificationQueue(inbox)) {
        const bId = item.broadcast_id;
        if (Date.parse(item.crm_broadcasts?.expires_at) <= now || ['paused', 'cancelled'].includes(item.crm_broadcasts?.audience?.broadcast_status)) continue;
        try {
          const raw = localStorage.getItem(`crm_broadcast_snooze_${bId}`);
          if (raw) {
            const snoozeUntil = parseInt(raw, 10);
            if (snoozeUntil && now >= snoozeUntil) {
              localStorage.removeItem(`crm_broadcast_snooze_${bId}`);
              dismissedRef.current.delete(bId);
              const notificationData = { ...item.crm_broadcasts, is_reminder: true };
              currentRef.current = notificationData;
              setCurrent(notificationData);
              break;
            }
          }
        } catch {}
      }
    };

    const interval = setInterval(checkSnooze, 8000);
    checkSnooze();
    return () => clearInterval(interval);
  }, [userId, inbox]);

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let fetching = false;
    let rerun = false;
    let timer;
    let expiryTimer;
    let fetchController;
    let channel;
    let db;
    let lastFetch = 0;
    let backoff = 60000;
    currentRef.current = null;
    dismissedRef.current = new Set();

    async function refresh() {
      if (stopped || document.hidden || !navigator.onLine) return;
      if (fetching) { rerun = true; return; }
      clearTimeout(timer);
      if (Date.now() - lastFetch < 2000) { timer = setTimeout(refresh, 2000); return; }
      fetching = true;
      lastFetch = Date.now();
      try {
        const requestedCurrentId = currentRef.current?.id || null;
        const params = new URLSearchParams({ mode: 'inbox' });
        if (requestedCurrentId) params.set('currentId', requestedCurrentId);
        fetchController = new AbortController();
        const fetchTimeout = setTimeout(() => fetchController?.abort(), 20000);
        let result;
        try {
          const response = await fetch(`/api/broadcast-notifications?${params}`, {
            credentials: 'same-origin', cache: 'no-store', signal: fetchController.signal
          });
          if (!response.ok) { backoff = 300000; return; }
          result = await response.json();
        } finally { clearTimeout(fetchTimeout); }
        if (stopped) return;
        if (!result.success || result.userId !== userId) { backoff = 300000; return; }
        backoff = 60000;
        const rows = result.inbox || [];
        setInbox(rows);
        const received = [...new Set([...rows, ...(result.pending || [])].filter(r => !r.delivered_at).map(r => r.broadcast_id))];
        if (received.length) await acknowledgeBroadcast(received, 'delivered');
        if (stopped) return;
        const isPaused = (result.inbox || []).find(r => r.broadcast_id === currentRef.current?.id)?.crm_broadcasts?.audience?.broadcast_status === 'paused';
        if (currentRef.current && (Date.parse(currentRef.current.expires_at) <= Date.now() || isPaused ||
          (currentRef.current.id === requestedCurrentId && !result.currentUnread))) {
          currentRef.current = null;
          setCurrent(null);
        }
        if (!currentRef.current && !document.hidden) {
          const now = Date.now();
          const next = prioritizeNotificationQueue(result.pending || []).find(r => {
            if (dismissedRef.current.has(r.broadcast_id)) return false;
            if (Date.parse(r.crm_broadcasts.expires_at) <= now) return false;
            // Check if snoozed
            try {
              const rawSnooze = localStorage.getItem(`crm_broadcast_snooze_${r.broadcast_id}`);
              if (rawSnooze && now < parseInt(rawSnooze, 10)) return false;
            } catch {}
            return true;
          });
          if (next) {
            // Atomic claim across browsers/tabs: a single user sees each automatic popup once.
            const claim = await acknowledgeBroadcast([next.broadcast_id], 'shown');
            if (!stopped && claim.success && claim.updated.includes(next.broadcast_id)) {
              currentRef.current = next.crm_broadcasts;
              setCurrent(next.crm_broadcasts);
              // Record viewed status when notification is displayed on screen
              acknowledgeBroadcast([next.broadcast_id], 'viewed').catch(() => {});
              clearTimeout(expiryTimer);
              expiryTimer = setTimeout(() => {
                if (currentRef.current && Date.parse(currentRef.current.expires_at) <= Date.now()) {
                  currentRef.current = null;
                  setCurrent(null);
                }
                refresh();
              }, Math.min(2147483647, Math.max(1, Date.parse(next.crm_broadcasts.expires_at) - Date.now())));
            }
          }
        }
      } catch { backoff = 300000; }
      finally {
        fetching = false;
        if (!stopped) { timer = setTimeout(refresh, rerun ? 2000 : backoff); rerun = false; }
      }
    }
    refreshRef.current = refresh;
    const wake = () => { if (!document.hidden) refresh(); };
    timer = setTimeout(refresh, 3000);
    try {
      db = createClient();
      channel = db.channel(`crm-announcements:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_broadcast_recipients' }, (payload) => {
          if (!payload?.new?.user_id || payload.new.user_id === userId) {
            refresh();
          }
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    } catch {}
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      fetchController?.abort();
      refreshRef.current = null;
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      if (channel && db) db.removeChannel(channel).catch(() => {});
    };
  }, [userId]);

  const close = useCallback((options = {}) => {
    const notification = currentRef.current;
    if (!notification) return;
    dismissedRef.current.add(notification.id);
    currentRef.current = null;
    setCurrent(null);
    const mode = options?.markViewed ? 'viewed' : 'dismissed';
    acknowledgeBroadcast([notification.id], mode).catch(() => {}).finally(() => refreshRef.current?.());
  }, []);

  async function markRead(id, extra = {}) {
    const result = await acknowledgeBroadcast([id], 'read', extra);
    if (result.success) {
      dismissedRef.current.add(id);
      try { localStorage.removeItem(`crm_broadcast_snooze_${id}`); } catch {}
      setInbox(rows => rows.filter(r => r.broadcast_id !== id));
      if (currentRef.current?.id === id) { currentRef.current = null; setCurrent(null); }
      refreshRef.current?.();
    }
    return result;
  }

  async function remindLater(id, minutes = 15) {
    try {
      const snoozeUntil = Date.now() + minutes * 60 * 1000;
      try {
        localStorage.setItem(`crm_broadcast_snooze_${id}`, String(snoozeUntil));
      } catch {}
      await acknowledgeBroadcast([id], 'remind', { remind_minutes: minutes });
      if (currentRef.current?.id === id) {
        currentRef.current = null;
        setCurrent(null);
      }
      refreshRef.current?.();
      return { success: true, snoozed: true, minutes };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return (
    <>
      {current && <ErrorBoundary key={current.id} fallback={null}><NotificationPresentation key={current.id} notification={current} onClose={close}>
        <BroadcastNotificationCard
          key={current.id}
          notification={current}
          presentation
          onClose={close}
          onRead={(extra) => markRead(current.id, extra)}
          onRemind={(minutes) => remindLater(current.id, minutes)}
        />
      </NotificationPresentation></ErrorBoundary>}
      {inbox.length > 0 && (
        <button
          type="button"
          className="broadcast-inbox-button"
          onClick={() => { setInboxOpen(value => !value); refreshRef.current?.(); }}
        >
          <Bell size={16} /> Announcements ({inbox.length}{inbox.length === 100 ? '+' : ''})
        </button>
      )}
      {inboxOpen && (
        <aside className="broadcast-inbox" aria-label="Announcements inbox">
          <header>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Bell size={17} color="#4f46e5" />
              <strong>Company Announcements</strong>
            </div>
            <button type="button" onClick={() => setInboxOpen(false)} aria-label="Close announcements inbox">
              <X size={18} />
            </button>
          </header>
          {/* Tab Bar */}
          <div className="inbox-tab-bar">
            {[
              { id: 'unread', label: `Unread (${inbox.filter(r => !r.read_at).length})` },
              { id: 'all', label: `All (${inbox.length})` },
              { id: 'pending', label: 'Pending Response' },
              { id: 'acknowledged', label: 'Acknowledged' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`inbox-tab-pill ${inboxTab === tab.id ? 'active' : ''}`}
                onClick={() => setInboxTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <small style={{ display: 'block', margin: '8px 0', color: '#64748b' }}>
            {inboxTab === 'unread' ? 'Unread messages requiring attention. Auto-close does not mark read.' :
             inboxTab === 'pending' ? 'Announcements waiting for your response or feedback.' :
             inboxTab === 'acknowledged' ? 'Historical announcements already acknowledged by you.' :
             'All company notifications for your profile.'}
          </small>
          {inboxError && <p role="alert" style={{ color: '#ef4444', fontSize: 12 }}>{inboxError}</p>}
          {(() => {
            const displayRows = inbox.filter(row => {
              if (inboxTab === 'unread') return !row.read_at;
              if (inboxTab === 'pending') return !row.read_at;
              if (inboxTab === 'acknowledged') return !!row.read_at;
              return true;
            });
            if (!displayRows.length) {
              return (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  No announcements in {inboxTab} tab.
                </div>
              );
            }
            return displayRows.map(row => {
              const b = row.crm_broadcasts;
              const isRead = !!row.read_at;
              return (
                <article key={row.broadcast_id} className={`inbox-article ${isRead ? 'read' : 'unread'}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>{b.title}</strong>
                    {isRead ? (
                      <span style={{ fontSize: 11, background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>✓ Acknowledged</span>
                    ) : (
                      <span style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Pending</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#334155', margin: '6px 0' }}>
                    {renderNotificationBody(b.message)}
                  </div>
                  <small style={{ color: '#94a3b8' }}>{timeIST(b.created_at)} IST</small>
                  {!isRead && (
                    <div style={{ marginTop: 10 }}>
                      <BroadcastNotificationCard
                        notification={b}
                        onClose={() => {}}
                        onRead={async (extra) => {
                          try {
                            const result = await markRead(row.broadcast_id, extra);
                            setInboxError(result.success ? '' : 'Could not save acknowledgement. Try again.');
                          } catch {
                            setInboxError('Could not save acknowledgement. Try again.');
                          }
                        }}
                        onRemind={async (minutes) => {
                          await remindLater(row.broadcast_id, minutes);
                          setInboxOpen(false);
                        }}
                      />
                    </div>
                  )}
                </article>
              );
            });
          })()}
        </aside>
      )}
      <style jsx>{`
        .broadcast-popup { position:fixed;top:80px;right:18px;width:min(420px,calc(100vw - 24px));z-index:9990; }
        .broadcast-popup.popup-wide { width:min(520px,calc(100vw - 24px)); }
        .broadcast-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          z-index: 9995;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: modalFadeIn 0.2s ease-out;
        }
        .broadcast-modal-dialog {
          width: min(480px, calc(100vw - 32px));
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          animation: modalScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .broadcast-modal-dialog.popup-wide {
          width: min(580px, calc(100vw - 32px));
        }
        .broadcast-top-banner-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9998;
          display: flex;
          justify-content: center;
          padding: 8px 16px;
          animation: bannerSlideDown 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .broadcast-banner-inner {
          width: min(720px, calc(100vw - 32px));
        }
        .broadcast-banner-inner.popup-wide {
          width: min(850px, calc(100vw - 32px));
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalScaleUp {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bannerSlideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        .broadcast-inbox-button { position:fixed;bottom:16px;left:16px;z-index:9980;display:flex;align-items:center;gap:8px;background:#4338ca;color:#fff;border:0;border-radius:24px;padding:10px 16px;box-shadow:0 4px 16px #0002;cursor:pointer;font-weight:600;font-size:13px; }
        .broadcast-inbox { position:fixed;bottom:65px;left:16px;width:min(440px,calc(100vw - 32px));max-height:75vh;overflow-y:auto;background:var(--bg-card,#fff);color:var(--text-primary,#172554);padding:18px;border:1px solid #c7d2fe;border-radius:14px;box-sizing:border-box;z-index:9981;box-shadow:0 8px 30px #0002; }
        .inbox-tab-bar { display:flex;gap:5px;background:#f1f5f9;padding:4px;border-radius:8px;overflow-x:auto; }
        .inbox-tab-pill { background:transparent;border:0;padding:5px 9px;border-radius:6px;font-size:11.5px;font-weight:600;color:#64748b;cursor:pointer;white-space:nowrap;transition:all 0.15s ease; }
        .inbox-tab-pill:hover { color:#0f172a;background:rgba(255,255,255,0.6); }
        .inbox-tab-pill.active { background:#fff;color:#4f46e5;box-shadow:0 1px 3px rgba(0,0,0,0.1); }
        .inbox-article { border-top:1px solid #e2e8f0;padding-top:14px;margin-top:14px;overflow-wrap:anywhere; }
        .inbox-article.read { opacity:0.85;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;margin-top:10px; }
        header { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
        header strong { font-size:14px;color:#1e293b; }
        header button { cursor:pointer;border:0;background:transparent;color:#64748b;padding:4px;border-radius:6px; }
        header button:hover { background:#f1f5f9;color:#0f172a; }
        article { border-top:1px solid #e2e8f0;padding-top:15px;margin-top:15px;overflow-wrap:anywhere; }
        article strong { font-size:14px;color:#0f172a; }
        article p { white-space:pre-wrap;font-size:13px;line-height:1.5;margin:6px 0;color:#334155; }
        small { color:var(--text-secondary,#64748b);font-size:11px; }
        @media(max-width:600px) { .broadcast-popup { top:12px;right:12px; } }
      `}</style>
    </>
  );
}
