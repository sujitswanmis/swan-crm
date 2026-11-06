'use client';

import { useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Monitor, ChevronRight, ChevronLeft } from 'lucide-react';

export default function DesktopZoomControl() {
  const [zoomPercent, setZoomPercent] = useState(100);
  const [screenRes, setScreenRes] = useState({ width: 0, height: 0 });
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // Initialize screen resolution and saved zoom level
  useEffect(() => {
    setIsClient(true);
    const updateRes = () => {
      setScreenRes({
        width: window.innerWidth || window.screen?.width || 0,
        height: window.innerHeight || window.screen?.height || 0
      });
    };
    updateRes();
    window.addEventListener('resize', updateRes);

    // Check if running inside Desktop Electron App
    if (typeof window !== 'undefined' && window.desktopApp?.getZoom) {
      window.desktopApp.getZoom().then((currentZoom) => {
        if (currentZoom) setZoomPercent(currentZoom);
      }).catch(() => {});

      if (window.desktopApp.onZoomChanged) {
        window.desktopApp.onZoomChanged((newZoom) => {
          setZoomPercent(newZoom);
        });
      }
    } else {
      // Running in standard Web Browser: restore saved CSS zoom
      try {
        const saved = localStorage.getItem('spc_user_zoom');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (parsed >= 60 && parsed <= 160) {
            setZoomPercent(parsed);
            document.documentElement.style.zoom = `${parsed / 100}`;
          }
        }
      } catch (_e) {}
    }

    return () => {
      window.removeEventListener('resize', updateRes);
    };
  }, []);

  const applyZoom = useCallback((newPercent) => {
    const clamped = Math.max(60, Math.min(160, newPercent));
    setZoomPercent(clamped);

    if (typeof window !== 'undefined') {
      if (window.desktopApp?.setZoom) {
        window.desktopApp.setZoom(clamped);
      } else {
        document.documentElement.style.zoom = `${clamped / 100}`;
        try {
          localStorage.setItem('spc_user_zoom', clamped.toString());
        } catch (_e) {}
      }
    }
  }, []);

  const handleZoomIn = () => applyZoom(zoomPercent + 10);
  const handleZoomOut = () => applyZoom(zoomPercent - 10);
  const handleReset = () => applyZoom(100);

  if (!isClient) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '30px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '0.82rem',
        userSelect: 'none',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: isCollapsed ? '4px 10px 4px 8px' : '4px 6px 4px 12px',
      }}
      title={`Screen Size: ${screenRes.width} × ${screenRes.height} | Current Zoom: ${zoomPercent}%`}
    >
      {/* Collapsed Pill */}
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: 0,
            fontSize: '0.8rem',
            fontWeight: 600
          }}
        >
          <Monitor size={14} color="#38bdf8" />
          <span style={{ color: '#e2e8f0' }}>{zoomPercent}%</span>
          <ChevronRight size={14} color="#64748b" />
        </button>
      ) : (
        /* Expanded Controls */
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Screen Size Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              paddingRight: '6px',
              borderRight: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#94a3b8',
              fontSize: '0.75rem',
              fontWeight: 500
            }}
          >
            <Monitor size={13} color="#38bdf8" />
            <span>{screenRes.width}×{screenRes.height}</span>
          </div>

          {/* Zoom Out Button */}
          <button
            onClick={handleZoomOut}
            disabled={zoomPercent <= 60}
            title="Zoom Out (Ctrl -)"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: zoomPercent <= 60 ? '#475569' : '#f8fafc',
              cursor: zoomPercent <= 60 ? 'not-allowed' : 'pointer',
              borderRadius: '50%',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => { if (zoomPercent > 60) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
          >
            <ZoomOut size={13} />
          </button>

          {/* Current Zoom Percentage (Click to Reset) */}
          <button
            onClick={handleReset}
            title="Click to Reset Zoom to 100% (Ctrl 0)"
            style={{
              background: 'none',
              border: 'none',
              color: zoomPercent === 100 ? '#38bdf8' : '#f59e0b',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '6px',
              minWidth: '46px',
              textAlign: 'center'
            }}
          >
            {zoomPercent}%
          </button>

          {/* Zoom In Button */}
          <button
            onClick={handleZoomIn}
            disabled={zoomPercent >= 160}
            title="Zoom In (Ctrl +)"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: zoomPercent >= 160 ? '#475569' : '#f8fafc',
              cursor: zoomPercent >= 160 ? 'not-allowed' : 'pointer',
              borderRadius: '50%',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => { if (zoomPercent < 160) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
          >
            <ZoomIn size={13} />
          </button>

          {/* Collapse Button */}
          <button
            onClick={() => setIsCollapsed(true)}
            title="Minimize Zoom Bar"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              marginLeft: '2px'
            }}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
