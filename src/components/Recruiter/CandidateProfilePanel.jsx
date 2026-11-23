'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { submitRecruiterChange, useRecruiterNotes } from '@/utils/recruiterLocalDb';
import { showSyncToast } from '@/utils/offlineSync';
import { 
  X, Send, User, Briefcase, FileText, ClipboardList, CheckCircle2, 
  DollarSign, Calendar, ShieldCheck, Mail, Phone, Loader2, Clock, 
  History, MessageSquare, ChevronDown, ChevronUp, ExternalLink, Sparkles, Award
} from 'lucide-react';

// Strictly format ISO date to Indian Standard Time (IST / Asia/Kolkata)
function formatIST(isoDate) {
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

const getStatusOptions = (stage) => {
  switch (stage) {
    case 'S02':
      return ['Awaiting Screening', 'Resume Selected', 'Resume Rejected', 'No Response', 'ReSchedule'];
    case 'S03':
      return ['Interview Scheduled', 'Interview Cleared', 'Interview Rejected', 'No Response', 'ReSchedule'];
    case 'S04':
      return ['Test Pending', 'Test Passed', 'Test Failed', 'No Response', 'ReSchedule'];
    case 'S05':
      return ['Pending ED', 'ED Approved', 'ED Rejected', 'Final Pending', 'Final Confirmed', 'Final Rejected', 'No Response', 'ReSchedule'];
    case 'S06':
      return ['Negotiation Pending', 'Salary Agreed', 'Salary Rejected', 'No Response', 'ReSchedule'];
    case 'S07':
      return ['Shortlisted', 'Dropped', 'No Response', 'ReSchedule'];
    case 'S08':
      return ['LOI Released', 'LOI Accepted', 'LOI Declined', 'No Response', 'ReSchedule'];
    case 'S09':
      return ['Joining Pending', 'Joined', 'No Show', 'No Response', 'ReSchedule'];
    case 'S10':
      return ['Pending Documents', 'Documents Submitted', 'KYC & Verification Completed', 'Discrepancy Found', 'Hold', 'ReSchedule'];
    case 'S11':
      return ['Mapping Pending', 'Employee ID Generated', 'Biometric Enrolled', 'System & Email Created', 'Handover Completed', 'Hold'];
    case 'S12':
      return ['Under Probation', '30-Day Review Completed', '60-Day Review Completed', 'Confirmed (Good)', 'Average (Needs Monitoring)', 'Probation Extended', 'Early Left / Resigned'];
    default:
      return ['Pending', 'No Response', 'ReSchedule'];
  }
};

export const NO_RESPONSE_SUBSTATUS_OPTIONS = [
  'Call Not Picked / Ringing',
  'Switched Off',
  'Call Busy / Disconnected',
  'Number Unreachable / Network Issue',
  'Invalid / Wrong Number',
  'WhatsApp Sent — Awaiting Reply',
  'Call Later / Busy Right Now'
];

export default function CandidateProfilePanel({ 
  recruiterScope,
  candidate, 
  isOpen, 
  onClose, 
  onCandidateUpdate, 
  canEdit = true,
  canDecreaseStage = false,
  stagesConfig = null,
  pipelineConfig = null,
  initialView = 'details'
}) {
  const supabase = useMemo(() => createClient(), []);
  const { notes } = useRecruiterNotes(recruiterScope, candidate?.id, isOpen, supabase);
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [uploadingResume, setUploadingResume] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 880);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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


  const getStageNumber = (stageId) => {
    if (!stageId) return -1;
    const match = String(stageId).match(/\d+/);
    return match ? parseInt(match[0], 10) : -1;
  };

  const STAGES = useMemo(() => {
    let list = [];
    if (Array.isArray(stagesConfig) && stagesConfig.length > 0) {
      list = stagesConfig.map(s => ({
        id: s.id,
        label: s.label || s.name || s.id,
        tat_hours: s.tat_hours || 24,
        status_options: s.status_options || []
      }));
    } else {
      list = [
        { id: 'S02', label: 'S02 — Resume Filtered', tat_hours: 24 },
        { id: 'S03', label: 'S03 — Interview Executed', tat_hours: 48 },
        { id: 'S04', label: 'S04 — Test Results', tat_hours: 24 },
        { id: 'S05', label: 'S05 — Final Confirmation', tat_hours: 48 },
        { id: 'S06', label: 'S06 — Salary Negotiation', tat_hours: 24 },
        { id: 'S07', label: 'S07 — Shortlisted', tat_hours: 24 },
        { id: 'S08', label: 'S08 — LOI Released', tat_hours: 24 },
        { id: 'S09', label: 'S09 — Joined', tat_hours: 48 },
        { id: 'S10', label: 'S10 — Document Collection', tat_hours: 48 },
        { id: 'S11', label: 'S11 — Employee ID & Final Mapping', tat_hours: 24 },
        { id: 'S12', label: 'S12 — Employee Working Rating', tat_hours: 720 }
      ];
    }
    // Candidate stages strictly exclude S00 and S01 (which belong only to Job Positions)
    return list.filter(s => s.id !== 'S00' && s.id !== 'S01');
  }, [stagesConfig]);

  const resolveStatusOptions = React.useCallback((stageId) => {
    const match = STAGES.find(s => s.id === stageId);
    if (match?.status_options && Array.isArray(match.status_options) && match.status_options.length > 0) {
      return match.status_options;
    }
    return getStatusOptions(stageId);
  }, [STAGES]);

  const currentStageObj = useMemo(() => {
    return STAGES.find(s => s.id === (editForm.current_stage || 'S02')) || STAGES[0];
  }, [STAGES, editForm.current_stage]);

  const nextStageObj = useMemo(() => {
    const idx = STAGES.findIndex(s => s.id === (editForm.current_stage || 'S02'));
    if (idx >= 0 && idx < STAGES.length - 1) {
      return STAGES[idx + 1];
    }
    return null;
  }, [STAGES, editForm.current_stage]);

  const [mountedTime] = useState(() => Date.now());

  // Compute Planned vs Actual dates in IST (Models 1 & 2)
  const timelineData = useMemo(() => {
    const createdTime = candidate?.created_at ? new Date(candidate.created_at).getTime() : mountedTime;
    const currentTatHours = currentStageObj?.tat_hours || 24;
    const nextTatHours = nextStageObj?.tat_hours || 24;

    // Model 1: Planned Stage Target (Candidate Registration + Stage TAT)
    const plannedTargetDate = new Date(createdTime + (currentTatHours * 60 * 60 * 1000));

    // Model 2: Actual completion / in-progress variance
    const now = mountedTime;
    const isOverdue = now > plannedTargetDate.getTime();
    const diffHours = Math.round(Math.abs(now - plannedTargetDate.getTime()) / (1000 * 60 * 60));

    // Model 2 Cascading: Next stage planned = Actual / Target completion + Next Stage TAT
    const nextStagePlanned = new Date(now + (nextTatHours * 60 * 60 * 1000));

    const formatIST = (dateObj) => {
      if (!dateObj || isNaN(dateObj.getTime())) return 'N/A';
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(dateObj);
    };

    return {
      currentTatHours,
      nextTatHours,
      plannedTargetStr: formatIST(plannedTargetDate),
      isOverdue,
      diffHours,
      nextStagePlannedStr: formatIST(nextStagePlanned)
    };
  }, [candidate, currentStageObj, nextStageObj, mountedTime]);

  // Unified timeline entries from notes & movements in Strict IST
  const timelineEntries = useMemo(() => {
    const entries = [];
    (notes || []).forEach(note => {
      const text = note.note_text || '';
      let actionType = 'Note Logged';
      let stageMatch = null;
      let badgeColor = '#64748b';
      let badgeBg = '#f1f5f9';

      if (text.includes('applied online') || text.includes('Application Reference ID')) {
        actionType = 'Online Application';
        stageMatch = 'S02';
        badgeColor = '#0369a1';
        badgeBg = '#e0f2fe';
      } else if (text.startsWith('Stage changed from')) {
        actionType = 'Stage Advancement';
        badgeColor = '#15803d';
        badgeBg = '#dcfce7';
        const parts = text.match(/Stage changed from (S\d{2}) to (S\d{2})/);
        if (parts && parts[2]) {
          stageMatch = parts[2];
        }
      } else if (text.includes('ADMIN STAGE OVERRIDE')) {
        actionType = 'Admin Override';
        badgeColor = '#b91c1c';
        badgeBg = '#fee2e2';
        const parts = text.match(/from (S\d{2}) to (S\d{2})/);
        if (parts && parts[2]) {
          stageMatch = parts[2];
        }
      } else if (text.startsWith('Candidate registered in S00') || text.startsWith('Candidate added')) {
        actionType = 'Manual Registration';
        stageMatch = 'S02';
        badgeColor = '#7e22ce';
        badgeBg = '#f3e8ff';
      }

      entries.push({
        id: note.id,
        timestamp: note.created_at,
        stage: stageMatch || editForm.current_stage || candidate?.current_stage || 'S02',
        actionType,
        badgeColor,
        badgeBg,
        actor: note.created_by || 'System',
        details: text
      });
    });

    if (!entries.some(e => e.actionType.includes('Application') || e.actionType.includes('Registration'))) {
      entries.push({
        id: 'initial_creation',
        timestamp: candidate?.created_at,
        stage: 'S02',
        actionType: 'Candidate Registered',
        badgeColor: '#0369a1',
        badgeBg: '#e0f2fe',
        actor: candidate?.created_by || 'Recruiter Desk',
        details: `Candidate profile created for "${candidate?.recruitment_positions?.title || 'Job Position'}".`
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return entries;
  }, [candidate, notes, editForm.current_stage]);

  useEffect(() => {
    if (isOpen && initialView === 'history') {
      const timer = setTimeout(() => {
        const el = document.getElementById('candidate-notes-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialView]);

  useEffect(() => {
    if (!candidate || !isOpen) return;

    let prof = candidate.applicant_profile || {};
    let evalData = candidate.evaluation || {};
    let s10Data = {};
    let s11Data = {};
    let s12Data = {};
    let rescheduleData = {};
    let noResponseData = {};
    let existingStageRemarks = '';
    if (candidate.joining_details) {
      try {
        const parsed = typeof candidate.joining_details === 'string' ? JSON.parse(candidate.joining_details) : candidate.joining_details;
        if (parsed && typeof parsed === 'object') {
          if (!prof.current_city) prof = parsed?.applicant_profile || prof;
          evalData = parsed?.evaluation || evalData;
          s10Data = parsed?.s10_doc_collection || {};
          s11Data = parsed?.s11_emp_mapping || {};
          s12Data = parsed?.s12_working_rating || {};
          rescheduleData = parsed?.reschedule_details || {};
          noResponseData = parsed?.no_response_details || {};
          existingStageRemarks = parsed?.stage_remarks || '';
        }
      } catch (_) {}
    }

    const defaultInitialStatus = candidate.candidate_status || getStatusOptions(candidate.current_stage || 'S02')[0] || 'Pending';

    // Initialize edit form
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditForm({
      name: candidate.name,
      email: candidate.email || '',
      phone: candidate.phone || '',
      alternate_phone: prof.alternate_phone || candidate.alternate_phone || '',
      current_stage: candidate.current_stage || 'S02',
      candidate_status: defaultInitialStatus,
      no_response_substatus: noResponseData.substatus || 'Call Not Picked / Ringing',
      no_response_remarks: noResponseData.remarks || '',
      reschedule_date: rescheduleData.reschedule_date || '',
      reschedule_remarks: rescheduleData.reschedule_remarks || '',
      stage_remarks: existingStageRemarks || '',
      interview_feedback: candidate.interview_feedback || '',
      interview_rating: evalData.interview_rating !== undefined ? evalData.interview_rating : (candidate.interview_rating || ''),
      technical_score: evalData.technical_score || candidate.technical_score || candidate.test_results || '',
      recommendation: evalData.recommendation || candidate.evaluation_recommendation || '',
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
      interviewer_name: candidate.interviewer_name || '',
      current_city: prof.current_city || candidate.current_city || '',
      total_experience: prof.total_experience || candidate.total_experience || '',
      highest_qualification: prof.highest_qualification || candidate.highest_qualification || '',
      notice_period: prof.notice_period || candidate.notice_period || '',
      current_salary: prof.current_salary || candidate.current_salary || '',
      cover_note: prof.cover_note || candidate.cover_note || '',
      // S10 Document Collection
      doc_collection_status: s10Data.status || 'Pending Documents',
      doc_checklist: s10Data.checklist || {},
      doc_remarks: s10Data.remarks || '',
      // S11 Employee ID & Mapping
      employee_id: s11Data.employee_id || candidate.employee_id || '',
      official_email: s11Data.official_email || '',
      biometric_id: s11Data.biometric_id || '',
      reporting_manager: s11Data.reporting_manager || '',
      assigned_branch: s11Data.assigned_branch || '',
      // S12 Employee Working Rating
      working_rating: s12Data.rating !== undefined ? s12Data.rating : '',
      probation_status: s12Data.probation_status || 'Under Probation',
      hod_working_remarks: s12Data.remarks || '',
      review_period: s12Data.review_period || '30-Day Review'
    });

  }, [candidate, isOpen]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'current_stage') {
      const currentStageNum = getStageNumber(candidate?.current_stage || 'S02');
      const targetStageNum = getStageNumber(value);

      const isDemotion = targetStageNum < currentStageNum;
      if (isDemotion && !canDecreaseStage) {
        alert(`Stage Demotion Restricted: Only Manager, Admin, or users with 'Demote / Decrease Recruiter Stage Power' can revert a candidate from ${candidate?.current_stage || 'S02'} back to ${value}.`);
        return;
      }

      const isJump = targetStageNum > currentStageNum + 1;
      if (isJump) {
        alert(`Stage Jump Restricted: Candidates must advance step-by-step (+1 stage only). You cannot jump directly from ${candidate?.current_stage || 'S02'} to ${value}. Please submit evaluations sequentially.`);
        return;
      }
    }

    setEditForm(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      if (name === 'current_stage') {
        updated.candidate_status = resolveStatusOptions(value)[0];
      }
      return updated;
    });
  };

  const handleSave = async () => {
    // Guard against stage demotion on save
    if (candidate?.current_stage && editForm.current_stage) {
      const oldStageNum = getStageNumber(candidate.current_stage);
      const newStageNum = getStageNumber(editForm.current_stage);

      const isDemotion = newStageNum < oldStageNum;
      if (isDemotion && !canDecreaseStage) {
        alert(`Stage Demotion Restricted: Only Manager, Admin, or users with 'Demote / Decrease Recruiter Stage Power' can revert a candidate back to lower stages.`);
        return;
      }

      // Universal Stage Jump Restriction (no direct skipping stages in profile panel)
      if (newStageNum > oldStageNum + 1) {
        alert(`Stage Jump Restricted: Candidates must advance step-by-step (+1 stage only). You cannot jump directly from ${candidate.current_stage} to ${editForm.current_stage}. Please submit evaluations sequentially.`);
        return;
      }

      // Strict Gate-Check Validation when promoting to Next Stage (for standard recruiters)
      if (newStageNum > oldStageNum && !canDecreaseStage) {

        // Gate-Check 1: S02 -> S03
        if (candidate.current_stage === 'S02') {
          const st = (editForm.candidate_status || '').toLowerCase();
          if (st.includes('awaiting') || st.includes('reject')) {
            alert("Gate-Check Required: Candidate status must be 'Resume Selected' or qualified before moving to S03 (Interview).");
            return;
          }
        }

        // Gate-Check 2: S03 -> S04/S05
        if (candidate.current_stage === 'S03') {
          if (!editForm.interviewer_name?.trim()) {
            alert("Gate-Check Required: Please enter Interviewer Name for S03 before advancing.");
            return;
          }
          if (!editForm.interview_feedback?.trim() && !editForm.interview_rating) {
            alert("Gate-Check Required: Please log Interview Rating or Feedback comments before advancing from S03.");
            return;
          }
        }

        // Gate-Check 3: S04 -> S05
        if (candidate.current_stage === 'S04') {
          if (!editForm.test_results?.trim() && !editForm.technical_score?.trim()) {
            alert("Gate-Check Required: Please enter Test Score / Machine Trial Results before advancing from S04.");
            return;
          }
        }

        // Gate-Check 4: S05 -> S06
        if (candidate.current_stage === 'S05') {
          if (editForm.ed_approval_status !== 'Approved') {
            alert("Gate-Check Required: Candidate must be 'Approved' in S05 (ED / Final Confirmation) before moving to S06 (Salary Negotiation).");
            return;
          }
        }

        // Gate-Check 5: S06 -> S07/S08
        if (candidate.current_stage === 'S06') {
          if (!editForm.actual_salary || parseInt(editForm.actual_salary, 10) <= 0) {
            alert("Gate-Check Required: Please specify the Actual Negotiated Salary (₹/month) in S06 before issuing offer / shortlist.");
            return;
          }
        }

        // Gate-Check 6: S08 -> S09
        if (candidate.current_stage === 'S08') {
          if (editForm.loi_status !== 'Accepted') {
            alert("Gate-Check Required: LOI / Offer Letter status must be 'LOI Accepted' before candidate can be marked as Joined (S09).");
            return;
          }
        }

        // Gate-Check 7: S09 -> S10
        if (candidate.current_stage === 'S09') {
          if (!editForm.actual_joining_date) {
            alert("Gate-Check Required: Actual Joined Date must be entered in S09 before candidate can advance to S10 (Document Collection).");
            return;
          }
        }

        // Gate-Check 8: S10 -> S11
        if (candidate.current_stage === 'S10') {
          const docSt = (editForm.candidate_status || editForm.doc_collection_status || '').toLowerCase();
          if (docSt.includes('pending') || docSt.includes('discrepancy')) {
            alert("Gate-Check Required: Document status must be verified ('Documents Submitted' or 'KYC & Verification Completed') before moving to S11 (Employee ID & Final Mapping).");
            return;
          }
        }

        // Gate-Check 9: S11 -> S12
        if (candidate.current_stage === 'S11') {
          if (!editForm.employee_id?.trim()) {
            alert("Gate-Check Required: Please enter official Employee ID in S11 before advancing to S12 (Employee Working Rating).");
            return;
          }
        }
      }
    }

    setIsSaving(true);
    try {
      let currentJoiningObj = {};
      try {
        if (editForm.joining_details) {
          currentJoiningObj = typeof editForm.joining_details === 'string'
            ? JSON.parse(editForm.joining_details)
            : JSON.parse(JSON.stringify(editForm.joining_details));
        }
      } catch (_) {}

      const updatedApplicantProfile = {
        ...(currentJoiningObj.applicant_profile || {}),
        current_city: editForm.current_city || '',
        total_experience: editForm.total_experience || '',
        highest_qualification: editForm.highest_qualification || '',
        notice_period: editForm.notice_period || '',
        current_salary: editForm.current_salary ? parseInt(editForm.current_salary) : null,
        cover_note: editForm.cover_note || '',
        alternate_phone: editForm.alternate_phone || ''
      };

      currentJoiningObj.applicant_profile = updatedApplicantProfile;
      currentJoiningObj.evaluation = {
        interview_rating: editForm.interview_rating ? parseFloat(editForm.interview_rating) : null,
        technical_score: editForm.technical_score || '',
        recommendation: editForm.recommendation || ''
      };

      // Store S10, S11, S12 structured metadata safely inside joining_details
      currentJoiningObj.s10_doc_collection = {
        status: editForm.doc_collection_status || editForm.candidate_status || '',
        checklist: editForm.doc_checklist || {},
        remarks: editForm.doc_remarks || ''
      };
      currentJoiningObj.s11_emp_mapping = {
        employee_id: editForm.employee_id || '',
        official_email: editForm.official_email || '',
        biometric_id: editForm.biometric_id || '',
        reporting_manager: editForm.reporting_manager || '',
        assigned_branch: editForm.assigned_branch || ''
      };
      currentJoiningObj.s12_working_rating = {
        rating: editForm.working_rating ? parseFloat(editForm.working_rating) : null,
        probation_status: editForm.probation_status || '',
        remarks: editForm.hod_working_remarks || '',
        review_period: editForm.review_period || ''
      };

      if (editForm.candidate_status === 'No Response') {
        currentJoiningObj.no_response_details = {
          substatus: editForm.no_response_substatus || 'Call Not Picked / Ringing',
          updated_at: new Date().toISOString()
        };
      } else if (editForm.candidate_status === 'ReSchedule') {
        currentJoiningObj.reschedule_details = {
          reschedule_date: editForm.reschedule_date || '',
          updated_at: new Date().toISOString()
        };
      }

      const payload = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        current_stage: editForm.current_stage,
        candidate_status: editForm.candidate_status,
        interview_feedback: editForm.interview_feedback || '',
        test_results: editForm.test_results || editForm.technical_score || '',
        ed_approval_status: editForm.ed_approval_status || 'Pending',
        salary_negotiation_details: editForm.salary_negotiation_details || '',
        formal_structure_approved: !!editForm.formal_structure_approved,
        loi_status: editForm.loi_status || 'Not Offered',
        joining_date: (editForm.joining_date && !editForm.joining_date.includes('NaN')) ? editForm.joining_date : null,
        actual_joining_date: (editForm.actual_joining_date && !editForm.actual_joining_date.includes('NaN')) ? editForm.actual_joining_date : null,
        expected_salary_min: editForm.expected_salary_min ? parseInt(editForm.expected_salary_min) : null,
        expected_salary_max: editForm.expected_salary_max ? parseInt(editForm.expected_salary_max) : null,
        actual_salary: editForm.actual_salary ? parseInt(editForm.actual_salary) : null,
        resume_url: editForm.resume_url || '',
        interviewer_name: editForm.interviewer_name || '',
        joining_details: JSON.stringify(currentJoiningObj)
      };

      const changes = {
        id: candidate.id,
        ...payload,
        alternate_phone: editForm.alternate_phone || '',
        current_city: editForm.current_city || '',
        total_experience: editForm.total_experience || '',
        highest_qualification: editForm.highest_qualification || '',
        notice_period: editForm.notice_period || '',
        current_salary: editForm.current_salary ? parseInt(editForm.current_salary, 10) : null,
        cover_note: editForm.cover_note || '',
        interview_rating: editForm.interview_rating ? parseFloat(editForm.interview_rating) : null,
        technical_score: editForm.technical_score || '',
        recommendation: editForm.recommendation || ''
      };

      let note = '';
      // Audit Logging: Log stage change OR status update (especially No Response / ReSchedule)
      if (candidate.current_stage !== editForm.current_stage) {
        note = `Stage changed from ${candidate.current_stage} to ${editForm.current_stage}`;
      } else {
        if (editForm.candidate_status === 'No Response') {
          note = `Status set to No Response (${editForm.no_response_substatus || 'Call Not Picked / Ringing'})`;
        } else if (editForm.candidate_status === 'ReSchedule') {
          const dtStr = editForm.reschedule_date ? formatIST(editForm.reschedule_date) : 'Pending Date';
          note = `Status set to ReSchedule (Target: ${dtStr})`;
        } else if (candidate.candidate_status !== editForm.candidate_status) {
          note = `Status updated to ${editForm.candidate_status}`;
        }
      }

      const saveRes = await submitRecruiterChange(recruiterScope, 'candidate:save', changes, {
        expected: candidate.updated_at, candidateId: candidate.id, note
      });
      if (!saveRes?.success) throw new Error(saveRes?.error || 'Candidate save failed.');
      if (saveRes.queued) showSyncToast('Candidate change saved offline. It will sync when you reconnect.', 'success');

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

    try {
      const saved = await submitRecruiterChange(recruiterScope, 'note:add', {
        candidate_id: candidate.id, note_text: newNote.trim()
      }, { candidateId: candidate.id });
      if (!saved?.success) throw new Error(saved?.error || 'Candidate note could not be saved.');
      if (saved.queued) showSyncToast('Note saved offline. It will sync when you reconnect.', 'success');
      setNewNote('');
    } catch (err) {
      alert("Error adding note: " + err.message);
    }
  };

  if (!isOpen || !candidate) return null;

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: 'rgba(9, 13, 22, 0.65)', 
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1rem'
      }} 
      onClick={onClose}
    >
      <div 
        className="card"
        onClick={e => e.stopPropagation()}
        style={{ 
          width: '1180px', 
          maxWidth: '96vw', 
          maxHeight: '92vh', 
          height: '90vh',
          backgroundColor: 'var(--bg-surface)', 
          borderRadius: '16px', 
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)', 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Pinned Sticky Header */}
        <div style={{ padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
              <User size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Candidate Profile</h2>
                <span style={{ 
                  fontSize: '0.7rem', fontWeight: 700, 
                  padding: '0.15rem 0.5rem', borderRadius: '12px',
                  background: 'var(--accent-color)', color: '#fff'
                }}>
                  {editForm.current_stage || candidate.current_stage || 'S02'}
                </span>
                <span style={{ 
                  fontSize: '0.7rem', fontWeight: 600,
                  padding: '0.15rem 0.5rem', borderRadius: '12px',
                  background: 'var(--bg-surface-variant)', border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)'
                }}>
                  {editForm.candidate_status || candidate.candidate_status || 'Pending'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', color: 'var(--text-secondary)', borderRadius: '6px' }} title="Close">
            <X size={20} />
          </button>
        </div>

        {/* Top 1-Line Compact Summary Bar */}
        <div style={{
          padding: '0.65rem 1.5rem',
          background: 'var(--bg-surface-variant, #f8fafc)',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          flexShrink: 0,
          fontSize: '0.8rem'
        }}>
          {/* Left: Name, Code & Position */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                {editForm.name || candidate.name || 'Candidate'}
              </span>
              {candidate.candidate_code && (
                <span style={{ 
                  fontSize: '0.68rem', fontFamily: 'monospace', 
                  padding: '0.1rem 0.4rem', borderRadius: '4px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)', fontWeight: 600
                }}>
                  {candidate.candidate_code}
                </span>
              )}
            </div>

            <div style={{ color: 'var(--border-light)', display: 'inline-block' }}>|</div>

            {/* Position & Dept */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
              <Briefcase size={14} style={{ color: 'var(--accent-color)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {candidate.recruitment_positions?.title || 'Position'}
              </span>
              {candidate.recruitment_positions?.department && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  ({candidate.recruitment_positions.department})
                </span>
              )}
              {(candidate.position_id || candidate.recruitment_positions?.id) && (
                <span style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.1rem 0.4rem', 
                  borderRadius: '4px', 
                  background: '#eff6ff', 
                  border: '1px solid #bfdbfe', 
                  color: '#1d4ed8', 
                  fontWeight: 600 
                }}>
                  {`POS-${String(candidate.position_id || candidate.recruitment_positions?.id).substring(0, 8).toUpperCase()}`}
                </span>
              )}
            </div>
          </div>

          {/* Right: Phone, Click-to-call, Email, Contact Info toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            {/* Phone & Click-to-Call */}
            {editForm.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <a 
                  href={`tel:${editForm.phone}`}
                  style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', 
                    color: '#0284c7', textDecoration: 'none', fontWeight: 600,
                    padding: '0.2rem 0.5rem', borderRadius: '6px',
                    background: '#e0f2fe', border: '1px solid #bae6fd'
                  }}
                  title="Click to dial"
                >
                  <Phone size={12} />
                  <span>{editForm.phone}</span>
                </a>
                <a 
                  href={`https://wa.me/91${String(editForm.phone).replace(/[^0-9]/g, '').slice(-10)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                    color: '#15803d', textDecoration: 'none', fontWeight: 600,
                    fontSize: '0.72rem', padding: '0.2rem 0.45rem', borderRadius: '6px',
                    background: '#dcfce7', border: '1px solid #bbf7d0'
                  }}
                  title="Open WhatsApp chat"
                >
                  💬 WA
                </a>
              </div>
            )}

            {/* Email */}
            {editForm.email && (
              <a 
                href={`mailto:${editForm.email}`}
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  color: 'var(--text-secondary)', textDecoration: 'none',
                  padding: '0.2rem 0.5rem', borderRadius: '6px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)'
                }}
                title="Send Email"
              >
                <Mail size={12} />
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {editForm.email}
                </span>
              </a>
            )}

            {/* Resume button if exists */}
            {editForm.resume_url && (
              <a 
                href={editForm.resume_url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 600,
                  fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-light)'
                }}
              >
                <FileText size={12} /> Resume
              </a>
            )}

            {/* Toggle Full Candidate Bio button */}
            <button
              type="button"
              onClick={() => setShowFullBio(prev => !prev)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                fontSize: '0.72rem', fontWeight: 600,
                padding: '0.25rem 0.6rem', borderRadius: '6px',
                border: '1px solid var(--border-light)',
                background: showFullBio ? 'var(--accent-color)' : 'var(--bg-surface)',
                color: showFullBio ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              title="Toggle full candidate contact & personal information"
            >
              {showFullBio ? (
                <>Hide Bio <ChevronUp size={12} /></>
              ) : (
                <>Edit Bio <ChevronDown size={12} /></>
              )}
            </button>
          </div>
        </div>

        {/* 2-Column Main Workspace */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 0.85fr)',
          gap: '1.25rem',
          padding: '1.25rem 1.5rem',
          overflow: isMobile ? 'auto' : 'hidden',
          minHeight: 0
        }}>
          {/* COLUMN 1: Stage Status & Actions (Left) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            overflowY: 'auto',
            paddingRight: isMobile ? 0 : '0.5rem',
            minHeight: 0
          }}>
            {/* Collapsible Candidate Contact & Profile Details (if toggled) */}
            {showFullBio && (
              <div className="card" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--accent-color)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <User size={15} /> Candidate Contact &amp; Bio Details
                  </h3>
                  <button 
                    type="button" 
                    onClick={() => setShowFullBio(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem' }}
                  >
                    Close ✕
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Candidate Name</label>
                  <input name="name" value={editForm.name || ''} onChange={handleInputChange} disabled={!canEdit} style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Mobile Number</label>
                    <input name="phone" value={editForm.phone || ''} onChange={handleInputChange} disabled={!canEdit} type="tel" maxLength={10} style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Alternate Mobile Number</label>
                    <input name="alternate_phone" value={editForm.alternate_phone || ''} onChange={handleInputChange} disabled={!canEdit} type="tel" maxLength={10} placeholder="Optional 10-digit" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
                    <input name="email" value={editForm.email || ''} onChange={handleInputChange} disabled={!canEdit} type="email" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>City / Location</label>
                    <input name="current_city" value={editForm.current_city || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="e.g. Ludhiana, Punjab" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Experience</label>
                    <input name="total_experience" value={editForm.total_experience || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="e.g. 2 - 3 Years" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Highest Qualification</label>
                    <input name="highest_qualification" value={editForm.highest_qualification || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="e.g. B.Tech / MBA" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Salary (₹/month)</label>
                    <input name="current_salary" value={editForm.current_salary || ''} onChange={handleInputChange} disabled={!canEdit} type="number" placeholder="Current Salary" style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expected Salary Min - Max</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input name="expected_salary_min" value={editForm.expected_salary_min || ''} onChange={handleInputChange} disabled={!canEdit} type="number" placeholder="Min" style={{ width: '50%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                      <input name="expected_salary_max" value={editForm.expected_salary_max || ''} onChange={handleInputChange} disabled={!canEdit} type="number" placeholder="Max" style={{ width: '50%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                    </div>
                  </div>
                </div>

                {editForm.cover_note && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Key Skills &amp; Remarks</label>
                    <div style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-variant, #f1f5f9)', fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {editForm.cover_note}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Resume URL / CV Link</span>
                    {editForm.resume_url && (
                      <a href={editForm.resume_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem' }}>
                        <FileText size={12} /> Open Link
                      </a>
                    )}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input name="resume_url" value={editForm.resume_url || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="https://drive.google.com/... or upload" style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border-light)', minWidth: 0 }} />
                    <label className="btn-secondary" style={{ display: 'inline-flex', padding: '0.45rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface-variant)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: !canEdit ? 'not-allowed' : 'pointer', opacity: !canEdit ? 0.6 : 1, whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {uploadingResume ? 'Uploading...' : 'Upload'}
                      <input type="file" accept=".pdf,.doc,.docx,.rtf,.txt" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploadingResume || !canEdit} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Main Stage & Status Card */}
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Briefcase size={16} /> Recruitment Stage &amp; Status
                </h3>
                {!showFullBio && (
                  <button 
                    type="button" 
                    onClick={() => setShowFullBio(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-color)', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  >
                    View / Edit Candidate Bio ▾
                  </button>
                )}
              </div>

              {/* Current Stage */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Current Stage</label>
                <select name="current_stage" value={editForm.current_stage || 'S02'} onChange={handleInputChange} disabled={!canEdit} style={{ padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>
                  {STAGES.map(s => {
                    const currentStageNum = getStageNumber(candidate?.current_stage || 'S02');
                    const stageNum = getStageNumber(s.id);
                    const isNext = stageNum === currentStageNum + 1;
                    const isDemotion = stageNum < currentStageNum;
                    const isJump = stageNum > currentStageNum + 1;

                    const isOptionDisabled = isJump || (isDemotion && !canDecreaseStage);
                    let badge = '';
                    if (isJump) badge = '🚫 (Jump Restricted — +1 Only)';
                    else if (isDemotion && !canDecreaseStage) badge = '🔒 (Decrease Restricted)';
                    else if (isNext) badge = '➜ (Next Stage)';

                    return (
                      <option key={s.id} value={s.id} disabled={isOptionDisabled}>
                        {s.label} {badge}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Candidate Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Candidate Status</label>
                <select name="candidate_status" value={editForm.candidate_status || ''} onChange={handleInputChange} disabled={!canEdit} style={{ padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}>
                  {resolveStatusOptions(editForm.current_stage || 'S02').map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Conditional No Response Sub-Status & Notes */}
              {editForm.candidate_status === 'No Response' && (
                <div style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  marginTop: '0.15rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    📵 No Response Reason / Sub-Status
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Sub-Status *</label>
                    <select
                      name="no_response_substatus"
                      value={editForm.no_response_substatus || 'Call Not Picked / Ringing'}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.78rem', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }}
                    >
                      {NO_RESPONSE_SUBSTATUS_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Conditional ReSchedule Details Input */}
              {editForm.candidate_status === 'ReSchedule' && (
                <div style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  marginTop: '0.15rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={13} /> 📅 Rescheduled Follow-Up Details (IST)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Rescheduled Date & Time (IST) *</label>
                    <input 
                      type="datetime-local" 
                      name="reschedule_date" 
                      value={editForm.reschedule_date || ''} 
                      onChange={handleInputChange} 
                      disabled={!canEdit} 
                      style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.78rem', backgroundColor: 'var(--bg-surface)', fontWeight: 600 }} 
                    />
                  </div>
                </div>
              )}

              {/* Planned vs Actual TAT SLA Timeline Widget (Models 1 & 2) */}
              <div style={{
                background: 'var(--bg-surface-variant, #f8fafc)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginTop: '0.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={13} /> Stage TAT SLA &amp; Timeline (IST)
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '10px',
                    background: timelineData.isOverdue ? '#fee2e2' : '#dcfce7',
                    color: timelineData.isOverdue ? '#991b1b' : '#166534'
                  }}>
                    {timelineData.isOverdue ? `⚠️ Delayed by ${timelineData.diffHours}h` : `✓ On Track (TAT: ${timelineData.currentTatHours}h)`}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', fontWeight: 600 }}>Planned Stage Target</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{timelineData.plannedTargetStr}</div>
                  </div>
                  {nextStageObj && (
                    <div style={{ background: 'var(--bg-surface)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', fontWeight: 600 }}>Next Stage Target ({nextStageObj.id})</div>
                      <div style={{ fontWeight: 700, color: 'var(--accent-color)' }}>{timelineData.nextStagePlannedStr}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* S03 Details */}
              {editForm.current_stage >= 'S03' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Interviewer Name (S03)</label>
                    <input name="interviewer_name" value={editForm.interviewer_name || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="Enter interviewer name..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>⭐ Interview Rating (1 - 5)</label>
                      <select name="interview_rating" value={editForm.interview_rating || ''} onChange={handleInputChange} disabled={!canEdit} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                        <option value="">Select Rating...</option>
                        <option value="5">⭐⭐⭐⭐⭐ 5.0 (Exceptional)</option>
                        <option value="4.5">⭐⭐⭐⭐½ 4.5 (Very Strong)</option>
                        <option value="4">⭐⭐⭐⭐ 4.0 (Strong / Qualified)</option>
                        <option value="3.5">⭐⭐⭐½ 3.5 (Good)</option>
                        <option value="3">⭐⭐⭐ 3.0 (Average)</option>
                        <option value="2">⭐⭐ 2.0 (Below Average)</option>
                        <option value="1">⭐ 1.0 (Unsuitable)</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Evaluation Outcome</label>
                      <select name="recommendation" value={editForm.recommendation || ''} onChange={handleInputChange} disabled={!canEdit} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                        <option value="">Select Decision...</option>
                        <option value="Strong Hire">🟢 Strong Hire (Top Match)</option>
                        <option value="Hire">🟢 Hire (Recommended)</option>
                        <option value="Hold">🟡 On Hold / Second Review</option>
                        <option value="Reject">🔴 Reject</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ClipboardList size={14} /> Interview Feedback (S03)</label>
                    <textarea name="interview_feedback" value={editForm.interview_feedback || ''} onChange={handleInputChange} disabled={!canEdit} rows={2} placeholder="Log interview comments, strengths, weaknesses..." style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                  </div>
                </div>
              )}

              {/* S04 Details */}
              {editForm.current_stage >= 'S04' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><FileText size={14} /> Test &amp; Skill Evaluation (S04)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Test Marks / %</label>
                      <input name="technical_score" value={editForm.technical_score || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="e.g. 85% or 45/50" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Remarks / Test Status</label>
                      <input name="test_results" value={editForm.test_results || ''} onChange={handleInputChange} disabled={!canEdit} placeholder="e.g. Test Passed / Machine Test Done" style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* S05 Details */}
              {editForm.current_stage >= 'S05' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ShieldCheck size={14} /> S05 — Final Confirmation / Approval</label>
                  <select name="ed_approval_status" value={editForm.ed_approval_status || 'Pending'} onChange={handleInputChange} disabled={!canEdit} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                    <option value="Pending">Final Confirmation Pending</option>
                    <option value="Approved">Approved &amp; Confirmed</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              )}

              {/* S06 Details */}
              {editForm.current_stage >= 'S06' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><DollarSign size={14} /> Salary Negotiation (S06)</label>
                    <textarea name="salary_negotiation_details" value={editForm.salary_negotiation_details || ''} onChange={handleInputChange} disabled={!canEdit} rows={2} placeholder="Offered salary, perks, notice period discussion..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Actual Negotiated Salary (₹/month)</label>
                    <input name="actual_salary" value={editForm.actual_salary || ''} onChange={handleInputChange} disabled={!canEdit} type="number" placeholder="Enter actual negotiated salary..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }} />
                  </div>
                </div>
              )}

              {/* S07 Details */}
              {editForm.current_stage >= 'S07' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
                  <input type="checkbox" id="formal_structure_approved" name="formal_structure_approved" checked={editForm.formal_structure_approved || false} onChange={handleInputChange} disabled={!canEdit} style={{ width: '16px', height: '16px' }} />
                  <label htmlFor="formal_structure_approved" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', cursor: !canEdit ? 'not-allowed' : 'pointer' }}>Formal Structure Approved for Shortlist (S07)</label>
                </div>
              )}

              {/* S08 Details */}
              {editForm.current_stage >= 'S08' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={14} /> LOI / Offer Letter Status (S08)</label>
                    <select name="loi_status" value={editForm.loi_status || 'Not Offered'} onChange={handleInputChange} disabled={!canEdit} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                      <option value="Not Offered">LOI Not Offered</option>
                      <option value="Sent">LOI Sent to Candidate</option>
                      <option value="Accepted">LOI Accepted</option>
                      <option value="Declined">LOI Declined</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={14} /> Expected Joining Date (S08)</label>
                    <input type="date" name="joining_date" value={editForm.joining_date || ''} onChange={handleInputChange} disabled={!canEdit} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              )}

              {/* S09 Details */}
              {editForm.current_stage >= 'S09' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Calendar size={14} /> Actual Joined Date (S09)</label>
                    <input type="date" name="actual_joining_date" value={editForm.actual_joining_date || ''} onChange={handleInputChange} disabled={!canEdit} style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CheckCircle2 size={14} /> Joining Details &amp; Formalities (S09)</label>
                    <textarea name="joining_details" value={editForm.joining_details || ''} onChange={handleInputChange} disabled={!canEdit} rows={2} placeholder="Document checklist, induction status..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }} />
                  </div>
                </div>
              )}

              {/* S10 Details - Document Collection */}
              {getStageNumber(editForm.current_stage) >= 10 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      📁 S10 — Document Collection Checklist
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 700, background: '#fff7ed', padding: '0.15rem 0.5rem', borderRadius: '10px', border: '1px solid #ffedd5' }}>
                      {Object.values(editForm.doc_checklist || {}).filter(Boolean).length} / 8 Collected
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', background: 'var(--bg-surface-variant, #f8fafc)', padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    {[
                      { id: 'aadhar', label: 'Aadhar Card (UIDAI)' },
                      { id: 'pan', label: 'PAN Card' },
                      { id: 'relieving', label: 'Relieving / Exp Letter' },
                      { id: 'salary_slips', label: 'Last 3 Mo Salary Slips' },
                      { id: 'educational', label: 'Marksheets / Degrees' },
                      { id: 'bank', label: 'Bank Passbook / Cheque' },
                      { id: 'photos', label: 'Passport Photos (4)' },
                      { id: 'medical', label: 'Medical Fitness Cert' }
                    ].map(doc => (
                      <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', cursor: canEdit ? 'pointer' : 'default', color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(editForm.doc_checklist?.[doc.id])}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditForm(prev => ({
                              ...prev,
                              doc_checklist: { ...(prev.doc_checklist || {}), [doc.id]: checked }
                            }));
                          }}
                          style={{ width: '14px', height: '14px' }}
                        />
                        <span>{doc.label}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Verification Status (S10)</label>
                    <select
                      name="doc_collection_status"
                      value={editForm.doc_collection_status || 'Pending Documents'}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                    >
                      <option value="Pending Documents">Pending Documents</option>
                      <option value="Documents Submitted">Documents Submitted</option>
                      <option value="KYC &amp; Verification Completed">KYC &amp; Verification Completed</option>
                      <option value="Discrepancy Found">Discrepancy Found</option>
                      <option value="Hold">Hold</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Document Remarks &amp; Notes</label>
                    <textarea
                      name="doc_remarks"
                      value={editForm.doc_remarks || ''}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      rows={2}
                      placeholder="Missing documents, verification notes, or pending items..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}

              {/* S11 Details - Employee ID & Final Mapping */}
              {getStageNumber(editForm.current_stage) >= 11 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    🆔 S11 — Employee ID &amp; Final Mapping
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Official Employee ID *</label>
                      <input
                        name="employee_id"
                        value={editForm.employee_id || ''}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        placeholder="e.g. 50761 or EMP-010"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontWeight: 700, color: '#312e81' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Biometric Device / Punch ID</label>
                      <input
                        name="biometric_id"
                        value={editForm.biometric_id || ''}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        placeholder="e.g. BIO-50761"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Reporting Manager / HOD</label>
                      <input
                        name="reporting_manager"
                        value={editForm.reporting_manager || ''}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        placeholder="e.g. Rajesh Sharma"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Assigned Branch / Location</label>
                      <input
                        name="assigned_branch"
                        value={editForm.assigned_branch || ''}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        placeholder="e.g. TNT00002-B0002 Raian"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Official Company Email</label>
                    <input
                      name="official_email"
                      type="email"
                      value={editForm.official_email || ''}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      placeholder="e.g. employee@newswangroup.com"
                      style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                    />
                  </div>
                </div>
              )}

              {/* S12 Details - Employee Working Rating */}
              {getStageNumber(editForm.current_stage) >= 12 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', width: '100%' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    ⭐ S12 — Employee Working Rating &amp; Probation Evaluation
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>⭐ Working Rating (1 - 5 Stars)</label>
                      <select
                        name="working_rating"
                        value={editForm.working_rating || ''}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <option value="">Select Star Rating...</option>
                        <option value="5">⭐⭐⭐⭐⭐ 5.0 (Outstanding)</option>
                        <option value="4.5">⭐⭐⭐⭐½ 4.5 (Very Strong)</option>
                        <option value="4">⭐⭐⭐⭐ 4.0 (Good / Confirmed)</option>
                        <option value="3.5">⭐⭐⭐½ 3.5 (Above Average)</option>
                        <option value="3">⭐⭐⭐ 3.0 (Satisfactory / Meets Expectations)</option>
                        <option value="2">⭐⭐ 2.0 (Needs Improvement)</option>
                        <option value="1">⭐ 1.0 (Unsatisfactory / Early Exit)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Review Milestone</label>
                      <select
                        name="review_period"
                        value={editForm.review_period || '30-Day Review'}
                        onChange={handleInputChange}
                        disabled={!canEdit}
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <option value="30-Day Review">30-Day Review</option>
                        <option value="60-Day Review">60-Day Review</option>
                        <option value="90-Day Review (Final Confirmation)">90-Day Review (Final Confirmation)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Probation Decision</label>
                    <select
                      name="probation_status"
                      value={editForm.probation_status || 'Under Probation'}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
                    >
                      <option value="Under Probation">Under Probation</option>
                      <option value="Confirmed (Good)">Confirmed (Good / Permanent)</option>
                      <option value="Average (Needs Monitoring)">Average (Needs Monitoring)</option>
                      <option value="Probation Extended">Probation Extended (30 Days)</option>
                      <option value="Early Left / Resigned">Early Left / Resigned</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>HOD Working Review &amp; Feedback</label>
                    <textarea
                      name="hod_working_remarks"
                      value={editForm.hod_working_remarks || ''}
                      onChange={handleInputChange}
                      disabled={!canEdit}
                      rows={2}
                      placeholder="Work performance, punctuality, machine skill, team collaboration..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Save Profile Button inside Column 1 */}
            {canEdit ? (
              <button onClick={handleSave} disabled={isSaving} className="btn-primary" style={{ justifyContent: 'center', width: '100%', padding: '0.75rem', borderRadius: '8px', fontWeight: 600 }}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Save Profile Updates"}
              </button>
            ) : (
              <div style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface-variant)',
                border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                fontSize: '0.85rem', fontWeight: 600, width: '100%', boxSizing: 'border-box'
              }}>
                🔒 Read-Only (Stage View Access Only)
              </div>
            )}
          </div>

          {/* COLUMN 2: Stage History & Activity Log + Bottom Note Input (Right) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            overflow: 'hidden',
            minHeight: 0,
            height: '100%'
          }}>
            {/* Column 2 Header */}
            <div style={{
              padding: '0.85rem 1rem',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-surface-variant, #f8fafc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <History size={15} style={{ color: 'var(--accent-color)' }} /> Stage History &amp; Activity Log
                </h3>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Chronological trail &amp; remarks (Strict IST)
                </span>
              </div>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700,
                padding: '0.15rem 0.5rem', borderRadius: '10px',
                background: 'var(--accent-color)', color: '#fff'
              }}>
                {timelineEntries.length} Events
              </span>
            </div>

            {/* Column 2 Scrollable Timeline Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              minHeight: 0
            }}>
              {timelineEntries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  <History size={28} style={{ opacity: 0.3, margin: '0 auto 0.5rem auto' }} />
                  <p style={{ margin: 0, fontStyle: 'italic' }}>No stage movements or notes recorded yet.</p>
                </div>
              ) : (
                timelineEntries.map((entry, idx) => (
                  <div 
                    key={entry.id || idx}
                    style={{
                      padding: '0.75rem 0.85rem',
                      background: 'var(--bg-surface-variant, #f8fafc)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          padding: '0.1rem 0.45rem', borderRadius: '6px',
                          background: entry.badgeBg, color: entry.badgeColor
                        }}>
                          {entry.actionType}
                        </span>
                        {entry.stage && (
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 600,
                            padding: '0.08rem 0.35rem', borderRadius: '4px',
                            background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                            color: 'var(--text-secondary)'
                          }}>
                            {entry.stage}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={11} /> {formatIST(entry.timestamp)}
                      </span>
                    </div>

                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                      {entry.details}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      <span>By: <strong style={{ color: 'var(--text-primary)' }}>{entry.actor}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Column 2 Pinned Footer: Note Box & Add Note Button */}
            <div style={{
              padding: '0.75rem 1rem',
              borderTop: '1px solid var(--border-light)',
              background: 'var(--bg-surface-variant, #f8fafc)',
              flexShrink: 0
            }}>
              <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={newNote} 
                  onChange={e => setNewNote(e.target.value)} 
                  disabled={!canEdit}
                  placeholder={canEdit ? "Write candidate remark / note..." : "Read-only access"} 
                  style={{ 
                    flex: 1, 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-light)', 
                    fontSize: '0.82rem', 
                    backgroundColor: !canEdit ? 'var(--bg-surface-variant)' : 'var(--bg-surface)',
                    color: 'var(--text-primary)'
                  }} 
                />
                <button 
                  type="submit" 
                  disabled={!canEdit || !newNote.trim()} 
                  className="btn-primary"
                  style={{ 
                    padding: '0.5rem 0.85rem', 
                    borderRadius: '8px',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    opacity: !canEdit || !newNote.trim() ? 0.6 : 1,
                    cursor: !canEdit || !newNote.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Send size={13} />
                  <span>Add Note</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Modal Pinned Sticky Footer */}
        <div style={{ 
          padding: '0.75rem 1.5rem', 
          borderTop: '1px solid var(--border-light)', 
          background: 'var(--bg-surface)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexShrink: 0, 
          gap: '1rem', 
          flexWrap: 'wrap' 
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Current Stage: <strong style={{ color: 'var(--text-primary)' }}>{candidate?.current_stage || 'S02'}</strong></span>
            <span>•</span>
            <span>Status: <strong style={{ color: 'var(--accent-color)' }}>{candidate?.candidate_status || 'Pending'}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={onClose} 
              style={{ padding: '0.45rem 1.15rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
            >
              Cancel
            </button>
            {canEdit && (
              <button 
                type="button" 
                onClick={handleSave} 
                disabled={isSaving} 
                className="btn-primary" 
                style={{ padding: '0.45rem 1.4rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem' }}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Save Profile Updates"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
