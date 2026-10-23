'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, PhoneCall, Mic, MicOff, UserX, UserPlus, Loader2, Users, Pause, Play, UserRound, Headset } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useSoftphoneContacts } from './useSoftphoneContacts';
import styles from './Softphone.module.css';

export default function ActiveCallPanel({ session, onCallEnded, agentData, userId, onToggleMute, microphoneMuted = false, shortcutControlsRef, durationLabel = '00:00' }) {
  return <ActiveCallContent key={session?.room_name} session={session} onCallEnded={onCallEnded} agentData={agentData} userId={userId}
    onToggleMute={onToggleMute} microphoneMuted={microphoneMuted} shortcutControlsRef={shortcutControlsRef} durationLabel={durationLabel} />;
}

function ActiveCallContent({ session, onCallEnded, agentData, userId, onToggleMute, microphoneMuted, shortcutControlsRef, durationLabel }) {
  const [members, setMembers] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [heldMembers, setHeldMembers] = useState({});
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [consultation, setConsultation] = useState(null);
  const [consultationError, setConsultationError] = useState('');
  const consultationRef = useRef(null);
  const membersRequestRef = useRef(false);
  const currentRoomRef = useRef(session?.room_name);
  const hangupInFlightRef = useRef(false);
  const usesConsultation = () => session?.conference_name?.startsWith('mpc_') || !!consultationRef.current;
  const consultationPhases = ['preparing', 'dialing', 'ringing', 'consulting', 'merging', 'cancelling', 'failed'];
  const consultationBusy = consultation?.busy || consultationPhases.includes(consultation?.phase) || loadingAction === 'add_participant';
  const canMerge = consultation?.canMerge || consultation?.phase === 'consulting';
  const showMerge = !consultation?.controlsOnly || loadingAction === 'add_participant';
  const agentMember = members.find(member => member.callUuid === session.agent_call_uuid || member.memberId === 'agent_leg');
  const customerMember = members.find(member => member.callUuid === session.customer_call_uuid || member.memberId === 'customer_leg');
  const agentMuted = onToggleMute ? microphoneMuted : !!agentMember?.muted;
  const customerHeld = !!heldMembers[customerMember?.memberId];
  const isConnected = session.status === 'connected' || !!session.customer_answer_time;
  const canMute = isConnected && (!!onToggleMute || (!!agentMember && !consultationBusy && !loadingAction));
  const canHold = isConnected && !!customerMember && !consultationBusy && !loadingAction;
  const extraParties = members.filter(member => member.callUuid !== session.agent_call_uuid &&
    member.callUuid !== session.customer_call_uuid && !['agent_leg', 'customer_leg'].includes(member.memberId));
  const requiresEndConfirmation = extraParties.length > 0 ||
    (!!consultation && !consultation.controlsOnly && consultationPhases.includes(consultation.phase)) ||
    (!!session.conference_name && !consultation && members.length === 0);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });
  const participantPhone = member => member.phoneNumber ||
    ((member.callUuid === session.customer_call_uuid || member.memberId === 'customer_leg')
      ? session.customer_number : member.direction === 'inbound' ? member.from : member.to);
  const contactFor = useSoftphoneContacts(userId || agentData?.user_id, [session.customer_number,
    ...members.filter(member => member.callUuid !== session.agent_call_uuid && member.memberId !== 'agent_leg').map(participantPhone)
  ], agentData?.id || '');

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
            onCallEnded?.(payload.new);
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, onCallEnded]);

  const roomName = session?.room_name;
  const conferenceName = session?.conference_name;
  const fetchMembers = useCallback(async () => {
    if (membersRequestRef.current) return;
    const room = roomName;
    if (!room) return;
    membersRequestRef.current = true;
    try {
      if (conferenceName?.startsWith('mpc_') || consultationRef.current) {
        const res = await fetch(`/api/plivo/consultation?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
        const data = await res.json();
        if (currentRoomRef.current !== room) return;
        if (!res.ok || data.error) throw new Error(data.error || 'Call status is unavailable.');
        if (data.consultation) {
          consultationRef.current = data.consultation;
          setConsultation(data.consultation);
          setMembers(data.consultation.members || []);
          setHeldMembers(Object.fromEntries((data.consultation.members || []).map(member => [member.memberId, member.held])));
          setConsultationError('');
        }
        return;
      }
      const res = await fetch(`/api/plivo/controls/members?room=${encodeURIComponent(room)}`);
      const data = await res.json();
      if (currentRoomRef.current !== room) return;
      if (data.members) {
        if (data.members.length >= 2 && typeof window !== 'undefined' && window.__crm_stop_all_ringing) {
          window.__crm_stop_all_ringing(room);
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
      if ((conferenceName?.startsWith('mpc_') || consultationRef.current) && currentRoomRef.current === room) setConsultationError(err.message);
      else console.error(err);
    } finally {
      membersRequestRef.current = false;
    }
  }, [roomName, conferenceName]);

  useEffect(() => {
    currentRoomRef.current = roomName;
    const initialFetch = setTimeout(fetchMembers, 0);
    const interval = setInterval(fetchMembers, 2500);
    return () => {
      currentRoomRef.current = null;
      clearTimeout(initialFetch);
      clearInterval(interval);
      window.__crm_stop_all_ringing?.(roomName);
    };
  }, [fetchMembers, roomName]);

  const requestConsultation = async (action, extra = {}) => {
    const room = session.room_name;
    const res = await fetch('/api/plivo/consultation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: room, action, attemptId: consultationRef.current?.attemptId, ...extra }),
    });
    const data = await res.json();
    if (currentRoomRef.current !== room) return;
    if (!res.ok || data.error) throw new Error(data.error || 'Call action could not complete.');
    if (data.consultation) {
      consultationRef.current = data.consultation;
      setConsultation(data.consultation);
      setMembers(data.consultation.members || []);
      setHeldMembers(Object.fromEntries((data.consultation.members || []).map(member => [member.memberId, member.held])));
    }
    setConsultationError('');
  };

  const handleConsultationAction = async action => {
    setLoadingAction(`consultation_${action}`);
    try {
      await requestConsultation(action);
    } catch (error) {
      setConsultationError(error.message);
      await fetchMembers();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleMuteToggle = async (memberId, isMuted) => {
    const member = members.find(item => item.memberId === memberId);
    if (onToggleMute && (memberId === 'agent_leg' || member?.callUuid === session.agent_call_uuid)) {
      try { onToggleMute(); } catch (error) { setConsultationError(error.message); }
      return;
    }
    setLoadingAction(`mute_${memberId}`);
    try {
      if (['agent_leg', 'customer_leg'].includes(memberId)) {
        await requestConsultation('prepare-controls', {
          role: memberId === 'agent_leg' ? 'agent' : 'customer', control: isMuted ? 'unmute' : 'mute',
        });
        return;
      }
      if (usesConsultation()) {
        await requestConsultation(isMuted ? 'unmute' : 'mute', { memberId });
        return;
      }
      const response = await fetch('/api/plivo/controls/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: session.room_name,
          memberId,
          action: isMuted ? 'unmute' : 'mute'
        })
      });
      if (!response.ok) throw new Error('Mute could not complete. Please retry.');
      await fetchMembers();
    } catch (error) {
      setConsultationError(error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleHoldToggle = async (memberId, isHeld) => {
    setLoadingAction(`hold_${memberId}`);
    try {
      if (['agent_leg', 'customer_leg'].includes(memberId)) {
        await requestConsultation('prepare-controls', {
          role: memberId === 'agent_leg' ? 'agent' : 'customer', control: isHeld ? 'unhold' : 'hold',
        });
        return;
      }
      if (usesConsultation()) {
        await requestConsultation(isHeld ? 'unhold' : 'hold', { memberId });
        return;
      }
      const response = await fetch('/api/plivo/controls/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: session.room_name,
          memberId,
          action: isHeld ? 'unhold' : 'hold'
        })
      });
      if (!response.ok) throw new Error('Hold could not complete. Please retry.');
      setHeldMembers(prev => ({ ...prev, [memberId]: !isHeld }));
      await fetchMembers();
    } catch (e) {
      setConsultationError(e.message);
      await fetchMembers();
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
          if (usesConsultation()) {
            await requestConsultation('kick', { memberId });
            return;
          }
          await fetch('/api/plivo/controls/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomName: session.room_name,
              memberId
            })
          });
          await fetchMembers();
        } catch (error) {
          setConsultationError(error.message);
        } finally {
          setLoadingAction(null);
        }
      }
    });
  };

  const endCurrentCall = async () => {
    if (hangupInFlightRef.current) return;
    hangupInFlightRef.current = true;
    setLoadingAction('hangup_all');
    try {
      const response = await fetch('/api/plivo/controls/hangup-conference', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: session.room_name }),
      });
      if (!response.ok) throw new Error('Call could not be ended. Please retry.');
      onCallEnded?.();
    } catch (error) {
      setConsultationError(error.message);
    } finally {
      hangupInFlightRef.current = false;
      setLoadingAction(null);
    }
  };

  const handleHangupAll = () => {
    if (requiresEndConfirmation) {
      setConfirmModal({ isOpen: true, title: 'End All Calls?',
        message: 'This will disconnect everyone in this call. End all calls?',
        confirmLabel: 'End All Calls', onConfirm: endCurrentCall });
      return;
    }
    return endCurrentCall();
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (!newParticipant || newParticipant.length < 10) return;
    
    setLoadingAction('add_participant');
    setConsultationError('');
    try {
      await requestConsultation('start', { participantNumber: newParticipant });
      setNewParticipant('');
    } catch (err) {
      setConsultationError(err.message || 'Add Call could not complete.');
    } finally {
      setLoadingAction(null);
    }
  };

  // Register the same guarded actions used by the visible buttons. The parent
  // keeps this panel mounted while docked/minimized so shortcuts stay current.
  useEffect(() => {
    if (!shortcutControlsRef) return;
    const controls = {
      mute: () => handleMuteToggle(agentMember?.memberId || 'agent_leg', agentMuted),
      hold: () => handleHoldToggle(customerMember?.memberId || 'customer_leg', customerHeld),
      end: handleHangupAll, canMute, canHold,
      canEnd: loadingAction !== 'hangup_all', modalOpen: confirmModal.isOpen, requiresEndConfirmation,
    };
    shortcutControlsRef.current = controls;
    return () => { if (shortcutControlsRef.current === controls) shortcutControlsRef.current = null; };
  });

  return (
    <div className={styles.activePanel}>
      <div className={styles.callHeader}>
        <span className={styles.callEmblem}><PhoneCall size={20} /></span>
        <div className={styles.callSummary}>
          <h2 className={styles.callState} data-connected={!!(session.status === 'connected' || session.customer_answer_time)}>
            <span className={styles.callStateDot} />
            {(session.status === 'connected' || session.customer_answer_time) ? 'Call Connected' : (session.status === 'customer_ringing' ? 'Carrier is trying customer line...' : 'Connecting to Line...')}
            <span aria-label="Call duration" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {isConnected ? durationLabel : '00:00'}
            </span>
          </h2>
          <div className={styles.customerNumber} aria-label="Call contact name">
            {contactFor(session.customer_number).name}
          </div>
          <div className={styles.customerCaption}>+91 {(session.customer_number || '').replace(/[^0-9]/g, '').slice(-10) || 'Target Number'}</div>
        </div>
      </div>

      <div className={styles.callTools}>
        <div className={styles.callControls} aria-label="Call controls">
          <button type="button" className={styles.secondaryButton} aria-pressed={agentMuted}
            onClick={() => handleMuteToggle(agentMember?.memberId || 'agent_leg', agentMuted)}
            disabled={!canMute} title="Mute / Unmute (Ctrl+M)" aria-keyshortcuts="Control+m">
            {loadingAction === `mute_${agentMember?.memberId}` ? <Loader2 size={15} className="spin" /> : agentMuted ? <MicOff size={15} /> : <Mic size={15} />}
            {agentMuted ? 'Unmute' : 'Mute'}
          </button>
          <button type="button" className={styles.secondaryButton} aria-pressed={customerHeld}
            onClick={() => handleHoldToggle(customerMember?.memberId || 'customer_leg', customerHeld)}
            disabled={!canHold} title="Hold / Resume (Ctrl+H)" aria-keyshortcuts="Control+h">
            {loadingAction === `hold_${customerMember?.memberId}` ? <Loader2 size={15} className="spin" /> : customerHeld ? <Play size={15} /> : <Pause size={15} />}
            {customerHeld ? 'Resume' : 'Hold'}
          </button>
          <button type="button" onClick={handleHangupAll} disabled={loadingAction === 'hangup_all'}
            className={styles.dangerButton} title={`${requiresEndConfirmation ? 'End All Calls' : 'End Call'} (Ctrl+E)`} aria-keyshortcuts="Control+e">
            {loadingAction === 'hangup_all' ? <Loader2 size={15} className="spin" /> : <PhoneOff size={15} />}
            {requiresEndConfirmation ? 'End All' : 'End Call'}
          </button>
        </div>
        {(consultationBusy || canMerge || consultation?.phase === 'merged' || consultation?.error) && (
          <div role="status" aria-live="polite" className={styles.consultationStatus}>
            <strong>{consultation?.controlsOnly && consultation?.error ? 'Call control needs attention' : loadingAction === 'add_participant' ? 'Preparing Add Call…' : ({
              preparing: 'Preparing call controls…', dialing: 'Calling third person…',
              ringing: 'Third person is ringing…', consulting: 'Private call with third person',
              merging: 'Merging calls…', cancelling: 'Ending third-party call and resuming caller…',
              merged: 'Conference connected', active: 'Call connected', failed: 'Call controls need attention',
            })[consultation?.phase] || 'Preparing call controls…'}</strong>
            {consultation?.customerHeld && <div className={styles.consultationHint}>Existing caller is on hold and cannot hear this conversation.</div>}
            {(consultationBusy || canMerge) && (
              <>
                {showMerge && <div className={styles.consultationHint}>
                  {canMerge ? 'Select Merge to connect everyone.' : 'Merge becomes available when the third person connects.'}
                </div>}
                <div className={styles.consultationActions}>
                  {showMerge && <button type="button" onClick={() => handleConsultationAction('merge')}
                    disabled={!canMerge || !!loadingAction} className={styles.primaryButton}>
                    {loadingAction === 'consultation_merge' ? 'Merging…' : 'Merge Calls'}
                  </button>}
                  <button type="button" onClick={() => handleConsultationAction('cancel')}
                    disabled={!consultation || !!loadingAction || ['merging', 'cancelling'].includes(consultation?.phase)}
                    className={styles.secondaryButton}>Cancel & Resume</button>
                </div>
              </>
            )}
            {consultation?.error && <div className={styles.inlineError}>{consultation.error}</div>}
          </div>
        )}
        {consultationError && <div role="alert" className={styles.inlineError}>{consultationError}</div>}
      </div>

      <div>
        <h3 className={styles.participantsHeading}>
          <Users size={14} /> Live Participants ({members.length})
        </h3>
        
        <div className={styles.participants}>
          {/* Customer is pending until they actually join the conference. */}
          {(!session.customer_answer_time && session.status !== 'connected' && session.customer_number) && (
            <div className={styles.participant}>
              <span className={styles.avatar}><UserRound size={16} /></span>
              <div className={styles.participantInfo}>
                <div className={styles.participantName}>
                  {contactFor(session.customer_number).name}
                </div>
                <div className={styles.participantNumber}>+91 {(session.customer_number || '').replace(/[^0-9]/g, '').slice(-10)}</div>
                <div className={styles.pendingStatus}>
                  <Loader2 size={11} className="spin" /> {session.status === 'customer_ringing' ? 'Carrier connecting customer line...' : 'Connecting to telecom line...'}
                </div>
              </div>
            </div>
          )}

          {members.map(member => {
            const isAgent = member.callUuid === session.agent_call_uuid || member.memberId === 'agent_leg';
            const memberMuted = isAgent && onToggleMute ? microphoneMuted : member.muted;
            const rawPhone = participantPhone(member);
            const digits = String(rawPhone || '').replace(/\D/g, '');
            const phoneNumber = digits.length >= 10 ? `+91 ${digits.slice(-10)}` : '';
            return (
              <div key={member.memberId} className={styles.participant}>
                <span className={styles.avatar} data-agent={member.callUuid === session.agent_call_uuid || member.memberId === 'agent_leg'}>
                  {member.callUuid === session.agent_call_uuid || member.memberId === 'agent_leg' ? <Headset size={16} /> : <UserRound size={16} />}
                </span>
                <div className={styles.participantInfo}>
                  <div className={styles.participantName} title={isAgent ? member.callerName : contactFor(rawPhone).name}>
                    {(() => {
                      let name = isAgent ? member.callerName || (member.direction === 'inbound' ? member.from : member.to) || member.callUuid
                        : contactFor(rawPhone).name;
                      if (name && typeof name === 'string') {
                        if (name.startsWith('sip:')) {
                          name = name.replace('sip:', '').split('@')[0];
                        }
                        if (agentData && (name === agentData.plivo_username || name === agentData.plivo_sip_uri)) {
                          name = 'Agent (Me)';
                        }
                        if (isAgent && !phoneNumber && name.length > 15 && name !== 'Agent (Me)') {
                          name = name.substring(0, 15) + '...';
                        }
                      }
                      return name;
                    })()}
                  </div>
                  {phoneNumber && <div className={styles.participantNumber}>{phoneNumber}</div>}
                  {heldMembers[member.memberId] && <span className={styles.heldBadge}>On hold</span>}
                  <div className={styles.participantMeta} title={`ID: ${member.memberId} • Joined: ${member.joinTime}`}>ID: {member.memberId} • Joined: {member.joinTime}</div>
                </div>
                {!['agent_leg', 'customer_leg'].includes(member.memberId) && <div className={styles.participantControls}>
                  <button 
                    onClick={() => handleHoldToggle(member.memberId, heldMembers[member.memberId] || false)}
                    disabled={consultationBusy || !!loadingAction}
                    title={heldMembers[member.memberId] ? "Resume Call" : "Hold Call"}
                    className={styles.participantButton}
                    data-action="hold"
                    aria-pressed={!!heldMembers[member.memberId]}
                    aria-label={heldMembers[member.memberId] ? 'Resume Call' : 'Hold Call'}
                  >
                    {loadingAction === `hold_${member.memberId}` ? <Loader2 size={14} className="spin" /> : (heldMembers[member.memberId] ? <Play size={14} /> : <Pause size={14} />)}
                  </button>
                  <button 
                    onClick={() => handleMuteToggle(member.memberId, memberMuted)}
                    disabled={!(isAgent && onToggleMute) && (consultationBusy || !!loadingAction)}
                    title={memberMuted ? "Unmute" : "Mute"}
                    className={styles.participantButton}
                    aria-pressed={!!memberMuted}
                    aria-label={memberMuted ? 'Unmute' : 'Mute'}
                  >
                    {loadingAction === `mute_${member.memberId}` ? <Loader2 size={14} className="spin" /> : (memberMuted ? <MicOff size={14} /> : <Mic size={14} />)}
                  </button>
                  <button 
                    onClick={() => handleKick(member.memberId)}
                    disabled={consultationBusy || !!loadingAction}
                    title="Kick Participant"
                    className={styles.participantButton}
                    data-action="remove"
                    aria-label="Kick Participant"
                  >
                    {loadingAction === `kick_${member.memberId}` ? <Loader2 size={14} className="spin" /> : <UserX size={14} />}
                  </button>
                </div>}
              </div>
            );
          })}
          </div>
      </div>

      <div className={styles.consultationSection}>
        <div className={styles.activeActions}>
        <button
          type="button"
          onClick={() => setShowAddParticipant(!showAddParticipant)}
          className={styles.secondaryButton}
          disabled={!!loadingAction}
        >
          <UserPlus size={14} /> {showAddParticipant ? 'Hide Add Call' : '+ Add Call'}
        </button>
        </div>
        {showAddParticipant && (
          <form onSubmit={handleAddParticipant} className={styles.addCallForm}>
            <div className={styles.numberField}>
              <span className={styles.countryCode}>+91</span>
              <input 
                type="text" 
                value={newParticipant}
                disabled={consultationBusy || !!loadingAction || session.status !== 'connected'}
                onChange={(e) => setNewParticipant(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10 digit number"
                maxLength={10}
                className={styles.textInput}
                aria-label="Third person phone number"
                inputMode="numeric"
              />
            </div>
            <button 
              type="submit"
              disabled={consultationBusy || !!loadingAction || session.status !== 'connected' || newParticipant.length < 10}
              className={styles.primaryButton}
            >
              {loadingAction === 'add_participant' ? <Loader2 size={13} className="spin" /> : <UserPlus size={13} />}
              Hold & Call
            </button>
          </form>
        )}
      </div>

      {/* Custom Premium Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={confirmModal.title}>
            <h3 className={styles.modalTitle}>
              {confirmModal.title}
            </h3>
            <p className={styles.modalMessage}>
              {confirmModal.message}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
