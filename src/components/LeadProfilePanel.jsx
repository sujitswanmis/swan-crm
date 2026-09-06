'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { logAuditAction } from '@/app/actions/audit';
import { getLeadCallHistory } from '@/app/actions/team';
import { enqueueOfflineAction, canPerformOfflineAction } from '@/utils/offlineSync';
import { normalizeLeadRecord, normalizeEmployeeName } from '@/utils/dataSanitizer';
import { X, Send, Play, Pause, Phone, Volume2, RotateCw } from 'lucide-react';

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

export default function LeadProfilePanel({ lead, isOpen = true, mode, onClose, onLeadUpdate, userName }) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

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

    // Immediately seed with existing notes
    if (Array.isArray(lead.lead_notes)) {
      setNotes([...lead.lead_notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
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
      deal_value: lead.deal_value || 0,
      source: lead.source || 'Website'
    });

    // Fetch ALL existing notes fresh from database
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
        setNotes(allNotes);
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

  // Unified chronological timeline of notes & calls
  const unifiedHistory = useMemo(() => {
    const list = [];

    // Format notes
    notes.forEach(n => {
      list.push({
        id: `note_${n.id}`,
        type: 'note',
        createdAt: n.created_at,
        text: n.note_text,
        createdBy: n.created_by,
        raw: n
      });
    });

    // Format calls
    callLogs.forEach(c => {
      list.push({
        id: `call_${c.id}`,
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
    if (!newNote.trim()) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('leadNotes');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
    }

    const actor = normalizeEmployeeName(userName || 'Agent');
    const createdNote = {
      id: `local_note_${Date.now()}`,
      lead_id: lead.id,
      note_text: newNote,
      created_by: actor,
      created_at: new Date().toISOString()
    };

    const updatedNotes = [createdNote, ...notes];
    setNotes(updatedNotes);
    if (onLeadUpdate) {
      onLeadUpdate({
        ...lead,
        lead_notes: updatedNotes,
        is_offline_pending: true
      });
    }
    const noteContent = newNote;
    setNewNote('');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineAction('create', 'lead_note', { lead_id: lead.id, note_text: noteContent, created_by: actor });
      return;
    }

    try {
      const { data: inserted, error } = await supabase
        .from('lead_notes')
        .insert([{ lead_id: lead.id, note_text: noteContent, created_by: actor }])
        .select()
        .single();

      if (error) throw error;
      if (inserted) {
        setNotes((current) => current.map(n => n.id === createdNote.id ? inserted : n));
      }
    } catch (netErr) {
      console.warn('Network addNote failed, fallback to offline queue:', netErr);
      const check = canPerformOfflineAction('leadNotes');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
      await enqueueOfflineAction('create', 'lead_note', { lead_id: lead.id, note_text: noteContent, created_by: actor });
    }
  };

  const handleFollowUpChange = async (e) => {
    const newDate = e.target.value;
    const actor = userName || 'System';

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('leadFollowUp');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
    }

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
        onLeadUpdate({ ...lead, follow_up_date: null, is_offline_pending: true });
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: null });
        return;
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
        console.warn('Network update failed, fallback to offline:', netErr);
        const check = canPerformOfflineAction('leadFollowUp');
        if (!check.allowed) {
          alert(check.reason);
          return;
        }
        await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: null });
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
      onLeadUpdate({ ...lead, follow_up_date: isoDateStr, is_offline_pending: true });
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: isoDateStr });
      return;
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
      console.warn('Network update failed, fallback to offline:', netErr);
      const check = canPerformOfflineAction('leadFollowUp');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
      await enqueueOfflineAction('update', 'lead', { id: lead.id, follow_up_date: isoDateStr });
    }
  };

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleSaveEdit = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('profileEdit');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
    }

    const cleanForm = normalizeLeadRecord({ ...editForm });
    const actor = normalizeEmployeeName(userName || 'System');

    if (onLeadUpdate) {
      onLeadUpdate({ ...lead, ...cleanForm, is_offline_pending: true });
    }
    setIsEditing(false);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineAction('update', 'lead', { ...cleanForm, id: lead.id });
      alert('⚡ Offline Mode: Profile changes saved to device! They will sync to cloud when connected.');
      return;
    }

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
      console.warn('Network update failed, fallback to offline:', netErr);
      const check = canPerformOfflineAction('profileEdit');
      if (!check.allowed) {
        alert(check.reason);
        return;
      }
      await enqueueOfflineAction('update', 'lead', { ...cleanForm, id: lead.id });
      alert('⚡ Network issue: Profile changes saved to device! They will sync to cloud automatically.');
    }
  };

  if (!isOpen || !lead) return null;

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 999 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', backgroundColor: 'var(--bg-surface)', zIndex: 1000, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, marginRight: '1rem' }}>
              <input name="name" value={editForm.name} onChange={handleEditChange} style={{ fontSize: '1.25rem', fontWeight: 600, padding: '0.25rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input name="company" value={editForm.company} onChange={handleEditChange} placeholder="Company" style={{ padding: '0.25rem', width: '50%' }} />
                <input name="phone" value={editForm.phone} onChange={handleEditChange} placeholder="Phone" style={{ padding: '0.25rem', width: '50%' }} />
              </div>
              <input name="email" value={editForm.email} onChange={handleEditChange} placeholder="Email" style={{ padding: '0.25rem', width: '100%' }} />
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {lead.name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{lead.company} | {lead.phone}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{lead.email}</p>
            </div>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}><X size={20} color="var(--text-secondary)" /></button>
        </div>

        {/* Lead Info Details */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', fontSize: '0.85rem' }}>
          
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>Status:</span> <b>{lead.status}</b></div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Priority:</span> <b>{lead.priority}</b></div>
            
            {isEditing ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Value (₹):</span>
                  <input type="number" name="deal_value" value={editForm.deal_value} onChange={handleEditChange} style={{ padding: '0.25rem' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Source:</span>
                  <select name="source" value={editForm.source} onChange={handleEditChange} style={{ padding: '0.25rem' }}>
                    <option value="Website">Website</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Referral">Referral</option>
                    <option value="Cold Call">Cold Call</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Our Company:</span>
                  <select name="our_company" value={editForm.our_company || ''} onChange={handleEditChange} style={{ padding: '0.25rem' }}>
                    <option value="">None</option>
                    <option value="NSMLR">NSMLR</option>
                    <option value="NSTLP">NSTLP</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div><span style={{ color: 'var(--text-secondary)' }}>Value:</span> <b>₹{lead.deal_value || 0}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Source:</span> <b>{lead.source}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Our Company:</span> <b>{lead.our_company || 'Unassigned'}</b></div>
              </>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontWeight: 600, color: 'var(--accent-color)' }}>🗓️ Next Follow-up Date</label>
            <input 
              type="datetime-local" 
              value={followUpDate} 
              onChange={handleFollowUpChange}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
            />
          </div>
        </div>

        {/* Show Notes Section only if mode is history or not editing */}
        {(!isEditing || mode === 'history') && (
          <>
            {/* Notes & Call History Section */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

            {/* Add Note Input */}
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
              <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={newNote} 
                  onChange={e => setNewNote(e.target.value)} 
                  placeholder="Add a note..." 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} 
                />
                <button type="submit" style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', padding: '0 1rem', cursor: 'pointer' }}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}
