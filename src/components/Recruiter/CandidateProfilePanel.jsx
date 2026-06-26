'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Send, User, Briefcase, FileText, ClipboardList, CheckCircle2, DollarSign, Calendar, ShieldCheck, Mail, Phone, Loader2 } from 'lucide-react';

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

export default function CandidateProfilePanel({ candidate, isOpen, onClose, onCandidateUpdate, userName }) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
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

      setEditForm(prev => ({ ...prev, resume_url: publicUrlData.publicUrl }));
    } catch (err) {
      console.error('Resume upload error:', err);
      alert('An unexpected error occurred during upload: ' + err.message);
    } finally {
      setUploadingResume(false);
    }
  };


  const STAGES = [
    { id: 'S02', label: 'S02 - Resume Filtered' },
    { id: 'S03', label: 'S03 - Interview Executed' },
    { id: 'S04', label: 'S04 - Test Result Updated' },
    { id: 'S05', label: 'S05 - ED Approval Pending' },
    { id: 'S06', label: 'S06 - Salary Negotiating' },
    { id: 'S07', label: 'S07 - Structure Confirmed / Shortlisted' },
    { id: 'S08', label: 'S08 - LOI Offer Letter Released' },
    { id: 'S09', label: 'S09 - Joining Formalities' }
  ];

  useEffect(() => {
    if (!candidate || !isOpen) return;

    // Initialize edit form
    setEditForm({
      name: candidate.name,
      email: candidate.email || '',
      phone: candidate.phone || '',
      current_stage: candidate.current_stage || 'S02',
      candidate_status: candidate.candidate_status || 'Awaiting Screening',
      interview_feedback: candidate.interview_feedback || '',
      test_results: candidate.test_results || '',
      ed_approval_status: candidate.ed_approval_status || 'Pending',
      salary_negotiation_details: candidate.salary_negotiation_details || '',
      formal_structure_approved: candidate.formal_structure_approved || false,
      loi_status: candidate.loi_status || 'Not Offered',
      joining_date: candidate.joining_date || '',
      actual_joining_date: candidate.actual_joining_date || '',
      expected_salary_min: candidate.expected_salary_min || '',
      expected_salary_max: candidate.expected_salary_max || '',
      actual_salary: candidate.actual_salary || '',
      joining_details: candidate.joining_details || '',
      resume_url: candidate.resume_url || '',
      interviewer_name: candidate.interviewer_name || ''
    });

    // Fetch notes for candidate
    const fetchNotes = async () => {
      const { data, error } = await supabase
        .from('recruitment_candidate_notes')
        .select('*')
        .eq('candidate_id', candidate.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setNotes(data);
      }
    };

    fetchNotes();

    // Subscribe to notes updates
    const channel = supabase
      .channel(`candidate-notes-${candidate.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recruitment_candidate_notes', filter: `candidate_id=eq.${candidate.id}` }, (payload) => {
        setNotes(prev => {
          if (prev.some(n => n.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [candidate, isOpen, supabase]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      if (name === 'current_stage') {
        updated.candidate_status = getStatusOptions(value)[0];
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...editForm,
        joining_date: editForm.joining_date || null,
        actual_joining_date: editForm.actual_joining_date || null,
        expected_salary_min: editForm.expected_salary_min ? parseInt(editForm.expected_salary_min) : null,
        expected_salary_max: editForm.expected_salary_max ? parseInt(editForm.expected_salary_max) : null,
        actual_salary: editForm.actual_salary ? parseInt(editForm.actual_salary) : null
      };

      const { error } = await supabase
        .from('recruitment_candidates')
        .update(payload)
        .eq('id', candidate.id);

      if (error) throw error;

      // Log stage transition or updates if stage changed
      if (candidate.current_stage !== editForm.current_stage) {
        const { data: { user } } = await supabase.auth.getUser();
        const actor = userName || user?.email?.split('@')[0] || 'System';
        
        await supabase.from('recruitment_candidate_notes').insert([{
          candidate_id: candidate.id,
          note_text: `Stage changed from ${candidate.current_stage} to ${editForm.current_stage}`,
          created_by: actor
        }]);
      }

      if (onCandidateUpdate) {
        onCandidateUpdate({ ...candidate, ...payload });
      }
      onClose();
    } catch (err) {
      alert("Error saving updates: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    const actor = userName || user?.email?.split('@')[0] || 'Recruiter';

    const { error } = await supabase
      .from('recruitment_candidate_notes')
      .insert([{
        candidate_id: candidate.id,
        note_text: newNote.trim(),
        created_by: actor
      }]);

    if (error) {
      alert("Error adding note: " + error.message);
    } else {
      setNewNote('');
    }
  };

  if (!isOpen || !candidate) return null;

  return (
    <>
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 999 }} 
        onClick={onClose} 
      />
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, 
          right: 0, 
          bottom: 0, 
          width: '450px', 
          backgroundColor: 'var(--bg-surface)', 
          zIndex: 1000, 
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)', 
          display: 'flex', 
          flexDirection: 'column',
          borderTopLeftRadius: '16px',
          borderBottomLeftRadius: '16px',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Candidate Profile</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{editForm.name}</span>
              {candidate.candidate_code && (
                <span style={{ 
                  fontSize: '0.68rem', fontFamily: 'monospace', 
                  padding: '0.1rem 0.35rem', borderRadius: '4px',
                  background: 'var(--bg-surface-variant)', border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)'
                }}>
                  {candidate.candidate_code}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Form Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Base Fields */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={16} /> Contact Details
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Candidate Name</label>
              <input name="name" value={editForm.name || ''} onChange={handleInputChange} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
                <input name="email" value={editForm.email || ''} onChange={handleInputChange} type="email" style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Phone</label>
                <input name="phone" value={editForm.phone || ''} onChange={handleInputChange} type="tel" style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expected Salary Min (₹/month)</label>
                <input name="expected_salary_min" value={editForm.expected_salary_min || ''} onChange={handleInputChange} type="number" placeholder="Min salary" style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expected Salary Max (₹/month)</label>
                <input name="expected_salary_max" value={editForm.expected_salary_max || ''} onChange={handleInputChange} type="number" placeholder="Max salary" style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Resume URL / CV Link</span>
                {editForm.resume_url && (
                  <a href={editForm.resume_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem' }}>
                    <FileText size={12} /> Open Resume
                  </a>
                )}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input name="resume_url" value={editForm.resume_url || ''} onChange={handleInputChange} placeholder="https://drive.google.com/... or upload link" style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 0 }} />
                <label className="btn-secondary" style={{ display: 'inline-flex', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {uploadingResume ? 'Uploading...' : 'Upload File'}
                  <input type="file" accept=".pdf,.doc,.docx,.rtf,.txt" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploadingResume} />
                </label>
              </div>
            </div>
          </div>

          {/* Workflow Stage */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Briefcase size={16} /> Recruitment Stage
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Stage</label>
              <select name="current_stage" value={editForm.current_stage || 'S02'} onChange={handleInputChange} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                {STAGES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Candidate Status</label>
              <select name="candidate_status" value={editForm.candidate_status || ''} onChange={handleInputChange} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                {getStatusOptions(editForm.current_stage || 'S02').map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* S03 Details */}
            {editForm.current_stage >= 'S03' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name (S03)</label>
                  <input name="interviewer_name" value={editForm.interviewer_name || ''} onChange={handleInputChange} placeholder="Enter interviewer name..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ClipboardList size={14} /> Interview Feedback (S03)</label>
                  <textarea name="interview_feedback" value={editForm.interview_feedback || ''} onChange={handleInputChange} rows={2} placeholder="Log interview comments..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                </div>
              </div>
            )}

            {/* S04 Details */}
            {editForm.current_stage >= 'S04' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><FileText size={14} /> Test Results (S04)</label>
                <input name="test_results" value={editForm.test_results || ''} onChange={handleInputChange} placeholder="Enter test marks, status, or results..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
              </div>
            )}

            {/* S05 Details */}
            {editForm.current_stage >= 'S05' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldCheck size={14} /> ED Sir Approval Status (S05)</label>
                <select name="ed_approval_status" value={editForm.ed_approval_status || 'Pending'} onChange={handleInputChange} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  <option value="Pending">Approval Pending</option>
                  <option value="Approved">Approved by ED Sir</option>
                  <option value="Rejected">Rejected by ED Sir</option>
                </select>
              </div>
            )}

            {/* S06 Details */}
            {editForm.current_stage >= 'S06' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><DollarSign size={14} /> Salary Negotiation (S06)</label>
                  <textarea name="salary_negotiation_details" value={editForm.salary_negotiation_details || ''} onChange={handleInputChange} rows={2} placeholder="Offered salary, perks, notice period discussion..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Actual Negotiated Salary (₹/month)</label>
                  <input name="actual_salary" value={editForm.actual_salary || ''} onChange={handleInputChange} type="number" placeholder="Enter actual negotiated salary..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>
              </div>
            )}

            {/* S07 Details */}
            {editForm.current_stage >= 'S07' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                <input type="checkbox" id="formal_structure_approved" name="formal_structure_approved" checked={editForm.formal_structure_approved || false} onChange={handleInputChange} style={{ width: '16px', height: '16px' }} />
                <label htmlFor="formal_structure_approved" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>Formal Structure Approved for Shortlist (S07)</label>
              </div>
            )}

            {/* S08 Details */}
            {editForm.current_stage >= 'S08' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={14} /> LOI / Offer Letter Status (S08)</label>
                  <select name="loi_status" value={editForm.loi_status || 'Not Offered'} onChange={handleInputChange} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                    <option value="Not Offered">LOI Not Offered</option>
                    <option value="Sent">LOI Sent to Candidate</option>
                    <option value="Accepted">LOI Accepted</option>
                    <option value="Declined">LOI Declined</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={14} /> Expected Joining Date (S08)</label>
                  <input type="date" name="joining_date" value={editForm.joining_date || ''} onChange={handleInputChange} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                </div>
              </div>
            )}

            {/* S09 Details */}
            {editForm.current_stage >= 'S09' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={14} /> Actual Joined Date (S09)</label>
                  <input type="date" name="actual_joining_date" value={editForm.actual_joining_date || ''} onChange={handleInputChange} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CheckCircle2 size={14} /> Joining Details & Formalities (S09)</label>
                  <textarea name="joining_details" value={editForm.joining_details || ''} onChange={handleInputChange} rows={2} placeholder="Document checklist, induction status..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button onClick={handleSave} disabled={isSaving} className="btn-primary" style={{ justifyContent: 'center', width: '100%', padding: '0.75rem' }}>
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Save Profile Updates"}
          </button>

          {/* Interaction History / Notes Log */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Calendar size={16} /> Interaction Log & History
            </h3>
            
            <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={newNote} 
                onChange={e => setNewNote(e.target.value)} 
                placeholder="Log activity or add notes..." 
                style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} 
              />
              <button type="submit" style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', padding: '0 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={14} />
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {notes.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No interaction logs yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} style={{ padding: '0.75rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}>
                    <p style={{ margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>{note.note_text}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      <span>By {note.created_by}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
