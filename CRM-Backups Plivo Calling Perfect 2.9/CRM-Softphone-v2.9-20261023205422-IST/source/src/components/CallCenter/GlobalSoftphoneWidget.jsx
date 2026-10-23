'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, PhoneMissed, Mic, MicOff, PhoneCall, Headphones, Minimize2, Maximize2, Loader2, ShieldAlert, GripHorizontal, X, RotateCcw, Clock } from 'lucide-react';
import Draggable from 'react-draggable';
import ActiveCallPanel from './ActiveCallPanel';
import { getRecentCalls } from '@/app/actions/team';
import { createClient } from '@/utils/supabase/client';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';
import { incomingMatchesOutboundRoom, shouldAutoAnswerOutbound } from '@/app/api/plivo/outbound-intent';
import { createIncomingCallGuard, incomingCallUuid } from '@/lib/softphoneIncomingCall';
import { useSoftphoneContacts } from './useSoftphoneContacts';
import styles from './Softphone.module.css';

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
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.025);
      gain.gain.setValueAtTime(0.35, startTime + dur - 0.025);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + dur);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + dur);
      osc2.stop(startTime + dur);
    } catch (e) {}
  }

  unlock() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {}
  }

  start(roomName) {
    if (typeof window === 'undefined') return;
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.activeRoom = roomName || null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      if (this.masterGain) {
        try { this.masterGain.disconnect(); } catch (e) {}
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.6, this.ctx.currentTime);
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

const SOFTPHONE_VERSION = 'v2.9';

function readCachedEndpointId(userId, reference) {
  try {
    if (typeof window === 'undefined') return null;
    const cached = JSON.parse(window.sessionStorage.getItem(`crm_softphone_endpoint_v1_${userId}`) || 'null');
    return cached?.reference === reference && cached.expiresAt > Date.now() && /^[0-9]+$/.test(cached.endpointId)
      ? cached.endpointId : null;
  } catch {
    return null;
  }
}

// Pre-warm SpeechSynthesis voices on page load
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        try { window.speechSynthesis.getVoices(); } catch (e) {}
      };
    }
  } catch (e) {}
}

// Web Audio API tone generator for instant audio cues
function playAudioTone(type) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (type === 'rejected') {
      [0, 0.14, 0.28].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520 - idx * 80, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.12);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
    } else if (type === 'busy') {
      [0, 0.18, 0.36].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(480, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.12);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.12);
      });
    } else if (type === 'switched_off') {
      [0, 0.16, 0.32].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(380 - idx * 50, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.14);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.14);
      });
    } else if (type === 'disconnect') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch (e) {
    console.warn("AudioContext tone error:", e);
  }
}

// Web Speech API Voice Announcer for Hindi / Indian English voice announcement
function speakOutcome(hindiText, englishText) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const voices = window.speechSynthesis.getVoices() || [];
        const hindiVoice = voices.find(v => v.lang === 'hi-IN' || v.lang.startsWith('hi'));
        const indianVoice = voices.find(v => v.lang === 'en-IN');
        const fallbackVoice = voices.length > 0 ? voices[0] : null;

        let selectedVoice = null;
        let selectedLang = 'en-US';
        let textToSpeak = englishText || hindiText;

        if (hindiVoice) {
          selectedVoice = hindiVoice;
          selectedLang = 'hi-IN';
          textToSpeak = hindiText || englishText;
        } else if (indianVoice) {
          selectedVoice = indianVoice;
          selectedLang = 'en-IN';
          textToSpeak = hindiText || englishText;
        } else {
          // On Windows with standard English voices (Microsoft David, Mark, Zira, etc.),
          // setting lang: 'hi-IN' throws language-unavailable error and silences the audio.
          // Using fallbackVoice.lang and clear English phrasing ensures loud, 100% reliable voice output.
          selectedVoice = fallbackVoice;
          selectedLang = fallbackVoice?.lang || 'en-US';
          textToSpeak = englishText || hindiText;
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.lang = selectedLang;

        // Prevent V8 Garbage Collection bug in Chrome
        window.__crm_speech_utterance = utterance;
        utterance.onend = () => {
          window.__crm_speech_utterance = null;
        };
        utterance.onerror = (e) => {
          console.warn("SpeechSynthesis error:", e?.error || e);
          window.__crm_speech_utterance = null;
        };

        window.speechSynthesis.speak(utterance);
      } catch (innerErr) {
        console.warn("SpeechSynthesis inner speak error:", innerErr);
      }
    }, 200);
  } catch (e) {
    console.warn("Speech synthesis error:", e);
  }
}

