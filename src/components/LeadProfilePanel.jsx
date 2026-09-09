'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { logAuditAction } from '@/app/actions/audit';
import { getLeadCallHistory } from '@/app/actions/team';
import { enqueueOfflineAction, canPerformOfflineAction } from '@/utils/offlineSync';
import { normalizeLeadRecord, normalizeEmployeeName } from '@/utils/dataSanitizer';
import { X, Send, Play, Pause, Phone, Volume2, RotateCw, Mic, MicOff, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { triggerWhatsappAutomationForStage } from '@/app/actions/whatsapp';

// Standard 7 CRM Stages Fallback Definition
const DEFAULT_STAGES = [
  { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
  { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] }
];

const DEFAULT_CLIENT_STATUSES = ['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress'];

const DEFAULT_PRIORITIES = [
  'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
  'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
  'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
];

const INVESTMENT_OPTIONS = [
  'Below 1 Lakh',
  '1 Lakh - 5 Lakh',
  '5 Lakh - 10 Lakh',
  '10 Lakh - 25 Lakh',
  '25 Lakh - 50 Lakh',
  'Above 50 Lakh'
];

const BUYING_TIMELINE_OPTIONS = [
  'Immediate',
  'Within 7 Days',
  'Within 15 Days',
  'Within 30 Days',
  'Within 60 Days',
  'After 60 Days',
  'Not Decided'
];

const DEFAULT_BUSINESS_TYPES = [
  'Dealer',
  'Distributor',
  'Retailer',
  'Farmer',
  'Trader',
  'Manufacturer',
  'Service Provider',
  'Other'
];

export const formatStatusWithNumbers = (rawStatus, stagesList = DEFAULT_STAGES) => {
  if (!rawStatus || rawStatus === 'None') return rawStatus || 'None';
  if (/^\d+;\d+>/.test(rawStatus)) return rawStatus;
  const clean = rawStatus.includes('>') ? rawStatus.split('>').pop().trim() : rawStatus.trim();
  const list = (stagesList && stagesList.length > 0) ? stagesList : DEFAULT_STAGES;
  for (let i = 0; i < list.length; i++) {
    const stageObj = list[i];
    const stageNum = i + 1;
    const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
    const substages = stageObj.substages || [];
    for (let j = 0; j < substages.length; j++) {
      const sub = substages[j];
      const subClean = sub.includes('>') ? sub.split('>').pop().trim() : sub.trim();
      if (clean.toLowerCase() === subClean.toLowerCase() || rawStatus.toLowerCase().includes(subClean.toLowerCase())) {
        const subNum = String(j + 1).padStart(2, '0');
        return `${stageNum};${subNum}>${cleanStageName}>${subClean}`;
      }
    }
  }
  return rawStatus;
};

// Strict IST Timezone Formatter
const formatIST = (isoString) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  } catch (e) {
    return String(isoString);
  }
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getCallStatusBadge = (status, hangupCause, talkDuration) => {
  const cause = (hangupCause || '').toLowerCase();
  const st = (status || '').toLowerCase();

  if (talkDuration > 0 || st === 'connected' || cause === 'customer_hangup') {
    return {
      label: 'Connected',
      bg: '#ecfdf5',
      color: '#059669',
      border: '#a7f3d0'
    };
  }
  if (cause === 'busy' || cause.includes('busy')) {
    return {
      label: 'Customer Busy',
      bg: '#fffbeb',
      color: '#d97706',
      border: '#fde68a'
    };
  }
  if (cause === 'rejected' || cause.includes('reject') || cause.includes('cancel')) {
    return {
      label: 'Cut / Declined',
      bg: '#fef2f2',
      color: '#dc2626',
      border: '#fecaca'
    };
  }
  if (cause === 'no_answer' || cause.includes('timeout') || cause.includes('no-answer')) {
    return {
      label: 'No Answer',
      bg: '#f8fafc',
      color: '#64748b',
      border: '#cbd5e1'
    };
  }
  if (cause === 'failed' || st === 'failed') {
    return {
      label: 'Failed / Unreachable',
      bg: '#fef2f2',
      color: '#dc2626',
      border: '#fecaca'
    };
  }
  return {
    label: st ? st.toUpperCase() : 'CALL',
    bg: '#f1f5f9',
    color: '#475569',
    border: '#cbd5e1'
  };
};

function CallAudioPlayer({ audioUrl }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      document.querySelectorAll('audio').forEach(el => {
        if (el !== audioRef.current) el.pause();
      });
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.error("Audio play error:", e));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatSec = (sec) => {
    if (isNaN(sec) || !isFinite(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      marginTop: '0.6rem',
      padding: '0.6rem 0.75rem',
      backgroundColor: 'var(--bg-surface, #ffffff)',
      borderRadius: '8px',
      border: '1px solid var(--border-light, #e2e8f0)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    }}>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        title={isPlaying ? "Pause Recording" : "Play Recording"}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: isPlaying ? '#dc2626' : '#059669',
          color: '#ffffff',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.15s ease'
        }}
      >
        {isPlaying ? <Pause size={14} fill="#ffffff" /> : <Play size={14} fill="#ffffff" style={{ marginLeft: '2px' }} />}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{
            width: '100%',
            height: '4px',
            accentColor: '#059669',
            cursor: 'pointer'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', fontFamily: 'monospace' }}>
          <span>{formatSec(currentTime)}</span>
          <span>{formatSec(duration)}</span>
        </div>
      </div>

      <a
        href={audioUrl}
        target="_blank"
        rel="noreferrer"
        download
        title="Download / Open Audio"
        style={{
          color: 'var(--text-secondary, #64748b)',
          padding: '4px',
          borderRadius: '4px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          textDecoration: 'none'
        }}
      >
        <Volume2 size={16} />
      </a>
    </div>
  );
}

