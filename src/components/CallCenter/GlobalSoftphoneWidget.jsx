'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, Minimize2, Maximize2, Loader2, ShieldAlert, GripHorizontal } from 'lucide-react';
import Draggable from 'react-draggable';
import ActiveCallPanel from './ActiveCallPanel';
import { getRecentCalls } from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';

export default function GlobalSoftphoneWidget({ userId }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const supabase = createClient();
  const [plivoClient, setPlivoClient] = useState(null);
  const [connectionState, setConnectionState] = useState('offline'); // offline, connecting, online, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeSession, setActiveSession] = useState(null);
  const [callNotice, setCallNotice] = useState(null); // Notice banner for Busy, Switched Off, Rejected, etc.
  const [sdkStatus, setSdkStatus] = useState({ isRegistered: false, isConnected: false });
  const [agentData, setAgentData] = useState(null);
  // Dialer state
  const [customerNumber, setCustomerNumber] = useState('');
  const [callingMode, setCallingMode] = useState('browser_webrtc');
  const [agentMobile, setAgentMobile] = useState('');
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const durationTimerRef = useRef(null);
  const plivoClientRef = useRef(null);
  const nodeRef = useRef(null);

  const getCallStatusText = useCallback((session) => {
    if (!session) return { text: 'Ringing Customer...', color: '#3b82f6' };
    const s = session.status;
    const cause = (session.hangup_cause || '').toUpperCase();

    if (s === 'connected') return { text: 'Call Connected', color: '#10b981' };
    if (s === 'initiated') return { text: 'Connecting Employee...', color: '#f59e0b' };
    if (s === 'agent_answered' || s === 'customer_ringing' || s === 'ringing') {
      return { text: 'Ringing Customer...', color: '#3b82f6' };
    }

    if (s === 'busy' || cause.includes('BUSY')) {
      return { text: 'Customer Busy (User Busy)', color: '#ef4444' };
    }
    if (s === 'rejected' || cause.includes('REJECT')) {
      return { text: 'Call Rejected by Customer', color: '#ef4444' };
    }
    if (s === 'no_answer' || cause.includes('NO_ANSWER') || cause.includes('TIMEOUT')) {
      return { text: 'No Answer / Ring Timeout', color: '#f59e0b' };
    }
    if (s === 'switched_off' || cause.includes('ABSENT') || cause.includes('UNALLOCATED') || cause.includes('CONGESTION')) {
      return { text: 'Switched Off / Out of Network / Unreachable', color: '#ef4444' };
    }
    if (s === 'ended') {
      if (session.talk_duration_sec > 0) return { text: 'Call Ended', color: '#6b7280' };
      return { text: 'Call Ended / Unanswered', color: '#ef4444' };
    }
    return { text: 'Call Failed / Not Answered', color: '#ef4444' };
  }, []);

  const showNotice = useCallback((text, color = '#ef4444') => {
    setCallNotice({ text, color });
    setTimeout(() => {
      setCallNotice(null);
    }, 4000);
  }, []);

  const hangupCall = useCallback(() => {
    if (activeSession?.room_name) {
      fetch('/api/plivo/controls/hangup-conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: activeSession.room_name })
      }).catch(e => console.error("Hangup API error:", e));
    }
    if (plivoClientRef.current) {
      try {
        plivoClientRef.current.hangup();
      } catch (e) {
        console.error("Error during WebRTC hangup:", e);
      }
    }
    setActiveCall(null);
    setActiveSession(null);
  }, [activeSession?.room_name]);

  const updateActiveSession = useCallback((newSession) => {
    setActiveSession(prev => {
      if (!prev && !newSession) return null;
      
      const isTerminalState = (s) => ['ended', 'failed', 'busy', 'rejected', 'no_answer', 'switched_off'].includes(s?.status);

      if (!prev && newSession) {
        if (isTerminalState(newSession)) {
          const info = getCallStatusText(newSession);
          showNotice(info.text, info.color);
          return null;
        }
        return newSession;
      }

      if (prev && (!newSession || isTerminalState(newSession))) {
        const info = getCallStatusText(newSession || prev);
        showNotice(info.text, info.color);
        if (plivoClientRef.current) {
          try { plivoClientRef.current.hangup(); } catch (_e) {}
        }
        setActiveCall(null);
        return null;
      }

      if (prev.id === newSession.id && prev.status === newSession.status && prev.customer_member_id === newSession.customer_member_id) {
        return prev;
      }
      return newSession;
    });
  }, [getCallStatusText, showNotice]);

  // Load saved position on mount
  useEffect(() => {
    const saved = localStorage.getItem('softphone_position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(parsed);
        }
      } catch (e) {
        console.error("Error loading softphone position:", e);
      }
    }
  }, []);

  // Auto-adjust position when minimized state changes to prevent off-screen overflow
  useEffect(() => {
    const height = isMinimized ? 50 : 520;
    const width = isMinimized ? 280 : 360;
    
    const x_min = 40 + width - window.innerWidth;
    const y_min = 40 + height - window.innerHeight;
    
    setPosition(prev => {
      const clampedX = Math.max(x_min, Math.min(0, prev.x));
      const clampedY = Math.max(y_min, Math.min(0, prev.y));
      if (clampedX !== prev.x || clampedY !== prev.y) {
        const newPos = { x: clampedX, y: clampedY };
        localStorage.setItem('softphone_position', JSON.stringify(newPos));
        return newPos;
      }
      return prev;
    });
  }, [isMinimized]);

  // Keep widget within screen bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      const height = isMinimized ? 50 : 520;
      const width = isMinimized ? 280 : 360;
      
      const x_min = 40 + width - window.innerWidth;
      const y_min = 40 + height - window.innerHeight;
      
      setPosition(prev => {
        const clampedX = Math.max(x_min, Math.min(0, prev.x));
        const clampedY = Math.max(y_min, Math.min(0, prev.y));
        if (clampedX !== prev.x || clampedY !== prev.y) {
          const newPos = { x: clampedX, y: clampedY };
          localStorage.setItem('softphone_position', JSON.stringify(newPos));
          return newPos;
        }
        return prev;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized]);

  const handleDrag = (e, ui) => {
    setPosition({ x: ui.x, y: ui.y });
  };

  const handleDragStop = (e, ui) => {
    const newPos = { x: ui.x, y: ui.y };
    setPosition(newPos);
    localStorage.setItem('softphone_position', JSON.stringify(newPos));
  };

  // Fetch agent profile
  useEffect(() => {
    if (!userId) return;
    const fetchAgent = async () => {
      const adminClient = require('@supabase/supabase-js').createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { data } = await adminClient
        .from('call_agents')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (data) setAgentData(data);
    };
    fetchAgent();
  }, [userId]);

  // Realtime Active Session listener and polling backup
  useEffect(() => {
    if (!agentData) return;

    const fetchSession = async () => {
      const { data } = await getRecentCalls(agentData.id);
      if (data) {
        const active = data.find(c => {
          const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected'].includes(c.status);
          const ageInMs = new Date() - new Date(c.created_at);
          if (['initiated', 'ringing'].includes(c.status) && ageInMs > 120000) return false;
          const isRecent = ageInMs < 1000 * 60 * 60;
          return isStatusActive && isRecent;
        });
        updateActiveSession(active || null);
      }
    };

    fetchSession();

    // Subscribe to realtime database changes for call_sessions
    const channel = supabase
      .channel(`agent_call_sessions_${agentData.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_sessions',
        filter: `agent_id=eq.${agentData.id}`
      }, (payload) => {
        const updated = payload.new;
        if (payload.eventType === 'DELETE' || !updated) {
          updateActiveSession(null);
          return;
        }

        const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected'].includes(updated.status);
        const ageInMs = new Date() - new Date(updated.created_at);
        const isRecent = ageInMs < 1000 * 60 * 60;

        if (isStatusActive && isRecent) {
          updateActiveSession(updated);
        } else {
          updateActiveSession(null);
        }
      })
      .subscribe();

    // 5-second polling fallback to ensure state remains in sync even if websocket drops
    const interval = setInterval(fetchSession, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [agentData, supabase, updateActiveSession]);

  const connectSoftphone = useCallback(async (clientInstance = plivoClient) => {
    if (!clientInstance) return;
    setConnectionState('connecting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/plivo/token', { method: 'POST' });
      const data = await res.json();
      if (data.username && data.password) {
        clientInstance.login(data.username, data.password);
      } else if (data.token) {
        clientInstance.loginWithAccessToken(data.token);
      } else {
        setConnectionState('error');
        setErrorMessage(data.error || 'Failed to fetch credentials');
      }
    } catch (err) {
      setConnectionState('error');
      setErrorMessage(err.message || 'Failed to fetch credentials');
    }
  }, [plivoClient]);

  useEffect(() => {
    let activeClient = null;
    const initPlivo = async () => {
      try {
        const PlivoModule = await import('plivo-browser-sdk');
        const Plivo = PlivoModule.default || PlivoModule;
        
        const plivoObj = new Plivo({
          enableTracking: true,
          closeProtection: true,
          debug: 'ALL',
          clientRegion: 'south_asia'
        });
        const client = plivoObj.client;
        activeClient = client;
        plivoClientRef.current = client;

        client.on('onLogin', () => {
          setConnectionState('online');
          setSdkStatus({ isRegistered: true, isConnected: true });
        });

        client.on('onLoginFailed', (reason) => {
          setConnectionState('error');
          setErrorMessage('Login failed: ' + reason);
          setSdkStatus({ isRegistered: false, isConnected: false });
        });

        client.on('onLogout', () => {
          setConnectionState('offline');
          setSdkStatus({ isRegistered: false, isConnected: false });
        });

        client.on('onConnectionChange', (state) => {
          if (state && (state.status === 'disconnected' || state.status === 'failed')) {
            setConnectionState('error');
            setErrorMessage('Connection lost: ' + (state.reason || 'Disconnected'));
            setSdkStatus(prev => ({ ...prev, isConnected: false }));
          } else if (state && state.status === 'connected') {
            setSdkStatus(prev => ({ ...prev, isConnected: true }));
          }
        });

        client.on('onIncomingCall', (callerName, extraHeaders, callInfo) => {
          setIncomingCall({ callerName, extraHeaders, callInfo });
          setIsMinimized(false); // Auto-expand on incoming call
          
          // Auto-answer logic for outbound calls initiated by the agent
          if (localStorage.getItem('pendingOutboundCall') === 'true') {
            localStorage.removeItem('pendingOutboundCall');
            // Auto answer immediately for smooth agent experience
            setTimeout(() => {
              client.answer();
              setIncomingCall(null);
              setActiveCall({ callerName, isOutbound: true });
            }, 300);
          }
        });

        client.on('onCallAnswered', () => {
          setActiveCall(prev => ({ ...prev, status: 'connected' }));
        });

        client.on('onCallTerminated', () => {
          setActiveCall(null);
          setIncomingCall(null);
        });

        setPlivoClient(client);

        // Auto login if agent credentials available
        connectSoftphone(client);
      } catch (err) {
        console.error("Plivo SDK init error:", err);
      }
    };

    initPlivo();

    return () => {
      if (activeClient) {
        try {
          activeClient.logout();
        } catch(e) {}
      }
    };
  }, [connectSoftphone]);

  // Declarative Call Duration Timer based on activeSession status
  useEffect(() => {
    if (activeSession && activeSession.status === 'connected') {
      const startTime = activeSession.customer_answer_time 
        ? new Date(activeSession.customer_answer_time).getTime() 
        : Date.now();

      const updateTimer = () => {
        setCallDuration(Math.floor((Date.now() - startTime) / 1000));
      };

      updateTimer();
      durationTimerRef.current = setInterval(updateTimer, 1000);
    } else {
      setCallDuration(0);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    }

    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [activeSession?.status, activeSession === null]);

  const answerCall = () => {
    if (plivoClientRef.current) {
      plivoClientRef.current.answer();
      setActiveCall(incomingCall);
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (plivoClientRef.current) {
      plivoClientRef.current.reject();
      setIncomingCall(null);
    }
  };

  const toggleMute = () => {
    if (plivoClientRef.current) {
      if (isMuted) {
        plivoClientRef.current.unmute();
        setIsMuted(false);
      } else {
        plivoClientRef.current.mute();
        setIsMuted(true);
      }
    }
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStartCall = async (e) => {
    e.preventDefault();
    if (!customerNumber) return;

    try {
      if (callingMode === 'browser_webrtc') {
        localStorage.setItem('pendingOutboundCall', 'true');
      }

      const res = await fetch('/api/plivo/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber,
          callingMode,
          agentEndpoint: agentData?.plivo_sip_uri,
          agentMobile
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to initiate call');
      } else {
        // Softphone state will auto-update via Realtime listener / polling
      }
    } catch (err) {
      alert("Failed to start call");
    }
  };

  if (!agentData) return null; // Don't show widget if not an agent

  const isSessionActive = activeSession && !['ended', 'failed', 'busy', 'rejected', 'no_answer', 'switched_off'].includes(activeSession.status);
  const hasActiveInteraction = activeCall || incomingCall || isSessionActive;

  return (
    <Draggable 
      nodeRef={nodeRef} 
      handle=".drag-handle" 
      position={position}
      onDrag={handleDrag}
      onStop={handleDragStop}
    >
      <div ref={nodeRef} style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: isMinimized ? '280px' : '360px',
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
        zIndex: 99999,
        border: '1px solid var(--border-light)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* Header Drag Handle */}
        <div className="drag-handle" style={{
          padding: '0.75rem 1rem',
          background: 'var(--bg-primary)',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          cursor: 'grab',
          userSelect: 'none',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
            <GripHorizontal size={16} style={{ color: 'var(--text-secondary)' }} />
            <PhoneCall size={16} color="#3b82f6" />
            <span>CRM Softphone</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Status indicator dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: connectionState === 'online' ? '#10b981' : '#ef4444' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectionState === 'online' ? '#10b981' : '#ef4444' }} />
              {!isMinimized && (connectionState === 'online' ? 'Online' : 'Offline')}
            </div>

            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Widget Body */}
        {!isMinimized && (
          <div style={{ padding: '1rem' }}>
            {/* Agent / Connection Status */}
            <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>SIP Endpoint:</span>
                <span style={{ fontWeight: 600 }}>{agentData?.plivo_sip_uri?.split('@')[0] || 'Unassigned'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                <span style={{ color: connectionState === 'online' ? '#10b981' : connectionState === 'connecting' ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                  {connectionState.toUpperCase()}
                </span>
              </div>
              {connectionState !== 'online' && (
                <button 
                  onClick={() => connectSoftphone()}
                  style={{ marginTop: '0.5rem', width: '100%', padding: '0.4rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  Reconnect Softphone
                </button>
              )}
            </div>

            {errorMessage && (
              <div style={{ fontSize: '0.8rem', color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
                {errorMessage}
              </div>
            )}

            {/* Status Feedback Notice Banner (Busy, Switched Off, Rejected, No Answer) */}
            {callNotice && (
              <div style={{ background: callNotice.color === '#10b981' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${callNotice.color}`, padding: '0.75rem', borderRadius: '8px', textAlign: 'center', marginBottom: '1rem', color: callNotice.color, fontWeight: 700, fontSize: '0.85rem' }}>
                {callNotice.text}
              </div>
            )}

            {/* Incoming Call */}
            {incomingCall && (
              <div className="pulse" style={{ background: '#3b82f6', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Incoming Call</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>{incomingCall.callerName || 'Unknown Caller'}</div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button onClick={rejectCall} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '24px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <PhoneOff size={14} /> Reject
                  </button>
                  <button onClick={answerCall} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '24px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Phone size={14} /> Answer
                  </button>
                </div>
              </div>
            )}

            {/* Active Call Status & Controls */}
            {(activeCall || isSessionActive) && (
              <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', textAlign: 'center', marginBottom: '1rem', border: '1px solid var(--border-light)' }}>
                <div style={{ color: getCallStatusText(activeSession).color, fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  {activeSession?.status !== 'connected' && <Loader2 size={14} className="animate-spin" />}
                  {getCallStatusText(activeSession).text}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                  {activeSession?.status === 'connected' ? formatDuration(callDuration) : '00:00'}
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  {activeCall && (
                    <button 
                      onClick={toggleMute}
                      style={{ width: '40px', height: '40px', borderRadius: '50%', background: isMuted ? '#f59e0b' : 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                  )}
                  <button 
                    onClick={hangupCall}
                    title="End Call"
                    style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <PhoneOff size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Call Center Active Session Panel (Merge, Mute Participants, etc.) */}
            {isSessionActive && (
              <div style={{ marginTop: '0.5rem' }}>
                <ActiveCallPanel session={activeSession} agentData={agentData} onCallEnded={hangupCall} />
              </div>
            )}

            {/* Outbound Dialer (Only visible when no active calls) */}
            {!hasActiveInteraction && (
              <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Make Outbound Call</div>
                
                <form onSubmit={handleStartCall}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Calling Mode</label>
                    <select 
                      value={callingMode} 
                      onChange={(e) => setCallingMode(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value="browser_webrtc">Browser Softphone (WebRTC)</option>
                      <option value="external_webrtc">External Softphone (Zoiper/MicroSIP)</option>
                      <option value="mobile">Dial via Mobile (SIM Call)</option>
                    </select>
                  </div>

                  {callingMode === 'mobile' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Your Mobile Number</label>
                      <input 
                        type="text" 
                        placeholder="+919876543210" 
                        value={agentMobile}
                        onChange={(e) => setAgentMobile(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Customer Mobile Number</label>
                    <input 
                      type="text" 
                      placeholder="+919876543210" 
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value)}
                      required
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={connectionState !== 'online' && callingMode === 'browser_webrtc'}
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem', 
                      background: (connectionState === 'online' || callingMode !== 'browser_webrtc') ? '#3b82f6' : 'var(--border-light)', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px', 
                      cursor: (connectionState === 'online' || callingMode !== 'browser_webrtc') ? 'pointer' : 'not-allowed', 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justify: 'center', 
                      gap: '0.5rem' 
                    }}
                  >
                    <PhoneCall size={18} /> Call Customer
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </Draggable>
  );
}