export default function GlobalSoftphoneWidget({ userId }) {
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('softphone_minimized');
        if (saved !== null) return saved === 'true';
      } catch (e) {}
    }
    return false;
  });

  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('softphone_hidden');
        if (saved !== null) return saved === 'true';
      } catch (e) {}
    }
    return true; // Default to docked pill so softphone never intrudes or flashes on refresh
  });

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
  const [agentDataState, setAgentData] = useState(null);
  const agentData = agentDataState?.user_id && agentDataState.user_id !== userId ? null : agentDataState;
  // Dialer state
  const [customerNumber, setCustomerNumber] = useState('');
  const [callingMode, setCallingMode] = useState('browser_webrtc');
  const [agentMobile, setAgentMobile] = useState('');
  const [position, setPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedPos = localStorage.getItem('softphone_position');
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return { x: parsed.x, y: parsed.y };
          }
        }
      } catch (e) {}
    }
    return { x: 0, y: 0 };
  });

  const durationTimerRef = useRef(null);
  const plivoClientRef = useRef(null);
  const incomingGuardRef = useRef(createIncomingCallGuard());
  const nodeRef = useRef(null);
  const callShortcutControlsRef = useRef(null);
  const activeSessionRef = useRef(null);
  const optimisticCallRef = useRef(null);
  const pendingOutboundCallRef = useRef(null);
  const startCallInFlightRef = useRef(null);
  const cancelledOutboundRoomsRef = useRef(new Set());
  const agentDataRef = useRef(null);
  const announcementTimerRef = useRef(null);
  const handleSessionTerminationAnnouncementRef = useRef(null);
  const lastAnnouncedRoomRef = useRef(null);
  const recentEndedSessionRef = useRef(null);
  const pendingOutcomeRoomsRef = useRef(new Set());
  const announcedOutcomeRoomsRef = useRef(new Set());

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    optimisticCallRef.current = optimisticCall;
  }, [optimisticCall]);

  useEffect(() => {
    agentDataRef.current = agentData;
  }, [agentData]);

  const stopRingingAudio = useCallback((roomName) => {
    const target = roomName || activeSessionRef.current?.room_name || optimisticCallRef.current?.roomName;
    globalRingController.stop(target);
  }, []);

  useEffect(() => {
    return () => {
      globalRingController.stop();
    };
  }, []);

  const triggerAnnouncement = useCallback(({ type, title, subtitle, speech, speechEnglish, customerNumber }) => {
    setIsHidden(false);
    stopRingingAudio();

    if (type === 'rejected') playAudioTone('rejected');
    else if (type === 'busy') playAudioTone('busy');
    else if (type === 'switched_off') playAudioTone('switched_off');
    else if (type === 'no_answer') playAudioTone('rejected');
    else playAudioTone('disconnect');

    if (speech || speechEnglish) {
      speakOutcome(speech, speechEnglish);
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
    const currentRoom = activeSessionRef.current?.room_name || optimisticCallRef.current?.roomName;
    if (currentRoom) {
      recentEndedSessionRef.current = { roomName: currentRoom, session: activeSessionRef.current, time: Date.now() };
    }
    if (currentRoom && startCallInFlightRef.current === currentRoom) {
      cancelledOutboundRoomsRef.current.add(currentRoom);
      setTimeout(() => cancelledOutboundRoomsRef.current.delete(currentRoom), 120000);
    }

    // Stop ringback audio immediately
    stopRingingAudio();

    // 1. INSTANT UI RESET (0 ms latency!)
    setActiveCall(null);
    setActiveSession(null);
    setOptimisticCall(null);
    optimisticCallRef.current = null;
    pendingOutboundCallRef.current = null;
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
        if (!optimisticCallRef.current || (Date.now() - (optimisticCallRef.current.startTime || 0) > 25000)) {
          setOptimisticCall(null);
        }
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
      if (prev.id === newSession.id) {
        const order = ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected', 'ended'];
        const previousStage = order.indexOf(prev.status);
        const nextStage = order.indexOf(newSession.status);
        if (previousStage >= 0 && nextStage >= 0 && nextStage < previousStage) return prev;
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
  const [endpointIdLookup, setEndpointIdLookup] = useState(null);
  const [profileLoad, setProfileLoad] = useState(null);
  const [profileReloadAttempt, setProfileReloadAttempt] = useState(0);
  const profileLoadState = profileLoad?.userId === userId ? profileLoad.status : 'loading';
  const contactFor = useSoftphoneContacts(agentData?.id ? userId : null, [
    incomingCall?.callerNumber, activeSession?.customer_number, optimisticCall?.customerNumber,
    activeCall?.direction === 'inbound' ? activeCall.remote : null
  ], agentData?.id || '');
  const assignedEndpointKey = String(agentData?.plivo_endpoint_key || '').trim();
  const endpointReference = JSON.stringify([userId, agentData?.id, assignedEndpointKey, agentData?.plivo_username, agentData?.plivo_sip_uri]);
  const displayEndpointId = /^[0-9]+$/.test(assignedEndpointKey)
    ? assignedEndpointKey
    : (endpointIdLookup?.reference === endpointReference ? endpointIdLookup.endpointId : null);

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

  // Keep saved position clamped within screen boundaries on mount or resize
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
          if (safeX !== parsed.x || safeY !== parsed.y) {
            setPosition({ x: safeX, y: safeY });
          }
        }
      }
    } catch (e) {
      console.error("Error clamping softphone position:", e);
    }
  }, [isMinimized]);

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

  // Read independently of the Server Action queue used by other CRM modules.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const controller = new AbortController();
    const fetchAgent = async () => {
      try {
        const response = await fetch(`/api/plivo/agent-profile?userId=${encodeURIComponent(userId)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) throw new Error('Softphone profile could not be loaded.');
        const { data } = await response.json();
        if (cancelled) return;
        setAgentData(data || null);
        if (data) {
          const reference = JSON.stringify([userId, data.id, String(data.plivo_endpoint_key || '').trim(), data.plivo_username, data.plivo_sip_uri]);
          setEndpointIdLookup({ reference, endpointId: readCachedEndpointId(userId, reference) });
          if (data.default_calling_mode) {
             setCallingMode(data.default_calling_mode);
          }
          const landingMobile = normalizeIndianPhoneNumber(data.user_landing_mobile);
          setAgentMobile(landingMobile ? landingMobile.slice(-10) : '');
        }
        setProfileLoad({ userId, status: 'ready' });
      } catch (err) {
        if (!cancelled) setProfileLoad({ userId, status: 'error' });
      }
    };
    fetchAgent();
    return () => { cancelled = true; controller.abort(); };
  }, [userId, profileReloadAttempt]);

  // Resolve the numeric Plivo ID separately so metadata cannot block connecting or dialing.
  useEffect(() => {
    if (!userId || !agentData?.id || /^[0-9]+$/.test(assignedEndpointKey)) return;
    const cachedId = readCachedEndpointId(userId, endpointReference);
    if (cachedId) return;
    let cancelled = false;
    const controller = new AbortController();
    const resolveEndpointId = async () => {
      try {
        const response = await fetch(`/api/plivo/agent-endpoint-id?userId=${encodeURIComponent(userId)}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal
        });
        if (!response.ok) throw new Error('Endpoint ID could not be loaded.');
        const result = await response.json();
        if (cancelled) return;
        const endpointId = /^[0-9]+$/.test(String(result.endpointId || '')) ? String(result.endpointId) : null;
        setEndpointIdLookup({ reference: endpointReference, endpointId });
        if (endpointId) {
          try {
            window.sessionStorage.setItem(`crm_softphone_endpoint_v1_${userId}`, JSON.stringify({
              reference: endpointReference, endpointId, expiresAt: Date.now() + 5 * 60 * 1000
            }));
          } catch { /* Display metadata caching is optional. Never cache SIP credentials. */ }
        }
      } catch {
        if (!cancelled) setEndpointIdLookup({ reference: endpointReference, endpointId: null });
      }
    };
    resolveEndpointId();
    return () => { cancelled = true; controller.abort(); };
  }, [userId, agentData?.id, assignedEndpointKey, endpointReference]);

  const handleSessionTerminationAnnouncement = useCallback((sessionData, allowGeneric = false) => {
    if (!sessionData) return;
    const room = sessionData.room_name;
    const cause = (sessionData.hangup_cause || '').toLowerCase();
    const cleanNum = (sessionData.customer_number || '').replace(/[^0-9]/g, '').slice(-10);

    if (room && announcedOutcomeRoomsRef.current.has(room)) return;
    if (room && !allowGeneric && !sessionData.customer_answer_time && sessionData.hangup_source !== 'agent' &&
        ['', 'failed', 'initiated', 'call_cancelled'].includes(cause)) {
      if (pendingOutcomeRoomsRef.current.has(room)) return;
      pendingOutcomeRoomsRef.current.add(room);
      const checkCarrierCause = async (attempt = 1) => {
        if (announcedOutcomeRoomsRef.current.has(room)) return;
        let latest = sessionData;
        try {
          const response = await fetch(`/api/plivo/session-status?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
          if (response.ok) {
            const result = await response.json();
            latest = result?.activeSession || latest;
          }
        } catch (_error) {}
        const latestCause = (latest.hangup_cause || '').toLowerCase();
        if (!['', 'failed', 'initiated', 'call_cancelled'].includes(latestCause)) {
          pendingOutcomeRoomsRef.current.delete(room);
          handleSessionTerminationAnnouncementRef.current?.(latest);
        } else if (attempt < 5) {
          setTimeout(() => checkCarrierCause(attempt + 1), attempt * 500);
        } else {
          pendingOutcomeRoomsRef.current.delete(room);
          handleSessionTerminationAnnouncementRef.current?.(latest, true);
        }
      };
      setTimeout(checkCarrierCause, 300);
      return;
    }

    // Guard: Prevent duplicate announcements for the same room
    const announceKey = `${room || 'room'}_${cause || 'ended'}`;
    if (room && lastAnnouncedRoomRef.current === announceKey) {
      return;
    }
    if (room) {
      lastAnnouncedRoomRef.current = announceKey;
      announcedOutcomeRoomsRef.current.add(room);
      pendingOutcomeRoomsRef.current.delete(room);
    }

    if (cause === 'agent_hangup') {
      return;
    }

    if (cause === 'agent_unavailable' || cause === 'agent_dial_error') {
      triggerAnnouncement({
        type: 'failed',
        title: 'Agent Softphone Connect नहीं हुआ',
        subtitle: 'Apna browser softphone, SIP app ya agent mobile connection check karein.',
        speech: 'Agent softphone connect nahi ho paya.',
        speechEnglish: 'The agent softphone could not connect.',
        customerNumber: cleanNum
      });
      return;
    }

    if (cause === 'customer_hangup') {
      triggerAnnouncement({
        type: 'ended',
        title: 'Customer ने Call Disconnect कर दिया',
        subtitle: 'Customer ne call end kar diya.',
        speech: 'Customer ne call disconnect kar diya.',
        speechEnglish: 'Customer disconnected the call.',
        customerNumber: cleanNum
      });
      return;
    }

    if (cause === 'invalid_number') {
      triggerAnnouncement({
        type: 'failed',
        title: 'Number उपलब्ध नहीं है',
        subtitle: 'Carrier ne number invalid ya unallocated bataya.',
        speech: 'Yeh number uplabdh nahi hai.',
        speechEnglish: 'This number is unavailable.',
        customerNumber: cleanNum
      });
      return;
    }

    if (sessionData.customer_answer_time) {
      triggerAnnouncement({
        type: 'ended',
        title: 'Call End हुई',
        subtitle: 'Connected call end ho gayi.',
        speech: 'Call end ho gayi.',
        speechEnglish: 'The call has ended.',
        customerNumber: cleanNum
      });
      return;
    }

    if (cause === 'unreachable' || cause === 'switched_off') {
      triggerAnnouncement({
        type: 'switched_off',
        title: 'Number Switched Off / Unreachable',
        subtitle: 'Carrier ke mutabik number abhi service ya network par available nahi hai.',
        speech: 'Number switched off ya unreachable hai.',
        speechEnglish: 'This number is currently unreachable.',
        customerNumber: cleanNum
      });
      return;
    }

    // Customer cut / rejected while ringing
    if (cause === 'rejected' || cause.includes('reject') || cause.includes('abandon')) {
      triggerAnnouncement({
        type: 'rejected',
        title: 'Call Decline / Busy',
        subtitle: 'Customer ne call decline kar di ya line busy hai.',
        speech: 'Customer ne call decline kar di, line busy hai.',
        speechEnglish: 'The call was declined or line is busy.',
        customerNumber: cleanNum
      });
    } else if (cause === 'busy' || cause.includes('busy')) {
      triggerAnnouncement({
        type: 'busy',
        title: 'Line Busy Hai',
        subtitle: 'Customer doosri call par vyast hai ya line busy hai.',
        speech: 'Line busy hai.',
        speechEnglish: 'The line is busy.',
        customerNumber: cleanNum
      });
    } else if (cause === 'no_answer' || cause.includes('timeout') || cause.includes('no-answer')) {
      triggerAnnouncement({
        type: 'no_answer',
        title: 'Call का Answer नहीं मिला',
        subtitle: 'Carrier ne no answer ya ring timeout bataya.',
        speech: 'Call ka answer nahi mila.',
        speechEnglish: 'The call was not answered.',
        customerNumber: cleanNum
      });
    } else if (cause === 'call_cancelled') {
      triggerAnnouncement({
        type: 'failed',
        title: 'Call Cancel हुई',
        subtitle: 'Call answer hone se pehle cancel ho gayi.',
        speech: 'Call answer hone se pehle cancel ho gayi.',
        speechEnglish: 'The call was cancelled before answer.',
        customerNumber: cleanNum
      });
    } else if (cause === 'network_error') {
      triggerAnnouncement({
        type: 'failed',
        title: 'Network के कारण Call नहीं लगी',
        subtitle: 'Carrier ne network ya routing error bataya.',
        speech: 'Network ke karan call connect nahi ho payi.',
        speechEnglish: 'The call failed due to a network issue.',
        customerNumber: cleanNum
      });
    } else if (cause === 'capacity_error' || cause === 'setup_error') {
      triggerAnnouncement({
        type: 'failed',
        title: cause === 'capacity_error' ? 'Call Capacity Limit आया' : 'Call Setup में दिक्कत आई',
        subtitle: cause === 'capacity_error' ? 'Provider ki call limit ya balance check karein.' : 'Provider settings ya call route check karein.',
        speech: cause === 'capacity_error' ? 'Call limit ki wajah se call nahi lagi.' : 'Call setup mein dikkat aayi.',
        speechEnglish: cause === 'capacity_error' ? 'The call limit was reached.' : 'The call could not be set up.',
        customerNumber: cleanNum
      });
    } else {
      triggerAnnouncement({
        type: 'failed',
        title: 'Call Connect नहीं हो सका',
        subtitle: 'Carrier ne exact reason confirm nahi kiya.',
        speech: 'Call connect nahi ho paya.',
        speechEnglish: 'Call could not connect.',
        customerNumber: cleanNum
      });
    }
  }, [triggerAnnouncement]);

  useEffect(() => {
    handleSessionTerminationAnnouncementRef.current = handleSessionTerminationAnnouncement;
  }, [handleSessionTerminationAnnouncement]);

  const handleActivePanelCallEnded = useCallback((endedSession) => {
    stopRingingAudio();
    const s = endedSession || activeSessionRef.current;
    if (s) {
      recentEndedSessionRef.current = { roomName: s.room_name, session: s, time: Date.now() };
      handleSessionTerminationAnnouncement(s);
    }
    updateActiveSession(null);
    setOptimisticCall(null);
  }, [handleSessionTerminationAnnouncement, updateActiveSession, stopRingingAudio]);

  const fetchSession = useCallback(async () => {
    if (!agentData) return;
    try {
      const activeRoom = activeSessionRef.current?.room_name || optimisticCallRef.current?.roomName;
      let url = `/api/plivo/session-status?agent_id=${agentData.id}`;
      if (activeRoom) {
        url += `&room=${encodeURIComponent(activeRoom)}`;
      }

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
      const statusData = await res.json();
      if (statusData?.activeSession?.room_name && cancelledOutboundRoomsRef.current.has(statusData.activeSession.room_name)) return;

      if (statusData?.activeSession && !statusData.isEnded) {
        const s = statusData.activeSession;
        const recentlyEnded = recentEndedSessionRef.current;
        if (recentlyEnded?.roomName === s.room_name && Date.now() - recentlyEnded.time < 120000) return;
        // A carrier ring callback does not prove the handset is alerting.
        stopRingingAudio(s.room_name);
        setOptimisticCall(null);
        updateActiveSession(s);
      } else if (statusData?.isEnded) {
        // Prevent stale ended sessions from wiping out a fresh (< 25s) optimistic call
        const isFreshOptimistic = optimisticCallRef.current && (Date.now() - (optimisticCallRef.current.startTime || 0) < 25000);
        if (!isFreshOptimistic || (statusData.activeSession?.room_name === activeRoom)) {
          stopRingingAudio(activeRoom);
          const prev = activeSessionRef.current;
          const endedData = statusData.activeSession || prev || (activeRoom ? { room_name: activeRoom, hangup_cause: statusData.hangupCause } : null);
          if (endedData) {
            recentEndedSessionRef.current = { roomName: endedData.room_name || activeRoom, session: endedData, time: Date.now() };
            // Guard: Stale sessions from prior calls on page load/refresh must never trigger announcement or unhide
            if (activeSessionRef.current || optimisticCallRef.current || activeRoom) {
              handleSessionTerminationAnnouncement(endedData);
            }
          }
          updateActiveSession(null);
          setOptimisticCall(null);
        }
      } else {
        // statusData is { activeSession: null }
        // CRITICAL ZERO-FLICKER GUARD:
        // When start-call is in-flight (< 25s), sessionData is null on the server until Plivo responds.
        // NEVER clear optimisticCall or revert to dialpad here!
        const isFreshOptimistic = optimisticCallRef.current && (Date.now() - (optimisticCallRef.current.startTime || 0) < 25000);
        if (isFreshOptimistic) {
          return;
        }

        // Only run getRecentCalls fallback if we previously had an active session that we might have lost track of
        if (activeSessionRef.current) {
          const { data } = await getRecentCalls(agentData.id);
          if (data) {
            const active = data.find(c => {
              const isStatusActive = ['initiated', 'ringing', 'agent_answered', 'connected', 'customer_ringing'].includes(c.status);
              const ageInMs = Date.now() - new Date(c.created_at).getTime();
              if (['initiated', 'ringing', 'customer_ringing', 'agent_answered'].includes(c.status) && ageInMs > 90000) return false;
              const isRecent = ageInMs < 1000 * 60 * 10;
              const recentlyEnded = recentEndedSessionRef.current;
              const wasEndedLocally = recentlyEnded?.roomName === c.room_name && Date.now() - recentlyEnded.time < 120000;
              return isStatusActive && isRecent && !wasEndedLocally;
            });

            if (active) {
              stopRingingAudio(active.room_name);
              setOptimisticCall(null);
              updateActiveSession(active);
            } else {
              const prev = activeSessionRef.current;
              if (prev) {
                stopRingingAudio(prev.room_name);
                const latest = data.find(c => c.id === prev.id) || data[0];
                if (latest && (latest.status === 'ended' || latest.status === 'failed')) {
                  recentEndedSessionRef.current = { roomName: latest.room_name, session: latest, time: Date.now() };
                  handleSessionTerminationAnnouncement(latest);
                }
                updateActiveSession(null);
                setOptimisticCall(null);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching softphone session:', err);
    }
  }, [agentData, updateActiveSession, stopRingingAudio, handleSessionTerminationAnnouncement]);

  // Realtime handles immediate changes; polling recovers missed events.
  useEffect(() => {
    if (!agentData) return;
    fetchSession();

    const isEngaged = !!(activeCall || activeSession || optimisticCall);
    const intervalMs = isEngaged ? 2000 : 60000;
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
        if (updated?.room_name && cancelledOutboundRoomsRef.current.has(updated.room_name)) {
          if (updated.status === 'ended' || updated.status === 'failed') cancelledOutboundRoomsRef.current.delete(updated.room_name);
          return;
        }
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
          const recentlyEnded = recentEndedSessionRef.current;
          if (recentlyEnded?.roomName === updated.room_name && Date.now() - recentlyEnded.time < 120000) return;
          stopRingingAudio();
          setOptimisticCall(null);
          updateActiveSession(updated);
        } else {
          // Terminal session state: trigger announcement ONLY if it belongs to our session or room
          const prevSession = activeSessionRef.current;
          const currentOptimistic = optimisticCallRef.current;
          const recentEnded = recentEndedSessionRef.current;
          const isRecentEndedMatch = recentEnded && 
            (Date.now() - recentEnded.time < 15000) && 
            (recentEnded.roomName === updated.room_name || (recentEnded.session && recentEnded.session.id === updated.id));

          const isOurSession = (prevSession && prevSession.id === updated.id) ||
                               (currentOptimistic && updated.room_name === currentOptimistic.roomName) ||
                               isRecentEndedMatch;
          if (isOurSession) {
            stopRingingAudio();
            recentEndedSessionRef.current = { roomName: updated.room_name, session: updated, time: Date.now() };
            handleSessionTerminationAnnouncement(updated);
            updateActiveSession(null);
            setOptimisticCall(null);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentData, supabase, updateActiveSession, stopRingingAudio, handleSessionTerminationAnnouncement]);

  const connectSoftphone = useCallback(async (clientInstance = plivoClient) => {
    if (!clientInstance) return;
    setConnectionState('connecting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/plivo/token', { method: 'POST' });
      if (plivoClientRef.current !== clientInstance) return;
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok || !contentType.includes('application/json')) {
        let errMsg = res.status === 401 
          ? 'Session expired. Please log in again.' 
          : `Connection endpoint unavailable (${res.status})`;
        try {
          if (contentType.includes('application/json')) {
            const errJson = await res.json();
            errMsg = errJson.error || errJson.message || errMsg;
          }
        } catch (_) {}
        setConnectionState('error');
        setErrorMessage(errMsg);
        return;
      }

      const data = await res.json();
      if (plivoClientRef.current !== clientInstance) return;
      if (data.username && data.password) {
        clientInstance.login(data.username, data.password);
      } else if (data.token) {
        clientInstance.loginWithAccessToken(data.token);
      } else if (data.enabled === false) {
        setConnectionState('offline');
        setErrorMessage('');
      } else {
        setConnectionState('error');
        setErrorMessage(data.error || 'Failed to fetch credentials');
      }
    } catch (err) {
      if (plivoClientRef.current !== clientInstance) return;
      setConnectionState('error');
      setErrorMessage(err.message || 'Failed to fetch credentials');
    }
  }, [plivoClient]);

  useEffect(() => {
    let activeClient = null;
    let disposed = false;
    const incomingGuard = incomingGuardRef.current;
    const initPlivo = async () => {
      try {
        const PlivoModule = await import('plivo-browser-sdk');
        if (disposed) return;
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
        // Let Plivo's real carrier media through. Local ringback can mask
        // switched-off or busy announcements during outbound dialing.
        if (typeof client.setRingTone === 'function') client.setRingTone(false);
        if (typeof client.setRingToneBack === 'function') client.setRingToneBack(false);

        client.on('onLogin', () => {
          if (plivoClientRef.current !== client) return;
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
          if (plivoClientRef.current !== client) return;
          setConnectionState('error');
          setErrorMessage('Login failed: ' + reason);
          setSdkStatus({ isRegistered: false, isConnected: false });
        });

        client.on('onLogout', () => {
          if (plivoClientRef.current && plivoClientRef.current !== client) return;
          incomingGuardRef.current.clear(client);
          setIncomingCall(null);
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
          if (plivoClientRef.current !== client) return;
          if (state && (state.status === 'disconnected' || state.status === 'failed')) {
            setConnectionState('error');
            setErrorMessage('Connection lost: ' + (state.reason || 'Disconnected'));
            setSdkStatus(prev => ({ ...prev, isConnected: false }));
          } else if (state && state.status === 'connected') {
            setSdkStatus(prev => ({ ...prev, isConnected: true }));
          }
        });

        client.on('onIncomingCall', async (callerName, extraHeaders, callInfo, incomingCallerName) => {
          if (plivoClientRef.current !== client) return;
          const guard = incomingGuardRef.current;
          const ticket = guard.begin(client, callInfo);
          if (!ticket) return;
          const resolvedCaller = callerName || incomingCallerName || '';
          const pending = pendingOutboundCallRef.current;
          const activeRoom = optimisticCallRef.current?.roomName || activeSessionRef.current?.room_name || pending?.roomName;
          const isCancelledOutbound = [...cancelledOutboundRoomsRef.current].some((room) =>
            incomingMatchesOutboundRoom(room, extraHeaders, resolvedCaller)
          );
          if (isCancelledOutbound) {
            guard.act(client, callInfo, 'reject');
            return;
          }
          const isFreshPending = pending && activeRoom === pending.roomName && (Date.now() - pending.startedAt < 18000);
          const matchesOutbound = shouldAutoAnswerOutbound(pending, activeRoom, extraHeaders, resolvedCaller) || (isFreshPending && (extraHeaders?.['X-PH-CrmRoom'] || extraHeaders?.['x-ph-crmroom'] || resolvedCaller.startsWith('CRM') || isFreshPending));
          if (matchesOutbound) {
            pendingOutboundCallRef.current = null;
            try {
              if (typeof client.stopRingTone === 'function') client.stopRingTone();
              if (guard.act(client, callInfo, 'answer').success) {
                setActiveCall({ direction: 'inbound', remote: callerName });
                setIncomingCall(null);
                return;
              }
            } catch (e) { console.error('Outbound auto-answer failed:', e); }
            return;
          }
          if (pending && Date.now() - pending.startedAt >= 20000) pendingOutboundCallRef.current = null;

          let leadName = '';
          let leadCompany = '';
          let leadId = '';
          const callerNumber = callerName || '';

          // 1. Try parsing from extraHeaders
          if (extraHeaders) {
            try {
              leadName = decodeURIComponent(extraHeaders['X-Lead-Name'] || extraHeaders['x-lead-name'] || '');
              leadCompany = decodeURIComponent(extraHeaders['X-Lead-Company'] || extraHeaders['x-lead-company'] || '');
              leadId = extraHeaders['X-Lead-Id'] || extraHeaders['x-lead-id'] || '';
            } catch (e) {}
          }

          // Show the live invitation immediately. Lead lookup only enriches
          // this exact invite; it cannot recreate a cancelled/answered one.
          setIncomingCall({ callerName, callerNumber, leadName, leadCompany, leadId, extraHeaders, callInfo });
          setIsMinimized(false);

          // Optional names are resolved separately by useSoftphoneContacts,
          // using the authenticated tenant instead of an unscoped browser query.

          if (plivoClientRef.current !== client || !guard.isCurrent(ticket)) {
            if (guard.current() === ticket) {
              guard.clear(client, callInfo);
              setIncomingCall(previous => incomingCallUuid(previous) === ticket.uuid ? null : previous);
            }
            return;
          }
          setIncomingCall(previous => incomingCallUuid(previous) === ticket.uuid
            ? { ...previous, leadName, leadCompany, leadId } : previous);
        });

        client.on('onIncomingCallCanceled', (callInfo) => {
          if (plivoClientRef.current !== client) return;
          if (incomingGuardRef.current.clear(client, callInfo)) {
            const uuid = incomingCallUuid(callInfo);
            setIncomingCall(previous => !uuid || incomingCallUuid(previous) === uuid ? null : previous);
          }
        });

        client.on('onMediaPermission', (event) => {
          if (plivoClientRef.current !== client) return;
          if (event?.error) {
            setErrorMessage('Microphone permission nahi mili. Browser settings check karein.');
          }
        });

        client.on('onCallFailed', (reason, callInfo) => {
          if (plivoClientRef.current !== client) return;
          incomingGuardRef.current.clear(client, callInfo);
          stopRingingAudio();
          setActiveCall(null);
          const uuid = incomingCallUuid(callInfo);
          setIncomingCall(previous => !uuid || incomingCallUuid(previous) === uuid ? null : previous);
          setErrorMessage(`Call failed: ${String(reason?.message || reason?.cause || reason || 'connection error')}`);
        });

        client.on('onCallAnswered', (callInfo) => {
          if (plivoClientRef.current !== client) return;
          incomingGuardRef.current.clear(client, callInfo);
          const uuid = incomingCallUuid(callInfo);
          setIncomingCall(previous => !uuid || incomingCallUuid(previous) === uuid ? null : previous);
          startDurationTimer();
        });

        client.on('onCallTerminated', async (callInfo) => {
          if (plivoClientRef.current !== client) return;
          incomingGuardRef.current.clear(client, callInfo);
          pendingOutboundCallRef.current = null;
          stopRingingAudio();
          setActiveCall(null);
          const uuid = incomingCallUuid(callInfo);
          setIncomingCall(previous => !uuid || incomingCallUuid(previous) === uuid ? null : previous);
          stopDurationTimer();
          setCallDuration(0);

          const currentSession = activeSessionRef.current;
          const currentOptimistic = optimisticCallRef.current;
          const endedRoom = currentSession?.room_name || currentOptimistic?.roomName;

          if (endedRoom) {
            recentEndedSessionRef.current = {
              roomName: endedRoom,
              session: currentSession,
              time: Date.now()
            };
          }

          setActiveSession(null);
          setOptimisticCall(null);
          optimisticCallRef.current = null;

          if (endedRoom) {
            let attempts = 0;
            const pollEndedCause = async () => {
              attempts++;
              try {
                const res = await fetch(`/api/plivo/session-status?room=${encodeURIComponent(endedRoom)}&agent_id=${agentDataRef.current?.id}`, { cache: 'no-store' });
                if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return;
                const statusData = await res.json();
                const sessionResult = statusData?.activeSession;
                const cause = sessionResult?.hangup_cause;
                // Give the carrier CDR a moment to replace a generic end reason.
                if (cause && !['initiated', 'ringing', 'agent_answered', 'failed', 'agent_hangup', 'call_cancelled'].includes(cause)) {
                  handleSessionTerminationAnnouncementRef.current?.(sessionResult);
                } else if (attempts < 5) {
                  setTimeout(pollEndedCause, attempts * 400);
                } else {
                  handleSessionTerminationAnnouncementRef.current?.(sessionResult || currentSession);
                }
              } catch (e) {
                if (attempts < 5) {
                  setTimeout(pollEndedCause, attempts * 400);
                } else if (currentSession) {
                  handleSessionTerminationAnnouncementRef.current?.(currentSession);
                }
              }
            };
            setTimeout(pollEndedCause, 200);
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
      disposed = true;
      if (activeClient) {
        incomingGuard.clear(activeClient);
        if (plivoClientRef.current === activeClient) plivoClientRef.current = null;
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
    const client = plivoClientRef.current;
    if (client && incomingCall) {
      const uuid = incomingCallUuid(incomingCall);
      const result = incomingGuardRef.current.act(client, incomingCall, 'answer');
      if (result.success) {
        setActiveCall({ direction: 'inbound', remote: incomingCall.callerName });
        startDurationTimer();
      } else if (result.reason === 'failed') {
        setErrorMessage('Call could not be answered. Please try a fresh call.');
      }
      setIncomingCall(previous => incomingCallUuid(previous) === uuid ? null : previous);
    }
  };

  const rejectCall = () => {
    const client = plivoClientRef.current;
    if (client && incomingCall) {
      const uuid = incomingCallUuid(incomingCall);
      incomingGuardRef.current.act(client, incomingCall, 'reject');
      setIncomingCall(previous => incomingCallUuid(previous) === uuid ? null : previous);
    }
  };

  const toggleMute = () => {
    if (plivoClient && activeCall) {
      if (isMuted) plivoClient.unmute();
      else plivoClient.mute();
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    const handleCallShortcut = event => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return;
      const key = String(event.key || '').toLowerCase();
      if (!['m', 'h', 'e'].includes(key)) return;
      const hasSession = activeSession && !['ended', 'failed'].includes(activeSession.status);
      if (!hasSession && !activeCall && !optimisticCall) return;
      // Own these shortcuts only during this CRM call. Browser defaults are
      // left intact when there is no call, and held keys never repeat actions.
      event.preventDefault();
      event.stopPropagation();
      const controls = callShortcutControlsRef.current;
      if (event.repeat || controls?.modalOpen || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      try {
        if (hasSession) {
          if (!controls) return;
          if (key === 'm' && controls.canMute) void controls.mute();
          if (key === 'h' && controls.canHold) void controls.hold();
          if (key === 'e' && controls.canEnd) {
            if (controls.requiresEndConfirmation) {
              setIsHidden(false);
              setIsMinimized(false);
            }
            void controls.end();
          }
        } else if (key === 'm' && activeCall) toggleMute();
        else if (key === 'e') void hangupCall();
      } catch (error) {
        setErrorMessage(error.message || 'Call shortcut could not complete.');
      }
    };
    window.addEventListener('keydown', handleCallShortcut, true);
    return () => window.removeEventListener('keydown', handleCallShortcut, true);
  });

  const handleStartCall = async (e, directNumber = null) => {
    e?.preventDefault?.();
    const rawTarget = directNumber || customerNumber;
    if (!rawTarget) return;
    if (optimisticCallRef.current || activeSessionRef.current || activeCall) return;
    if (callingMode === 'browser_webrtc' && connectionState !== 'online') {
      alert('Browser softphone connect hone ke baad call karein.');
      return;
    }

    const formattedE164 = normalizeIndianPhoneNumber(rawTarget);
    if (!formattedE164) {
      alert('Valid 10-digit Indian phone number required');
      return;
    }
    const display10Digit = formattedE164.slice(-10);
    setCustomerNumber(display10Digit);

    // Unhide and unminimize softphone so agent sees the call progress
    setIsHidden(false);
    setIsMinimized(false);

    // Dismiss previous announcement
    setCallAnnouncement(null);

    const clientRoomName = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    startCallInFlightRef.current = clientRoomName;

    // 1. Set immediate optimistic UI state! (0 ms latency, completely steady)
    const optimisticState = {
      roomName: clientRoomName,
      customerNumber: display10Digit,
      callingMode,
      status: 'initiating',
      startTime: Date.now()
    };
    setOptimisticCall(optimisticState);
    optimisticCallRef.current = optimisticState;

    if (callingMode === 'browser_webrtc') {
      pendingOutboundCallRef.current = {
        roomName: clientRoomName,
        startedAt: Date.now()
      };
    }

    try {
      const res = await fetch('/api/plivo/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: clientRoomName,
          customerNumber: formattedE164,
          callingMode,
          agentEndpoint: agentData?.plivo_sip_uri,
          agentMobile: callingMode === 'mobile' ? agentMobile : undefined
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        let errText = `Call failed (${res.status})`;
        try {
          if (contentType.includes('application/json')) {
            const errJson = await res.json();
            errText = errJson.error || errJson.message || errText;
          }
        } catch (_) {}
        pendingOutboundCallRef.current = null;
        stopRingingAudio(clientRoomName);
        setOptimisticCall(null);
        optimisticCallRef.current = null;
        setErrorMessage(errText);
        alert(`Failed to start call: ${errText}`);
        return;
      }
      const result = await res.json();
      if (cancelledOutboundRoomsRef.current.has(clientRoomName)) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const cleanup = await fetch('/api/plivo/controls/hangup-conference', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomName: clientRoomName })
            });
            if (cleanup.ok) break;
          } catch (cleanupError) {
            console.error('Failed to cancel outbound call:', cleanupError);
          }
        }
        return;
      }
      if (result.error) {
        pendingOutboundCallRef.current = null;
        stopRingingAudio(clientRoomName);
        setOptimisticCall(null);
        optimisticCallRef.current = null;
        alert("Call Error: " + result.error);
      } else {
        if (!directNumber) setCustomerNumber('');
        if (result.session) {
          if (['ended', 'failed'].includes(result.session.status)) {
            pendingOutboundCallRef.current = null;
            recentEndedSessionRef.current = { roomName: result.session.room_name, session: result.session, time: Date.now() };
            handleSessionTerminationAnnouncement(result.session);
          } else {
            updateActiveSession(result.session);
          }
          setOptimisticCall(null);
          optimisticCallRef.current = null;
        }
      }
    } catch (err) {
      if (cancelledOutboundRoomsRef.current.has(clientRoomName)) {
        return;
      }
      pendingOutboundCallRef.current = null;
      stopRingingAudio(clientRoomName);
      setOptimisticCall(null);
      optimisticCallRef.current = null;
      console.error('[Softphone] Outbound start-call error:', err);
      const errDetail = err?.message || 'Server connection error';
      setErrorMessage(`Failed to start call: ${errDetail}`);
      alert(`Failed to start call: ${errDetail}`);
    } finally {
      if (startCallInFlightRef.current === clientRoomName) startCallInFlightRef.current = null;
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

  if (!userId) return null;
  if (!agentData) {
    if (profileLoadState === 'ready') return null; // Verified: this user is not a call agent.
    return (
      <div className={styles.launcherRoot}>
        <button
          type="button"
          className={styles.launcherButton}
          disabled={profileLoadState === 'loading'}
          aria-busy={profileLoadState === 'loading'}
          onClick={() => { setProfileLoad(null); setAgentData(null); setProfileReloadAttempt(value => value + 1); }}
          title={profileLoadState === 'error' ? 'Retry loading CRM Softphone' : 'Loading CRM Softphone'}
        >
          <PhoneCall size={15} />
          <span>Softphone</span>
          <span role="status">{profileLoadState === 'error' ? 'Retry' : 'Loading…'}</span>
        </button>
      </div>
    );
  }

  const hasActiveInteraction = !!(activeCall || incomingCall || (activeSession && activeSession.status !== 'ended') || optimisticCall);

  // Keep active controls mounted while docked/minimized so shortcuts retain
  // the live participant state and conference confirmation behavior.
  return (
    <>
      {isHidden && !incomingCall && (
      <div className={styles.launcherRoot}>
        <button
          type="button"
          onClick={handleUnhideWidget}
          className={styles.launcherButton}
          title="Click to open CRM Softphone"
        >
          <PhoneCall size={15} />
          <span>Softphone</span>
          <span className={styles.statusDot} data-state={connectionState} />
        </button>
      </div>
      )}
    <Draggable 
      nodeRef={nodeRef} 
      handle=".drag-handle" 
      position={position}
      bounds={bounds}
      onDrag={handleDrag}
      onStop={handleDragStop}
    >
      <div ref={nodeRef} className={styles.shell} data-minimized={isMinimized} style={{ width: isMinimized ? '280px' : 'min(360px, calc(100vw - 16px))', display: isHidden && !incomingCall ? 'none' : undefined }}>
      {/* Widget Header (Click to toggle) */}
      <div className={styles.header}>
        <div className={styles.headerBrand}>
          <div className={`drag-handle ${styles.dragHandle}`}>
            <GripHorizontal size={16} />
          </div>
          <span className={styles.brandMark}><PhoneCall size={18} /></span>
          <span className={styles.headerTitle}>
            {isMinimized && callAnnouncement ? callAnnouncement.title : 'CRM Softphone'}
          </span>
          <span className={styles.version}>
            {SOFTPHONE_VERSION}
          </span>
          <span className={styles.statusDot} data-state={connectionState} />
        </div>
        <div className={styles.headerActions}>
          <button 
            type="button"
            className={styles.iconButton}
            onClick={handleToggleMinimize}
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button 
            type="button"
            className={styles.iconButton}
            onClick={handleHideWidget}
            title="Hide Softphone"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Widget Body */}
        <div className={styles.body} style={{ display: isMinimized ? 'none' : undefined }}>
          {/* Connection Controls */}
          <div className={styles.connection}>
            <div className={styles.connectionInfo}>
              <span className={styles.connectionState} data-state={connectionState}>
                <span className={styles.statusDot} data-state={connectionState} />
                {connectionState === 'online' ? 'Online' : 
                 connectionState === 'connecting' ? 'Connecting...' : 
                 connectionState === 'error' ? 'Connection Error' : 'Offline'}
              </span>
              <span className={styles.endpoint}>
                Endpoint ID: {displayEndpointId || 'N/A'}
              </span>
            </div>
            <div style={{ flexShrink: 0 }}>
              {connectionState !== 'online' ? (
                <button 
                  onClick={() => connectSoftphone(plivoClient)}
                  disabled={connectionState === 'connecting'}
                  className={`${styles.primaryButton} ${styles.compactButton}`}
                >
                  {connectionState === 'connecting' ? <Loader2 size={14} className="spin" /> : <ShieldAlert size={14} />} Connect
                </button>
              ) : (
                <button 
                  onClick={disconnectSoftphone}
                  className={`${styles.secondaryButton} ${styles.compactButton}`}
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className={styles.error} role="alert">
              {errorMessage}
            </div>
          )}

          {/* Incoming Call Popup with Live Lead Identification */}
          {incomingCall && (
            <div className={styles.incoming}>
              <div className={styles.incomingEyebrow}>
                Incoming Call
              </div>

              {/* Lead Name / Identifier */}
              <div className={styles.incomingName}>
                {contactFor(incomingCall.callerNumber).name}
              </div>

              {/* Contact metadata is verified within the current tenant. */}
              <div style={{ marginBottom: '0.5rem' }}>
                {contactFor(incomingCall.callerNumber).source ? (
                  <span className={styles.leadBadge}>
                    ✓ Known Contact
                  </span>
                ) : (
                  <span className={styles.leadBadge}>
                    UnKnow Person
                  </span>
                )}
              </div>

              {/* Phone Number */}
              <div className={styles.incomingNumber}>
                +91 {incomingCall.callerNumber?.replace(/\D/g, '').slice(-10) || incomingCall.callerName}
              </div>

              {/* Action Buttons */}
              <div className={styles.incomingActions}>
                <button
                  type="button"
                  onClick={rejectCall}
                  className={styles.dangerButton}
                >
                  <PhoneOff size={15} /> Reject
                </button>
                <button
                  type="button"
                  onClick={answerCall}
                  className={styles.primaryButton}
                >
                  <Phone size={15} /> Answer
                </button>
              </div>
            </div>
          )}

          {/* Call Outcome Announcement Banner */}
          {callAnnouncement && (
            <div className={styles.announcement} data-outcome={callAnnouncement.type}>
              <div className={styles.announcementHeader}>
                <div className={styles.announcementInfo}>
                  <div className={styles.announcementIcon}>
                    {callAnnouncement.type === 'rejected' ? <PhoneOff size={16} /> :
                     callAnnouncement.type === 'switched_off' ? <PhoneOff size={16} /> :
                     callAnnouncement.type === 'busy' ? <Clock size={16} /> :
                     <PhoneMissed size={16} />}
                  </div>
                  <div>
                    <div className={styles.announcementTitle}>
                      {callAnnouncement.title}
                    </div>
                    <div className={styles.announcementSubtitle}>
                      {callAnnouncement.subtitle} • +91 {callAnnouncement.customerNumber}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCallAnnouncement(null)}
                  className={styles.iconButton}
                  title="Dismiss"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Quick Redial button */}
              {callAnnouncement.customerNumber && (
                <div className={styles.announcementActions}>
                  <button
                    type="button"
                    onClick={() => {
                      const num = callAnnouncement.customerNumber;
                      handleStartCall(null, num);
                    }}
                    className={styles.primaryButton}
                  >
                    <RotateCcw size={13} /> Dobara Call Lagayein (Redial)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallAnnouncement(null)}
                    className={styles.secondaryButton}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active Call Status & Controls (Only rendered when there is no ActiveCallPanel activeSession, e.g. optimistic outbound connecting or direct inbound call) */}
          {(!activeSession || activeSession.status === 'ended') && (optimisticCall || (activeCall && activeCall.direction === 'inbound')) && (
            <div className={styles.directCall}>
              <div className={styles.callState} style={{ justifyContent: 'center' }} data-connected={!!(activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound'))}>
                <span className={styles.callStateDot} />
                {(activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound'))
                  ? 'Call Connected'
                  : (activeSession?.status === 'customer_ringing'
                      ? 'Carrier is trying customer line...'
                      : 'Connecting to Line...')}
              </div>

              {/* Target Number */}
              <div className={styles.incomingName}>
                {contactFor(optimisticCall?.customerNumber || activeSession?.customer_number || activeCall?.remote).name}
              </div>
              <div className={styles.directNumber}>
                +91 {String(optimisticCall?.customerNumber || activeSession?.customer_number || activeCall?.remote || '').replace(/[^0-9]/g, '').slice(-10) || 'Customer'}
              </div>

              <div className={styles.duration}>
                {(activeSession?.status === 'connected' || activeSession?.customer_answer_time || (activeCall && activeCall.direction === 'inbound')) ? formatDuration(callDuration) : '00:00'}
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                {activeCall && (
                  <button 
                    onClick={toggleMute}
                    className={styles.participantButton}
                    aria-pressed={isMuted}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
                <button 
                  onClick={hangupCall}
                  className={styles.dangerButton}
                  title="End Call (Hang Up)"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Call Center Active Session Panel (Merge, Mute Participants, etc.) */}
          {activeSession && activeSession.status !== 'ended' && (
            <div>
              <ActiveCallPanel session={activeSession} agentData={agentData} userId={userId} onCallEnded={handleActivePanelCallEnded}
                durationLabel={formatDuration(callDuration)}
                onToggleMute={activeCall && plivoClient && activeSession.calling_mode === 'browser_webrtc' ? toggleMute : undefined}
                microphoneMuted={isMuted} shortcutControlsRef={callShortcutControlsRef} />
            </div>
          )}

          {/* Outbound Dialer (Only visible when no active calls) */}
          {!hasActiveInteraction && (
            <div className={styles.dialer}>
              <form onSubmit={handleStartCall}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="crm-softphone-customer-number">Customer number</label>
                  <div className={styles.numberField}>
                    <span className={styles.countryCode}>+91</span>
                    <input 
                      type="text" 
                      id="crm-softphone-customer-number"
                      inputMode="numeric"
                      value={customerNumber}
                      onChange={(e) => setCustomerNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Mobile Number"
                      className={styles.textInput}
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.label} id="crm-softphone-calling-mode-label">Calling method</span>
                  <div className={styles.methodToggle} role="group" aria-labelledby="crm-softphone-calling-mode-label">
                    <button type="button" aria-pressed={callingMode === 'browser_webrtc'}
                      onClick={() => setCallingMode('browser_webrtc')}>
                      <Headphones size={15} /> Browser
                    </button>
                    <button type="button" aria-pressed={callingMode === 'mobile'}
                      onClick={() => setCallingMode('mobile')}>
                      <Phone size={15} /> Via Mobile
                    </button>
                  </div>
                </div>

                {callingMode === 'mobile' && (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="crm-softphone-agent-mobile">Agent Mobile (Call Landing Number)</label>
                    <div className={styles.numberField}>
                      <span className={styles.countryCode}>+91</span>
                      <input 
                        type="text" 
                        id="crm-softphone-agent-mobile"
                        inputMode="numeric"
                        value={agentMobile}
                        onChange={(e) => setAgentMobile(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Agent Mobile Number"
                        className={styles.textInput}
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
                  className={`${styles.primaryButton} ${styles.callButton}`}
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
      </div>
    </Draggable>
    </>
  );
}
