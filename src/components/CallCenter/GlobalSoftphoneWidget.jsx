'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneMissed, Mic, MicOff, PhoneCall, Minimize2, Maximize2, Loader2, ShieldAlert, GripHorizontal, X, RotateCcw, Clock } from 'lucide-react';
import Draggable from 'react-draggable';
import ActiveCallPanel from './ActiveCallPanel';
import { getRecentCalls } from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';

// Web Audio API tone generator for instant audio cues
// Authentic Indian Standard Telecom Ringback Tone Generator (400 Hz + 450 Hz Dual Frequency)
// Cadence: 0.4s ON, 0.2s OFF, 0.4s ON, 2.0s OFF (Classic "trr-trr.........trr-trr" telephone ringing tone)
class IndianRingbackController {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.timer = null;
    this.safetyTimer = null;
    this.isPlaying = false;
    this.activeRoom = null;
    this.answeredRooms = new Set();
  }

  _burst(startTime) {
    if (!this.ctx || this.ctx.state === 'closed' || !this.masterGain || !this.isPlaying) return;
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(400, startTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(450, startTime);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      const dur = 0.4;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.025);
      gain.gain.setValueAtTime(0.08, startTime + dur - 0.025);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + dur);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + dur);
      osc2.stop(startTime + dur);
    } catch (e) {}
  }

  start(roomName) {
    if (typeof window === 'undefined') return;
    if (roomName && this.answeredRooms.has(roomName)) return;
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.activeRoom = roomName || null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      const schedule = () => {
        if (!this.isPlaying || !this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;
        this._burst(now);
        this._burst(now + 0.6);
        this.timer = setTimeout(schedule, 3000);
      };

      schedule();

      // 35s Hard Safety Cutoff: never ring past telecom timeout
      if (this.safetyTimer) clearTimeout(this.safetyTimer);
      this.safetyTimer = setTimeout(() => {
        this.stop(roomName);
      }, 35000);
    } catch (e) {
      console.warn("Ringback audio error:", e);
    }
  }

  stop(roomName) {
    if (roomName) this.answeredRooms.add(roomName);
    if (this.activeRoom) this.answeredRooms.add(this.activeRoom);
    this.isPlaying = false;
    this.activeRoom = null;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (this.masterGain) {
      try {
        this.masterGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
        this.masterGain.disconnect();
      } catch (e) {}
      this.masterGain = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
    }
  }
}

// Global browser tab singleton
const globalRingController = typeof window !== 'undefined'
  ? (window.__crm_ringback_controller || (window.__crm_ringback_controller = new IndianRingbackController()))
  : new IndianRingbackController();

if (typeof window !== 'undefined') {
  window.__crm_stop_all_ringing = (room) => globalRingController.stop(room);
}

// Web Audio API tone generator for instant audio cues
function playAudioTone(type) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'rejected') {
      [0, 0.15, 0.3].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(480 - idx * 70, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.12);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
    } else if (type === 'busy') {
      [0, 0.2, 0.4].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(480, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.12);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
    } else if (type === 'disconnect') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    console.warn("AudioContext tone error:", e);
  }
}

// Web Speech API Voice Announcer for Hindi / Indian English voice announcement
function speakOutcome(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === 'hi-IN' || v.lang.startsWith('hi')) 
      || voices.find(v => v.lang === 'en-IN')
      || voices[0];
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Speech synthesis error:", e);
  }
}

