'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, Minimize2, Maximize2, Loader2, ShieldAlert, GripHorizontal, X } from 'lucide-react';
import Draggable from 'react-draggable';
import ActiveCallPanel from './ActiveCallPanel';
import { getRecentCalls } from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';

export default function GlobalSoftphoneWidget({ userId }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const supabase = createClient();
  const [plivoClient, setPlivoClient] = useState(null);
  const [connectionState, setConnectionState] = useState('offline'); // offline, connecting, online, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeSession, setActiveSession] = useState(null);
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

  const hangupCall = useCallback(() => {
    if (plivoClientRef.current) {
      try {
        plivoClientRef.current.hangup();
      } catch (e) {
        console.error("Error during WebRTC hangup:", e);
      }
    }
    setActiveCall(null);
  }, []);

  const updateActiveSession = useCallback((newSession) => {
    setActiveSession(prev => {
      if (!prev && !newSession) return null;
      if (!prev && newSession) return newSession;
      if (prev && !newSession) {
        // Session ended! Clean up browser WebRTC call!
        hangupCall();
        return null;
      }
      if (prev.id === newSession.id && prev.status === newSession.status && prev.customer_member_id === newSession.customer_member_id) {
        return prev;
      }
      return newSession;
    });
  }, [hangupCall]);

  const [bounds, setBounds] = useState({ left: -1000, top: -1000, right: 12, bottom: 12 });

  // Dynamically calculate strict screen boundaries based on current window size and widget dimensions
  const updateBounds = useCallback(() => {
    if (typeof window === 'undefined') return;
    const el = nodeRef.current;
    const width = el?.offsetWidth || (isMinimized ? 280 : 380);
    const height = el?.offsetHeight || (isMinimized ? 50 : 520);
    const margin = 8; // Keep at least 8px padding from all viewport edges

    const minX = -(window.innerWidth - width - 20 - margin);
    const minY = -(window.innerHeight - height - 20 - margin);
    const maxX = 20 - margin;
    const maxY = 20 - margin;

    setBounds({ left: minX, top: minY, right: maxX, bottom: maxY });
  }, [isMinimized]);

  useEffect(() => {
    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, [updateBounds]);

  // Load saved position, hidden state, and minimized state on mount
  useEffect(() => {
    try {
      const savedPos = localStorage.getItem('softphone_position');
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const width = isMinimized ? 280 : 380;
          const height = isMinimized ? 50 : 520;
          const margin = 8;
          const minX = -(window.innerWidth - width - 20 - margin);
          const minY = -(window.innerHeight - height - 20 - margin);
          const maxX = 20 - margin;
          const maxY = 20 - margin;
          const safeX = Math.max(minX, Math.min(maxX, parsed.x));
          const safeY = Math.max(minY, Math.min(maxY, parsed.y));
          setPosition({ x: safeX, y: safeY });
        }
      }
      const savedHidden = localStorage.getItem('softphone_hidden');
      if (savedHidden !== null) {
        setIsHidden(savedHidden === 'true');
      }
      const savedMinimized = localStorage.getItem('softphone_minimized');
      if (savedMinimized !== null) {
        setIsMinimized(savedMinimized === 'true');
      }
    } catch (e) {
      console.error("Error loading softphone preferences:", e);
    }
  }, []);

  // Listen for custom events to toggle or open softphone from anywhere in the app
  useEffect(() => {
    const handleOpen = () => {
      setIsHidden(false);
      localStorage.setItem('softphone_hidden', 'false');
    };
    const handleToggle = () => {
      setIsHidden(prev => {
        const next = !prev;
        localStorage.setItem('softphone_hidden', String(next));
        return next;
      });
    };
    window.addEventListener('open-softphone', handleOpen);
    window.addEventListener('toggle-softphone', handleToggle);
    return () => {
      window.removeEventListener('open-softphone', handleOpen);
      window.removeEventListener('toggle-softphone', handleToggle);
    };
  }, []);

  const handleDrag = (e, data) => {
    setPosition({ x: data.x, y: data.y });
  };

  const handleDragStop = (e, data) => {
    const el = nodeRef.current;
    const width = el?.offsetWidth || (isMinimized ? 280 : 380);
    const height = el?.offsetHeight || (isMinimized ? 50 : 520);
    const margin = 8;

    const minX = -(window.innerWidth - width - 20 - margin);
    const minY = -(window.innerHeight - height - 20 - margin);
    const maxX = 20 - margin;
    const maxY = 20 - margin;

    const clampedX = Math.max(minX, Math.min(maxX, data.x));
    const clampedY = Math.max(minY, Math.min(maxY, data.y));

    const finalPos = { x: clampedX, y: clampedY };
    setPosition(finalPos);
    try {
      localStorage.setItem('softphone_position', JSON.stringify(finalPos));
    } catch (err) {
      console.error("Error saving softphone position:", err);
    }
  };

  const handleToggleMinimize = (e) => {
    e?.stopPropagation?.();
    setIsMinimized(prev => {
      const next = !prev;
      localStorage.setItem('softphone_minimized', String(next));
      return next;
    });
  };

  const handleHideWidget = (e) => {
    e?.stopPropagation?.();
    setIsHidden(true);
    localStorage.setItem('softphone_hidden', 'true');
  };

  const handleUnhideWidget = () => {
    setIsHidden(false);
    localStorage.setItem('softphone_hidden', 'false');
  };

  // Fetch agent profile
  useEffect(() => {
    if (!userId) return;
    const fetchAgent = async () => {
      try {
        const { getAgentProfile } = await import('@/app/actions/team');
        const { data } = await getAgentProfile(userId);
        if (data) {
          setAgentData(data);
          if (data.default_calling_mode) {
             setCallingMode(data.default_calling_mode);
          }
          if (data.mobile_number) {
             const cleanNum = data.mobile_number.replace(/[^0-9]/g, '');
             setAgentMobile(cleanNum.slice(-10));
          }
        }
      } catch (err) {
        console.error(err);
      }
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
          const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected'].includes(c.status);
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

        const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected'].includes(updated.status);
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
            // Check admin setting, default to true (direct call)
            if (localStorage.getItem('CRM_AUTO_ANSWER_OUTBOUND') !== 'false') {
              setTimeout(() => {
                // use the explicit client reference to answer
                try { client.answer(); } catch(e){}
                setActiveCall({ direction: 'inbound', remote: callerName });
                setIncomingCall(null);
                // The onCallAnswered event will start the timer
              }, 500); // slight delay ensures DOM/SDK readiness
            }
          }
        });

        client.on('onIncomingCallCanceled', () => {
          setIncomingCall(null);
        });

        client.on('onCallAnswered', () => {
          startDurationTimer();
        });

        client.on('onCallTerminated', () => {
          setActiveCall(null);
          setIncomingCall(null);
          stopDurationTimer();
          setCallDuration(0);
        });

        setPlivoClient(client);
        
        // Auto connect after initialization
        connectSoftphone(client);
      } catch (err) {
        setConnectionState('error');
        setErrorMessage('Failed to load SDK');
      }
    };

    initPlivo();

    return () => {
      if (activeClient) {
        activeClient.logout();
      }
    };
  }, []);

  // Declarative Call Duration Timer based on activeSession status
  useEffect(() => {
    let timerInterval = null;
    if (activeSession && activeSession.status === 'connected') {
      if (activeSession.customer_answer_time) {
        const elapsed = Math.floor((new Date() - new Date(activeSession.customer_answer_time)) / 1000);
        setCallDuration(Math.max(0, elapsed));
      }
      timerInterval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }

    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [activeSession?.status, activeSession === null]);

  const startDurationTimer = () => {
    // Handled declaratively
  };

  const stopDurationTimer = () => {
    // Handled declaratively
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const disconnectSoftphone = () => {
    if (plivoClient && connectionState === 'online') {
      plivoClient.logout();
      setConnectionState('offline');
    }
  };

  const answerCall = () => {
    if (plivoClient && incomingCall) {
      plivoClient.answer();
      setActiveCall({ direction: 'inbound', remote: incomingCall.callerName });
      setIncomingCall(null);
      startDurationTimer();
    }
  };

  const rejectCall = () => {
    if (plivoClient && incomingCall) {
      plivoClient.reject();
      setIncomingCall(null);
    }
  };

  const toggleMute = () => {
    if (plivoClient && activeCall) {
      if (isMuted) plivoClient.unmute();
      else plivoClient.mute();
      setIsMuted(!isMuted);
    }
  };

  const handleStartCall = async (e) => {
    e.preventDefault();
    if (!customerNumber) return;

    // Set flag so onIncomingCall knows this is our outbound call
    localStorage.setItem('pendingOutboundCall', 'true');

    try {
      const res = await fetch('/api/plivo/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: `+91${customerNumber}`,
          callingMode,
          agentEndpoint: agentData?.plivo_sip_uri,
          agentMobile: callingMode === 'mobile' ? `+91${agentMobile}` : undefined
        })
      });
      const result = await res.json();
      if (result.error) {
        alert("Call Error: " + result.error);
      } else {
        setCustomerNumber('');
      }
    } catch (err) {
      alert("Failed to start call");
    }
  };

  if (!agentData) return null; // Don't show widget if not an agent

  const hasActiveInteraction = activeCall || incomingCall || activeSession;

  // If user chose to hide the widget, render a persistent mini launcher pill (unless incoming call arrives)
  if (isHidden && !incomingCall) {
    return (
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
        <button
          type="button"
          onClick={handleUnhideWidget}
          style={{
            background: connectionState === 'online' ? '#10b981' : 'var(--accent-color)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '24px',
            padding: '0.5rem 0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.82rem',
            transition: 'transform 0.15s, box-shadow 0.15s'
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.04)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Click to open CRM Softphone"
        >
          <PhoneCall size={15} />
          <span>Softphone</span>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: connectionState === 'online' ? '#ffffff' : 'rgba(255,255,255,0.7)' }} />
        </button>
      </div>
    );
  }

  return (
    <Draggable 
      nodeRef={nodeRef} 
      handle=".drag-handle" 
      position={position}
      bounds={bounds}
      onDrag={handleDrag}
      onStop={handleDragStop}
    >
      <div ref={nodeRef} style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: isMinimized ? '280px' : 'min(380px, calc(100vw - 16px))',
        maxWidth: 'calc(100vw - 16px)',
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-light)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        zIndex: 9999,
        transition: 'width 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
      {/* Widget Header (Click to toggle) */}
      <div 
        style={{ 
          padding: '0.75rem 1rem', 
          background: 'var(--bg-primary)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: isMinimized ? 'none' : '1px solid var(--border-light)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="drag-handle" style={{ cursor: 'move', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <GripHorizontal size={16} />
          </div>
          <PhoneCall size={18} color={connectionState === 'online' ? '#10b981' : 'var(--text-secondary)'} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>CRM Softphone</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectionState === 'online' ? '#10b981' : connectionState === 'error' ? '#ef4444' : connectionState === 'connecting' ? '#f59e0b' : 'var(--text-secondary)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button 
            type="button"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', color: 'var(--text-secondary)' }} 
            onClick={handleToggleMinimize}
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button 
            type="button"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', color: 'var(--text-secondary)' }} 
            onClick={handleHideWidget}
            title="Hide Softphone"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Widget Body */}
      {!isMinimized && (
        <div style={{ padding: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Connection Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {connectionState === 'online' ? 'Online' : 
                 connectionState === 'connecting' ? 'Connecting...' : 
                 connectionState === 'error' ? 'Connection Error' : 'Offline'}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                SIP: {agentData.plivo_sip_uri || 'N/A'}
              </span>
            </div>
            <div style={{ flexShrink: 0 }}>
              {connectionState !== 'online' ? (
                <button 
                  onClick={() => connectSoftphone(plivoClient)}
                  disabled={connectionState === 'connecting'}
                  style={{ padding: '0.4rem 0.75rem', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  {connectionState === 'connecting' ? <Loader2 size={14} className="spin" /> : <ShieldAlert size={14} />} Connect
                </button>
              ) : (
                <button 
                  onClick={disconnectSoftphone}
                  style={{ padding: '0.4rem 0.75rem', background: 'var(--text-secondary)', color: 'var(--bg-surface)', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {errorMessage && (
            <div style={{ fontSize: '0.8rem', color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}>
              {errorMessage}
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
          {(activeCall || (activeSession && activeSession.status !== 'ended')) && (
            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', textAlign: 'center', marginBottom: '1rem', border: '1px solid var(--border-light)' }}>
              <div style={{ color: activeSession?.status === 'connected' ? '#10b981' : '#f59e0b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                {activeSession?.status === 'connected' ? 'Call Connected' : 'Ringing Customer...'}
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
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Call Center Active Session Panel (Merge, Mute Participants, etc.) */}
          {activeSession && (
            <div style={{ marginTop: '0.5rem' }}>
              <ActiveCallPanel session={activeSession} agentData={agentData} onCallEnded={() => setActiveSession(null)} />
            </div>
          )}

          {/* Outbound Dialer (Only visible when no active calls) */}
          {!hasActiveInteraction && (
            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Make Outbound Call</div>
              
              <form onSubmit={handleStartCall}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden' }}>
                    <span style={{ background: 'var(--border-light)', padding: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>+91</span>
                    <input 
                      type="text" 
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Mobile Number"
                      style={{ flex: 1, padding: '0.6rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                      maxLength={10}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <select 
                    value={callingMode}
                    onChange={(e) => setCallingMode(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--border-light)', borderRadius: '6px', outline: 'none', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  >
                    <option value="browser_webrtc">Browser Softphone (WebRTC)</option>
                    <option value="mobile">Dial via my Mobile Phone</option>
                    <option value="external_softphone">External App (MicroSIP)</option>
                  </select>
                </div>

                {callingMode === 'mobile' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Agent Mobile (Call Landing Number)</label>
                    <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', overflow: 'hidden' }}>
                      <span style={{ background: 'var(--border-light)', padding: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>+91</span>
                      <input 
                        type="text" 
                        value={agentMobile}
                        onChange={(e) => setAgentMobile(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Agent Mobile Number"
                        style={{ flex: 1, padding: '0.6rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                        maxLength={10}
                      />
                    </div>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={
                    !customerNumber || 
                    customerNumber.length < 10 || 
                    (callingMode === 'browser_webrtc' && connectionState !== 'online') ||
                    (callingMode === 'mobile' && (!agentMobile || agentMobile.length < 10))
                  }
                  style={{ 
                    width: '100%', 
                    padding: '0.6rem', 
                    fontSize: '0.85rem', 
                    fontWeight: 600,
                    background: 'var(--accent-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem',
                    cursor: (
                      !customerNumber || 
                      customerNumber.length < 10 || 
                      (callingMode === 'browser_webrtc' && connectionState !== 'online') ||
                      (callingMode === 'mobile' && (!agentMobile || agentMobile.length < 10))
                    ) ? 'not-allowed' : 'pointer',
                    opacity: (
                      !customerNumber || 
                      customerNumber.length < 10 || 
                      (callingMode === 'browser_webrtc' && connectionState !== 'online') ||
                      (callingMode === 'mobile' && (!agentMobile || agentMobile.length < 10))
                    ) ? 0.5 : 1 
                  }}
                >
                  <PhoneCall size={16} />
                  {callingMode === 'browser_webrtc' && connectionState !== 'online' 
                    ? 'Connect Softphone First' 
                    : 'Call Customer'}
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
