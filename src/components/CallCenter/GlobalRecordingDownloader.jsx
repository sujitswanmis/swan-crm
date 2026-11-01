'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Download, CheckCircle, XCircle, Minus, Maximize2, Loader2, Play, Pause, AlertCircle } from 'lucide-react';

export default function GlobalRecordingDownloader() {
  const [downloadState, setDownloadState] = useState(null); 
  // downloadState: { active: boolean, calls: [], concurrency: number, speedLabel: string, current: number, total: number, phase: 'downloading'|'compressing'|'completed'|'error', errorMsg: '', isMinimized: boolean }
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    const handleStart = async (event) => {
      const { calls = [], concurrency = 10, speedLabel = '10x Faster' } = event.detail || {};
      const validCalls = calls.filter(c => c.recording_url);
      if (validCalls.length === 0) return;

      cancelRequestedRef.current = false;
      setDownloadState({
        active: true,
        calls: validCalls,
        concurrency: Math.max(1, concurrency),
        speedLabel,
        current: 0,
        total: validCalls.length,
        phase: 'downloading',
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

        // Concurrent Worker Pool
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
            if (!cancelRequestedRef.current) {
              setDownloadState(prev => prev ? { ...prev, current: completed } : null);
              window.dispatchEvent(new CustomEvent('recordings-zip-download-progress', {
                detail: { current: completed, total: validCalls.length }
              }));
            }
          }
        };

        const workers = [];
        const poolSize = Math.min(concurrency, validCalls.length);
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

        // Compressing Phase
        setDownloadState(prev => prev ? { ...prev, phase: 'compressing' } : null);

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
        saveAs(zipBlob, `Call_Recordings_${nowStr}.zip`);

        setDownloadState(prev => prev ? { ...prev, phase: 'completed' } : null);
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
          padding: '0.6rem 1rem',
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
        <span>Zipping: {downloadState.current}/{downloadState.total} ({percent}%)</span>
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
      width: '380px',
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
            {downloadState.phase === 'completed' ? 'Download Complete!' : (downloadState.phase === 'compressing' ? 'Compiling ZIP...' : 'Downloading Recordings')}
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
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{downloadState.total} audio files downloaded & packed.</div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                ⚡ {downloadState.speedLabel} ({downloadState.concurrency} Parallel)
              </span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b' }}>
                {downloadState.phase === 'compressing' ? 'Packing ZIP...' : `${downloadState.current} / ${downloadState.total} (${percent}%)`}
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
              <span>🚀 Downloading in background. You can navigate to other pages freely.</span>
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
