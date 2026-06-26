'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, Briefcase, Users, Search, ChevronRight, UserPlus, Filter, RefreshCw, Calendar, FileText, CheckCircle2, ClipboardList } from 'lucide-react';
import CandidateProfilePanel from './CandidateProfilePanel';
import { getRecruitersList } from '@/app/actions/team';

const getStatusOptions = (stage) => {
  switch (stage) {
    case 'S02':
      return ['Awaiting Screening', 'Resume Selected', 'Resume Rejected', 'No Response', 'ReSchedule'];
    case 'S03':
      return ['Interview Scheduled', 'Interview Cleared', 'Interview Rejected', 'No Response', 'ReSchedule'];
    case 'S04':
      return ['Test Pending', 'Test Passed', 'Test Failed', 'No Response', 'ReSchedule'];
    case 'S05':
      return ['Pending ED', 'ED Approved', 'ED Rejected', 'No Response', 'ReSchedule'];
    case 'S06':
      return ['Negotiation Pending', 'Salary Agreed', 'Salary Rejected', 'No Response', 'ReSchedule'];
    case 'S07':
      return ['Shortlisted', 'Dropped', 'No Response', 'ReSchedule'];
    case 'S08':
      return ['LOI Released', 'LOI Accepted', 'LOI Declined', 'No Response', 'ReSchedule'];
    case 'S09':
      return ['Joining Pending', 'Joined', 'No Show', 'No Response', 'ReSchedule'];
    default:
      return ['Pending', 'No Response', 'ReSchedule'];
  }
};

