'use client';
import React, { useState, useEffect } from 'react';
import { PhoneOff, Mic, MicOff, UserX, UserPlus, Loader2, Users, Pause, Play } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ActiveCallPanel({ session, onCallEnded, agentData }) {
  const [members, setMembers] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  
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
      await fetchMembers();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleKick = async (memberId) => {
    if (!confirm('Are you sure you want to kick this participant?')) return;
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
  };

  const handleHangupAll = async () => {
    if (!confirm('End the call for everyone?')) return;
    setLoadingAction('hangup_all');
    try {
      await fetch('/api/plivo/controls/hangup-conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: session.room_name })
      });
      // The supabase subscription will catch the end event and close the panel.
    } finally {
      setLoadingAction(null);
    }
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
    <div style={{ background: '#fff', border: '1px solid #3b82f6', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
            Active Call Session
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>Room: {session.room_name}</p>
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
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> Live Participants ({members.length})
        </h3>
        
        {members.length === 0 ? (
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
            <Loader2 size={16} className="spin" style={{ display: 'inline', marginRight: '0.5rem' }} /> Waiting for participants to join...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map(member => (
              <div key={member.memberId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#f1f5f9', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem', overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={member.callerName || (member.direction === 'inbound' ? member.from : member.to) || member.callUuid}>
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
                          // strictly truncate extremely long names to ensure it doesn't break flex layout
                          name = name.substring(0, 15) + '...';
                        }
                      }
                      return name;
                    })()}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {member.memberId} • Joined: {member.joinTime}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button 
                    onClick={() => handleHoldToggle(member.memberId, member.deaf)}
                    disabled={loadingAction === `hold_${member.memberId}`}
                    title={member.deaf ? "Resume Call" : "Hold Call"}
                    style={{ background: member.deaf ? '#fef08a' : 'white', color: member.deaf ? '#ca8a04' : '#64748b', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `hold_${member.memberId}` ? <Loader2 size={16} className="spin" /> : (member.deaf ? <Play size={16} /> : <Pause size={16} />)}
                  </button>
                  <button 
                    onClick={() => handleMuteToggle(member.memberId, member.muted)}
                    disabled={loadingAction === `mute_${member.memberId}`}
                    title={member.muted ? "Unmute" : "Mute"}
                    style={{ background: member.muted ? '#fee2e2' : 'white', color: member.muted ? '#ef4444' : '#64748b', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `mute_${member.memberId}` ? <Loader2 size={16} className="spin" /> : (member.muted ? <MicOff size={16} /> : <Mic size={16} />)}
                  </button>
                  <button 
                    onClick={() => handleKick(member.memberId)}
                    disabled={loadingAction === `kick_${member.memberId}`}
                    title="Kick Participant"
                    style={{ background: 'white', color: '#ef4444', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {loadingAction === `kick_${member.memberId}` ? <Loader2 size={16} className="spin" /> : <UserX size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#475569', marginBottom: '0.75rem' }}>Merge 3rd Party (Add to Call)</h3>
        <form onSubmit={handleAddParticipant} style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flex: 1, border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
            <span style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', color: '#64748b', fontWeight: 500, borderRight: '1px solid #cbd5e1', display: 'flex', alignItems: 'center' }}>+91</span>
            <input 
              type="text" 
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Enter 10 digit number"
              maxLength={10}
              style={{ flex: 1, padding: '0.5rem 0.75rem', border: 'none', outline: 'none', fontSize: '0.9rem' }}
            />
          </div>
          <button 
            type="submit"
            disabled={loadingAction === 'add_participant' || newParticipant.length < 10}
            style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0 1rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: newParticipant.length < 10 ? 0.5 : 1 }}
          >
            {loadingAction === 'add_participant' ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
            Dial & Add
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  );
}
