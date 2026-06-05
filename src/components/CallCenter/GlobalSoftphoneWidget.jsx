'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, Minimize2, Maximize2, Loader2, ShieldAlert } from 'lucide-react';
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

  const durationTimerRef = useRef(null);
  const plivoClientRef = useRef(null);

  // Fetch agent profile
  useEffect(() => {
    if (!userId) return;
    const fetchAgent = async () => {
      try {
        const { getAgentProfile } = await import('@/app/actions/team');
        const { data } = await getAgentProfile(userId);
        if (data) setAgentData(data);
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
        const active = data.find(c => ['initiated', 'ringing', 'agent_answered', 'connected'].includes(c.status));
        setActiveSession(active || null);
      }
    };
    fetchSession();
    interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [agentData]);

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

        client.on('onIncomingCall', (callerName, extraHeaders) => {
          setIncomingCall({ callerName, extraHeaders });
          setIsMinimized(false); // Auto-expand on incoming call
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

  const connectSoftphone = async () => {
    if (!plivoClient) return;
    setConnectionState('connecting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/plivo/token', { method: 'POST' });
      const data = await res.json();
      if (data.username && data.password) {
        plivoClient.login(data.username, data.password);
      } else if (data.token) {
        plivoClient.loginWithAccessToken(data.token);
      } else {
        setConnectionState('error');
        setErrorMessage(data.error || 'Failed to fetch credentials');
      }
    } catch (err) {
      setConnectionState('error');
      setErrorMessage(err.message || 'Failed to fetch credentials');
    }
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

  if (!agentData) return null; // Don't show widget if not an agent

  return (
    <div style={{
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
      transition: 'all 0.3s ease',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Widget Header (Click to toggle) */}
      <div 
        onClick={() => setIsMinimized(!isMinimized)}
        style={{ 
          padding: '0.75rem 1rem', 
          background: '#0f172a', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer',
          borderBottom: isMinimized ? 'none' : '1px solid #334155'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PhoneCall size={18} color={connectionState === 'online' ? '#10b981' : '#64748b'} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>CRM Softphone</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: connectionState === 'online' ? '#10b981' : connectionState === 'error' ? '#ef4444' : connectionState === 'connecting' ? '#f59e0b' : '#64748b' }} />
        </div>
        <div>
          {isMinimized ? <Maximize2 size={16} color="#94a3b8" /> : <Minimize2 size={16} color="#94a3b8" />}
        </div>
      </div>

      {/* Widget Body */}
      {!isMinimized && (
        <div style={{ padding: '1rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Connection Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem', background: '#0f172a', borderRadius: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {connectionState === 'online' ? 'Online' : 
                 connectionState === 'connecting' ? 'Connecting...' : 
                 connectionState === 'error' ? 'Connection Error' : 'Offline'}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                SIP: {agentData.plivo_sip_uri || 'N/A'}
              </span>
            </div>
            {connectionState !== 'online' ? (
              <button 
                onClick={connectSoftphone}
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
              <ActiveCallPanel session={activeSession} onCallEnded={() => setActiveSession(null)} />
            </div>
          )}

          {connectionState === 'online' && !activeCall && !incomingCall && !activeSession && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '1rem 0' }}>
              Ready. Make calls from Call Center tab.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