export default function RecruiterDashboard({ userRole, userName, selectedStage = 'positions', recruiterAccess = null, isAdmin = false }) {
  const supabase = useMemo(() => createClient(), []);

  // Compute which stages this user can access
  const canAccessStage = (stageId) => {
    if (isAdmin || userRole === 'admin' || userRole === 'Admin') return true;
    if (!recruiterAccess) return true; // fallback: allow all if no access config
    if (recruiterAccess.is_manager) return true; // full access
    const steps = recruiterAccess.assigned_steps || [];
    if (steps.length === 0) return true; // no restriction set
    return steps.includes(stageId);
  };

  const canAccessDashboard = isAdmin || userRole === 'admin' || userRole === 'Admin' || !!(recruiterAccess?.is_manager);
  const canAccessAllStages = canAccessDashboard;
  
  // Data State
  const [positions, setPositions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recruitersList, setRecruitersList] = useState([]);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPositionFilter, setSelectedPositionFilter] = useState('All');
  
  // Modals & Panels State
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Edit Position State
  const [editingPosition, setEditingPosition] = useState(null);
  const [editPositionForm, setEditPositionForm] = useState({});
  const [savingEditPos, setSavingEditPos] = useState(false);
  
  // Form State
  const [newPosition, setNewPosition] = useState({ title: '', department: '', openings: 1, jd_text: '', deadline_date: '', interviewer_name: '', recruiter_assigned: 'All' });
  const [newCandidate, setNewCandidate] = useState({ name: '', email: '', phone: '', position_id: '', resume_url: '' });
  const [uploadingResume, setUploadingResume] = useState(false);

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingResume(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = `resumes/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('recruitment_resumes')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error details:', uploadError);
        alert(`Error uploading resume: ${uploadError.message}\n\nPlease verify that the 'recruitment_resumes' storage bucket exists in your Supabase project and is set to Public.`);
        setUploadingResume(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('recruitment_resumes')
        .getPublicUrl(filePath);

      setNewCandidate(prev => ({ ...prev, resume_url: publicUrlData.publicUrl }));
    } catch (err) {
      console.error('Resume upload error:', err);
      alert('An unexpected error occurred during upload: ' + err.message);
    } finally {
      setUploadingResume(false);
    }
  };


  const STAGES = [
    { id: 'S02', label: 'S02: Resume Filtered', color: '#cbd5e1', textColor: '#334155' },
    { id: 'S03', label: 'S03: Interview Executed', color: '#fef9c3', textColor: '#854d0e' },
    { id: 'S04', label: 'S04: Test Results', color: '#dbeafe', textColor: '#1e40af' },
    { id: 'S05', label: 'S05: ED Approval Pending', color: '#ffedd5', textColor: '#c2410c' },
    { id: 'S06', label: 'S06: Salary Negotiating', color: '#f5d0fe', textColor: '#86198f' },
    { id: 'S07', label: 'S07: Shortlisted', color: '#e0e7ff', textColor: '#3730a3' },
    { id: 'S08', label: 'S08: LOI Released', color: '#e0f2fe', textColor: '#0369a1' },
    { id: 'S09', label: 'S09: Joined', color: '#dcfce7', textColor: '#166534' }
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch positions
      const { data: posData, error: posError } = await supabase
        .from('recruitment_positions')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (posError) throw posError;
      setPositions(posData || []);

      // Fetch candidates
      const { data: candData, error: candError } = await supabase
        .from('recruitment_candidates')
        .select('*, recruitment_positions(title, department)')
        .order('created_at', { ascending: false });

      if (candError) throw candError;
      setCandidates(candData || []);
    } catch (e) {
      console.error("Failed to load recruiter dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Load recruiters list using server action (bypasses RLS)
  const loadRecruiters = async () => {
    try {
      const data = await getRecruitersList();
      setRecruitersList(data || []);
    } catch (e) {
      console.error('Failed to load recruiters list:', e);
    }
  };

  useEffect(() => {
    loadData();
    loadRecruiters();

    // Set up Realtime subscriptions
    const channel1 = supabase
      .channel('recruitment_positions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_positions' }, () => {
        loadData();
      })
      .subscribe();

    const channel2 = supabase
      .channel('recruitment_candidates_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_candidates' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [supabase]);

  // Handle Position Creation
  const handleCreatePosition = async (e) => {
    e.preventDefault();
    if (!newPosition.title || !newPosition.department) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const creator = userName || user?.email?.split('@')[0] || 'Recruiter';

      const { error } = await supabase
        .from('recruitment_positions')
        .insert([{
          ...newPosition,
          status: selectedStage === 'S01' ? 'S01' : 'S00',
          created_by: creator
        }]);

      if (error) throw error;
      setNewPosition({ title: '', department: '', openings: 1, jd_text: '', deadline_date: '', interviewer_name: '', recruiter_assigned: 'All' });
      setIsPositionModalOpen(false);
      loadData();
    } catch (err) {
      alert("Error creating position: " + err.message);
    }
  };

  // Handle Claim Position (S00 'All' positions can be claimed by any recruiter)
  const handleClaimPosition = async (positionId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const claimant = userName || user?.email?.split('@')[0] || 'Recruiter';
      const { error } = await supabase
        .from('recruitment_positions')
        .update({ recruiter_assigned: claimant })
        .eq('id', positionId);
      if (error) throw error;
      loadData();
    } catch (err) {
      alert('Error claiming position: ' + err.message);
    }
  };

  // Open Edit Position Modal
  const handleOpenEditPosition = (pos) => {
    setEditingPosition(pos);
    setEditPositionForm({
      title: pos.title || '',
      department: pos.department || '',
      openings: pos.openings || 1,
      jd_text: pos.jd_text || '',
      deadline_date: pos.deadline_date || '',
      interviewer_name: pos.interviewer_name || '',
      recruiter_assigned: pos.recruiter_assigned || 'All',
    });
  };

  // Save Edited Position
  const handleSaveEditPosition = async (e) => {
    e.preventDefault();
    if (!editPositionForm.title || !editPositionForm.department) return;
    setSavingEditPos(true);
    try {
      const { error } = await supabase
        .from('recruitment_positions')
        .update({ ...editPositionForm })
        .eq('id', editingPosition.id);
      if (error) throw error;
      setEditingPosition(null);
      loadData();
    } catch (err) {
      alert('Error saving position: ' + err.message);
    } finally {
      setSavingEditPos(false);
    }
  };

  // Handle Candidate Registration
  const handleCreateCandidate = async (e) => {
    e.preventDefault();
    if (!newCandidate.name || !newCandidate.position_id) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const creator = userName || user?.email?.split('@')[0] || 'Recruiter';

      const { data, error } = await supabase
        .from('recruitment_candidates')
        .insert([{
          ...newCandidate,
          current_stage: 'S02',
          created_by: creator
        }])
        .select()
        .single();

      if (error) throw error;

      // Add default filtration note log
      await supabase.from('recruitment_candidate_notes').insert([{
        candidate_id: data.id,
        note_text: 'Candidate Resume Filtered and Registered (S02)',
        created_by: creator
      }]);

      setNewCandidate({ name: '', email: '', phone: '', position_id: '', resume_url: '' });
      setIsCandidateModalOpen(false);
      loadData();
    } catch (err) {
      alert("Error creating candidate: " + err.message);
    }
  };

  // Update Candidate Stage from table dropdown
  const handleUpdateCandidateStage = async (candidateId, newStage) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = userName || user?.email?.split('@')[0] || 'System';
      
      const defaultStatus = getStatusOptions(newStage)[0];

      const { error } = await supabase
        .from('recruitment_candidates')
        .update({ 
          current_stage: newStage,
          candidate_status: defaultStatus
        })
        .eq('id', candidateId);

      if (error) throw error;

      // Log transition
      await supabase.from('recruitment_candidate_notes').insert([{
        candidate_id: candidateId,
        note_text: `Stage changed to ${newStage} (Status reset to ${defaultStatus})`,
        created_by: actor
      }]);

      loadData();
    } catch (e) {
      alert("Error updating stage: " + e.message);
    }
  };

  // Update Candidate Status from table dropdown
  const handleUpdateCandidateStatus = async (candidateId, newStatus) => {
    try {
      const { error } = await supabase
        .from('recruitment_candidates')
        .update({ candidate_status: newStatus })
        .eq('id', candidateId);

      if (error) throw error;
      loadData();
    } catch (e) {
      alert("Error updating status: " + e.message);
    }
  };

  // Toggle Position Status
  const handleTogglePositionStatus = async (positionId, currentStatus) => {
    const nextStatus = currentStatus === 'S00' ? 'S01' : 'S00';
    try {
      const { error } = await supabase
        .from('recruitment_positions')
        .update({ status: nextStatus })
        .eq('id', positionId);
        
      if (error) throw error;
      loadData();
    } catch (e) {
      alert("Error updating position status: " + e.message);
    }
  };

  // Filtered Candidates — respects stage-wise access
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      // Stage access gate: user must have access to this candidate's stage
      if (!canAccessStage(c.current_stage)) return false;

      const matchesStage = selectedStage === 'all_stages' || c.current_stage === selectedStage;
      
      const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || '').includes(searchTerm);
      
      const matchesPosition = 
        selectedPositionFilter === 'All' || c.position_id === selectedPositionFilter;

      return matchesStage && matchesSearch && matchesPosition;
    });
  }, [candidates, selectedStage, searchTerm, selectedPositionFilter, recruiterAccess, isAdmin]);

  // Filtered Positions — respects stage-wise access
  const filteredPositions = useMemo(() => {
    if (!canAccessStage(selectedStage)) return [];
    return positions.filter(pos => pos.status === selectedStage);
  }, [positions, selectedStage, recruiterAccess, isAdmin]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>

      {/* ACCESS DENIED guard for specific stages */}
      {selectedStage !== 'dashboard' && selectedStage !== 'all_stages' && !canAccessStage(selectedStage) ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Access Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            You do not have permission to view <strong>{selectedStage}</strong>. 
            Please contact your administrator to grant access to this stage.
          </p>
        </div>
      ) : selectedStage === 'dashboard' && !canAccessDashboard ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Dashboard Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            The Recruiter Dashboard overview requires Full Access or Manager-level permission.
          </p>
        </div>
      ) : selectedStage === 'all_stages' && !canAccessAllStages ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🔒</div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>All Stages Restricted</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
            Viewing all stages requires Full Access or Manager-level permission.
          </p>
        </div>
      ) : (
      <>
      {/* Sub-Header & Stage Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectedStage === 'dashboard' ? (
              <>
                <ClipboardList size={20} style={{ color: 'var(--accent-color)' }} /> Recruiter Dashboard Overview
              </>
            ) : selectedStage === 'all_stages' ? (
              <>
                <Users size={20} style={{ color: 'var(--accent-color)' }} /> Recruiter All Stage Pipeline
              </>
            ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
              <>
                <Briefcase size={20} style={{ color: 'var(--accent-color)' }} />{' '}
                {selectedStage === 'S00' ? 'S00: Requirements Received' : 'S01: JDs Prepared & Posted'}
              </>
            ) : (
              <>
                <Users size={20} style={{ color: 'var(--accent-color)' }} /> {STAGES.find(s => s.id === selectedStage)?.label || 'Candidate Pipeline'}
              </>
            )}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            {selectedStage === 'dashboard' ? (
              "Overview of requirements, candidate metrics, pipeline funnel and recent activities."
            ) : selectedStage === 'all_stages' ? (
              `View and manage all registered candidates across all pipeline stages (${filteredCandidates.length} candidates).`
            ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
              `Manage department requirements, prepare and track JD postings (${filteredPositions.length} positions).`
            ) : (
              `Manage applicants in this stage (${filteredCandidates.length} candidates).`
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button 
            onClick={loadData}
            style={{ 
              padding: '0.5rem', 
              borderRadius: '50%', 
              border: '1px solid var(--border-light)', 
              background: 'var(--bg-surface)', 
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Refresh Data"
          >
            <RefreshCw size={16} />
          </button>

          {selectedStage === 'dashboard' ? null : selectedStage === 'S00' || selectedStage === 'S01' ? (
            <button 
              onClick={() => setIsPositionModalOpen(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
            >
              <Plus size={16} /> Create Position
            </button>
          ) : (
            <button 
              onClick={() => setIsCandidateModalOpen(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
            >
              <UserPlus size={16} /> Add Candidate
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-secondary)' }}>
          Loading recruiter workspace...
        </div>
      ) : selectedStage === 'dashboard' ? (
        /* ==================== TAB: RECRUITER DASHBOARD ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid var(--accent-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)' }}>
                <Briefcase size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Requirements (S00)</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {positions.filter(p => p.status === 'S00').length}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid #10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FileText size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Job JDs (S01)</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {positions.filter(p => p.status === 'S01').length}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid #3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Users size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Applicants</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {candidates.length}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '4px solid #22c55e', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: '12px' }}>
              <div style={{ padding: '0.75rem', borderRadius: '12px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Joined (S09)</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {candidates.filter(c => c.current_stage === 'S09').length}
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline Breakdown & Recent Activity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {/* Pipeline Stage-wise Breakdown */}
            <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Recruitment Funnel Pipeline</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                {STAGES.map(stage => {
                  const count = candidates.filter(c => c.current_stage === stage.id).length;
                  const pct = candidates.length > 0 ? (count / candidates.length) * 100 : 0;
                  return (
                    <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{stage.label}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{count} Candidates</span>
                      </div>
                      <div style={{ height: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: stage.textColor || 'var(--accent-color)', borderRadius: '4px', transition: 'width 0.5s ease-in-out' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Summary / Recent Entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Recent Openings */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Recent Requirements</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {positions.slice(0, 3).map(pos => (
                    <div key={pos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pos.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pos.department}</div>
                      </div>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '12px', 
                        fontWeight: 'bold',
                        background: pos.status === 'S00' ? '#fee2e2' : '#dcfce7',
                        color: pos.status === 'S00' ? '#991b1b' : '#166534'
                      }}>
                        {pos.status === 'S00' ? 'S00: Requirement' : 'S01: JD Posted'}
                      </span>
                    </div>
                  ))}
                  {positions.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No requirements found.</p>}
                </div>
              </div>

              {/* Recent Applicants */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRadius: '12px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Recent Candidates</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {candidates.slice(0, 3).map(cand => (
                    <div key={cand.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cand.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{cand.recruitment_positions?.title || 'Unknown Position'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {cand.current_stage}
                        </span>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          padding: '0.2rem 0.4rem', 
                          borderRadius: '12px', 
                          fontWeight: 'bold',
                          background: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') ? '#fee2e2' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Joined') ? '#dcfce7' : '#fef9c3',
                          color: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') ? '#991b1b' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Joined') ? '#166534' : '#854d0e'
                        }}>
                          {cand.candidate_status || 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {candidates.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No candidates found.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : selectedStage === 'S00' || selectedStage === 'S01' ? (
        /* ==================== TAB: JOB POSITIONS ==================== */
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          {filteredPositions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <h3>No Job Openings in this stage</h3>
              <p>Either create a new position or shift existing positions to change their status.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Job Title</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Department</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '100px' }}>Openings</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '120px' }}>Status</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '130px' }}>Deadline Date</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '160px' }}>Interviewer</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '160px' }}>🎯 Recruiter Assigned</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Job Description (JD Summary)</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '130px' }}>Created By</th>
                  <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '220px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map(pos => (
                  <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pos.title}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{pos.department}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{pos.openings}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '12px', 
                        fontWeight: 'bold',
                        background: pos.status === 'S00' ? '#fee2e2' : '#dcfce7',
                        color: pos.status === 'S00' ? '#991b1b' : '#166534'
                      }}>
                        {pos.status === 'S00' ? 'S00: Requirement' : 'S01: Posted & JD Prepared'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {pos.deadline_date ? new Date(pos.deadline_date).toLocaleDateString() : <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>None</span>}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {pos.interviewer_name || <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Not Assigned</span>}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                      {pos.recruiter_assigned && pos.recruiter_assigned !== 'All' ? (
                        <span style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
                          background: '#dbeafe', color: '#1e40af', fontSize: '0.75rem'
                        }}>👤 {pos.recruiter_assigned}</span>
                      ) : (
                        <span style={{ 
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600,
                          background: '#fef9c3', color: '#854d0e', fontSize: '0.75rem'
                        }}>📢 All Recruiters</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={pos.jd_text}>
                      {pos.jd_text || <span style={{ fontStyle: 'italic', color: '#c2410c' }}>⚠️ No JD logged — please edit.</span>}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{pos.created_by || 'System'}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleOpenEditPosition(pos)}
                          style={{
                            fontSize: '0.72rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                            border: '1px solid #6366f1', background: 'transparent',
                            cursor: 'pointer', fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap'
                          }}
                        >✏️ Edit</button>
                        {(!pos.recruiter_assigned || pos.recruiter_assigned === 'All') && (
                          <button
                            onClick={() => handleClaimPosition(pos.id)}
                            style={{
                              fontSize: '0.72rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                              border: '1px solid #10b981', background: '#ecfdf5',
                              cursor: 'pointer', fontWeight: 600, color: '#065f46', whiteSpace: 'nowrap'
                            }}
                          >🙋 Claim</button>
                        )}
                        <button 
                          onClick={() => handleTogglePositionStatus(pos.id, pos.status)}
                          style={{ 
                            fontSize: '0.72rem', padding: '0.35rem 0.75rem', borderRadius: '6px',
                            border: '1px solid var(--border-light)', background: 'var(--bg-surface)',
                            cursor: 'pointer', fontWeight: 600, color: 'var(--accent-color)', whiteSpace: 'nowrap'
                          }}
                        >
                          {pos.status === 'S00' ? 'JD Ready →' : '← Revert'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ==================== TAB: CANDIDATE PIPELINE ==================== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
          
          {/* Filters Row */}
          <div className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="Search candidate by name, email or phone..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '0.45rem 1rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '200px' }}>
              <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
              <select 
                value={selectedPositionFilter} 
                onChange={e => setSelectedPositionFilter(e.target.value)} 
                style={{ padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', fontSize: '0.85rem', backgroundColor: 'var(--bg-surface)' }}
              >
                <option value="All">All Job Positions</option>
                {positions.map(p => (
                  <option key={p.id} value={p.id}>{p.title} ({p.department})</option>
                ))}
              </select>
            </div>
            
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Showing {filteredCandidates.length} applicants
            </div>

          </div>

          {/* Candidates Table */}
          {filteredCandidates.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <h3>No Candidates in this Stage</h3>
              <p>Either add a new candidate or update existing candidates' stages to shift them here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Candidate Name</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Applying For</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '120px', textAlign: 'center' }}>Resume</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '100px' }}>Stage</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '185px' }}>Candidate Status</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Stage Details / Remarks</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '120px' }}>Date Applied</th>
                    <th style={{ padding: '1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', width: '120px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map(cand => {
                    // Compute stage details cell
                    let stageDetailsText = <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>No remarks logged.</span>;
                    if (cand.current_stage === 'S02') {
                      stageDetailsText = <span style={{ color: 'var(--text-secondary)' }}>Registered in S02 - Resume Filtered</span>;
                    } else if (cand.current_stage === 'S03') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div>🗣️ Interviewer: <strong>{cand.interviewer_name || 'Not assigned'}</strong></div>
                          <div>
                            Feedback: {cand.interview_feedback ? (
                              <span style={{ fontStyle: 'italic' }}>"{cand.interview_feedback}"</span>
                            ) : (
                              <span style={{ color: '#c2410c', fontStyle: 'italic' }}>Pending comments</span>
                            )}
                          </div>
                        </div>
                      );
                    } else if (cand.current_stage === 'S04') {
                      stageDetailsText = cand.test_results ? (
                        <span>📊 Test Score: <strong>{cand.test_results}</strong></span>
                      ) : (
                        <span style={{ color: '#1e40af' }}>Test Results Awaiting Update</span>
                      );
                    } else if (cand.current_stage === 'S05') {
                      stageDetailsText = (
                        <span>
                          🔑 ED Approval:{' '}
                          <strong style={{ color: cand.ed_approval_status === 'Approved' ? '#166534' : cand.ed_approval_status === 'Rejected' ? '#991b1b' : '#c2410c' }}>
                            {cand.ed_approval_status}
                          </strong>
                        </span>
                      );
                    } else if (cand.current_stage === 'S06') {
                      stageDetailsText = cand.salary_negotiation_details ? (
                        <span>💰 Structure: {cand.salary_negotiation_details}</span>
                      ) : (
                        <span style={{ color: '#86198f' }}>Salary Negotiation in progress</span>
                      );
                    } else if (cand.current_stage === 'S07') {
                      stageDetailsText = <span style={{ color: '#166534', fontWeight: 600 }}>✓ Structure Approved (ED Shortlisted)</span>;
                    } else if (cand.current_stage === 'S08') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span>✉️ Offer/LOI Status: <strong>{cand.loi_status}</strong></span>
                          {cand.joining_date && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>📅 Expected Joining: <strong>{cand.joining_date}</strong></span>}
                        </div>
                      );
                    } else if (cand.current_stage === 'S09') {
                      stageDetailsText = (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {cand.actual_joining_date && <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>📅 Joined Date: {cand.actual_joining_date}</span>}
                          {cand.joining_details ? (
                            <span>🤝 Details: {cand.joining_details}</span>
                          ) : (
                            <span style={{ color: '#166534' }}>Joined - Awaiting onboarding checklist</span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <tr 
                        key={cand.id} 
                        style={{ borderBottom: '1px solid var(--border-light)', transition: 'background-color 0.2s' }}
                      >
                        <td style={{ padding: '1rem' }}>
                          <div 
                            onClick={() => { setSelectedCandidate(cand); setIsProfileOpen(true); }}
                            style={{ fontWeight: 600, color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.875rem' }}
                          >
                            {cand.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            {cand.phone && <span style={{ marginRight: '0.75rem' }}>📞 {cand.phone}</span>}
                            {cand.email && <span>✉️ {cand.email}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <div>{cand.recruitment_positions?.title || 'Unknown'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{cand.recruitment_positions?.department}</div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {cand.resume_url ? (
                            <a 
                              href={cand.resume_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.25rem', 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '6px', 
                                backgroundColor: 'var(--bg-primary)', 
                                border: '1px solid var(--border-light)',
                                fontSize: '0.75rem', 
                                color: 'var(--accent-color)', 
                                textDecoration: 'none',
                                fontWeight: 600
                              }}
                            >
                              <FileText size={12} /> View Resume
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No Resume</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <select 
                            value={cand.current_stage || 'S02'}
                            onChange={(e) => handleUpdateCandidateStage(cand.id, e.target.value)}
                            style={{ 
                              padding: '0.25rem 0.5rem', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-light)', 
                              fontSize: '0.8rem',
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <option value="S02">S02</option>
                            <option value="S03">S03</option>
                            <option value="S04">S04</option>
                            <option value="S05">S05</option>
                            <option value="S06">S06</option>
                            <option value="S07">S07</option>
                            <option value="S08">S08</option>
                            <option value="S09">S09</option>
                          </select>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <select 
                            value={cand.candidate_status || getStatusOptions(cand.current_stage || 'S02')[0]}
                            onChange={(e) => handleUpdateCandidateStatus(cand.id, e.target.value)}
                            style={{ 
                              padding: '0.25rem 0.6rem', 
                              borderRadius: '12px', 
                              border: 'none', 
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              background: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') || cand.candidate_status?.includes('Dropped') || cand.candidate_status?.includes('No Show') ? '#fee2e2' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Agreed') || cand.candidate_status?.includes('Shortlisted') || cand.candidate_status?.includes('Joined') || cand.candidate_status?.includes('Selected') ? '#dcfce7' : '#fef9c3',
                              color: cand.candidate_status?.includes('Rejected') || cand.candidate_status?.includes('Failed') || cand.candidate_status?.includes('Dropped') || cand.candidate_status?.includes('No Show') ? '#991b1b' : cand.candidate_status?.includes('Cleared') || cand.candidate_status?.includes('Passed') || cand.candidate_status?.includes('Approved') || cand.candidate_status?.includes('Agreed') || cand.candidate_status?.includes('Shortlisted') || cand.candidate_status?.includes('Joined') || cand.candidate_status?.includes('Selected') ? '#166534' : '#854d0e',
                              outline: 'none',
                              textAlign: 'center'
                            }}
                          >
                            {getStatusOptions(cand.current_stage || 'S02').map(opt => (
                              <option key={opt} value={opt} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 'normal' }}>{opt}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          {stageDetailsText}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {new Date(cand.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button 
                            onClick={() => { setSelectedCandidate(cand); setIsProfileOpen(true); }}
                            style={{ 
                              fontSize: '0.75rem', 
                              padding: '0.4rem 0.85rem', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-surface)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Open Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Profile/Detail Slide Panel */}
      {selectedCandidate && (
        <CandidateProfilePanel 
          candidate={selectedCandidate}
          isOpen={isProfileOpen}
          onClose={() => { setIsProfileOpen(false); setSelectedCandidate(null); }}
          onCandidateUpdate={() => { loadData(); }}
          userName={userName}
        />
      )}

      {/* Modal: Add Job Position */}
      {isPositionModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '400px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Create Job Requirement</h3>
            
            <form onSubmit={handleCreatePosition} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Position Title</label>
                <input required type="text" value={newPosition.title} onChange={e => setNewPosition({...newPosition, title: e.target.value})} placeholder="e.g. Sales Manager, Recruiter" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Department</label>
                <select value={newPosition.department} onChange={e => setNewPosition({...newPosition, department: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  <option value="">Select Department</option>
                  <option value="Sales">Sales</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Human Resource">Human Resource</option>
                  <option value="Production">Production</option>
                  <option value="System">System</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No. of Openings</label>
                <input required type="number" min="1" value={newPosition.openings} onChange={e => setNewPosition({...newPosition, openings: parseInt(e.target.value) || 1})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Deadline Date</label>
                  <input type="date" value={newPosition.deadline_date || ''} onChange={e => setNewPosition({...newPosition, deadline_date: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name</label>
                  <input type="text" value={newPosition.interviewer_name || ''} onChange={e => setNewPosition({...newPosition, interviewer_name: e.target.value})} placeholder="e.g. Tanu Sharma" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>

              {/* Recruiter Assigned */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>🎯 Assign Recruiter</label>
                <select 
                  value={newPosition.recruiter_assigned || 'All'} 
                  onChange={e => setNewPosition({...newPosition, recruiter_assigned: e.target.value})} 
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                >
                  <option value="All">📢 All Recruiters (Anyone can Claim)</option>
                  {recruitersList.map(r => (
                    <option key={r.user_id} value={r.emp_name}>{r.emp_name}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Select "All" if unsure — any recruiter can claim it from S00.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Description (JD Summary)</label>
                <textarea rows="3" value={newPosition.jd_text} onChange={e => setNewPosition({...newPosition, jd_text: e.target.value})} placeholder="Key roles and qualifications required..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsPositionModalOpen(false)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>Create Requirement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Position */}
      {editingPosition && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>✏️ Edit Position — {editingPosition.title}</h3>
              <button onClick={() => setEditingPosition(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <form onSubmit={handleSaveEditPosition} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Position Title *</label>
                <input required type="text" value={editPositionForm.title} onChange={e => setEditPositionForm({...editPositionForm, title: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Department *</label>
                  <select value={editPositionForm.department} onChange={e => setEditPositionForm({...editPositionForm, department: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                    <option value="">Select Department</option>
                    <option value="Sales">Sales</option>
                    <option value="Purchase">Purchase</option>
                    <option value="Human Resource">Human Resource</option>
                    <option value="Production">Production</option>
                    <option value="System">System</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>No. of Openings</label>
                  <input type="number" min="1" value={editPositionForm.openings} onChange={e => setEditPositionForm({...editPositionForm, openings: parseInt(e.target.value) || 1})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Deadline Date</label>
                  <input type="date" value={editPositionForm.deadline_date || ''} onChange={e => setEditPositionForm({...editPositionForm, deadline_date: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name</label>
                  <input type="text" value={editPositionForm.interviewer_name || ''} onChange={e => setEditPositionForm({...editPositionForm, interviewer_name: e.target.value})} placeholder="e.g. Tanu Sharma" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>
              {/* Recruiter Assigned */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>🎯 Assign Recruiter</label>
                <select 
                  value={editPositionForm.recruiter_assigned || 'All'} 
                  onChange={e => setEditPositionForm({...editPositionForm, recruiter_assigned: e.target.value})} 
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                >
                  <option value="All">📢 All Recruiters (Anyone can Claim)</option>
                  {recruitersList.map(r => (
                    <option key={r.user_id} value={r.emp_name}>{r.emp_name}</option>
                  ))}
                </select>
              </div>
              {/* JD */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Job Description (JD Summary)</label>
                <textarea 
                  rows="5" 
                  value={editPositionForm.jd_text} 
                  onChange={e => setEditPositionForm({...editPositionForm, jd_text: e.target.value})} 
                  placeholder="Add detailed job roles, skills required, experience, qualifications etc..."
                  style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setEditingPosition(null)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={savingEditPos} className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>
                  {savingEditPos ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Candidate */}
      {isCandidateModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="card" style={{ width: '400px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Register Candidate Profile</h3>
            
            <form onSubmit={handleCreateCandidate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name</label>
                <input required type="text" value={newCandidate.name} onChange={e => setNewCandidate({...newCandidate, name: e.target.value})} placeholder="Applicant full name..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
                  <input type="email" value={newCandidate.email} onChange={e => setNewCandidate({...newCandidate, email: e.target.value})} placeholder="email@address.com" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                  <input type="tel" value={newCandidate.phone} onChange={e => setNewCandidate({...newCandidate, phone: e.target.value})} placeholder="Phone number" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Applying For Position</label>
                <select required value={newCandidate.position_id} onChange={e => setNewCandidate({...newCandidate, position_id: e.target.value})} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  <option value="">Select Open Position</option>
                  {positions.map(pos => (
                    <option key={pos.id} value={pos.id}>{pos.title} ({pos.department})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Resume/CV Link</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="url" value={newCandidate.resume_url} onChange={e => setNewCandidate({...newCandidate, resume_url: e.target.value})} placeholder="e.g. Paste link or upload file" style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 0 }} />
                  <label className="btn-secondary" style={{ display: 'inline-flex', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    {uploadingResume ? 'Uploading...' : 'Upload File'}
                    <input type="file" accept=".pdf,.doc,.docx,.rtf,.txt" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploadingResume} />
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsCandidateModalOpen(false)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>Register Candidate</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}

    </div>
  );
}
