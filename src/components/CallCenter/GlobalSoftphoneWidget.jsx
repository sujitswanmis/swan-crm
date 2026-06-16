'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, Minimize2, Maximize2, Loader2, ShieldAlert, GripHorizontal } from 'lucide-react';
import Draggable from 'react-draggable';
import ActiveCallPanel from './ActiveCallPanel';
import { getRecentCalls } from '@/app/actions/team';

export default function GlobalSoftphoneWidget({ userId }) {
  const [isMinimized, setIsMinimized] = useState(false);
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

  const durationTimerRef = useRef(null);
  const plivoClientRef = useRef(null);
  const nodeRef = useRef(null);

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

  // Track recent active session in database
  useEffect(() => {
    if (!agentData) return;
    let interval;
    const fetchSession = async () => {
      const { data } = await getRecentCalls(agentData.id);
      if (data) {
        const active = data.find(c => {
          const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected'].includes(c.status);
          const ageInMs = new Date() - new Date(c.created_at);
          // If status is initiated/ringing, timeout after 2 mins to prevent stuck dialer
          if (['initiated', 'ringing'].includes(c.status) && ageInMs > 120000) return false;
          const isRecent = ageInMs < 1000 * 60 * 60; // strictly within 1 hour for connected calls
          return isStatusActive && isRecent;
        });
        setActiveSession(active || null);
      }
    };
    fetchSession();
    interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [agentData]);

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

  const startDurationTimer = () => {
    stopDurationTimer();
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
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

  const hangupCall = () => {
    if (plivoClient) {
      plivoClient.hangup();
      setActiveCall(null);
      stopDurationTimer();
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

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="body">
      <div ref={nodeRef} style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: isMinimized ? '280px' : '360px',
        background: '#1e293b',
        borderRadius: '12px',
        color: 'white',
        border: '1px solid #334155',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
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
          background: '#0f172a', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: isMinimized ? 'none' : '1px solid #334155'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="drag-handle" style={{ cursor: 'move', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
            <GripHorizontal size={16} />
          </div>
          <PhoneCall size={18} color={connectionState === 'online' ? '#10b981' : '#64748b'} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>CRM Softphone</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectionState === 'online' ? '#10b981' : connectionState === 'error' ? '#ef4444' : connectionState === 'connecting' ? '#f59e0b' : '#64748b' }} />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => setIsMinimized(!isMinimized)}>
          {isMinimized ? <Maximize2 size={16} color="#94a3b8" /> : <Minimize2 size={16} color="#94a3b8" />}
        </div>
      </div>

      {/* Widget Body */}
      {!isMinimized && (
        <div style={{ padding: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Connection Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem', background: '#0f172a', borderRadius: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {connectionState === 'online' ? 'Online' : 
                 connectionState === 'connecting' ? 'Connecting...' : 
                 connectionState === 'error' ? 'Connection Error' : 'Offline'}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                SIP: {agentData.plivo_sip_uri || 'N/A'}
              </span>
            </div>
            <div style={{ flexShrink: 0 }}>
              {connectionState !== 'online' ? (
                <button 
                  onClick={() => connectSoftphone(plivoClient)}
                  disabled={connectionState === 'connecting'}
                  style={{ padding: '0.4rem 0.75rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  {connectionState === 'connecting' ? <Loader2 size={14} className="spin" /> : <ShieldAlert size={14} />} Connect
                </button>
              ) : (
                <button 
                  onClick={disconnectSoftphone}
                  style={{ padding: '0.4rem 0.75rem', background: '#475569', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
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

          {/* Active Plivo Call Controls */}
          {activeCall && (
            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Call Connected</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>{formatDuration(callDuration)}</div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button 
                  onClick={toggleMute}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', background: isMuted ? '#f59e0b' : '#334155', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
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
            <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: '#f8fafc' }}>Make Outbound Call</div>
              
              <form onSubmit={handleStartCall}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
                    <span style={{ background: '#334155', padding: '0.6rem', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 500 }}>+91</span>
                    <input 
                      type="text" 
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Mobile Number"
                      style={{ flex: 1, padding: '0.6rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'white' }}
                      maxLength={10}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <select 
                    value={callingMode}
                    onChange={(e) => setCallingMode(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', border: '1px solid #334155', borderRadius: '6px', outline: 'none', background: '#1e293b', color: 'white', fontSize: '0.8rem' }}
                  >
                    <option value="browser_webrtc">Browser Softphone (WebRTC)</option>
                    <option value="mobile">Dial via my Mobile Phone</option>
                    <option value="external_softphone">External App (MicroSIP)</option>
                  </select>
                </div>

                {callingMode === 'mobile' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>Agent Mobile (Call Landing Number)</label>
                    <div style={{ display: 'flex', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
                      <span style={{ background: '#334155', padding: '0.6rem', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 500 }}>+91</span>
                      <input 
                        type="text" 
                        value={agentMobile}
                        onChange={(e) => setAgentMobile(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Agent Mobile Number"
                        style={{ flex: 1, padding: '0.6rem', border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'white' }}
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
                    background: '#3b82f6',
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