export default function GlobalSoftphoneWidget({ userId }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const supabase = createClient();
  const [plivoClient, setPlivoClient] = useState(null);
  const [connectionState, setConnectionState] = useState('offline'); // offline, connecting, online, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null);
  const [optimisticCall, setOptimisticCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeSession, setActiveSession] = useState(null);
  const [callAnnouncement, setCallAnnouncement] = useState(null);
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
  const activeSessionRef = useRef(null);
  const agentDataRef = useRef(null);
  const announcementTimerRef = useRef(null);
  const handleSessionTerminationAnnouncementRef = useRef(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    agentDataRef.current = agentData;
  }, [agentData]);

  const startRingingAudio = useCallback((roomName) => {
    // With direct Plivo <Dial>, real telecom early media (carrier ringing, caller tune, operator switched-off announcement)
    // is streamed live over WebRTC. Synthetic tones are omitted to prevent drowning out operator messages.
  }, []);

  const stopRingingAudio = useCallback((roomName) => {
    const target = roomName || activeSessionRef.current?.room_name;
    globalRingController.stop(target);
  }, []);

  useEffect(() => {
    return () => {
      globalRingController.stop();
    };
  }, []);

  const triggerAnnouncement = useCallback(({ type, title, subtitle, speech, customerNumber }) => {
    setIsHidden(false);
    stopRingingAudio();

    if (type === 'rejected') playAudioTone('rejected');
    else if (type === 'busy') playAudioTone('busy');
    else if (type === 'no_answer') playAudioTone('rejected');
    else playAudioTone('disconnect');

    if (speech) {
      speakOutcome(speech);
    }

    setCallAnnouncement({
      type,
      title,
      subtitle,
      customerNumber,
      timestamp: Date.now()
    });

    if (announcementTimerRef.current) clearTimeout(announcementTimerRef.current);
    announcementTimerRef.current = setTimeout(() => {
      setCallAnnouncement(null);
    }, 12000);
  }, [stopRingingAudio]);

  const hangupCall = useCallback(async () => {
    const currentRoom = activeSessionRef.current?.room_name;

    // Stop ringback audio immediately
    stopRingingAudio();

    // 1. INSTANT UI RESET (0 ms latency!)
    setActiveCall(null);
    setActiveSession(null);
    setOptimisticCall(null);
    setIncomingCall(null);
    setCallDuration(0);

    // Stop duration timer immediately
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }

    // Play instant disconnect tone
    playAudioTone('disconnect');

    // 2. Hangup WebRTC client immediately
    if (plivoClientRef.current) {
      try {
        plivoClientRef.current.hangup();
      } catch (e) {
        console.error("Error during WebRTC hangup:", e);
      }
    }

    // 3. Inform backend to terminate conference and cancel any ringing customer leg immediately
    if (currentRoom) {
      try {
        fetch('/api/plivo/controls/hangup-conference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomName: currentRoom })
        }).catch(err => console.error("Error ending conference:", err));
      } catch (e) {
        console.error(e);
      }
    }

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('crm:call-ended', { detail: { roomName: currentRoom } }));
      }, 700);
    }
  }, [stopRingingAudio]);

  const updateActiveSession = useCallback((newSession) => {
    if (newSession && (newSession.status === 'connected' || newSession.customer_answer_time)) {
      stopRingingAudio();
    }

    setActiveSession(prev => {
      if (!prev && !newSession) return null;
      if (!prev && newSession) return newSession;
      if (prev && !newSession) {
        // Session ended from backend! Clean up local browser call WITHOUT re-calling hangup API
        if (plivoClientRef.current) {
          try { plivoClientRef.current.hangup(); } catch (e) {}
        }
        setActiveCall(null);
        setOptimisticCall(null);
        setCallDuration(0);
        stopRingingAudio();
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('crm:call-ended', { detail: { session: prev } }));
          }, 700);
        }
        return null;
      }
      if (prev.id === newSession.id && prev.status === newSession.status && prev.customer_member_id === newSession.customer_member_id) {
        return prev;
      }
      return newSession;
    });
  }, [stopRingingAudio]);

  // Auto-stop ringing immediately as soon as activeSession is connected or answered
  useEffect(() => {
    if (activeSession && (activeSession.status === 'connected' || activeSession.customer_answer_time)) {
      stopRingingAudio();
    }
  }, [activeSession?.status, activeSession?.customer_answer_time, stopRingingAudio]);

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
    const handleOpen = (e) => {
      setIsHidden(false);
      setIsMinimized(false);
      localStorage.setItem('softphone_hidden', 'false');
      if (e?.detail?.number) {
        const clean = String(e.detail.number).replace(/[^0-9]/g, '').slice(-10);
        if (clean.length === 10) {
          setCustomerNumber(clean);
        }
      }
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

  const handleSessionTerminationAnnouncement = useCallback((sessionData) => {
    if (!sessionData) return;
    const cause = (sessionData.hangup_cause || '').toLowerCase();
    const cleanNum = (sessionData.customer_number || '').replace(/[^0-9]/g, '').slice(-10);

    if (cause === 'agent_hangup') return; // Agent deliberately ended it

    // If customer was connected and answered, then hung up
    if (sessionData.customer_answer_time || cause === 'customer_hangup') {
      triggerAnnouncement({
        type: 'ended',
        title: 'Customer ने Call Disconnect कर दिया',
        subtitle: 'Customer ne call end kar diya.',
        speech: 'Customer ne call disconnect kar diya.',
        customerNumber: cleanNum
      });
      return;
    }

    // Customer cut / rejected while ringing
    if (cause === 'rejected' || cause.includes('reject') || cause.includes('cancel')) {
      triggerAnnouncement({
        type: 'rejected',
        title: 'Customer ने Call Cut कर दिया',
        subtitle: 'Customer ne call disconnect ya reject kar diya.',
        speech: 'Customer ne call cut kar diya hai.',
        customerNumber: cleanNum
      });
    } else if (cause === 'busy' || cause.includes('busy')) {
      triggerAnnouncement({
        type: 'busy',
        title: 'Customer Busy है',
        subtitle: 'Customer doosri call par vyast hai.',
        speech: 'Customer doosri call par vyast hai.',
        customerNumber: cleanNum
      });
    } else if (cause === 'no_answer' || cause.includes('timeout') || cause.includes('no-answer')) {
      triggerAnnouncement({
        type: 'no_answer',
        title: 'Customer ने Phone नहीं उठाया',
        subtitle: 'Ring timeout ho gaya, call pick nahi hua.',
        speech: 'Customer ne phone nahi uthaya.',
        customerNumber: cleanNum
      });
    } else if (cause === 'failed' || cause === 'customer_dial_error') {
      triggerAnnouncement({
        type: 'failed',
        title: 'Call Connect नहीं हो सका',
        subtitle: 'Network issue ya unreachable number.',
        speech: 'Call connect nahi ho paya.',
        customerNumber: cleanNum
      });
    }
  }, [triggerAnnouncement]);

  useEffect(() => {
    handleSessionTerminationAnnouncementRef.current = handleSessionTerminationAnnouncement;
  }, [handleSessionTerminationAnnouncement]);

  const fetchSession = useCallback(async () => {
    if (!agentData) return;
    try {
      const activeRoom = activeSessionRef.current?.room_name || optimisticCall?.roomName;
      let url = `/api/plivo/session-status?agent_id=${agentData.id}`;
      if (activeRoom) {
        url += `&room=${encodeURIComponent(activeRoom)}`;
      }

      const res = await fetch(url, { cache: 'no-store' });
      const statusData = await res.json();

      if (statusData?.activeSession && !statusData.isEnded) {
        const s = statusData.activeSession;
        if (statusData.isConnected || statusData.customerAnswered || s.status === 'connected' || s.customer_answer_time) {
          stopRingingAudio(s.room_name);
        } else if (s.status === 'customer_ringing' || s.status === 'ringing') {
          if (!s.customer_answer_time) {
            startRingingAudio(s.room_name);
          }
        }
        setOptimisticCall(null);
        updateActiveSession(s);
      } else if (statusData?.isEnded) {
        stopRingingAudio(activeRoom);
        const prev = activeSessionRef.current;
        if (prev) {
          handleSessionTerminationAnnouncement(statusData.activeSession || prev);
        }
        updateActiveSession(null);
        setOptimisticCall(null);
      } else {
        // Fallback check via getRecentCalls
        const { data } = await getRecentCalls(agentData.id);
        if (data) {
          const active = data.find(c => {
            const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected', 'customer_ringing'].includes(c.status);
            const ageInMs = Date.now() - new Date(c.created_at).getTime();
            if (['initiated', 'ringing', 'customer_ringing'].includes(c.status) && ageInMs > 45000) return false;
            const isRecent = ageInMs < 1000 * 60 * 60;
            return isStatusActive && isRecent;
          });

          if (active) {
            if (active.status === 'connected' || active.customer_answer_time) {
              stopRingingAudio(active.room_name);
            } else if (active.status === 'customer_ringing' || active.status === 'ringing') {
              if (!active.customer_answer_time) {
                startRingingAudio(active.room_name);
              }
            }
            setOptimisticCall(null);
            updateActiveSession(active);
          } else {
            const prev = activeSessionRef.current;
            if (prev) {
              stopRingingAudio(prev.room_name);
              const latest = data.find(c => c.id === prev.id) || data[0];
              if (latest && (latest.status === 'ended' || latest.status === 'failed')) {
                handleSessionTerminationAnnouncement(latest);
              }
            }
            updateActiveSession(null);
            setOptimisticCall(null);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching softphone session:', err);
    }
  }, [agentData, updateActiveSession, stopRingingAudio, startRingingAudio, handleSessionTerminationAnnouncement, optimisticCall?.roomName]);

  // Dynamic Polling: 500ms during active interaction, 4000ms when idle
  useEffect(() => {
    if (!agentData) return;
    fetchSession();

    const isEngaged = !!(activeCall || activeSession || optimisticCall);
    const intervalMs = isEngaged ? 500 : 4000;
    const interval = setInterval(fetchSession, intervalMs);

    return () => clearInterval(interval);
  }, [agentData, activeCall, activeSession?.status, optimisticCall, fetchSession]);

  // Realtime Active Session listener
  useEffect(() => {
    if (!agentData) return;

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
          setOptimisticCall(null);
          stopRingingAudio();
          return;
        }

        const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected', 'customer_ringing'].includes(updated.status);
        const ageInMs = Date.now() - new Date(updated.created_at).getTime();
        const isRecent = ageInMs < 1000 * 60 * 60;

        if (isStatusActive && isRecent) {
          if (updated.status === 'connected' || updated.customer_answer_time) {
            stopRingingAudio();
          } else if (updated.status === 'customer_ringing' || updated.status === 'ringing') {
            startRingingAudio();
          }
          setOptimisticCall(null);
          updateActiveSession(updated);
        } else {
          // Terminal session state: trigger announcement
          const prevSession = activeSessionRef.current;
          if (prevSession && prevSession.id === updated.id) {
            stopRingingAudio();
            handleSessionTerminationAnnouncement(updated);
          }
          updateActiveSession(null);
          setOptimisticCall(null);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentData, supabase, updateActiveSession, stopRingingAudio, startRingingAudio, handleSessionTerminationAnnouncement]);

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
          if (agentDataRef.current?.id) {
            fetch('/api/plivo/session-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentId: agentDataRef.current.id, status: 'available' })
            }).catch(() => {});
          }
        });

        client.on('onLoginFailed', (reason) => {
          setConnectionState('error');
          setErrorMessage('Login failed: ' + reason);
          setSdkStatus({ isRegistered: false, isConnected: false });
        });

        client.on('onLogout', () => {
          setConnectionState('offline');
          setSdkStatus({ isRegistered: false, isConnected: false });
          if (agentDataRef.current?.id) {
            fetch('/api/plivo/session-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentId: agentDataRef.current.id, status: 'offline' })
            }).catch(() => {});
          }
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
          // Fast auto-answer logic for outbound calls initiated by the agent
          if (localStorage.getItem('pendingOutboundCall') === 'true') {
            localStorage.removeItem('pendingOutboundCall');
            // Immediate WebRTC answer without delay for fast connection
            try { client.answer(); } catch(e){}
            setActiveCall({ direction: 'inbound', remote: callerName });
            setIncomingCall(null);
            return;
          }

          setIncomingCall({ callerName, extraHeaders, callInfo });
          setIsMinimized(false); // Auto-expand on incoming call
        });

        client.on('onIncomingCallCanceled', () => {
          setIncomingCall(null);
        });

        client.on('onCallAnswered', () => {
          startDurationTimer();
        });

        client.on('onCallTerminated', async () => {
          stopRingingAudio();
          setActiveCall(null);
          setIncomingCall(null);
          stopDurationTimer();
          setCallDuration(0);

          const currentSession = activeSessionRef.current;
          setActiveSession(null);
          setOptimisticCall(null);

          if (currentSession) {
            try {
              const res = await fetch(`/api/plivo/session-status?room=${currentSession.room_name}&agent_id=${agentDataRef.current?.id}`, { cache: 'no-store' });
              const statusData = await res.json();
              if (statusData?.activeSession) {
                handleSessionTerminationAnnouncementRef.current?.(statusData.activeSession);
              } else {
                handleSessionTerminationAnnouncementRef.current?.(currentSession);
              }
            } catch (e) {
              handleSessionTerminationAnnouncementRef.current?.(currentSession);
            }
          }
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

  // Declarative Call Duration Timer based on activeSession status or customer_answer_time
  useEffect(() => {
    let timerInterval = null;
    const isConnected = (activeSession && (activeSession.status === 'connected' || !!activeSession.customer_answer_time)) ||
      (activeCall && activeCall.direction === 'inbound');

    if (isConnected) {
      if (activeSession?.customer_answer_time) {
        const elapsed = Math.floor((Date.now() - new Date(activeSession.customer_answer_time).getTime()) / 1000);
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
  }, [activeSession?.status, activeSession?.customer_answer_time, activeSession === null, activeCall?.direction]);

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

  const handleStartCall = async (e, directNumber = null) => {
    e?.preventDefault?.();
    const rawTarget = directNumber || customerNumber;
    if (!rawTarget) return;

    // Sanitize phone number (strip whitespace, hyphens, brackets)
    let clean = String(rawTarget).trim().replace(/[^\d+]/g, '');
    let formattedE164 = clean;

    if (formattedE164.startsWith('+91')) {
      // already +91
    } else if (formattedE164.startsWith('91') && formattedE164.length === 12) {
      formattedE164 = '+' + formattedE164;
    } else if (formattedE164.startsWith('0') && formattedE164.length === 11) {
      formattedE164 = '+91' + formattedE164.slice(1);
    } else {
      formattedE164 = '+91' + formattedE164.replace(/\D/g, '');
    }

    const digitsOnly = formattedE164.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      alert("Invalid phone number: " + rawTarget);
      return;
    }

    const display10Digit = digitsOnly.slice(-10);
    setCustomerNumber(display10Digit);

    // Unhide and unminimize softphone so agent sees the call progress
    setIsHidden(false);
    setIsMinimized(false);

    // Dismiss previous announcement
    setCallAnnouncement(null);

    // 1. Set immediate optimistic UI state! (0 ms latency)
    setOptimisticCall({
      customerNumber: display10Digit,
      callingMode,
      status: 'initiating',
      startTime: Date.now()
    });

    // 2. Start authentic Indian telephone ringing audio loop immediately
    startRingingAudio();

    // Set flag so onIncomingCall knows this is our outbound call
    localStorage.setItem('pendingOutboundCall', 'true');

    try {
      const res = await fetch('/api/plivo/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: formattedE164,
          callingMode,
          agentEndpoint: agentData?.plivo_sip_uri,
          agentMobile: callingMode === 'mobile' ? (agentMobile.startsWith('+') ? agentMobile : `+91${agentMobile}`) : undefined
        })
      });
      const result = await res.json();
      if (result.error) {
        stopRingingAudio();
        setOptimisticCall(null);
        alert("Call Error: " + result.error);
      } else {
        if (!directNumber) setCustomerNumber('');
        if (result.roomName) {
          startRingingAudio(result.roomName);
        }
        // Instantly adopt session if returned!
        if (result.session) {
          updateActiveSession(result.session);
        }
        setOptimisticCall(null);
      }
    } catch (err) {
      stopRingingAudio();
      setOptimisticCall(null);
      alert("Failed to start call");
    }
  };

  const handleStartCallRef = useRef(handleStartCall);
  useEffect(() => {
    handleStartCallRef.current = handleStartCall;
  });

  // Global direct dial listener for table click-to-call actions
  useEffect(() => {
    const handleMakeCallEvent = (e) => {
      const rawNum = e?.detail?.number || e?.detail?.phoneNumber || e?.detail;
      if (!rawNum) return;

      if (!agentDataRef.current) {
        alert("Softphone agent profile configure nahi hai ya load ho raha hai. Kripya thoda intezar karein.");
        return;
      }

      setIsHidden(false);
      setIsMinimized(false);

      if (activeCall || incomingCall || (activeSessionRef.current && activeSessionRef.current.status !== 'ended')) {
        alert("Ek call pehle se chal rahi hai. Kripya doosri call lagane se pehle use end karein.");
        return;
      }

      handleStartCallRef.current?.(null, String(rawNum));
    };

    window.addEventListener('crm:make-call', handleMakeCallEvent);
    window.__crm_direct_call = (num) => {
      handleMakeCallEvent({ detail: { number: num } });
    };

    return () => {
      window.removeEventListener('crm:make-call', handleMakeCallEvent);
      delete window.__crm_direct_call;
    };
  }, [activeCall, incomingCall]);

  if (!agentData) return null; // Don't show widget if not an agent

  const hasActiveInteraction = !!(activeCall || incomingCall || (activeSession && activeSession.status !== 'ended') || optimisticCall);

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
          <span style={{ fontWeight: 600, fontSize: '0.92rem', color: isMinimized && callAnnouncement ? (callAnnouncement.type === 'rejected' ? '#ef4444' : '#f59e0b') : 'inherit' }}>
            {isMinimized && callAnnouncement ? callAnnouncement.title : 'CRM Softphone'}
          </span>
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

          {/* Call Outcome Announcement Banner */}
          {callAnnouncement && (
            <div style={{
              background: callAnnouncement.type === 'rejected' ? 'rgba(239, 68, 68, 0.12)' :
                          callAnnouncement.type === 'busy' ? 'rgba(245, 158, 11, 0.12)' :
                          callAnnouncement.type === 'no_answer' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(100, 116, 139, 0.12)',
              border: `1px solid ${
                callAnnouncement.type === 'rejected' ? '#ef4444' :
                callAnnouncement.type === 'busy' ? '#f59e0b' :
                callAnnouncement.type === 'no_answer' ? '#3b82f6' : 'var(--border-light)'
              }`,
              borderRadius: '8px',
              padding: '0.85rem',
              marginBottom: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: callAnnouncement.type === 'rejected' ? '#ef4444' : callAnnouncement.type === 'busy' ? '#f59e0b' : '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    flexShrink: 0
                  }}>
                    {callAnnouncement.type === 'rejected' ? <PhoneOff size={16} /> :
                     callAnnouncement.type === 'busy' ? <Clock size={16} /> :
                     <PhoneMissed size={16} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {callAnnouncement.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {callAnnouncement.subtitle} • +91 {callAnnouncement.customerNumber}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCallAnnouncement(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                  title="Dismiss"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Quick Redial button */}
              {callAnnouncement.customerNumber && (
                <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const num = callAnnouncement.customerNumber;
                      handleStartCall(null, num);
                    }}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.75rem',
                      background: 'var(--accent-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <RotateCcw size={13} /> Dobara Call Lagayein (Redial)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallAnnouncement(null)}
                    style={{
                      padding: '0.45rem 0.75rem',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active Call Status & Controls */}
          {((activeSession && activeSession.status !== 'ended') || optimisticCall || (activeCall && activeCall.direction === 'inbound')) && (
            <div style={{ background: 'var(--bg-primary)', padding: '1.25rem 1rem', borderRadius: '8px', textAlign: 'center', marginBottom: '1rem', border: '1px solid var(--border-light)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                color: (activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound')) ? '#10b981' : '#f59e0b',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '0.35rem'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: (activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound')) ? '#10b981' : '#f59e0b',
                  boxShadow: (activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound')) ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
                }} />
                {(activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound'))
                  ? 'Call Connected'
                  : (activeSession?.status === 'customer_ringing'
                      ? 'Ringing Customer...'
                      : (optimisticCall ? 'Connecting to Line...' : 'Ringing Customer...'))}
              </div>

              {/* Target Number */}
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                +91 {optimisticCall?.customerNumber || activeSession?.customer_number?.replace(/[^0-9]/g, '').slice(-10) || 'Customer'}
              </div>

              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '1rem', letterSpacing: '0.5px' }}>
                {(activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound')) ? formatDuration(callDuration) : '00:00'}
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                {activeCall && (
                  <button 
                    onClick={toggleMute}
                    style={{ width: '42px', height: '42px', borderRadius: '50%', background: isMuted ? '#f59e0b' : 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
                <button 
                  onClick={hangupCall}
                  style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)' }}
                  title="End Call (Hang Up)"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Call Center Active Session Panel (Merge, Mute Participants, etc.) */}
          {activeSession && activeSession.status !== 'ended' && (
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
