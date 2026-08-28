'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2, Clock, X, ShieldAlert, Zap } from 'lucide-react';
import { getPendingQueue, getSyncHistory, syncPendingQueue, getDailyOfflineUsage, incrementDailyOfflineSeconds, MAX_OFFLINE_SECONDS_PER_DAY } from '@/utils/offlineSync';
import { createClient } from '@/utils/supabase/client';

export default function OfflineSyncCenter({ onSyncComplete }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState([]);
  const [syncedHistory, setSyncedHistory] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [offlineUsage, setOfflineUsage] = useState(() => getDailyOfflineUsage());

  const supabase = createClient();

  const loadQueueState = useCallback(async () => {
    try {
      const queue = await getPendingQueue();
      setPendingCount(queue.length);
      setPendingItems(queue);
      const history = await getSyncHistory();
      setSyncedHistory(history);
      setOfflineUsage(getDailyOfflineUsage());
    } catch (e) {
      console.warn('Load queue state notice:', e);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncPendingQueue(supabase);
      if (result.count > 0) {
        setToastMessage(`🎉 ${result.count} offline update${result.count > 1 ? 's' : ''} synchronized successfully!`);
        if (onSyncComplete) onSyncComplete();
      }
      await loadQueueState();
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, supabase, onSyncComplete, loadQueueState]);

  // Track offline time every 5 seconds when offline
  useEffect(() => {
    const offlineTicker = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        incrementDailyOfflineSeconds(5);
        setOfflineUsage(getDailyOfflineUsage());
      }
    }, 5000);
    return () => clearInterval(offlineTicker);
  }, []);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    loadQueueState();

    const handleOnline = () => {
      setIsOnline(true);
      setOfflineUsage(getDailyOfflineUsage());
      setToastMessage('🌐 Internet reconnected! Syncing offline changes...');
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setOfflineUsage(getDailyOfflineUsage());
      setToastMessage('⚡ Offline mode active (5h max daily quota). All changes saved to disk.');
    };

    const handleQueueChanged = () => {
      loadQueueState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supuja_offline_queue_changed', handleQueueChanged);

    const interval = setInterval(() => {
      if (navigator.onLine) {
        loadQueueState();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supuja_offline_queue_changed', handleQueueChanged);
      clearInterval(interval);
    };
  }, [triggerSync, loadQueueState]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return (
    <>
      {/* 1. Header Live Sync Pill Button */}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s',
          border: !isOnline 
            ? '1px solid #f87171' 
            : pendingCount > 0 
            ? '1px solid #fbbf24' 
            : '1px solid rgba(255, 255, 255, 0.15)',
          background: !isOnline 
            ? 'rgba(239, 68, 68, 0.15)' 
            : pendingCount > 0 
            ? 'rgba(245, 158, 11, 0.15)' 
            : 'rgba(255, 255, 255, 0.08)',
          color: !isOnline 
            ? '#f87171' 
            : pendingCount > 0 
            ? '#fbbf24' 
            : '#94a3b8'
        }}
        title={!isOnline ? 'Offline Mode Active' : pendingCount > 0 ? `${pendingCount} items pending sync` : 'All changes synced'}
      >
        {!isOnline ? (
          <>
            <WifiOff style={{ width: '13px', height: '13px', color: '#f87171' }} />
            <span>Offline {pendingCount > 0 ? `(${pendingCount})` : ''}</span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite', color: '#38bdf8' }} />
            <span>Syncing...</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <Clock style={{ width: '13px', height: '13px', color: '#fbbf24' }} />
            <span>{pendingCount} Pending</span>
          </>
        ) : (
          <>
            <Wifi style={{ width: '13px', height: '13px', color: '#4ade80' }} />
            <span style={{ color: '#cbd5e1' }}>Synced</span>
          </>
        )}
      </button>

      {/* 2. Floating Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999999,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: '500',
            maxWidth: '380px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      )}

      {/* 3. Offline Sync Center Modal */}
      {showModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999998,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#1e293b',
              color: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: !isOnline ? '#ef4444' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!isOnline ? <WifiOff style={{ width: '18px', height: '18px', color: '#fff' }} /> : <Wifi style={{ width: '18px', height: '18px', color: '#fff' }} />}
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>Offline Sync Center</h3>
                  <span style={{ fontSize: '12px', color: !isOnline ? '#f87171' : '#4ade80' }}>
                    {!isOnline ? 'Offline Mode (Device Storage Active)' : 'Online (Connected to Cloud)'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', maxHeight: '360px', overflowY: 'auto' }}>
              
              {/* Daily Offline Quota (Max 5 Hours) */}
              <div style={{
                padding: '14px',
                borderRadius: '12px',
                marginBottom: '16px',
                background: offlineUsage.isExceeded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.08)',
                border: offlineUsage.isExceeded ? '1px solid #ef4444' : '1px solid rgba(37, 99, 235, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {offlineUsage.isExceeded ? (
                      <ShieldAlert style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                    ) : (
                      <Zap style={{ width: '16px', height: '16px', color: '#38bdf8' }} />
                    )}
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: offlineUsage.isExceeded ? '#f87171' : '#e2e8f0' }}>
                      Daily Offline Quota (5h Max)
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: offlineUsage.isExceeded ? '#ef4444' : '#38bdf8' }}>
                    {offlineUsage.formattedUsed} / 5h 0m
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{
                    width: `${offlineUsage.percentUsed}%`,
                    height: '100%',
                    backgroundColor: offlineUsage.isExceeded ? '#ef4444' : offlineUsage.percentUsed > 80 ? '#f59e0b' : '#38bdf8',
                    transition: 'width 0.3s ease'
                  }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                  <span>{offlineUsage.isExceeded ? '🛑 Quota exhausted' : `⏳ Remaining today: ${offlineUsage.formattedRemaining}`}</span>
                  <span>Resets daily at 00:00</span>
                </div>

                {offlineUsage.isExceeded && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '6px', fontSize: '11px', color: '#fca5a5', lineHeight: 1.4 }}>
                    ⚠️ <strong>Internet Connection Required</strong>: Aapka 5 ghante ka offline work quota pura ho chuka hai. Naye records add/update karne ke liye kripya Internet connect karein.
                  </div>
                )}
              </div>

              {/* Pending Queue Section */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>
                    Pending Cloud Sync ({pendingItems.length})
                  </span>
                  {isOnline && pendingItems.length > 0 && (
                    <button
                      onClick={triggerSync}
                      disabled={isSyncing}
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: isSyncing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <RefreshCw style={{ width: '11px', height: '11px', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                      Sync Now
                    </button>
                  )}
                </div>

                {pendingItems.length === 0 ? (
                  <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', textAlign: 'center', color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <CheckCircle2 style={{ width: '16px', height: '16px', color: '#4ade80' }} />
                    No pending items. All changes saved to cloud!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pendingItems.map((item) => (
                      <div
                        key={item.queueId}
                        style={{
                          padding: '10px 14px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Clock style={{ width: '16px', height: '16px', color: '#fbbf24', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                              {item.title || `${item.actionType.toUpperCase()} ${item.entityType}`}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Saved {new Date(item.timestamp).toLocaleTimeString()} on device
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 'bold' }}>
                          PENDING
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recently Synced Section */}
              {syncedHistory.length > 0 && (
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                    Recently Synchronized
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {syncedHistory.slice(0, 5).map((h) => (
                      <div
                        key={h.id}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12px'
                        }}
                      >
                        <span style={{ color: '#cbd5e1' }}>{h.title}</span>
                        <span style={{ color: '#4ade80', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                          {new Date(h.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Storage: Browser IndexedDB (Zero Data Loss)
              </span>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
