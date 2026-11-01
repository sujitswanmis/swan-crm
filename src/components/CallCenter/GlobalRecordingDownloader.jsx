'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Download, CheckCircle, XCircle, Minus, Maximize2, Loader2, AlertCircle, Clock } from 'lucide-react';

function formatEta(seconds) {
  if (seconds <= 0) return 'Almost done...';
  if (seconds < 60) return `~${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~${mins}m ${secs}s left`;
}

function computeEta(completed, total, startTime) {
  if (completed < 2) return 'Calculating ETA...';
  const elapsedMs = Date.now() - startTime;
  if (elapsedMs < 600) return 'Calculating ETA...';
  const rate = completed / (elapsedMs / 1000);
  if (rate <= 0) return 'Calculating ETA...';
  const remaining = total - completed;
  const secondsLeft = Math.round(remaining / rate);
  return formatEta(secondsLeft);
}

export default function GlobalRecordingDownloader() {
  const [downloadState, setDownloadState] = useState(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    const handleStart = async (event) => {
      const { calls = [], concurrency = 10, speedLabel = '10x Faster', dateRangeSuffix = '' } = event.detail || {};
      const validCalls = calls.filter(c => c.recording_url);
      if (validCalls.length === 0) return;

      cancelRequestedRef.current = false;

      // Smart browser-safe concurrency mapping (prevents host socket choking)
      let effectiveConcurrency = 8;
      if (concurrency <= 1) effectiveConcurrency = 1;
      else if (concurrency <= 5) effectiveConcurrency = 5;
      else if (concurrency <= 10) effectiveConcurrency = 8;
      else if (concurrency <= 25) effectiveConcurrency = 12;
      else effectiveConcurrency = Math.min(15, concurrency);

      const startTime = Date.now();

      setDownloadState({
        active: true,
        concurrency: effectiveConcurrency,
        speedLabel,
        dateRangeSuffix,
        dateRangeLabel: dateRangeSuffix ? dateRangeSuffix.replace(/_/g, ' ') : '',
        current: 0,
        total: validCalls.length,
        eta: 'Calculating ETA...',
        phase: 'downloading', // 'downloading' | 'compressing' | 'completed' | 'error'
        errorMsg: '',
        isMinimized: false
      });

      try {
        const JSZip = (await import('jszip')).default;
        const { saveAs } = await import('file-saver');
        const zip = new JSZip();
        const folder = zip.folder("call_recordings");

        let completed = 0;
        let downloadedCount = 0;
        let currentIndex = 0;
        let lastUiUpdate = 0;

        // Concurrent Worker with Event-Loop Yielding
        const worker = async () => {
          while (currentIndex < validCalls.length) {
            if (cancelRequestedRef.current) break;
            const index = currentIndex++;
            const c = validCalls[index];

            try {
              const resp = await fetch(c.recording_url);
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const blob = await resp.blob();

              const timeStr = c.created_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(c.created_at)) : 'rec';
              const agentName = (c.call_agents?.display_name || 'agent').replace(/[^a-zA-Z0-9_-]/g, '_');
              const customerNum = (c.customer_number || 'customer').replace(/[^0-9+]/g, '');
              const filename = `${timeStr}_${agentName}_${customerNum}_${c.id || index + 1}.mp3`;

              folder.file(filename, blob);
              downloadedCount++;
            } catch (err) {
              console.warn(`Failed to fetch recording ${c.id}:`, err);
            }

            completed++;

            // Throttled UI state update (every 150ms) to eliminate React re-render lag
            const now = performance.now();
            if (now - lastUiUpdate > 150 || completed === validCalls.length) {
              lastUiUpdate = now;
              const eta = computeEta(completed, validCalls.length, startTime);
              setDownloadState(prev => prev ? { ...prev, current: completed, eta } : null);
            }

            // Cooperative yield to keep browser UI, clicks, and page transitions at 60 FPS
            await new Promise(resolve => setTimeout(resolve, 15));
          }
        };

        const workers = [];
        const poolSize = Math.min(effectiveConcurrency, validCalls.length);
        for (let w = 0; w < poolSize; w++) {
          workers.push(worker());
        }

        await Promise.all(workers);

        if (cancelRequestedRef.current) {
          setDownloadState(null);
          window.dispatchEvent(new CustomEvent('recordings-zip-download-finished', { detail: { cancelled: true } }));
          return;
        }

        if (downloadedCount === 0) {
          throw new Error("Could not download any audio files. Please check network or CORS access.");
        }

        // Compressing Phase: Use compression: 'STORE' for ultra-fast, zero-CPU packaging of already-compressed MP3s
        setDownloadState(prev => prev ? { ...prev, phase: 'compressing', eta: 'Packing archive (~1-2s)...' } : null);

        // Yield to allow UI to render "Compiling ZIP" state
        await new Promise(resolve => setTimeout(resolve, 50));

        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'STORE',
          streamFiles: true
        });

        const defaultSuffix = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        const finalSuffix = dateRangeSuffix || defaultSuffix;
        saveAs(zipBlob, `Call_Recordings_${finalSuffix}.zip`);

        setDownloadState(prev => prev ? { ...prev, phase: 'completed', current: validCalls.length } : null);
        window.dispatchEvent(new CustomEvent('recordings-zip-download-finished', { detail: { success: true } }));

        // Auto dismiss after 6 seconds on success
        setTimeout(() => {
          setDownloadState(null);
        }, 6000);
      } catch (err) {
        console.error("Bulk recording download failed:", err);
        setDownloadState(prev => prev ? { ...prev, phase: 'error', errorMsg: err.message } : null);
        window.dispatchEvent(new CustomEvent('recordings-zip-download-finished', { detail: { error: err.message } }));
      }
    };

    window.addEventListener('start-recordings-zip-download', handleStart);
    return () => window.removeEventListener('start-recordings-zip-download', handleStart);
  }, []);

  if (!downloadState || !downloadState.active) return null;

  const percent = downloadState.total > 0 ? Math.round((downloadState.current / downloadState.total) * 100) : 0;

  const handleCancel = () => {
    if (confirm("Are you sure you want to stop this recordings download?")) {
      cancelRequestedRef.current = true;
      setDownloadState(null);
      window.dispatchEvent(new CustomEvent('recordings-zip-download-finished', { detail: { cancelled: true } }));
    }
  };

  const toggleMinimize = () => {
    setDownloadState(prev => prev ? { ...prev, isMinimized: !prev.isMinimized } : null);
  };

  // Minimized Compact Floating Pill
  if (downloadState.isMinimized) {
    return (
      <div 
        onClick={toggleMinimize}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: 'white',
          padding: '0.6rem 1.1rem',
          borderRadius: '50px',
          boxShadow: '0 10px 25px rgba(37, 99, 235, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.85rem',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          transition: 'all 0.2s ease'
        }}
        title="Click to expand recordings downloader"
      >
        <Loader2 size={16} className="animate-spin" />
        <span>{downloadState.current}/{downloadState.total} ({percent}%) • {downloadState.phase === 'compressing' ? 'Packing...' : downloadState.eta}</span>
        <Maximize2 size={14} style={{ opacity: 0.8, marginLeft: '0.2rem' }} />
      </div>
    );
  }

  // Expanded Floating Card
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 99999,
      width: '390px',
      maxWidth: 'calc(100vw - 48px)',
      background: 'white',
      borderRadius: '16px',
      boxShadow: '0 12px 35px rgba(15, 23, 42, 0.2), 0 2px 8px rgba(15, 23, 42, 0.08)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      fontFamily: 'inherit',
      animation: 'slideUp 0.3s ease-out'
    }}>
      {/* Header */}
      <div style={{
        background: downloadState.phase === 'error' ? '#ef4444' : (downloadState.phase === 'completed' ? '#10b981' : '#1e3a8a'),
        color: 'white',
        padding: '0.85rem 1.1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
          <Download size={18} />
          <span>
            {downloadState.phase === 'completed' ? 'Download Complete!' : (downloadState.phase === 'compressing' ? 'Compiling ZIP Archive...' : 'Downloading Recordings')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button 
            onClick={toggleMinimize} 
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
            title="Minimize to pill"
          >
            <Minus size={16} />
          </button>
          {downloadState.phase !== 'completed' && (
            <button 
              onClick={handleCancel} 
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
              title="Cancel download"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.1rem 1.25rem' }}>
        {downloadState.phase === 'completed' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#059669' }}>
            <CheckCircle size={24} color="#10b981" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>ZIP Saved Successfully!</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {downloadState.total} recordings ({downloadState.dateRangeLabel || 'Call Recordings'}) packed.
              </div>
            </div>
          </div>
        ) : downloadState.phase === 'error' ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#dc2626' }}>
            <AlertCircle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Download Failed</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{downloadState.errorMsg || 'Failed to download recordings.'}</div>
            </div>
          </div>
        ) : (
          <div>
            {/* Speed & Progress text */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                ⚡ {downloadState.speedLabel} ({downloadState.concurrency} Streams)
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>
                {downloadState.phase === 'compressing' ? 'Packing ZIP...' : `${downloadState.current} / ${downloadState.total} (${percent}%)`}
              </span>
            </div>

            {/* Date Range Period Badge */}
            {downloadState.dateRangeLabel && (
              <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>📅 Period:</span>
                <span style={{ color: '#0f172a', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                  {downloadState.dateRangeLabel}
                </span>
              </div>
            )}

            {/* ETA Countdown Timer Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: '#0369a1', background: '#f0f9ff', padding: '0.2rem 0.6rem', borderRadius: '5px' }}>
                <Clock size={13} color="#0284c7" />
                <span>{downloadState.phase === 'compressing' ? 'Almost ready (~1-2s)' : downloadState.eta}</span>
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                {downloadState.phase === 'compressing' ? 'Finalizing ZIP' : `${Math.max(0, downloadState.total - downloadState.current)} remaining`}
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.75rem' }}>
              <div style={{
                width: downloadState.phase === 'compressing' ? '100%' : `${percent}%`,
                height: '100%',
                background: downloadState.phase === 'compressing' 
                  ? 'linear-gradient(90deg, #10b981, #3b82f6)' 
                  : 'linear-gradient(90deg, #2563eb, #3b82f6)',
                borderRadius: '6px',
                transition: 'width 0.2s ease-out'
              }} />
            </div>

            {/* Background Notice */}
            <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🚀 Running in background. You can navigate freely.</span>
              <button
                onClick={handleCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: '0.76rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  textDecoration: 'underline'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
