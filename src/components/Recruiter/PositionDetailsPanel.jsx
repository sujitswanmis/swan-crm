'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Briefcase, Building2, MapPin, Users, DollarSign, Calendar, 
  Clock, Share2, Check, ExternalLink, UserPlus, Edit3, ShieldAlert, 
  ChevronRight, AlertCircle, FileText, CheckCircle2, User, Phone, Mail, Award
} from 'lucide-react';
import { formatBranchStandard } from '@/utils/branchAccess';

export default function PositionDetailsPanel({
  position,
  isOpen,
  onClose,
  onPositionUpdate,
  candidates = [],
  onSelectCandidate,
  userName = '',
  canEdit = true,
  onAddCandidateForPosition,
  onOpenEditPosition,
  onClaimPosition,
  onReleasePosition,
  branches = []
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'applicants' | 'jd'
  const [releaseReason, setReleaseReason] = useState('');
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Linked candidates for this specific position
  const positionCandidates = useMemo(() => {
    if (!position?.id || !Array.isArray(candidates)) return [];
    return candidates.filter(c => c.position_id === position.id);
  }, [position?.id, candidates]);

  // Stage distribution stats
  const stageStats = useMemo(() => {
    const counts = {
      total: positionCandidates.length,
      screening: 0,
      interview: 0,
      test: 0,
      approval: 0,
      offer: 0,
      joined: 0,
      rejected: 0
    };

    positionCandidates.forEach(c => {
      const stage = c.current_stage || 'S02';
      const status = (c.candidate_status || '').toLowerCase();
      if (status.includes('reject') || status.includes('drop') || status.includes('fail') || status.includes('decline')) {
        counts.rejected++;
      } else if (stage === 'S02') {
        counts.screening++;
      } else if (stage === 'S03') {
        counts.interview++;
      } else if (stage === 'S04') {
        counts.test++;
      } else if (stage === 'S05' || stage === 'S07') {
        counts.approval++;
      } else if (stage === 'S06' || stage === 'S08') {
        counts.offer++;
      } else if (stage === 'S09') {
        counts.joined++;
      }
    });

    return counts;
  }, [positionCandidates]);

  if (!isOpen || !position) return null;

  // Handle Public Apply Link Copy
  const handleCopyApplyLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/apply/${position.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  // Branch display
  const standardBranch = formatBranchStandard(position.branch_code || position.workspace_branch_code, branches);
  const branchParts = standardBranch ? standardBranch.split(' — ') : [];
  const branchCode = branchParts[0] || position.branch_code || 'N/A';
  const branchName = branchParts[1] || branchCode;

  // Recruiter Claim / Release logic
  const isAssigned = position.recruiter_assigned && position.recruiter_assigned !== 'All';
  const isAssignedToCurrentUser = isAssigned && (
    position.recruiter_assigned.toLowerCase().trim() === (userName || '').toLowerCase().trim()
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.4)', 
          zIndex: 999,
          backdropFilter: 'blur(2px)'
        }} 
        onClick={onClose} 
      />

      {/* Slide Drawer */}
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, 
          right: 0, 
          bottom: 0, 
          width: '560px', 
          maxWidth: '92vw',
          backgroundColor: 'var(--bg-surface)', 
          zIndex: 1000, 
          boxShadow: '-6px 0 25px rgba(0,0,0,0.2)', 
          display: 'flex', 
          flexDirection: 'column',
          borderTopLeftRadius: '16px',
          borderBottomLeftRadius: '16px',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <span style={{ 
                  fontSize: '0.68rem', fontFamily: 'monospace', fontWeight: 700,
                  padding: '0.15rem 0.45rem', borderRadius: '4px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)'
                }}>
                  {position.id ? `POS-${position.id.substring(0, 8).toUpperCase()}` : 'JOB POSITION'}
                </span>
                <span style={{ 
                  fontSize: '0.7rem', padding: '0.15rem 0.55rem', borderRadius: '12px', fontWeight: 700,
                  background: position.status === 'S00' ? '#fee2e2' : '#dcfce7',
                  color: position.status === 'S00' ? '#991b1b' : '#166534'
                }}>
                  {position.status === 'S00' ? 'S00: Requirements Received' : 'S01: JDs Prepared & Posted'}
                </span>
                {position.urgency && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {position.urgency}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                {position.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Building2 size={13} /> {position.department}
                </span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} title={standardBranch}>
                  <MapPin size={13} /> {branchName}
                </span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Users size={13} /> <strong>{position.openings || 1}</strong> Openings
                </span>
              </div>
            </div>

            <button 
              onClick={onClose} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-secondary)', borderRadius: '6px' }}
              title="Close Drawer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Action Pills in Header */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleCopyApplyLink}
              style={{
                fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                border: '1px solid var(--accent-color)',
                background: copiedLink ? '#10b981' : 'var(--accent-color)',
                color: 'white', fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                transition: 'all 0.2s'
              }}
            >
              {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
              {copiedLink ? 'Link Copied! ✓' : 'Share Apply Link'}
            </button>

            <a
              href={`/apply/${position.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
              }}
            >
              <ExternalLink size={14} /> View Form ↗
            </a>

            {onAddCandidateForPosition && (
              <button
                onClick={() => { onClose(); onAddCandidateForPosition(position); }}
                style={{
                  fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                  border: '1px solid #10b981', background: '#ecfdf5',
                  color: '#065f46', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
                }}
              >
                <UserPlus size={14} /> + Add Candidate
              </button>
            )}

            {canEdit && onOpenEditPosition && (
              <button
                onClick={() => { onClose(); onOpenEditPosition(position); }}
                style={{
                  fontSize: '0.75rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                  border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
                }}
              >
                <Edit3 size={14} /> Edit Position
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                background: 'none', border: 'none', padding: '0.5rem 0.25rem',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                color: activeTab === 'overview' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'overview' ? '2px solid var(--accent-color)' : '2px solid transparent'
              }}
            >
              Overview & Specs
            </button>
            <button
              onClick={() => setActiveTab('applicants')}
              style={{
                background: 'none', border: 'none', padding: '0.5rem 0.25rem',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                color: activeTab === 'applicants' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'applicants' ? '2px solid var(--accent-color)' : '2px solid transparent',
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem'
              }}
            >
              Applicants ({positionCandidates.length})
            </button>
            <button
              onClick={() => setActiveTab('jd')}
              style={{
                background: 'none', border: 'none', padding: '0.5rem 0.25rem',
                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                color: activeTab === 'jd' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'jd' ? '2px solid var(--accent-color)' : '2px solid transparent'
              }}
            >
              Job Description (JD)
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* TAB 1: OVERVIEW & SPECS */}
          {activeTab === 'overview' && (
            <>
              {/* Recruiter & Ownership Card */}
              <div className="card" style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>ASSIGNED RECRUITER</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {isAssigned ? (
                        <>👤 {position.recruiter_assigned}</>
                      ) : (
                        <span style={{ color: '#854d0e', background: '#fef9c3', padding: '0.15rem 0.5rem', borderRadius: '8px', fontSize: '0.78rem' }}>
                          📢 Open Pool (All Recruiters)
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {!isAssigned && onClaimPosition && (
                      <button
                        onClick={() => onClaimPosition(position.id)}
                        disabled={!canEdit}
                        style={{
                          fontSize: '0.75rem', padding: '0.4rem 0.85rem', borderRadius: '6px',
                          border: '1px solid #10b981', background: '#10b981', color: 'white',
                          fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        🙋 Claim Position
                      </button>
                    )}

                    {isAssigned && onReleasePosition && (
                      <button
                        onClick={() => setShowReleaseModal(true)}
                        disabled={!canEdit}
                        style={{
                          fontSize: '0.75rem', padding: '0.4rem 0.85rem', borderRadius: '6px',
                          border: '1px solid #f97316', background: '#fff7ed', color: '#c2410c',
                          fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        🔓 Release to Pool
                      </button>
                    )}
                  </div>
                </div>

                {position.interviewer_name && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    🗣️ Designated Interviewer: <strong style={{ color: 'var(--text-primary)' }}>{position.interviewer_name}</strong>
                  </div>
                )}
              </div>

              {/* Applicants Funnel Snapshot */}
              <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    📊 Candidate Funnel Snapshot
                  </h3>
                  <button
                    onClick={() => setActiveTab('applicants')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    View All ({positionCandidates.length}) <ChevronRight size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div style={{ background: 'var(--bg-primary)', padding: '0.6rem 0.4rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stageStats.total}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Total Applied</div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: '0.6rem 0.4rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1d4ed8' }}>{stageStats.screening}</div>
                    <div style={{ fontSize: '0.68rem', color: '#1e40af' }}>Screening (S02)</div>
                  </div>
                  <div style={{ background: '#fefce8', padding: '0.6rem 0.4rem', borderRadius: '8px', border: '1px solid #fef08a' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#a16207' }}>{stageStats.interview}</div>
                    <div style={{ fontSize: '0.68rem', color: '#854d0e' }}>Interview (S03)</div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '0.6rem 0.4rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d' }}>{stageStats.joined}</div>
                    <div style={{ fontSize: '0.68rem', color: '#166534' }}>Joined (S09)</div>
                  </div>
                </div>
              </div>

              {/* Key Position Specifications */}
              <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 0.85rem 0', color: 'var(--text-primary)' }}>
                  📋 Position Specifications
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', fontSize: '0.8rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Salary Budget (Monthly)</div>
                    <div style={{ fontWeight: 700, color: '#166534', marginTop: '0.15rem' }}>
                      {position.salary_min || position.salary_max ? (
                        `₹${(position.salary_min || 0).toLocaleString('en-IN')} - ₹${(position.salary_max || 0).toLocaleString('en-IN')}`
                      ) : (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Not Disclosed</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Target Closure Deadline</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {position.deadline_date ? new Date(position.deadline_date).toLocaleDateString('en-IN') : 'None'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Experience Required</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {position.experience_required || 'Any Experience'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Minimum Qualification</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {position.min_qualification || 'Any / Uneducated'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Job & Shift Type</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {position.job_type || 'Full Time'} • {position.shift_type || 'General Shift'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Work Mode & Plant</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                      {position.work_mode || 'On-Site'}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Posting Status</div>
                    <div style={{ fontWeight: 700, marginTop: '0.15rem' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.74rem', fontWeight: 700,
                        backgroundColor: (position.posting_status === 'Posted' && stageStats.joined < (position.openings || 1)) ? '#dcfce7' : (position.posting_status === 'Closed' || stageStats.joined >= (position.openings || 1)) ? '#fee2e2' : (position.posting_status === 'Paused') ? '#ffedd5' : '#fef9c3',
                        color: (position.posting_status === 'Posted' && stageStats.joined < (position.openings || 1)) ? '#166534' : (position.posting_status === 'Closed' || stageStats.joined >= (position.openings || 1)) ? '#991b1b' : (position.posting_status === 'Paused') ? '#9a3412' : '#854d0e',
                        border: '1px solid currentColor'
                      }}>
                        {(stageStats.joined >= (position.openings || 1) && position.posting_status !== 'Closed')
                          ? `🔴 Closed (${stageStats.joined}/${position.openings || 1} Filled)`
                          : position.posting_status === 'Posted'
                          ? '🟢 Posted'
                          : position.posting_status === 'Paused'
                          ? '🟠 Paused'
                          : position.posting_status === 'Closed'
                          ? `🔴 Closed (${stageStats.joined}/${position.openings || 1} Filled)`
                          : '🟡 Draft'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Posting Channels ({position.posting_sources?.length || 0})</div>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                      {position.posting_sources && position.posting_sources.length > 0 ? (
                        position.posting_sources.map((src, i) => (
                          <span key={i} style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>
                            {src}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None tagged</span>
                      )}
                    </div>
                  </div>
                </div>

                {position.key_skills && (
                  <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginBottom: '0.35rem' }}>KEY SKILLS REQUIRED</div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {position.key_skills.split(',').map((skill, idx) => (
                        <span key={idx} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                          {skill.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: APPLICANTS LIST */}
          {activeTab === 'applicants' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Total {positionCandidates.length} Candidates Applied
                </div>
                {onAddCandidateForPosition && (
                  <button
                    onClick={() => { onClose(); onAddCandidateForPosition(position); }}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '6px', background: 'var(--accent-color)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Candidate
                  </button>
                )}
              </div>

              {positionCandidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <User size={32} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>No candidates applied yet.</p>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>Share the Public Apply Link or add a candidate manually.</p>
                </div>
              ) : (
                positionCandidates.map(cand => (
                  <div 
                    key={cand.id}
                    style={{
                      padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{cand.name}</span>
                        {cand.candidate_code && (
                          <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            {cand.candidate_code}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        {cand.phone && <span>📞 {cand.phone}</span>}
                        {cand.expected_salary_min || cand.expected_salary_max ? (
                          <span>💵 ₹{(cand.expected_salary_min || cand.expected_salary_max).toLocaleString('en-IN')}</span>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ 
                        fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 700,
                        background: '#dbeafe', color: '#1e40af'
                      }}>
                        {cand.current_stage || 'S02'}
                      </span>
                      {onSelectCandidate && (
                        <button
                          onClick={() => { onClose(); onSelectCandidate(cand); }}
                          style={{
                            fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: '6px',
                            border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
                            cursor: 'pointer', fontWeight: 600, color: 'var(--accent-color)'
                          }}
                        >
                          View 📝
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: JOB DESCRIPTION */}
          {activeTab === 'jd' && (
            <div className="card" style={{ padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  📄 Full Job Description
                </h3>
                {canEdit && onOpenEditPosition && (
                  <button
                    onClick={() => { onClose(); onOpenEditPosition(position); }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✏️ Edit JD
                  </button>
                )}
              </div>

              {position.jd_text ? (
                <div style={{ 
                  whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)'
                }}>
                  {position.jd_text}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#c2410c', background: '#fff7ed', borderRadius: '8px', fontSize: '0.85rem' }}>
                  ⚠️ No Job Description logged yet. Please edit the position to add JD text.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Created by: <strong>{position.created_by || 'System'}</strong> • {new Date(position.created_at || Date.now()).toLocaleDateString('en-IN')}
          </span>
          <button 
            onClick={onClose} 
            style={{ 
              padding: '0.45rem 1.15rem', borderRadius: '6px', border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Modal: Release Position to Open Pool */}
      {showReleaseModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '440px', maxWidth: '95vw', padding: '1.5rem', borderRadius: '12px', background: 'var(--bg-surface)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={18} /> Release Position to Open Pool?
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
              Are you sure you want to release <strong>"{position.title}"</strong> back to <strong>Open Pool (All Recruiters)</strong>? Other recruiters will be able to claim it.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Mandatory Reason for Release:
              </label>
              <textarea
                value={releaseReason}
                onChange={e => setReleaseReason(e.target.value)}
                placeholder="e.g. Specialized technical domain, lack of active resumes, releasing for senior recruiter..."
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => { setShowReleaseModal(false); setReleaseReason(''); }}
                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!releaseReason.trim()) {
                    alert('Please enter a reason for releasing this position.');
                    return;
                  }
                  setIsSubmitting(true);
                  try {
                    await onReleasePosition(position.id, releaseReason.trim());
                    setShowReleaseModal(false);
                    setReleaseReason('');
                    onClose();
                  } catch (err) {
                    alert('Error releasing position: ' + err.message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting || !releaseReason.trim()}
                style={{
                  padding: '0.45rem 1rem', borderRadius: '6px', border: 'none',
                  background: !releaseReason.trim() ? '#fed7aa' : '#ea580c',
                  color: 'white', fontWeight: 700, cursor: !releaseReason.trim() ? 'not-allowed' : 'pointer', fontSize: '0.8rem'
                }}
              >
                {isSubmitting ? 'Releasing...' : 'Confirm Release 🔓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
