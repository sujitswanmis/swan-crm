'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, History, Calendar, Clock, User, Send, CheckCircle2, 
  ArrowRight, ShieldCheck, AlertTriangle, FileText, Check, Tag, Zap
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { submitRecruiterChange, useRecruiterNotes } from '@/utils/recruiterLocalDb';
import { showSyncToast } from '@/utils/offlineSync';
import StandardTablePagination from '@/components/common/StandardTablePagination';

// Strict IST Formatting (Asia/Kolkata, UTC+5:30)
function formatISTDateTime(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '-';
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

// Format duration into readable hours/days
function formatDurationHours(hours) {
  if (hours <= 0) return '0h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

// Canonical Fallback Stages (Synced with Enterprise Settings / recruiter_pipeline_config.json)
const CANONICAL_STAGES = {
  S00: { id: 'S00', name: 'S00 — Requirements Received', color: '#f1f5f9', textColor: '#334155', tat_hours: 24 },
  S01: { id: 'S01', name: 'S01 — JDs Prepared & Posted', color: '#f8fafc', textColor: '#475569', tat_hours: 24 },
  S02: { id: 'S02', name: 'S02 — Resume Filtered', color: '#cbd5e1', textColor: '#334155', tat_hours: 24 },
  S03: { id: 'S03', name: 'S03 — Interview Executed', color: '#fef9c3', textColor: '#854d0e', tat_hours: 48 },
  S04: { id: 'S04', name: 'S04 — Test Results', color: '#dbeafe', textColor: '#1e40af', tat_hours: 24 },
  S05: { id: 'S05', name: 'S05 — Final Confirmation', color: '#ffedd5', textColor: '#c2410c', tat_hours: 48 },
  S06: { id: 'S06', name: 'S06 — Salary Negotiation', color: '#f5d0fe', textColor: '#86198f', tat_hours: 24 },
  S07: { id: 'S07', name: 'S07 — Shortlisted', color: '#e0e7ff', textColor: '#3730a3', tat_hours: 24 },
  S08: { id: 'S08', name: 'S08 — LOI Released', color: '#e0f2fe', textColor: '#0369a1', tat_hours: 24 },
  S09: { id: 'S09', name: 'S09 — Joined', color: '#dcfce7', textColor: '#166534', tat_hours: 48 },
  S10: { id: 'S10', name: 'S10 — Document Collection', color: '#fed7aa', textColor: '#9a3412', tat_hours: 48 },
  S11: { id: 'S11', name: 'S11 — Employee ID & Final Mapping', color: '#c7d2fe', textColor: '#312e81', tat_hours: 24 },
  S12: { id: 'S12', name: 'S12 — Employee Working Rating', color: '#fef08a', textColor: '#713f12', tat_hours: 720 }
};

export default function CandidateStageHistoryModal({
  recruiterScope,
  candidate,
  isOpen,
  onClose,
  stagesConfig = [],
  pipelineConfig = null
}) {
  const supabase = useMemo(() => createClient(), []);
  const { notes, loading } = useRecruiterNotes(recruiterScope, candidate?.id, isOpen, supabase);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination on candidate change
  useEffect(() => {
    setCurrentPage(1);
  }, [candidate?.id]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Master Stage Dictionary (Synced with Enterprise Pipeline Config)
  const stageMap = useMemo(() => {
    const map = new Map();
    // 1. Defaults
    Object.keys(CANONICAL_STAGES).forEach(k => {
      map.set(k.toUpperCase(), CANONICAL_STAGES[k]);
    });
    // 2. Override from live pipelineConfig if provided
    if (pipelineConfig?.stages && Array.isArray(pipelineConfig.stages)) {
      pipelineConfig.stages.forEach(s => {
        if (s?.id) {
          map.set(s.id.toUpperCase(), {
            id: s.id,
            name: s.name || CANONICAL_STAGES[s.id]?.name || s.id,
            color: s.color || CANONICAL_STAGES[s.id]?.color || '#cbd5e1',
            textColor: s.textColor || CANONICAL_STAGES[s.id]?.textColor || '#334155',
            tat_hours: Number(s.tat_hours) || CANONICAL_STAGES[s.id]?.tat_hours || 24,
            status_options: s.status_options || []
          });
        }
      });
    }
    return map;
  }, [pipelineConfig]);

  // Handle adding quick note directly from history modal
  const handleAddQuickNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim() || addingNote) return;

    setAddingNote(true);
    try {
      const res = await submitRecruiterChange(recruiterScope, 'note:add', {
        candidate_id: candidate.id, note_text: newNote.trim()
      }, { candidateId: candidate.id });
      if (res?.success) {
        if (res.queued) showSyncToast('Note saved offline. It will sync when you reconnect.', 'success');
        setNewNote('');
      } else {
        alert('Failed to log note: ' + (res?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error adding note: ' + err.message);
    } finally {
      setAddingNote(false);
    }
  };

  // Compile structured history entries with planned, actual & SLA calculation
  const historyEntries = useMemo(() => {
    if (!candidate) return [];

    const rawRows = [];
    const candidateCreatedIso = candidate.created_at || new Date().toISOString();
    const candidateCreatedMs = new Date(candidateCreatedIso).getTime();

    // 1. Initial Candidate Registration Row (Baseline)
    rawRows.push({
      id: 'initial_creation',
      timestamp: candidateCreatedIso,
      stageId: 'S02',
      status: 'Resume Selected',
      actionType: 'Candidate Registered',
      badgeColor: '#0369a1',
      badgeBg: '#e0f2fe',
      actor: candidate.created_by || 'Online Application',
      remarks: `Candidate registered for "${candidate.recruitment_positions?.title || 'Job Position'}".`
    });

    // 2. Parse all notes chronologically
    notes.forEach((note) => {
      const text = String(note.note_text || '').trim();
      let stageId = null;
      let status = null;
      let actionType = 'Recruiter Note';
      let badgeColor = '#475569';
      let badgeBg = '#f1f5f9';
      let cleanRemarks = text;

      // 1. Check for Admin Override
      if (text.includes('ADMIN STAGE OVERRIDE')) {
        actionType = 'Admin Override';
        badgeColor = '#b91c1c';
        badgeBg = '#fee2e2';
        const overrideMatch = text.match(/from\s+(S\d{2})\s+to\s+(S\d{2})/i);
        if (overrideMatch && overrideMatch[2]) {
          stageId = overrideMatch[2].toUpperCase();
        }
        const reasonMatch = text.match(/Mandatory Reason:\s*(.+)$/i);
        cleanRemarks = reasonMatch ? `Admin Override: ${reasonMatch[1]}` : text;
      }
      // 2. Check for Stage reverted to SXX
      else if (/Stage reverted to\s+(S\d{2})/i.test(text) || /Reverted to\s+(S\d{2})/i.test(text)) {
        actionType = 'Stage Reverted';
        badgeColor = '#b45309';
        badgeBg = '#fef3c7';
        const match = text.match(/(?:Stage reverted to|Reverted to)\s+(S\d{2})/i);
        if (match && match[1]) {
          stageId = match[1].toUpperCase();
        }
        const statusMatch = text.match(/(?:Status reset to|Status set to|Status:\s*)\s*([^,)\n]+)/i);
        if (statusMatch && statusMatch[1]) {
          status = statusMatch[1].trim();
        }
        cleanRemarks = `Reverted to stage ${stageId}${status ? ` with status "${status}"` : ''}.`;
      }
      // 3. Check for Stage advanced to SXX
      else if (/Stage advanced to\s+(S\d{2})/i.test(text) || /Advanced to\s+(S\d{2})/i.test(text)) {
        actionType = 'Stage Advanced';
        badgeColor = '#15803d';
        badgeBg = '#dcfce7';
        const match = text.match(/(?:Stage advanced to|Advanced to)\s+(S\d{2})/i);
        if (match && match[1]) {
          stageId = match[1].toUpperCase();
        }
        const statusMatch = text.match(/(?:Status reset to|Status set to|Status:\s*)\s*([^,)\n]+)/i);
        if (statusMatch && statusMatch[1]) {
          status = statusMatch[1].trim();
        }
        cleanRemarks = `Advanced to stage ${stageId}${status ? ` with status "${status}"` : ''}.`;
      }
      // 4. Check for Stage changed from SXX to SYY
      else if (/Stage changed from\s+(S\d{2})\s+to\s+(S\d{2})/i.test(text)) {
        actionType = 'Stage Advanced';
        badgeColor = '#0284c7';
        badgeBg = '#e0f2fe';
        const match = text.match(/Stage changed from\s+(S\d{2})\s+to\s+(S\d{2})/i);
        if (match && match[2]) {
          stageId = match[2].toUpperCase();
        }
        cleanRemarks = `Advanced from ${match ? match[1] : 'previous'} to ${stageId}.`;
      }
      // 5. Check for Stage changed to (S\d{2})
      else if (/Stage changed to\s+(S\d{2})/i.test(text)) {
        actionType = 'Stage Changed';
        badgeColor = '#15803d';
        badgeBg = '#dcfce7';
        const match = text.match(/Stage changed to\s+(S\d{2})/i);
        if (match && match[1]) {
          stageId = match[1].toUpperCase();
        }
        const statusMatch = text.match(/(?:Status reset to|Status set to|Status:\s*)\s*([^,)\n]+)/i);
        if (statusMatch && statusMatch[1]) {
          status = statusMatch[1].trim();
        }
        cleanRemarks = `Moved to stage ${stageId}${status ? ` with status "${status}"` : ''}.`;
      }
      // 6. Check for Resume Filtered and Registered / Application
      else if (/Resume Filtered and Registered/i.test(text) || /Candidate registered/i.test(text)) {
        actionType = 'Candidate Registered';
        stageId = 'S02';
        status = 'Resume Selected';
        badgeColor = '#6b21a8';
        badgeBg = '#f3e8ff';
        const stageMatch = text.match(/\((S\d{2})\)/i);
        if (stageMatch && stageMatch[1]) stageId = stageMatch[1].toUpperCase();
        cleanRemarks = text;
      }
      // 7. Check for Online Application details
      else if (text.includes('applied online') || text.includes('Application Reference ID')) {
        actionType = 'Online Application';
        stageId = 'S02';
        status = 'Resume Selected';
        badgeColor = '#0369a1';
        badgeBg = '#e0f2fe';
        cleanRemarks = 'Online candidate application submitted via public portal.';
      }

      // If stageId was not extracted from transition, fallback to candidate's stage
      if (!stageId) {
        stageId = candidate.current_stage || 'S02';
      }

      rawRows.push({
        id: note.id,
        timestamp: note.created_at,
        stageId,
        status: status || 'Logged',
        actionType,
        badgeColor,
        badgeBg,
        actor: note.created_by || 'System',
        remarks: cleanRemarks
      });
    });

    // 3. Sort ascending to compute accurate planned vs actual delta
    rawRows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let previousActualMs = candidateCreatedMs;
    const finalRows = rawRows.map((row, index) => {
      const actualMs = new Date(row.timestamp).getTime();
      const stageMeta = stageMap.get(row.stageId) || CANONICAL_STAGES[row.stageId] || {
        id: row.stageId,
        name: `${row.stageId} — Stage`,
        color: '#cbd5e1',
        textColor: '#334155',
        tat_hours: 24
      };

      const tatHours = stageMeta.tat_hours || 24;
      const plannedMs = previousActualMs + (tatHours * 3600 * 1000);
      const isDelayed = actualMs > plannedMs && index > 0;
      const diffHours = Math.max(0, Math.round((actualMs - plannedMs) / (1000 * 3600)));
      const timeTakenHours = Math.max(0, Math.round((actualMs - previousActualMs) / (1000 * 3600)));

      // Advance pointer for next step
      previousActualMs = actualMs;

      return {
        ...row,
        stageName: stageMeta.name,
        stageColor: stageMeta.color,
        stageTextColor: stageMeta.textColor,
        plannedStr: index === 0 ? formatISTDateTime(row.timestamp) : formatISTDateTime(new Date(plannedMs)),
        actualStr: formatISTDateTime(row.timestamp),
        tatHours,
        isDelayed,
        diffHours,
        timeTakenHours
      };
    });

    // Sort descending for display (latest activity first)
    finalRows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return finalRows;
  }, [candidate, notes, stageMap]);

  // Paginated slice for current page
  const paginatedHistoryEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return historyEntries.slice(startIndex, startIndex + pageSize);
  }, [historyEntries, currentPage, pageSize]);

  if (!isOpen || !candidate) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        style={{
          width: '96%',
          maxWidth: '1150px',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border-light, #e2e8f0)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Header */}
        <div 
          style={{
            padding: '1.1rem 1.5rem',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div 
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--accent-color, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <History size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                  {candidate.name}
                </h2>
                {candidate.candidate_code && (
                  <span style={{ 
                    fontSize: '0.72rem', 
                    fontFamily: 'monospace', 
                    padding: '0.15rem 0.45rem', 
                    borderRadius: '6px', 
                    backgroundColor: 'var(--bg-primary, #f8fafc)', 
                    border: '1px solid var(--border-light, #e2e8f0)',
                    color: 'var(--text-secondary, #64748b)',
                    fontWeight: 600
                  }}>
                    {candidate.candidate_code}
                  </span>
                )}
                {/* Current Stage Badge */}
                <span style={{
                  fontSize: '0.74rem',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '12px',
                  fontWeight: 700,
                  backgroundColor: stageMap.get(candidate.current_stage)?.color || '#dbeafe',
                  color: stageMap.get(candidate.current_stage)?.textColor || '#1e40af'
                }}>
                  Current: {stageMap.get(candidate.current_stage)?.name || candidate.current_stage}
                </span>
                {candidate.candidate_status && (
                  <span style={{
                    fontSize: '0.74rem',
                    padding: '0.15rem 0.6rem',
                    borderRadius: '12px',
                    fontWeight: 600,
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    border: '1px solid #bbf7d0'
                  }}>
                    {candidate.candidate_status}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.2rem' }}>
                Position: <strong>{candidate.recruitment_positions?.title || 'Unknown Position'}</strong>
                {candidate.recruitment_positions?.department && ` • Department: ${candidate.recruitment_positions.department}`}
                {candidate.phone && ` • 📞 ${candidate.phone}`}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Table Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Stage Progression Banner */}
          <div style={{
            padding: '0.85rem 1.15rem',
            backgroundColor: 'var(--bg-primary, #f8fafc)',
            borderRadius: '12px',
            border: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={16} style={{ color: 'var(--accent-color, #2563eb)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                Stage Progression Audit Trail (Strict IST)
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              Registration Timestamp: <strong>{formatISTDateTime(candidate.created_at)}</strong>
            </div>
          </div>

          {/* History Data Table Wrapper */}
          <div style={{
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: '12px',
            overflow: 'auto',
            maxHeight: '440px',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            position: 'relative'
          }}>
            <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-primary, #f8fafc)' }}>
                <tr style={{ backgroundColor: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light, #e2e8f0)' }}>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '45px', textAlign: 'center', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>#</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '190px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>Target Stage</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '135px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>Status in Stage</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '130px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>Action Type</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '150px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>Action By</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '160px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>⏱️ Planned Target (IST)</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '160px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>📅 Actual Logged (IST)</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', width: '125px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>⚡ SLA Status</th>
                  <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', minWidth: '220px', height: '38px', verticalAlign: 'middle', whiteSpace: 'nowrap', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>Remarks & Activity Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <span>Loading candidate history records...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedHistoryEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic' }}>
                      No stage transition or activity logs found for this candidate.
                    </td>
                  </tr>
                ) : (
                  paginatedHistoryEntries.map((entry, idx) => (
                    <tr 
                      key={entry.id || idx}
                      style={{ 
                        borderBottom: idx === paginatedHistoryEntries.length - 1 ? 'none' : '1px solid var(--border-light, #e2e8f0)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-surface, #ffffff)' : 'var(--bg-primary, #fbfcfe)',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* S.No */}
                      <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600, textAlign: 'center' }}>
                        {historyEntries.length - ((currentPage - 1) * pageSize + idx)}
                      </td>

                      {/* Target Stage Badge */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          backgroundColor: entry.stageColor || '#cbd5e1',
                          color: entry.stageTextColor || '#334155',
                          whiteSpace: 'nowrap'
                        }}>
                          {entry.stageName}
                        </span>
                      </td>

                      {/* Status in Stage */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          backgroundColor: '#fef9c3',
                          color: '#854d0e',
                          border: '1px solid #fef08a',
                          whiteSpace: 'nowrap'
                        }}>
                          {entry.status}
                        </span>
                      </td>

                      {/* Action Type */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: entry.badgeColor,
                          backgroundColor: entry.badgeBg,
                          whiteSpace: 'nowrap'
                        }}>
                          {entry.actionType}
                        </span>
                      </td>

                      {/* Action By */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top', color: 'var(--text-primary, #0f172a)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                          <User size={13} style={{ color: 'var(--text-secondary, #64748b)' }} />
                          <span>{entry.actor}</span>
                        </div>
                      </td>

                      {/* Planned Target (IST) */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--text-primary, #0f172a)' }}>
                        <div style={{ fontWeight: 600 }}>{entry.plannedStr}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>
                          SLA Target ({entry.tatHours}h)
                        </div>
                      </td>

                      {/* Actual Logged (IST) */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--text-secondary, #64748b)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                          <Clock size={13} style={{ color: 'var(--accent-color, #2563eb)' }} />
                          <span>{entry.actualStr}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)' }}>
                          Time Taken: {formatDurationHours(entry.timeTakenHours)}
                        </div>
                      </td>

                      {/* SLA / Delay Status */}
                      <td style={{ padding: '0.75rem 0.85rem', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {entry.isDelayed ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fecaca'
                          }}>
                            <Zap size={11} /> Delayed ({entry.diffHours}h)
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            border: '1px solid #bbf7d0'
                          }}>
                            ✓ On-Time
                          </span>
                        )}
                      </td>

                      {/* Remarks & Details */}
                      <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary, #0f172a)', verticalAlign: 'top', lineHeight: 1.4 }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {entry.remarks}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Standard Table Pagination */}
          {historyEntries.length > 0 && (
            <div style={{ marginTop: '-0.25rem' }}>
              <StandardTablePagination
                currentPage={currentPage}
                totalRecords={historyEntries.length}
                pageSize={pageSize}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}

          {/* Quick Note Add Section */}
          <div style={{
            padding: '1rem',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-primary, #f8fafc)',
            border: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Calendar size={14} style={{ color: 'var(--accent-color, #2563eb)' }} />
              Log Stage Interaction / Activity Note
            </label>
            <form onSubmit={handleAddQuickNote} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log a new candidate activity, stage remark, or interview note..."
                disabled={addingNote}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)'
                }}
              />
              <button
                type="submit"
                disabled={addingNote || !newNote.trim()}
                className="btn-primary"
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: addingNote || !newNote.trim() ? 'not-allowed' : 'pointer',
                  opacity: addingNote || !newNote.trim() ? 0.6 : 1
                }}
              >
                <Send size={14} />
                <span>{addingNote ? 'Saving...' : 'Add Note'}</span>
              </button>
            </form>
          </div>

        </div>

        {/* Pinned Sticky Footer */}
        <div 
          style={{
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
            Showing <strong>{historyEntries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(historyEntries.length, currentPage * pageSize)}</strong> of <strong>{historyEntries.length}</strong> total history & audit events
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #cbd5e1)',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              color: 'var(--text-primary, #0f172a)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