export default function LeadProfilePanel({ 
  lead, 
  isOpen = true, 
  mode, 
  onClose, 
  onLeadUpdate, 
  onUpdateLead, 
  userName,
  userRole,
  userId,
  teamMembers = [],
  stages: propStages,
  onNextLead,
  onPrevLead,
  hasNextLead = false,
  hasPrevLead = false,
  currentLeadIndex,
  totalLeadsCount
}) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Status management states
  const [currentStatus, setCurrentStatus] = useState(formatStatusWithNumbers(lead?.status, propStages || DEFAULT_STAGES));
  const [statusForNewNote, setStatusForNewNote] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState(false);
  const [stages, setStages] = useState(propStages || DEFAULT_STAGES);

  // Client & Lead Attributes states
  const [currentClientStatus, setCurrentClientStatus] = useState(lead?.client_status || lead?.clientStatus || 'None');
  const [currentPriority, setCurrentPriority] = useState(lead?.priority || 'LP00: None');
  const [currentBusinessType, setCurrentBusinessType] = useState(lead?.business_type || '');
  const [currentRequirement, setCurrentRequirement] = useState(lead?.requirement || '');
  const [currentInvestment, setCurrentInvestment] = useState(lead?.investment || '');
  const [currentBuyingTimeline, setCurrentBuyingTimeline] = useState(lead?.buying_timeline || '');
  const [savingField, setSavingField] = useState(null);
  const [savedFieldSuccess, setSavedFieldSuccess] = useState(null);
  const [clientStatuses, setClientStatuses] = useState(DEFAULT_CLIENT_STATUSES);
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES);
  const [businessTypes, setBusinessTypes] = useState(DEFAULT_BUSINESS_TYPES);

  // Voice-to-Text (Speech Recognition) states
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US'); // 'en-US' (English) or 'hi-IN' (Hindi)
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState(null);
  const [listeningTarget, setListeningTarget] = useState('note'); // 'note' | 'requirement'
  const listeningTargetRef = useRef('note');
  const latestInterimRef = useRef('');
  const recognitionRef = useRef(null);

  const notifyLeadUpdate = (updatedLeadObj) => {
    if (onLeadUpdate) onLeadUpdate(updatedLeadObj);
    if (onUpdateLead) onUpdateLead(updatedLeadObj);
  };

  // Keyboard navigation: Alt+Left / Alt+Right for Prev/Next lead, Esc to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (hasPrevLead && onPrevLead) onPrevLead();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (hasNextLead && onNextLead) onNextLead();
      } else if (!isInput && e.key === 'ArrowLeft') {
        if (hasPrevLead && onPrevLead) onPrevLead();
      } else if (!isInput && e.key === 'ArrowRight') {
        if (hasNextLead && onNextLead) onNextLead();
      } else if (e.key === 'Escape') {
        if (onClose) onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasNextLead, hasPrevLead, onNextLead, onPrevLead, onClose]);

  useEffect(() => {
    if (lead?.status) {
      setCurrentStatus(formatStatusWithNumbers(lead.status, stages));
    }
    if (lead) {
      setCurrentClientStatus(lead.client_status || lead.clientStatus || 'None');
      setCurrentPriority(lead.priority || 'LP00: None');
      setCurrentBusinessType(lead.business_type || '');
      setCurrentRequirement(lead.requirement || '');
      setCurrentInvestment(lead.investment || '');
      setCurrentBuyingTimeline(lead.buying_timeline || '');
    }
  }, [lead?.status, lead?.client_status, lead?.clientStatus, lead?.priority, lead?.business_type, lead?.requirement, lead?.investment, lead?.buying_timeline, stages]);

  useEffect(() => {
    if (propStages && propStages.length > 0) {
      setStages(propStages);
      return;
    }
    const loadConfig = () => {
      try {
        const saved = localStorage.getItem('crm_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.stages && parsed.stages.length > 0 && typeof parsed.stages[0] === 'object' && parsed.stages[0].substages) {
            setStages(parsed.stages);
          }
          if (parsed.clientStatuses && Array.isArray(parsed.clientStatuses) && parsed.clientStatuses.length > 0) {
            setClientStatuses(parsed.clientStatuses);
          }
          if (parsed.priorities && Array.isArray(parsed.priorities) && parsed.priorities.length > 0) {
            setPriorities(parsed.priorities);
          }
          if (parsed.businessTypes && Array.isArray(parsed.businessTypes) && parsed.businessTypes.length > 0) {
            setBusinessTypes(parsed.businessTypes);
          }
        }
      } catch (e) {}
    };
    loadConfig();
    if (typeof window !== 'undefined') {
      window.addEventListener('crm_config_updated', loadConfig);
      return () => window.removeEventListener('crm_config_updated', loadConfig);
    }
  }, [propStages]);

  // Robust Speech Recognition Controller
  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Immediately commit any pending interim transcript so nothing is lost
    if (latestInterimRef.current) {
      const pending = latestInterimRef.current.trim();
      if (pending) {
        if (listeningTargetRef.current === 'requirement') {
          setCurrentRequirement(prev => {
            const t = (prev || '').trim();
            return t ? `${t} ${pending}` : pending;
          });
        } else {
          setNewNote(prev => {
            const t = (prev || '').trim();
            return t ? `${t} ${pending}` : pending;
          });
        }
      }
      latestInterimRef.current = '';
    }

    setIsListening(false);
    setInterimTranscript('');
  };

  const startListening = (target = 'note', langToUse = speechLang) => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice dictation is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    // Stop previous instance before initializing fresh one
    stopListening();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = langToUse || 'en-US';

      listeningTargetRef.current = target;
      setListeningTarget(target);
      setSpeechError(null);
      latestInterimRef.current = '';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript;
          } else {
            interimChunk += transcript;
          }
        }

        if (finalChunk) {
          latestInterimRef.current = '';
          if (listeningTargetRef.current === 'requirement') {
            setCurrentRequirement(prev => {
              const trimmed = (prev || '').trim();
              return trimmed ? `${trimmed} ${finalChunk.trim()}` : finalChunk.trim();
            });
          } else {
            setNewNote(prev => {
              const trimmed = (prev || '').trim();
              return trimmed ? `${trimmed} ${finalChunk.trim()}` : finalChunk.trim();
            });
          }
        } else {
          latestInterimRef.current = interimChunk;
        }

        setInterimTranscript(interimChunk);
      };

      recognition.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error);
        if (e.error === 'not-allowed') {
          setSpeechError('Microphone permission denied. Please allow microphone in your browser settings.');
        } else if (e.error !== 'no-speech') {
          setSpeechError(`Voice error: ${e.error}`);
        }
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Could not start speech recognition:', err);
      setSpeechError('Failed to initialize microphone.');
      setIsListening(false);
    }
  };

  const toggleSpeechRecognition = (target = 'note') => {
    if (isListening && listeningTargetRef.current === target) {
      stopListening();
    } else {
      startListening(target, speechLang);
    }
  };

  const toggleSpeechLanguage = () => {
    const nextLang = speechLang.startsWith('en') ? 'hi-IN' : 'en-US';
    setSpeechLang(nextLang);
    if (isListening) {
      startListening(listeningTargetRef.current, nextLang);
    }
  };

  // Stop listening when modal closes or unmounts
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
    }
  }, [isOpen]);

  const handleStatusUpdate = async (newStatus) => {
    if (!newStatus || isUpdatingStatus || !lead?.id) return;

    const formattedNewStatus = formatStatusWithNumbers(newStatus, stages);
    if (formattedNewStatus === currentStatus) return;

    const oldStatus = currentStatus || formatStatusWithNumbers(lead.status, stages) || '01 - New Stage';
    const nowIso = new Date().toISOString();
    const actor = normalizeEmployeeName(userName || 'Agent');
    const noteText = `Status changed from ${oldStatus} to ${formattedNewStatus}`;

    const statusNote = {
      id: `local_note_${Date.now()}`,
      lead_id: lead.id,
      note_text: noteText,
      created_by: actor,
      created_at: nowIso
    };

    setCurrentStatus(formattedNewStatus);
    setNotes(prev => [statusNote, ...prev]);

    const updatedLeadObj = {
      ...lead,
      status: formattedNewStatus,
      last_status: formattedNewStatus,
      updated_at: nowIso,
      last_timestamp: nowIso,
      latest_remark: noteText,
      is_offline_pending: false
    };

    notifyLeadUpdate(updatedLeadObj);

    setIsUpdatingStatus(true);
    try {
      const { error: updateError } = await supabase.from('leads').update({
        status: formattedNewStatus
      }).eq('id', lead.id);

      if (updateError) {
        console.error('Lead status update error from Supabase:', updateError);
        throw updateError;
      }

      const { data: insertedNote, error: noteError } = await supabase.from('lead_notes').insert([{
        lead_id: lead.id,
        note_text: noteText,
        created_by: actor
      }]).select().single();

      if (noteError) {
        console.warn('Note insert warning in Supabase:', noteError.message || noteError);
      } else if (insertedNote) {
        setNotes(prev => prev.map(n => n.id === statusNote.id ? insertedNote : n));
      }

      try {
        await logAuditAction('Stage Changed', `Changed status of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to "${formattedNewStatus}" via History Panel`);
      } catch (e) {}

      try {
        triggerWhatsappAutomationForStage(lead.id, formattedNewStatus);
      } catch (e) {}

      setStatusUpdateSuccess(true);
      setTimeout(() => setStatusUpdateSuccess(false), 2000);
    } catch (err) {
      console.error('Status update failed:', err?.message || err?.details || JSON.stringify(err));
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        const check = canPerformOfflineAction('leadStatusUpdate');
        if (check.allowed) {
          await enqueueOfflineAction('update', 'lead', {
            id: lead.id,
            status: formattedNewStatus
          });
          await enqueueOfflineAction('create', 'lead_note', {
            lead_id: lead.id,
            note_text: noteText,
            created_by: actor
          });
        }
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAttributeUpdate = async (fieldKey, newValue, displayLabel) => {
    if (!lead || !lead.id || !fieldKey) return;

    const storedVal = (lead[fieldKey] !== undefined && lead[fieldKey] !== null) ? String(lead[fieldKey]).trim() : '';
    const cleanNewVal = (newValue !== undefined && newValue !== null) ? String(newValue).trim() : '';

    if (storedVal === cleanNewVal && savingField !== fieldKey) return;

    if (fieldKey === 'client_status') setCurrentClientStatus(newValue);
    else if (fieldKey === 'priority') setCurrentPriority(newValue);
    else if (fieldKey === 'business_type') setCurrentBusinessType(newValue);
    else if (fieldKey === 'requirement') setCurrentRequirement(newValue);
    else if (fieldKey === 'investment') setCurrentInvestment(newValue);
    else if (fieldKey === 'buying_timeline') setCurrentBuyingTimeline(newValue);

    const nowIso = new Date().toISOString();
    const actor = normalizeEmployeeName(userName || 'Agent');
    const label = displayLabel || fieldKey;
    const noteText = `${label} updated to: ${newValue || 'None'}`;

    const newLocalNote = {
      id: `local_attr_${Date.now()}`,
      lead_id: lead.id,
      note_text: noteText,
      created_by: actor,
      created_at: nowIso
    };

    setNotes(prev => [newLocalNote, ...prev]);

    const updatedLeadObj = {
      ...lead,
      [fieldKey]: newValue,
      updated_at: nowIso,
      last_timestamp: nowIso,
      is_offline_pending: false
    };

    notifyLeadUpdate(updatedLeadObj);

    setSavingField(fieldKey);
    try {
      const updatePayload = {
        [fieldKey]: newValue
      };

      const { error: updateError } = await supabase.from('leads').update(updatePayload).eq('id', lead.id);
      if (updateError) {
        if (updateError.code === 'PGRST204' && fieldKey === 'client_status') {
          console.warn('client_status column does not exist on leads table yet. Please run migrations/24_add_client_status.sql in Supabase SQL editor.');
        } else {
          throw updateError;
        }
      }

      const { data: insertedNote, error: noteError } = await supabase.from('lead_notes').insert([{
        lead_id: lead.id,
        note_text: noteText,
        created_by: actor
      }]).select().single();

      if (!noteError && insertedNote) {
        setNotes(prev => prev.map(n => n.id === newLocalNote.id ? insertedNote : n));
      }

      try {
        await logAuditAction('Update Lead', `Updated ${label} of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to "${newValue}" via History Panel`);
      } catch (e) {}

      setSavedFieldSuccess(fieldKey);
      setTimeout(() => setSavedFieldSuccess(null), 2000);
    } catch (err) {
      console.error(`${fieldKey} update failed:`, err?.message || err?.details || JSON.stringify(err));
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        const check = canPerformOfflineAction('leadAttributeUpdate');
        if (check.allowed) {
          await enqueueOfflineAction('update', 'lead', {
            id: lead.id,
            [fieldKey]: newValue
          });
          await enqueueOfflineAction('create', 'lead_note', {
            lead_id: lead.id,
            note_text: noteText,
            created_by: actor
          });
        }
      }
    } finally {
      setSavingField(null);
    }
  };

  const fetchCalls = async () => {
    if (!lead) return;
    setIsLoadingCalls(true);
    try {
      const rawList = [
        lead.phone,
        lead.business_contact_1,
        lead.business_contact_2,
        lead.business_alt_1,
        lead.business_alt_2,
        lead.cp1_mobile_2,
        lead.cp1_alt_1,
        lead.cp1_alt_2,
        lead.cp2_mobile_1,
        lead.cp2_mobile_2,
        lead.cp2_alt_1,
        lead.cp2_alt_2,
        lead.cp3_mobile_1,
        lead.cp3_mobile_2,
        lead.cp3_alt_1,
        lead.cp3_alt_2,
        lead.mobile,
        lead.contact_no_2,
        lead.business_contact_in_aio,
        lead.cp_mobile_in_aio,
        lead['Business Contact in AIO'],
        lead['CP Mobile in AIO'],
        lead.business_contact_aio,
        lead.cp_mobile_aio
      ];

      const res = await getLeadCallHistory(rawList);
      if (res && res.success && Array.isArray(res.data)) {
        setCallLogs(res.data);
      }
    } catch (err) {
      console.error("Error fetching call logs for lead:", err);
    } finally {
      setIsLoadingCalls(false);
    }
  };

  useEffect(() => {
    if (!lead || !isOpen) return;

    if (lead.status) setCurrentStatus(formatStatusWithNumbers(lead.status, stages));
    setCurrentClientStatus(lead.client_status || lead.clientStatus || 'None');
    setCurrentPriority(lead.priority || 'LP00: None');
    setCurrentBusinessType(lead.business_type || '');
    setCurrentRequirement(lead.requirement || '');
    setCurrentInvestment(lead.investment || '');
    setCurrentBuyingTimeline(lead.buying_timeline || '');
    setSavingField(null);
    setSavedFieldSuccess(null);
    setNewNote('');
    setStatusForNewNote('');
    setInterimTranscript('');
    setCallLogs([]);

    // Immediately seed with existing notes (deduplicated)
    if (Array.isArray(lead.lead_notes)) {
      const seen = new Set();
      const deduped = lead.lead_notes.filter(n => {
        if (!n) return false;
        const idKey = n.id ? String(n.id) : `${n.created_at}_${n.note_text}`;
        if (seen.has(idKey)) return false;
        seen.add(idKey);
        return true;
      });
      setNotes([...deduped].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } else {
      setNotes([]);
    }

    // Set initial mode
    setIsEditing(mode === 'edit');
    
    // Set follow up date if exists
    if (lead.follow_up_date) {
      // Convert to local datetime string format for input type="datetime-local"
      const date = new Date(lead.follow_up_date);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
      setFollowUpDate(localISOTime);
    } else {
      setFollowUpDate('');
    }

    // Initialize edit form
    setEditForm({
      name: lead.name,
      company: lead.company || '',
      email: lead.email || '',
      phone: lead.phone || '',
      business_type: lead.business_type || '',
      deal_value: lead.deal_value || 0,
      source: lead.source || 'Website'
    });

    // Fetch ALL existing notes fresh from database (deduplicated)
    const fetchNotes = async () => {
      let allNotes = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('lead_notes')
          .select('*')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        
        if (error || !data || data.length === 0) break;
        allNotes = [...allNotes, ...data];
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      if (allNotes.length > 0) {
        const seen = new Set();
        const deduped = allNotes.filter(n => {
          if (!n) return false;
          const idKey = n.id ? String(n.id) : `${n.created_at}_${n.note_text}`;
          if (seen.has(idKey)) return false;
          seen.add(idKey);
          return true;
        });
        setNotes(deduped);
      }
    };
    fetchNotes();
    fetchCalls();

    // Subscribe to new notes
    const noteChannel = supabase
      .channel(`notes-${lead.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes', filter: `lead_id=eq.${lead.id}` }, (payload) => {
        setNotes((prev) => {
          if (prev.some(note => note.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .subscribe();

    // Subscribe to call session updates (new calls or newly attached recordings)
    const callChannel = supabase
      .channel(`lead-calls-${lead.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_sessions' }, () => {
        fetchCalls();
      })
      .subscribe();

    const handleCallEnded = () => {
      fetchCalls();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('crm:call-ended', handleCallEnded);
    }

    return () => {
      supabase.removeChannel(noteChannel);
      supabase.removeChannel(callChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm:call-ended', handleCallEnded);
      }
    };
  }, [lead, isOpen]);

  // Unified chronological timeline of notes & calls with strict key uniqueness
  const unifiedHistory = useMemo(() => {
    const list = [];
    const seenIds = new Set();

    // Format notes
    (notes || []).forEach((n, idx) => {
      const rawId = n.id ? String(n.id) : `idx_${idx}`;
      const uniqueId = `note_${rawId}`;
      if (seenIds.has(uniqueId)) return;
      seenIds.add(uniqueId);
      list.push({
        id: uniqueId,
        type: 'note',
        createdAt: n.created_at,
        text: n.note_text,
        createdBy: n.created_by,
        raw: n
      });
    });

    // Format calls
    (callLogs || []).forEach((c, idx) => {
      const rawId = c.id ? String(c.id) : `idx_${idx}`;
      const uniqueId = `call_${rawId}`;
      if (seenIds.has(uniqueId)) return;
      seenIds.add(uniqueId);
      list.push({
        id: uniqueId,
        type: 'call',
        createdAt: c.created_at || c.start_time,
        customerNumber: c.customer_number,
        status: c.status,
        hangupCause: c.hangup_cause,
        talkDuration: c.talk_duration_sec || 0,
        ringingDuration: c.ringing_duration_sec || 0,
        recordingUrl: c.recording_url,
        agentName: c.call_agents?.display_name || '',
        raw: c
      });
    });

    // Sort descending (latest on top)
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (historyFilter === 'calls') return list.filter(item => item.type === 'call');
    if (historyFilter === 'notes') return list.filter(item => item.type === 'note');
    return list;
  }, [notes, callLogs, historyFilter]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim() && !statusForNewNote) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const actor = normalizeEmployeeName(userName || 'Agent');
    const nowIso = new Date().toISOString();
    const noteContent = newNote.trim();
    const statusToUpdate = (statusForNewNote && statusForNewNote !== currentStatus) ? statusForNewNote : null;

    let localNotesToAdd = [];
    let createdNote = null;

    if (noteContent) {
      createdNote = {
        id: `local_note_${Date.now()}`,
        lead_id: lead.id,
        note_text: noteContent,
        created_by: actor,
        created_at: nowIso
      };
      localNotesToAdd.push(createdNote);
    }

    if (statusToUpdate) {
      const statusNote = {
        id: `local_note_${Date.now() + 1}`,
        lead_id: lead.id,
        note_text: `Status changed from ${currentStatus} to ${statusToUpdate}`,
        created_by: actor,
        created_at: nowIso
      };
      localNotesToAdd.push(statusNote);
      setCurrentStatus(statusToUpdate);
    }

    const updatedNotes = [...localNotesToAdd, ...notes];
    setNotes(updatedNotes);

    const updatedLeadObj = {
      ...lead,
      ...(statusToUpdate ? {
        status: statusToUpdate,
        last_status: statusToUpdate
      } : {}),
      updated_at: nowIso,
      last_timestamp: nowIso,
      latest_remark: noteContent || `Status changed to ${statusToUpdate}`,
      lead_notes: updatedNotes,
      is_offline_pending: false
    };

    notifyLeadUpdate(updatedLeadObj);

    setNewNote('');
    setStatusForNewNote('');
    setInterimTranscript('');

    try {
      if (noteContent) {
        const { data: inserted, error: noteError } = await supabase
          .from('lead_notes')
          .insert([{ lead_id: lead.id, note_text: noteContent, created_by: actor }])
          .select()
          .single();

        if (noteError) throw noteError;
        if (inserted && createdNote) {
          setNotes((current) => current.map(n => n.id === createdNote.id ? inserted : n));
        }

        try {
          logAuditAction('Add Note', `Added note for lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}": "${noteContent.substring(0, 50)}${noteContent.length > 50 ? '...' : ''}"`);
        } catch (e) {}
      }

      if (statusToUpdate) {
        const { error: statusError } = await supabase.from('leads').update({
          status: statusToUpdate
        }).eq('id', lead.id);

        if (statusError) throw statusError;

        await supabase.from('lead_notes').insert([{
          lead_id: lead.id,
          note_text: `Status changed from ${currentStatus} to ${statusToUpdate}`,
          created_by: actor
        }]);

        try {
          await logAuditAction('Stage Changed', `Changed status of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" to "${statusToUpdate}" via History Panel`);
        } catch (e) {}

        try {
          triggerWhatsappAutomationForStage(lead.id, statusToUpdate);
        } catch (e) {}
      }
    } catch (netErr) {
      console.warn('Network addNote/status update failed, checking offline fallback:', netErr?.message || netErr);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        if (noteContent) {
          const check = canPerformOfflineAction('leadNotes');
          if (check.allowed) {
            await enqueueOfflineAction('create', 'lead_note', { lead_id: lead.id, note_text: noteContent, created_by: actor });
          }
        }
        if (statusToUpdate) {
          const check = canPerformOfflineAction('leadStatusUpdate');
          if (check.allowed) {
            await enqueueOfflineAction('update', 'lead', { id: lead.id, status: statusToUpdate });
          }
        }
      }
    }
  };

  const handleFollowUpChange = async (e) => {
    const newDate = e.target.value;
    const actor = userName || 'System';

    if (!newDate) {
      setFollowUpDate('');
      const noteText = 'Follow-up date cleared';
      const newNote = {
        id: Date.now(),
        lead_id: lead.id,
        note_text: noteText,
        created_by: actor,
        created_at: new Date().toISOString()
      };

      if (onLeadUpdate) {
        onLeadUpdate({ ...lead, follow_up_date: null, is_offline_pending: false });
      }

      try {
        const { error: updateError } = await supabase.from('leads').update({ follow_up_date: null }).eq('id', lead.id);
        if (updateError) throw updateError;

        await supabase.from('lead_notes').insert([{
          lead_id: lead.id,
          note_text: noteText,
          created_by: actor
        }]);
      } catch (netErr) {
        console.warn('Network follow-up update failed, fallback to offline:', netErr);
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (isOffline) {
          const check = canPerformOfflineAction('leadFollowUp');
          if (check.allowed) {
            await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: null });
          }
        }
      }
      return;
    }
    
    setFollowUpDate(newDate);
    const isoDateStr = new Date(newDate).toISOString();
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(newDate);
    const formattedDate = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const noteText = `Follow-up scheduled for: ${formattedDate}`;

    if (onLeadUpdate) {
      onLeadUpdate({ ...lead, follow_up_date: isoDateStr, is_offline_pending: false });
    }

    try {
      const { error: updateError } = await supabase.from('leads').update({ follow_up_date: isoDateStr }).eq('id', lead.id);
      if (updateError) throw updateError;

      await supabase.from('lead_notes').insert([{
        lead_id: lead.id,
        note_text: noteText,
        created_by: actor
      }]);
      try {
        logAuditAction('Set Follow-up', `Scheduled follow-up for lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}" on ${formattedDate}`);
      } catch(e) {}
    } catch (netErr) {
      console.warn('Network follow-up update failed, fallback to offline:', netErr);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        const check = canPerformOfflineAction('leadFollowUp');
        if (check.allowed) {
          await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: isoDateStr });
        }
      }
    }
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async () => {
    const cleanForm = normalizeLeadRecord({ ...editForm });
    const actor = normalizeEmployeeName(userName || 'System');

    if (onLeadUpdate) {
      onLeadUpdate({ ...lead, ...cleanForm, is_offline_pending: false });
    }
    setIsEditing(false);

    try {
      const { error: updateError } = await supabase.from('leads').update(cleanForm).eq('id', lead.id);
      if (updateError) throw updateError;
      
      await supabase.from('lead_notes').insert([{
        lead_id: lead.id,
        note_text: `Profile updated`,
        created_by: actor
      }]);
      try {
        logAuditAction('Update Lead', `Updated profile of lead "${lead.company || lead.name || lead.lead_ref_id || lead.id}"`);
      } catch(e) {}
      alert('Lead profile updated successfully!');
    } catch (netErr) {
      console.warn('Network profile update failed, fallback to offline:', netErr);
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        const check = canPerformOfflineAction('profileEdit');
        if (check.allowed) {
          await enqueueOfflineAction('update', 'lead', { ...cleanForm, id: lead.id });
          alert('⚡ Network issue: Profile changes saved to device! They will sync to cloud automatically.');
        }
      }
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <div 
      style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: 'rgba(15, 23, 42, 0.65)', 
          backdropFilter: 'blur(4px)', 
          zIndex: 9999, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          animation: 'fadeInLeadModal 0.2s ease-out'
        }} 
      >
        {/* Centered Modal Card */}
        <div 
          style={{ 
            width: 'min(980px, 96vw)', 
            height: 'min(860px, 92vh)', 
            backgroundColor: 'var(--bg-surface)', 
            zIndex: 10000, 
            borderRadius: '16px',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.35)', 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border-light)',
            animation: 'scaleInLeadModal 0.2s ease-out'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header with Navigation Bar */}
          <div style={{ 
            padding: '0.85rem 1.25rem', 
            borderBottom: '1px solid var(--border-light)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: 'var(--bg-surface)',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, marginRight: '0.5rem' }}>
                <input name="name" value={editForm.name} onChange={handleEditChange} style={{ fontSize: '1.1rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input name="company" value={editForm.company} onChange={handleEditChange} placeholder="Company" style={{ padding: '0.25rem 0.5rem', width: '50%', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }} />
                  <input name="phone" value={editForm.phone} onChange={handleEditChange} placeholder="Phone" style={{ padding: '0.25rem 0.5rem', width: '50%', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }} />
                </div>
                <input name="email" value={editForm.email} onChange={handleEditChange} placeholder="Email" style={{ padding: '0.25rem 0.5rem', width: '100%', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.8rem' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '220px', flex: '1 1 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {lead.name || 'Unnamed Lead'}
                  </h2>
                  {lead.lead_ref_id && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: '9999px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                      REF: #{lead.lead_ref_id}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {lead.company && <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.company}</span>}
                  {lead.company && (lead.phone || lead.email) && <span>•</span>}
                  {lead.phone && <span>📞 {lead.phone}</span>}
                  {lead.email && (
                    <>
                      <span>•</span>
                      <span>✉️ {lead.email}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Center: Next / Prev Navigation Controls */}
            {(onNextLead || onPrevLead || totalLeadsCount > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'var(--bg-primary)', padding: '3px 6px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <button
                  type="button"
                  onClick={onPrevLead}
                  disabled={!hasPrevLead}
                  title="Previous Lead (Alt + Left Arrow)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: hasPrevLead ? 'var(--bg-surface)' : 'transparent',
                    color: hasPrevLead ? 'var(--text-primary)' : 'var(--text-secondary)',
                    opacity: hasPrevLead ? 1 : 0.4,
                    cursor: hasPrevLead ? 'pointer' : 'not-allowed',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    boxShadow: hasPrevLead ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>

                {totalLeadsCount > 0 && (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    padding: '0 0.4rem',
                    whiteSpace: 'nowrap'
                  }}>
                    <b style={{ color: 'var(--accent-color)' }}>{currentLeadIndex || 1}</b> / {totalLeadsCount}
                  </span>
                )}

                <button
                  type="button"
                  onClick={onNextLead}
                  disabled={!hasNextLead}
                  title="Next Lead (Alt + Right Arrow)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: hasNextLead ? 'var(--bg-surface)' : 'transparent',
                    color: hasNextLead ? 'var(--text-primary)' : 'var(--text-secondary)',
                    opacity: hasNextLead ? 1 : 0.4,
                    cursor: hasNextLead ? 'pointer' : 'not-allowed',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    boxShadow: hasNextLead ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Right Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {mode !== 'history' && !isEditing && (
                <button 
                  onClick={() => setIsEditing(true)} 
                  style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  ✏️ Edit
                </button>
              )}
              {isEditing && (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => { setIsEditing(false); if(mode==='edit') onClose(); }} style={{ padding: '0.3rem 0.65rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.76rem' }}>Cancel</button>
                  <button onClick={handleSaveEdit} style={{ padding: '0.3rem 0.65rem', border: 'none', background: 'var(--accent-color)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '0.76rem' }}>Save</button>
                </div>
              )}
              <button 
                onClick={onClose} 
                title="Close (Esc)" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              >
                <X size={19} />
              </button>
            </div>
          </div>

          {/* Modal 2-Column Responsive Body */}
          <div className="lead-modal-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            
            {/* LEFT COLUMN: Parameters & Requirements */}
            <div className="lead-modal-left" style={{ 
              width: '45%', 
              maxWidth: '440px', 
              minWidth: '320px', 
              borderRight: '1px solid var(--border-light)', 
              overflowY: 'auto', 
              padding: '1.25rem', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.75rem', 
              backgroundColor: 'var(--bg-primary)',
              fontSize: '0.85rem'
            }}>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            {isEditing ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setIsEditing(false); if(mode==='edit') onClose(); }} style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveEdit} style={{ padding: '0.25rem 0.75rem', border: 'none', background: 'var(--accent-color)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Save Changes</button>
              </div>
            ) : mode === 'history' ? null : (
              <button onClick={() => setIsEditing(true)} style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                ✏️ Edit Details
              </button>
            )}
          </div>

          {/* Structured Lead & Client Parameters (2-column grid with 3 rows) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.65rem' }}>
            
            {/* 1. Lead Status (CRM Stage with Stage & Sub-number) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                📊 Lead Status:
                {isUpdatingStatus && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {statusUpdateSuccess && <Check size={12} color="#10b981" title="Status updated!" />}
              </span>
              <select
                value={currentStatus}
                disabled={isUpdatingStatus}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: isUpdatingStatus ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentStatus}
              >
                {!stages.some(s => s.substages?.some(sub => sub === currentStatus || sub.includes(currentStatus) || currentStatus.includes(sub))) && (
                  <option value={currentStatus}>
                    {formatStatusWithNumbers(currentStatus, stages)}
                  </option>
                )}
                {stages.map((stageObj, i) => {
                  const stageNum = i + 1;
                  const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                  return (
                    <optgroup key={`top-stage-${i}`} label={stageObj.name}>
                      {stageObj.substages.map((sub, j) => {
                        const subNum = String(j + 1).padStart(2, '0');
                        const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                        const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                        return (
                          <option key={`top-sub-${val}`} value={val}>
                            {val}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* 2. Client Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                🏷️ Client Status:
                {savingField === 'client_status' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'client_status' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <select
                value={currentClientStatus}
                disabled={savingField === 'client_status'}
                onChange={(e) => handleAttributeUpdate('client_status', e.target.value, 'Client Status')}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  cursor: savingField === 'client_status' ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentClientStatus}
              >
                {!clientStatuses.includes(currentClientStatus) && currentClientStatus && (
                  <option value={currentClientStatus}>{currentClientStatus}</option>
                )}
                {clientStatuses.map((st) => (
                  <option key={`cstatus-${st}`} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* 3. Lead Priority */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                ⚡ Lead Priority:
                {savingField === 'priority' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'priority' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <select
                value={currentPriority}
                disabled={savingField === 'priority'}
                onChange={(e) => handleAttributeUpdate('priority', e.target.value, 'Lead Priority')}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  cursor: savingField === 'priority' ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentPriority}
              >
                {!priorities.includes(currentPriority) && currentPriority && (
                  <option value={currentPriority}>{currentPriority}</option>
                )}
                {priorities.map((pr) => (
                  <option key={`prio-${pr}`} value={pr}>{pr}</option>
                ))}
              </select>
            </div>

            {/* 4. Business Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                🏢 Business Type:
                {savingField === 'business_type' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'business_type' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <select
                value={currentBusinessType}
                disabled={savingField === 'business_type'}
                onChange={(e) => handleAttributeUpdate('business_type', e.target.value, 'Business Type')}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  cursor: savingField === 'business_type' ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentBusinessType}
              >
                <option value="">Select Business Type...</option>
                {!businessTypes.includes(currentBusinessType) && currentBusinessType && (
                  <option value={currentBusinessType}>{currentBusinessType}</option>
                )}
                {businessTypes.map((bt) => (
                  <option key={`bt-${bt}`} value={bt}>{bt}</option>
                ))}
              </select>
            </div>

            {/* 5. Investment Size */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                💰 Investment Size:
                {savingField === 'investment' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'investment' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <select
                value={currentInvestment}
                disabled={savingField === 'investment'}
                onChange={(e) => handleAttributeUpdate('investment', e.target.value, 'Investment Size')}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  cursor: savingField === 'investment' ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentInvestment}
              >
                <option value="">Select Investment...</option>
                {!INVESTMENT_OPTIONS.includes(currentInvestment) && currentInvestment && (
                  <option value={currentInvestment}>{currentInvestment}</option>
                )}
                {INVESTMENT_OPTIONS.map((inv) => (
                  <option key={`inv-${inv}`} value={inv}>{inv}</option>
                ))}
              </select>
            </div>

            {/* 6. Buying Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
                ⏳ Buying Timeline:
                {savingField === 'buying_timeline' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'buying_timeline' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <select
                value={currentBuyingTimeline}
                disabled={savingField === 'buying_timeline'}
                onChange={(e) => handleAttributeUpdate('buying_timeline', e.target.value, 'Buying Timeline')}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.76rem',
                  fontWeight: 500,
                  cursor: savingField === 'buying_timeline' ? 'wait' : 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                title={currentBuyingTimeline}
              >
                <option value="">Select Timeline...</option>
                {!BUYING_TIMELINE_OPTIONS.includes(currentBuyingTimeline) && currentBuyingTimeline && (
                  <option value={currentBuyingTimeline}>{currentBuyingTimeline}</option>
                )}
                {BUYING_TIMELINE_OPTIONS.map((tm) => (
                  <option key={`tm-${tm}`} value={tm}>{tm}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 7. Next Follow-up Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem', padding: '0.45rem 0.6rem', backgroundColor: 'var(--bg-surface, #ffffff)', borderRadius: '6px', border: '1px solid var(--border-light, #e2e8f0)' }}>
            <span style={{ color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600 }}>
              🗓️ Next Follow-up Date:
            </span>
            <input 
              type="datetime-local" 
              value={followUpDate} 
              onChange={handleFollowUpChange}
              style={{
                width: '100%',
                padding: '0.28rem 0.4rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #e2e8f0)',
                backgroundColor: 'var(--bg-primary, #f8fafc)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* 7. Detailed Requirement with Voice Dictation & Quick Save */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', backgroundColor: 'var(--bg-surface, #ffffff)', borderRadius: '8px', border: '1px solid var(--border-light, #e2e8f0)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                📝 Detailed Requirement:
                {savingField === 'requirement' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {savedFieldSuccess === 'requirement' && <Check size={12} color="#10b981" title="Saved!" />}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {/* Voice Language Toggle (EN / HI) */}
                <button
                  type="button"
                  onClick={toggleSpeechLanguage}
                  title={`Click to switch speech language (Current: ${speechLang.startsWith('en') ? 'English' : 'Hindi'})`}
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    backgroundColor: speechLang === 'hi-IN' ? '#fef3c7' : 'var(--bg-primary, #f8fafc)',
                    color: speechLang === 'hi-IN' ? '#b45309' : 'var(--accent-color, #2563eb)',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  {speechLang.startsWith('en') ? 'EN' : 'HI'}
                </button>

                <button
                  type="button"
                  onClick={() => toggleSpeechRecognition('requirement')}
                  title={isListening && listeningTarget === 'requirement' ? "Stop voice dictation" : "Dictate requirement with voice"}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    border: isListening && listeningTarget === 'requirement' ? '1px solid #ef4444' : '1px solid var(--border-light, #e2e8f0)',
                    backgroundColor: isListening && listeningTarget === 'requirement' ? '#fef2f2' : 'var(--bg-primary, #f8fafc)',
                    color: isListening && listeningTarget === 'requirement' ? '#dc2626' : 'var(--text-secondary, #64748b)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isListening && listeningTarget === 'requirement' ? (
                    <>
                      <MicOff size={11} color="#dc2626" />
                      <span style={{ fontWeight: 600 }}>Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic size={11} />
                      <span>Voice</span>
                    </>
                  )}
                </button>

                {currentRequirement !== (lead.requirement || '') && (
                  <button
                    type="button"
                    onClick={() => handleAttributeUpdate('requirement', currentRequirement, 'Detailed Requirement')}
                    disabled={savingField === 'requirement'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      border: 'none',
                      backgroundColor: 'var(--accent-color, #2563eb)',
                      color: '#ffffff',
                      cursor: savingField === 'requirement' ? 'wait' : 'pointer'
                    }}
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
            
            <textarea
              value={currentRequirement}
              placeholder="Enter client requirements, product details, model, specifications..."
              onChange={(e) => setCurrentRequirement(e.target.value)}
              onBlur={() => {
                if (currentRequirement !== (lead.requirement || '')) {
                  handleAttributeUpdate('requirement', currentRequirement, 'Detailed Requirement');
                }
              }}
              rows={2}
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                borderRadius: '5px',
                border: '1px solid var(--border-light, #e2e8f0)',
                backgroundColor: 'var(--bg-primary, #f8fafc)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.76rem',
                lineHeight: 1.4,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            {isListening && listeningTarget === 'requirement' && interimTranscript && (
              <div style={{ fontSize: '0.72rem', color: '#dc2626', fontStyle: 'italic' }}>
                🎙️ Dictating: {interimTranscript}...
              </div>
            )}
          </div>

          {/* Secondary Metadata Row (Deal Value, Source, Company) or Edit Inputs */}
          {isEditing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light, #e2e8f0)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Value (₹):</span>
                <input type="number" name="deal_value" value={editForm.deal_value} onChange={handleEditChange} style={{ padding: '0.25rem', fontSize: '0.76rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Source:</span>
                <select name="source" value={editForm.source} onChange={handleEditChange} style={{ padding: '0.25rem', fontSize: '0.76rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                  <option value="Website">Website</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Referral">Referral</option>
                  <option value="Cold Call">Cold Call</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.2rem' }}>Company:</span>
                <select name="our_company" value={editForm.our_company || ''} onChange={handleEditChange} style={{ padding: '0.25rem', fontSize: '0.76rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                  <option value="">None</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light, #e2e8f0)' }}>
              <div>Value: <b style={{ color: 'var(--text-primary)' }}>₹{lead.deal_value || 0}</b></div>
              <div>Source: <b style={{ color: 'var(--text-primary)' }}>{lead.source || 'N/A'}</b></div>
            </div>
          )}
        </div>

          {/* RIGHT COLUMN: Interaction History & Notes Composer */}
          <div className="lead-modal-right" style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden', 
            backgroundColor: 'var(--bg-surface)' 
          }}>
            {/* Show Notes Section only if mode is history or not editing */}
            {(!isEditing || mode === 'history') && (
              <>
                {/* Notes & Call History Section */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  Interaction & Call History
                  <button
                    type="button"
                    onClick={fetchCalls}
                    title="Refresh Call History"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <RotateCw size={14} style={{ animation: isLoadingCalls ? 'spin 1s linear infinite' : 'none' }} />
                  </button>
                </h3>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--bg-primary, #f1f5f9)', padding: '3px', borderRadius: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: historyFilter === 'all' ? 'var(--accent-color, #0284c7)' : 'transparent',
                      color: historyFilter === 'all' ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    All ({notes.length + callLogs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('calls')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: historyFilter === 'calls' ? '#059669' : 'transparent',
                      color: historyFilter === 'calls' ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    📞 Calls ({callLogs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('notes')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: historyFilter === 'notes' ? 'var(--accent-color, #0284c7)' : 'transparent',
                      color: historyFilter === 'notes' ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    📝 Notes ({notes.length})
                  </button>
                </div>
              </div>
              
              {unifiedHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No interaction or call history yet.
                </p>
              ) : (
                unifiedHistory.map(item => {
                  if (item.type === 'call') {
                    const badge = getCallStatusBadge(item.status, item.hangupCause, item.talkDuration);
                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: '0.85rem 1rem',
                          backgroundColor: 'var(--th-bg, #f8fafc)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light, #e2e8f0)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.45rem'
                        }}
                      >
                        {/* Call Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: item.talkDuration > 0 ? '#dcfce7' : '#fee2e2',
                              color: item.talkDuration > 0 ? '#16a34a' : '#dc2626',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Phone size={12} strokeWidth={2.5} />
                            </div>
                            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                              Outbound Call ({item.customerNumber})
                            </span>
                          </div>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`
                          }}>
                            {badge.label}
                          </span>
                        </div>

                        {/* Call Metrics */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <span>⏱️ <b>Talk Duration:</b> {formatDuration(item.talkDuration)}</span>
                          {item.ringingDuration > 0 && <span>🔔 Ringing: {item.ringingDuration}s</span>}
                          {item.agentName && <span>👤 Agent: {item.agentName}</span>}
                        </div>

                        {/* Call Recording Play/Pause Audio Player */}
                        {item.recordingUrl ? (
                          <CallAudioPlayer audioUrl={item.recordingUrl} />
                        ) : item.talkDuration > 0 ? (
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#b45309',
                            backgroundColor: '#fef3c7',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px'
                          }}>
                            <span>⏳ Recording process ho rahi hai...</span>
                          </div>
                        ) : null}

                        {/* IST Timestamp */}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                          <span>📅 {formatIST(item.createdAt)}</span>
                        </div>
                      </div>
                    );
                  }

                  // Note item
                  return (
                    <div key={item.id} style={{ padding: '1rem', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.9rem', border: '1px solid var(--border-light, #e2e8f0)' }}>
                      <p style={{ marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>{item.text}</p>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>👤 {item.createdBy}</span>
                        <span>📅 {formatIST(item.createdAt)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Note & Voice Dictation Area */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>
              {/* Optional Quick Status Transition Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Add Remark / Note
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Status:</span>
                  <select
                    value={statusForNewNote}
                    onChange={e => setStatusForNewNote(e.target.value)}
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      maxWidth: '170px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Keep current ({formatStatusWithNumbers(currentStatus, stages)})</option>
                    {stages.map((stageObj, i) => {
                      const stageNum = i + 1;
                      const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                      return (
                        <optgroup key={`note-stage-${i}`} label={stageObj.name}>
                          {stageObj.substages.map((sub, j) => {
                            const subNum = String(j + 1).padStart(2, '0');
                            const prefix = `${stageNum};${subNum}>${cleanStageName}>`;
                            const val = sub.startsWith(prefix) ? sub : `${prefix}${sub.includes('>') ? sub.split('>').pop() : sub}`;
                            return (
                              <option key={`note-sub-${val}`} value={val}>
                                {val}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Realtime Voice Dictation Status */}
              {isListening && listeningTarget === 'note' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.74rem',
                  color: '#b91c1c',
                  backgroundColor: '#fee2e2',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  marginBottom: '0.5rem',
                  animation: 'fadeIn 0.2s ease-out'
                }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse-dot 1s infinite' }} />
                  <span style={{ fontWeight: 600 }}>Listening ({speechLang === 'hi-IN' ? 'Hindi' : 'English / Hinglish'})...</span>
                  {interimTranscript && <span style={{ color: '#450a0a', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{interimTranscript}"</span>}
                </div>
              )}

              {speechError && (
                <div style={{
                  fontSize: '0.72rem',
                  color: '#b91c1c',
                  backgroundColor: '#fef2f2',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginBottom: '0.5rem'
                }}>
                  ⚠️ {speechError}
                </div>
              )}

              <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={newNote} 
                  onChange={e => setNewNote(e.target.value)} 
                  placeholder={isListening && listeningTarget === 'note' ? "Listening... speak now..." : "Type or dictate remark..."} 
                  style={{ 
                    flex: 1, 
                    padding: '0.65rem 0.8rem', 
                    borderRadius: '8px', 
                    border: isListening && listeningTarget === 'note' ? '2px solid #ef4444' : '1px solid var(--border-light)', 
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }} 
                />

                {/* Voice Language Toggle (EN / HI) */}
                <button
                  type="button"
                  onClick={toggleSpeechLanguage}
                  title={`Click to switch speech language (Current: ${speechLang.startsWith('en') ? 'English' : 'Hindi'})`}
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0 0.45rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: speechLang === 'hi-IN' ? '#fef3c7' : 'var(--bg-surface)',
                    color: speechLang === 'hi-IN' ? '#b45309' : 'var(--accent-color)',
                    cursor: 'pointer',
                    height: '38px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none'
                  }}
                >
                  {speechLang.startsWith('en') ? 'EN' : 'HI'}
                </button>

                {/* Microphone Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleSpeechRecognition('note')}
                  title={isListening && listeningTarget === 'note' ? "Stop Voice Dictation" : "Dictate note with Voice"}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    border: isListening && listeningTarget === 'note' ? 'none' : '1px solid var(--border-light)',
                    backgroundColor: isListening && listeningTarget === 'note' ? '#ef4444' : 'var(--bg-surface)',
                    color: isListening && listeningTarget === 'note' ? '#ffffff' : 'var(--accent-color)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: isListening && listeningTarget === 'note' ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isListening && listeningTarget === 'note' ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                {/* Send Note Button */}
                <button 
                  type="submit" 
                  disabled={!newNote.trim() && !statusForNewNote}
                  title="Send Note"
                  style={{ 
                    width: '38px',
                    height: '38px',
                    background: (!newNote.trim() && !statusForNewNote) ? 'var(--border-light)' : 'var(--accent-color)', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: (!newNote.trim() && !statusForNewNote) ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Send size={16} />
                </button>
              </form>
              <style>{`
                @keyframes pulse-dot {
                  0% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.3; transform: scale(0.8); }
                  100% { opacity: 1; transform: scale(1); }
                }
              `}</style>
            </div>
          </>
        )}
      </div>
    </div>

    <style>{`
      @keyframes fadeInLeadModal {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleInLeadModal {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      @media (max-width: 768px) {
        .lead-modal-body {
          flex-direction: column !important;
          overflow-y: auto !important;
        }
        .lead-modal-left {
          width: 100% !important;
          max-width: 100% !important;
          border-right: none !important;
          border-bottom: 1px solid var(--border-light) !important;
        }
        .lead-modal-right {
          width: 100% !important;
          overflow: visible !important;
        }
      }
    `}</style>
  </div>
</div>
  );
}
