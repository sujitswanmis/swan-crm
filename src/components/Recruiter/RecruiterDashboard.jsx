'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, Briefcase, Users, Search, ChevronRight, UserPlus, Filter, RefreshCw, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import CandidateProfilePanel from './CandidateProfilePanel';

export default function RecruiterDashboard({ userRole, userName }) {
  const supabase = useMemo(() => createClient(), []);
  
  // Tab State
  const [activeSubTab, setActiveSubTab] = useState('pipeline'); // 'positions' or 'pipeline'
  
  // Data State
  const [positions, setPositions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPositionFilter, setSelectedPositionFilter] = useState('All');
  
  // Modals & Panels State
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Form State
  const [newPosition, setNewPosition] = useState({ title: '', department: '', openings: 1, jd_text: '' });
  const [newCandidate, setNewCandidate] = useState({ name: '', email: '', phone: '', position_id: '', resume_url: '' });

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

  useEffect(() => {
    loadData();

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
          status: 'S00',
          created_by: creator
        }]);

      if (error) throw error;
      setNewPosition({ title: '', department: '', openings: 1, jd_text: '' });
      setIsPositionModalOpen(false);
      loadData();
    } catch (err) {
      alert("Error creating position: " + err.message);
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

  // Promote Candidate Stage
  const handlePromoteStage = async (candidateId, currentStage) => {
    const stageIndex = STAGES.findIndex(s => s.id === currentStage);
    if (stageIndex === -1 || stageIndex === STAGES.length - 1) return; // Cannot promote past S09

    const nextStage = STAGES[stageIndex + 1].id;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = userName || user?.email?.split('@')[0] || 'System';

      const { error } = await supabase
        .from('recruitment_candidates')
        .update({ current_stage: nextStage })
        .eq('id', candidateId);

      if (error) throw error;

      // Log transition
      await supabase.from('recruitment_candidate_notes').insert([{
        candidate_id: candidateId,
        note_text: `Stage advanced to ${nextStage}`,
        created_by: actor
      }]);

      loadData();
    } catch (e) {
      alert("Error advancing stage: " + e.message);
    }
  };

  // Demote Candidate Stage
  const handleDemoteStage = async (candidateId, currentStage) => {
    const stageIndex = STAGES.findIndex(s => s.id === currentStage);
    if (stageIndex <= 0) return; // Cannot demote past S02

    const prevStage = STAGES[stageIndex - 1].id;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const actor = userName || user?.email?.split('@')[0] || 'System';

      const { error } = await supabase
        .from('recruitment_candidates')
        .update({ current_stage: prevStage })
        .eq('id', candidateId);

      if (error) throw error;

      // Log transition
      await supabase.from('recruitment_candidate_notes').insert([{
        candidate_id: candidateId,
        note_text: `Stage reverted to ${prevStage}`,
        created_by: actor
      }]);

      loadData();
    } catch (e) {
      alert("Error reverting stage: " + e.message);
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

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || '').includes(searchTerm);
      
      const matchesPosition = 
        selectedPositionFilter === 'All' || c.position_id === selectedPositionFilter;

      return matchesSearch && matchesPosition;
    });
  }, [candidates, searchTerm, selectedPositionFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
      
      {/* Sub-Header & Selector Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--th-bg)', padding: '0.25rem', borderRadius: '8px' }}>
          <button 
            onClick={() => setActiveSubTab('pipeline')}
            style={{ 
              padding: '0.5rem 1.25rem', 
              borderRadius: '6px', 
              border: 'none', 
              background: activeSubTab === 'pipeline' ? 'var(--bg-surface)' : 'transparent',
              color: activeSubTab === 'pipeline' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Users size={16} /> Candidate Pipeline (S02–S09)
          </button>
          <button 
            onClick={() => setActiveSubTab('positions')}
            style={{ 
              padding: '0.5rem 1.25rem', 
              borderRadius: '6px', 
              border: 'none', 
              background: activeSubTab === 'positions' ? 'var(--bg-surface)' : 'transparent',
              color: activeSubTab === 'positions' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Briefcase size={16} /> Job Requirements (S00–S01)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
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

          {activeSubTab === 'pipeline' ? (
            <button 
              onClick={() => setIsCandidateModalOpen(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
            >
              <UserPlus size={16} /> Add Candidate
            </button>
          ) : (
            <button 
              onClick={() => setIsPositionModalOpen(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
            >
              <Plus size={16} /> Create Position
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-secondary)' }}>
          Loading recruiter workspace...
        </div>
      ) : activeSubTab === 'positions' ? (
        /* ==================== TAB: JOB POSITIONS ==================== */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {positions.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <h3>No Job Openings Registered</h3>
              <p>Click "Create Position" to log a new position requirement from departments.</p>
            </div>
          ) : (
            positions.map(pos => (
              <div key={pos.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                
                {/* Header */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{pos.title}</h3>
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
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>{pos.department} | {pos.openings} Openings</p>
                </div>

                {/* JD Text */}
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)', 
                  backgroundColor: 'var(--bg-primary)', 
                  padding: '0.75rem', 
                  borderRadius: '8px', 
                  minHeight: '80px', 
                  maxHeight: '120px', 
                  overflowY: 'auto' 
                }}>
                  {pos.jd_text || <span style={{ fontStyle: 'italic' }}>No job description logged.</span>}
                </div>

                {/* Footer Controls */}
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>By {pos.created_by}</span>
                  <button 
                    onClick={() => handleTogglePositionStatus(pos.id, pos.status)}
                    style={{ 
                      fontSize: '0.75rem', 
                      padding: '0.4rem 0.85rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: 'var(--accent-color)'
                    }}
                  >
                    {pos.status === 'S00' ? 'JD Ready & Posted →' : '← Revert to S00'}
                  </button>
                </div>

              </div>
            ))
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

          {/* Kanban Board / Pipeline Columns */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            overflowX: 'auto', 
            paddingBottom: '1rem', 
            flex: 1, 
            minHeight: '450px',
            alignItems: 'stretch'
          }}>
            {STAGES.map(stage => {
              const stageCandidates = filteredCandidates.filter(c => c.current_stage === stage.id);
              
              return (
                <div 
                  key={stage.id} 
                  style={{ 
                    flexShrink: 0, 
                    width: '280px', 
                    backgroundColor: 'var(--bg-primary)', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-light)',
                    display: 'flex', 
                    flexDirection: 'column',
                    padding: '0.75rem'
                  }}
                >
                  {/* Column Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stage.label}</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: stage.color, 
                      color: stage.textColor, 
                      padding: '0.1rem 0.4rem', 
                      borderRadius: '8px', 
                      fontWeight: 'bold' 
                    }}>
                      {stageCandidates.length}
                    </span>
                  </div>

                  {/* Candidates List in Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.2rem' }}>
                    {stageCandidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                        No candidates here
                      </div>
                    ) : (
                      stageCandidates.map(cand => (
                        <div 
                          key={cand.id} 
                          className="card" 
                          onClick={() => { setSelectedCandidate(cand); setIsProfileOpen(true); }}
                          style={{ 
                            padding: '1rem', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '0.5rem',
                            borderLeft: `4px solid ${stage.textColor}`,
                            transition: 'transform 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{cand.name}</h4>
                            <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                          </div>

                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
                            {cand.recruitment_positions?.title || 'Unknown Position'}
                          </p>

                          {cand.phone && (
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>
                              📞 {cand.phone}
                            </p>
                          )}

                          {/* Quick stage advance buttons */}
                          <div 
                            style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}
                            onClick={e => e.stopPropagation()} // Stop opening panel
                          >
                            <button 
                              disabled={stage.id === 'S02'}
                              onClick={() => handleDemoteStage(cand.id, cand.current_stage)}
                              style={{ 
                                flex: 1, 
                                fontSize: '0.65rem', 
                                padding: '0.2rem 0.4rem', 
                                border: '1px solid var(--border-light)', 
                                borderRadius: '4px',
                                background: 'var(--bg-surface)', 
                                cursor: 'pointer',
                                opacity: stage.id === 'S02' ? 0.3 : 1
                              }}
                            >
                              ◀ Revert
                            </button>
                            <button 
                              disabled={stage.id === 'S09'}
                              onClick={() => handlePromoteStage(cand.id, cand.current_stage)}
                              style={{ 
                                flex: 1, 
                                fontSize: '0.65rem', 
                                padding: '0.2rem 0.4rem', 
                                border: 'none', 
                                borderRadius: '4px',
                                background: 'var(--accent-color)', 
                                color: 'white',
                                cursor: 'pointer',
                                opacity: stage.id === 'S09' ? 0.3 : 1
                              }}
                            >
                              Advance ▶
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

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
                <input type="url" value={newCandidate.resume_url} onChange={e => setNewCandidate({...newCandidate, resume_url: e.target.value})} placeholder="e.g. Google Drive, Dropbox link" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setIsCandidateModalOpen(false)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-surface)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>Register Candidate</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
