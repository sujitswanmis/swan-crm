'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const preferenceKey = userId => `softphone_incoming_sound:${userId}`;

function savedSoundEnabled(userId) {
  try {
    return !userId || typeof window === 'undefined' || window.localStorage.getItem(preferenceKey(userId)) !== 'silent';
  } catch { return true; }
}

// This notification owns its audio context. It never touches Plivo media,
// microphone mute, carrier ringback, or the guarded answer/reject flow.
export function createIncomingRingtone({
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  schedule = setTimeout, cancel = clearTimeout, onBlocked = () => {}
} = {}) {
  let context = null, callKey = null, timer = null, playing = false, disposed = false, revision = 0;
  const voices = new Set();

  const stop = key => {
    if (key && key !== callKey) return;
    callKey = null;
    revision++;
    playing = false;
    if (timer !== null) cancel(timer);
    timer = null;
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch {}
      try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch {}
    }
    voices.clear();
  };

  const ring = () => {
    if (disposed || !callKey) return;
    if (context?.state !== 'running') {
      playing = false;
      onBlocked(true);
      return;
    }
    try {
      playing = true;
      onBlocked(false);
      // Three short chimes, followed by a pause; distinct from carrier audio.
      [880, 1046.5, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const at = context.currentTime + index * 0.24;
        const voice = { oscillator, gain };
        voices.add(voice);
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.18, at + 0.015);
        gain.gain.linearRampToValueAtTime(0, at + 0.19);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          voices.delete(voice);
          try { oscillator.disconnect(); gain.disconnect(); } catch {}
        };
        oscillator.start(at);
        oscillator.stop(at + 0.2);
      });
      timer = schedule(ring, 2600);
    } catch {
      const pendingCall = callKey;
      stop();
      callKey = pendingCall;
      onBlocked(true);
    }
  };

  const unlock = () => {
    if (disposed) return;
    const expectedRevision = revision;
    try {
      if (!context || context.state === 'closed') context = createContext();
      const expectedContext = context;
      const ready = () => {
        if (disposed || context !== expectedContext || expectedRevision !== revision) return;
        const blocked = context.state !== 'running';
        onBlocked(blocked);
        if (!blocked && callKey && !playing) ring();
      };
      if (context.state === 'running') ready();
      else {
        if (callKey) onBlocked(true);
        // Invoke resume synchronously inside the user's gesture. Never await it
        // in an SDK handler: browsers may leave this pending until interaction.
        Promise.resolve(context.resume()).then(ready, () => {
          if (!disposed && expectedRevision === revision) onBlocked(true);
        });
      }
    } catch { onBlocked(true); }
  };

  return {
    start(key) {
      if (!key || disposed || callKey === key) return;
      stop();
      callKey = key;
      unlock();
    },
    unlock,
    stop,
    destroy() {
      disposed = true;
      stop();
      try { Promise.resolve(context?.close()).catch(() => {}); } catch {}
      context = null;
    }
  };
}

export function useIncomingRingtone(userId, callId) {
  const [preference, setPreference] = useState(null);
  const [silencedCall, setSilencedCall] = useState(null);
  const [audioStatus, setAudioStatus] = useState(null);
  const controllerRef = useRef(null);
  const enabled = preference?.userId === userId ? preference.enabled : savedSoundEnabled(userId);
  const callKey = userId && callId ? JSON.stringify([userId, callId]) : null;
  const isSilenced = !!callKey && silencedCall === callKey;
  const blocked = audioStatus?.userId === userId && audioStatus.blocked;

  useEffect(() => {
    if (!userId) return;
    const controller = createIncomingRingtone({ onBlocked: value => {
      setAudioStatus(previous => previous?.userId === userId && previous.blocked === value
        ? previous : { userId, blocked: value });
    } });
    controllerRef.current = controller;
    const unlockAudio = () => controller.unlock();
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [userId]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (callKey && enabled && !isSilenced) controller?.start(callKey);
    else controller?.stop();
    return () => controller?.stop(callKey);
  }, [userId, callKey, enabled, isSilenced]);

  const stop = useCallback(id => {
    controllerRef.current?.stop(id ? JSON.stringify([userId, id]) : undefined);
  }, [userId]);
  const silence = () => {
    if (!callKey) return;
    controllerRef.current?.stop(callKey);
    setSilencedCall(callKey);
  };
  const toggleEnabled = () => {
    const next = !enabled;
    if (!next) controllerRef.current?.stop();
    else controllerRef.current?.unlock();
    setPreference({ userId, enabled: next });
    try { if (userId) window.localStorage.setItem(preferenceKey(userId), next ? 'on' : 'silent'); } catch {}
  };

  return { enabled, blocked, isSilenced, silence, stop, toggleEnabled,
    enableSound: () => controllerRef.current?.unlock() };
}
