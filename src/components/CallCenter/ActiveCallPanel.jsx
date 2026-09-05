'use client';
import React, { useState, useEffect } from 'react';
import { PhoneOff, Mic, MicOff, UserX, UserPlus, Loader2, Users, Pause, Play } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ActiveCallPanel({ session, onCallEnded, agentData }) {
  const [members, setMembers] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [heldMembers, setHeldMembers] = useState({});
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });
  
  useEffect(() => {
    let interval;
    if (session && session.room_name) {
      fetchMembers();
      interval = setInterval(fetchMembers, 2500); // Poll every 2.5s for live updates
    }
    return () => clearInterval(interval);
  }, [session]);

  // Also listen to supabase changes for this session
  useEffect(() => {
    if (!session) return;
    const supabase = createClient();
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          if (payload.new.status === 'ended' || payload.new.status === 'failed') {
            onCallEnded();
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, onCallEnded]);

  const fetchMembers = async () => {
    try {
      const res = await fetch(`/api/plivo/controls/members?room=${session.room_name}`);
      const data = await res.json();
      if (data.members) {
        if (data.members.length >= 2 && typeof window !== 'undefined' && window.__crm_stop_all_ringing) {
          window.__crm_stop_all_ringing(session?.room_name);
        }
        setMembers(prev => {
          if (prev.length === data.members.length) {
            const hasChange = data.members.some((m, idx) => {
              const p = prev[idx];
              return p.memberId !== m.memberId || p.muted !== m.muted || p.callerName !== m.callerName;
            });
            if (!hasChange) return prev;
          }
          return data.members;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMuteToggle = async (memberId, isMuted) => {
    setLoadingAction(`mute_${memberId}`);
    try {
      await fetch('/api/plivo/controls/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: session.room_name,
          memberId,
          action: isMuted ? 'unmute' : 'mute'
        })
      });
      await fetchMembers();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleHoldToggle = async (memberId, isHeld) => {
    setLoadingAction(`hold_${memberId}`);
    try {
      await fetch('/api/plivo/controls/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: session.room_name,
          memberId,
          action: isHeld ? 'unhold' : 'hold'
        })
      });
      setHeldMembers(prev => ({ ...prev, [memberId]: !isHeld }));
      await fetchMembers();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleKick = (memberId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Kick Participant?',
      message: 'Are you sure you want to kick this participant from the call?',
      onConfirm: async () => {
        setLoadingAction(`kick_${memberId}`);
        try {
          await fetch('/api/plivo/controls/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomName: session.room_name,
              memberId
            })
          });
          await fetchMembers();
        } finally {
          setLoadingAction(null);
        }
      }
    });
  };

  const handleHangupAll = () => {
    setConfirmModal({
      isOpen: true,
      title: 'End Call For All?',
      message: 'This will hang up the call for all participants and end the call session. Are you sure?',
      onConfirm: async () => {
        setLoadingAction('hangup_all');
        try {
          await fetch('/api/plivo/controls/hangup-conference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: session.room_name })
          });
          if (onCallEnded) onCallEnded();
        } finally {
          setLoadingAction(null);
        }
      }
    });
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (!newParticipant || newParticipant.length < 10) return;
    
    setLoadingAction('add_participant');
    try {
      await fetch('/api/plivo/controls/add-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: session.room_name,
          participantNumber: newParticipant
        })
      });
      setNewParticipant('');
      alert('Dialing new participant...');
    } catch (err) {
      alert('Failed to add participant');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--neumorphic-shadow-flat)', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
            Active Call Session
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>Room: {session.room_name}</p>
        </div>
        <button 
          onClick={handleHangupAll}
          disabled={loadingAction === 'hangup_all'}
          style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        >
          {loadingAction === 'hangup_all' ? <Loader2 size={16} className="spin" /> : <PhoneOff size={16} />}
          End Call For All
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> Live Participants ({members.length})
        </h3>
        
        {members.length === 0 ? (
          <div style={{ padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <Loader2 size={16} className="spin" style={{ display: 'inline', marginRight: '0.5rem' }} /> Waiting for participants to join...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map(member => (
              <div key={member.memberId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-primary)', borderRadius: '8px', borderLeft: '4px solid var(--accent-color)' }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={member.callerName || (member.direction === 'inbound' ? member.from : member.to) || member.callUuid}>
                    {(() => {
                      let name = member.callerName || (member.direction === 'inbound' ? member.from : member.to) || member.callUuid;
                      if (name && typeof name === 'string') {
                        if (name.startsWith('sip:')) {
                          name = name.replace('sip:', '').split('@')[0];
                        }
                        if (agentData && (name === agentData.plivo_username || name === agentData.plivo_sip_uri)) {
                          name = 'Agent (Me)';
                        }
                        if (name.length > 15 && name !== 'Agent (Me)') {
                          name = name.substring(0, 15) + '...';
                        }
                      }
                      return name;
                    })()}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {member.memberId} • Joined: {member.joinTime}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button 
                    onClick={() => handleHoldToggle(member.memberId, heldMembers[member.memberId] || false)}
                    disabled={loadingAction === `hold_${member.memberId}`}
                    title={heldMembers[member.memberId] ? "Resume Call" : "Hold Call"}
                    style={{ background: heldMembers[member.memberId] ? 'var(--status-contacted-bg)' : 'var(--bg-surface)', color: heldMembers[member.memberId] ? 'var(--status-contacted-text)' : 'var(--text-secondary)', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `hold_${member.memberId}` ? <Loader2 size={16} className="spin" /> : (heldMembers[member.memberId] ? <Play size={16} /> : <Pause size={16} />)}
                  </button>
                  <button 
                    onClick={() => handleMuteToggle(member.memberId, member.muted)}
                    disabled={loadingAction === `mute_${member.memberId}`}
                    title={member.muted ? "Unmute" : "Mute"}
                    style={{ background: member.muted ? 'var(--status-new-bg)' : 'var(--bg-surface)', color: member.muted ? 'var(--status-new-text)' : 'var(--text-secondary)', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `mute_${member.memberId}` ? <Loader2 size={16} className="spin" /> : (member.muted ? <MicOff size={16} /> : <Mic size={16} />)}
                  </button>
                  <button 
                    onClick={() => handleKick(member.memberId)}
                    disabled={loadingAction === `kick_${member.memberId}`}
                    title="Kick Participant"
                    style={{ background: 'var(--bg-surface)', color: '#ef4444', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `kick_${member.memberId}` ? <Loader2 size={16} className="spin" /> : <UserX size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Merge 3rd Party (Add to Call)</h3>
        <form onSubmit={handleAddParticipant} style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flex: 1, border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-surface)' }}>
            <span style={{ background: 'var(--bg-primary)', padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 500, borderRight: '1px solid var(--border-light)', display: 'flex', alignItems: 'center' }}>+91</span>
            <input 
              type="text" 
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Enter 10 digit number"
              maxLength={10}
              style={{ flex: 1, padding: '0.5rem 0.75rem', border: 'none', outline: 'none', fontSize: '0.9rem', background: 'transparent', color: 'var(--text-primary)' }}
            />
          </div>
          <button 
            type="submit"
            disabled={loadingAction === 'add_participant' || newParticipant.length < 10}
            style={{ background: 'var(--accent-color)', color: 'var(--bg-surface)', border: 'none', padding: '0 1rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: newParticipant.length < 10 ? 0.5 : 1 }}
          >
            {loadingAction === 'add_participant' ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
            Dial & Add
          </button>
        </form>
      </div>

      {/* Custom Premium Confirmation Modal */}
      {confirmModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '1.75rem',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.4)',
            textAlign: 'center',
            animation: 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem' }}>
              {confirmModal.title}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="confirm-btn-cancel"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  flex: 1,
                  padding: '0.6rem 1rem',
                  background: '#334155',
                  color: '#cbd5e1',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-btn-danger"
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
                style={{
                  flex: 1,
                  padding: '0.6rem 1rem',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .confirm-btn-cancel:hover {
          background: #475569 !important;
          color: #f8fafc !important;
          border-color: #64748b !important;
        }
        .confirm-btn-danger:hover {
          background: #dc2626 !important;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important;
        }
      `}</style>
    </div>
  );
}
