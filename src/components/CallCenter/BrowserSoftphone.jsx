'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, PhoneCall, Volume2, ShieldAlert, Loader2 } from 'lucide-react';

export default function BrowserSoftphone({ agentData, onStatusChange }) {
  const [plivoClient, setPlivoClient] = useState(null);
  const [connectionState, setConnectionState] = useState('offline'); // offline, connecting, online, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [debugToken, setDebugToken] = useState('');

  const durationTimerRef = useRef(null);

  const plivoClientRef = useRef(null);

  useEffect(() => {
    let activeClient = null;

    // Dynamic import of plivo browser SDK to avoid SSR issues
    const initPlivo = async () => {
      try {
        console.log('[Softphone] Dynamically importing plivo-browser-sdk...');
        const PlivoModule = await import('plivo-browser-sdk');
        const Plivo = PlivoModule.default || PlivoModule;
        
        console.log('[Softphone] Initializing Plivo Browser SDK client with debug level ALL...');
        const plivoObj = new Plivo({
          enableTracking: true,
          closeProtection: true,
          debug: 'ALL'
        });
        const client = plivoObj.client;
        activeClient = client;
        plivoClientRef.current = client;

        // Event Listeners
        client.on('onLogin', () => {
          console.log('[Softphone] Plivo client logged in and SIP registered successfully!');
          setConnectionState('online');
          if (onStatusChange) onStatusChange('available');
        });

        client.on('onLoginFailed', (reason) => {
          console.error('[Softphone] Plivo client login/registration failed:', reason);
          setConnectionState('error');
          setErrorMessage('Login failed: ' + reason);
        });

        client.on('onLogout', () => {
          console.log('[Softphone] Plivo client logged out.');
          setConnectionState('offline');
          if (onStatusChange) onStatusChange('offline');
        });

        client.on('onConnectionChange', (state) => {
          console.log('[Softphone] Connection state changed:', state);
          if (state && (state.status === 'disconnected' || state.status === 'failed')) {
            console.warn('[Softphone] Connection lost, marking agent offline in database.');
            setConnectionState('error');
            setErrorMessage('Connection lost: ' + (state.reason || 'Disconnected'));
            if (onStatusChange) onStatusChange('offline');
          }
        });

        client.on('onIncomingCall', (callerName, extraHeaders) => {
          console.log('[Softphone] Incoming call received from:', callerName, extraHeaders);
          setIncomingCall({ callerName, extraHeaders });
        });

        client.on('onIncomingCallCanceled', () => {
          console.log('[Softphone] Incoming call canceled by caller.');
          setIncomingCall(null);
        });

        client.on('onCallRemoteRinging', () => {
          console.log('[Softphone] Remote endpoint is ringing...');
        });

        client.on('onCallAnswered', () => {
          console.log('[Softphone] Call answered and active.');
          startDurationTimer();
        });

        client.on('onCallTerminated', () => {
          console.log('[Softphone] Call terminated.');
          setActiveCall(null);
          setIncomingCall(null);
          stopDurationTimer();
          setCallDuration(0);
        });

        client.on('onMediaPermission', (res) => {
          console.log('[Softphone] Media/Microphone permission status:', res);
          if (res.error) {
            console.error('[Softphone] Media permission error:', res.error);
            setErrorMessage('Microphone permission denied.');
          }
        });

        client.on('onCallFailed', (reason) => {
          console.error('[Softphone] Active call failed:', reason);
          setActiveCall(null);
          setIncomingCall(null);
          stopDurationTimer();
          setCallDuration(0);
        });

        setPlivoClient(client);
      } catch (err) {
        console.error('[Softphone] Failed to load Plivo Browser SDK:', err);
      }
    };
    initPlivo();

    return () => {
      if (activeClient) {
        console.log('[Softphone] Unmounting BrowserSoftphone. Logging out Plivo client to release SIP registration...');
        try {
          activeClient.logout();
        } catch (e) {
          console.error('[Softphone] Error during Plivo client logout on unmount:', e);
        }
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
    setDebugToken('');

    try {
      const res = await fetch('/api/plivo/token', { method: 'POST' });
      const data = await res.json();
      
      if (data.username && data.password) {
        plivoClient.login(data.username, data.password);
      } else if (data.token) {
        setDebugToken(data.token);
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
      if (onStatusChange) onStatusChange('offline');
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
      if (isMuted) {
        plivoClient.unmute();
      } else {
        plivoClient.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', color: 'white', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PhoneCall size={20} color="#3b82f6" /> WebRTC Softphone
      </h3>

      {/* Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', padding: '0.75rem', background: '#0f172a', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: connectionState === 'online' ? '#10b981' : connectionState === 'error' ? '#ef4444' : connectionState === 'connecting' ? '#f59e0b' : '#64748b' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {connectionState === 'online' ? 'Online & Ready' : 
             connectionState === 'connecting' ? 'Connecting...' : 
             connectionState === 'error' ? 'Connection Error' : 'Offline'}
          </span>
        </div>
        
        {connectionState !== 'online' ? (
          <button 
            onClick={connectSoftphone}
            disabled={connectionState === 'connecting'}
            style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {connectionState === 'connecting' ? <Loader2 size={16} className="spin" /> : <ShieldAlert size={16} />}
            Connect Browser
          </button>
        ) : (
          <button 
            onClick={disconnectSoftphone}
            style={{ padding: '0.5rem 1rem', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Disconnect
          </button>
        )}
      </div>

      {errorMessage && (
        <div style={{ fontSize: '0.85rem', color: '#ef4444', marginBottom: '1rem' }}>
          <div>{errorMessage}</div>
          {debugToken && (
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#0f172a', borderRadius: '6px', border: '1px dashed #ef4444', color: '#94a3b8', wordBreak: 'break-all', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.25rem' }}>Debug Token Payload:</div>
              {(() => {
                try {
                  const payloadB64 = debugToken.split('.')[1];
                  const payloadStr = atob(payloadB64);
                  return payloadStr;
                } catch (e) {
                  return 'Error parsing token: ' + e.message;
                }
              })()}
            </div>
          )}
        </div>
      )}

      {/* Incoming Call Modal / Overlay */}
      {incomingCall && (
        <div className="pulse" style={{ background: '#3b82f6', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Incoming Call</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>{incomingCall.callerName || 'Unknown Caller'}</div>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={rejectCall} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <PhoneOff size={18} /> Reject
            </button>
            <button onClick={answerCall} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <Phone size={18} /> Answer
            </button>
          </div>
        </div>
      )}

      {/* Active Call Controls */}
      {activeCall && (
        <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Call Connected
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {formatDuration(callDuration)}
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button 
              onClick={toggleMute}
              style={{ width: '48px', height: '48px', borderRadius: '50%', background: isMuted ? '#f59e0b' : '#334155', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button 
              onClick={hangupCall}
              style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)' }}
              title="End Call"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      )}

      {connectionState === 'online' && !activeCall && !incomingCall && (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', padding: '2rem 0' }}>
          Waiting for incoming or outbound calls...
        </div>
      )}
    </div>
  );
}
