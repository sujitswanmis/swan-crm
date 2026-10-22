'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

export default function ErrorBoundary({ error, reset }) {
  const [isChunkError, setIsChunkError] = useState(false);

  useEffect(() => {
    console.error('Next.js Client Runtime Error Caught:', error);

    const isChunk = 
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module');

    if (isChunk) {
      setIsChunkError(true);
      // Auto-reload once on chunk mismatch after fresh deployment
      const hasAutoReloaded = sessionStorage.getItem('chunk_auto_reloaded');
      if (!hasAutoReloaded) {
        sessionStorage.setItem('chunk_auto_reloaded', 'true');
        window.location.reload();
      }
    }
  }, [error]);

  const handleHardReload = () => {
    try {
      sessionStorage.removeItem('chunk_auto_reloaded');
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } catch (_e) {}
    window.location.reload();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '2.5rem 2rem',
        textAlign: 'center',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          marginBottom: '1.25rem'
        }}>
          <AlertTriangle size={30} />
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.6rem', color: '#f8fafc' }}>
          {isChunkError ? 'New Workspace Update Available' : 'Something went wrong loading this page'}
        </h1>

        <p style={{ fontSize: '0.875rem', color: '#94a3b8', lineHeight: '1.5', marginBottom: '1.75rem' }}>
          {isChunkError
            ? 'A new version of the CRM was deployed. Please refresh to load the latest components.'
            : (error?.message || 'A temporary display error occurred. Please reload to refresh your workspace.')}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleHardReload}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.4rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
          >
            <RefreshCw size={16} />
            Refresh Workspace
          </button>

          <button
            type="button"
            onClick={() => { window.location.href = '/login'; }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.25rem',
              backgroundColor: '#334155',
              color: '#cbd5e1',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            <LogIn size={16} />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
