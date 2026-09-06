'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wifi, 
  WifiOff, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Database, 
  HardDrive, 
  Users, 
  FileText, 
  PhoneCall, 
  FileSpreadsheet, 
  Activity,
  Lock
} from 'lucide-react';
import { 
  getDailyOfflineUsage, 
  getPendingQueue, 
  getSyncHistory, 
  syncPendingQueue, 
  getLocalLeads,
  MAX_OFFLINE_SECONDS_PER_DAY 
} from '@/utils/offlineSync';
import { createClient } from '@/utils/supabase/client';

export default function OfflineRuleModule() {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineUsage, setOfflineUsage] = useState(() => getDailyOfflineUsage());
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncHistory, setSyncHistory] = useState([]);
  const [cachedLeadsCount, setCachedLeadsCount] = useState(0);
  const [cachedNotesCount, setCachedNotesCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');

  const supabase = createClient();

  const loadStats = useCallback(async () => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      setOfflineUsage(getDailyOfflineUsage());
    }

    try {
      const queue = await getPendingQueue();
      setPendingQueue(queue || []);
      const hist = await getSyncHistory();
      setSyncHistory(hist || []);

      const cached = await getLocalLeads();
      if (Array.isArray(cached)) {
        setCachedLeadsCount(cached.length);
        let noteCount = 0;
        for (const l of cached) {
          if (Array.isArray(l.lead_notes)) noteCount += l.lead_notes.length;
        }
        setCachedNotesCount(noteCount);
      }
    } catch (err) {
      console.warn('Error loading offline stats:', err);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const handleOnline = () => {
      setIsOnline(true);
      loadStats();
    };
    const handleOffline = () => {
      setIsOnline(false);
      loadStats();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supuja_offline_queue_changed', loadStats);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supuja_offline_queue_changed', loadStats);
    };
  }, [loadStats]);

  const handleManualSync = async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncStatusMsg('Syncing pending queue to cloud...');
    try {
      const res = await syncPendingQueue(supabase);
      setSyncStatusMsg(`Successfully synced ${res.count || 0} items to cloud!`);
      await loadStats();
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } catch (e) {
      setSyncStatusMsg('Sync failed: ' + (e.message || 'Unknown error'));
      setTimeout(() => setSyncStatusMsg(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const allowedFeatures = [
    {
      title: 'Full Local Lead Directory',
      desc: 'Browsing all 11,700+ leads, searching, and filtering with instant 0ms response from device IndexedDB cache.',
      icon: Users,
      badge: 'Allowed Offline'
    },
    {
      title: 'Lead Notes & Remarks',
      desc: 'Adding customer discussion remarks and follow-up notes. Queued locally and synced to cloud on reconnect.',
      icon: FileText,
      badge: 'Allowed Offline'
    },
    {
      title: 'Lead Status & Follow-up Dates',
      desc: 'Updating lead pipeline stages and scheduling follow-up dates. State updates instantly on screen.',
      icon: CheckCircle2,
      badge: 'Allowed Offline'
    },
    {
      title: 'Smart Attendance Punch Station',
      desc: 'Marking Punch In and Punch Out with GPS coordinates and client-validated timestamps.',
      icon: Clock,
      badge: 'Allowed Offline'
    },
    {
      title: 'New Client Registration',
      desc: 'Filling client registration forms while in the field. Saved with a temporary local ID and synced automatically.',
      icon: ShieldCheck,
      badge: 'Allowed Offline'
    }
  ];

  const restrictedFeatures = [
    {
      title: 'VOIP & Call Center Dialing',
      desc: 'Plivo WebRTC phone calls require active internet connection to establish SIP media stream.',
      icon: PhoneCall,
      reason: 'Network Stream Required'
    },
    {
      title: 'Bulk Data Imports & Exports',
      desc: 'Heavy Excel/CSV batch imports and live reporting exports require cloud server validation.',
      icon: FileSpreadsheet,
      reason: 'Server Processing'
    },
    {
      title: 'WhatsApp Cloud Broadcasts',
      desc: 'Triggering official or unofficial WhatsApp campaign messages requires Meta Cloud API access.',
      icon: Activity,
      reason: 'Cloud API Required'
    }
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1300px', margin: '0 auto', color: 'var(--text-color, #1e293b)' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
            }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>Offline Rule & Policy Center</h1>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
                Device IndexedDB Caching, 5-Hour Daily Offline Quota & Auto-Sync Engine
              </p>
            </div>
          </div>
        </div>

        {/* Live Network & Engine Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            background: isOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            fontSize: '0.85rem',
            fontWeight: '600',
            color: isOnline ? '#16a34a' : '#dc2626'
          }}>
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isOnline ? 'Online Mode Active' : 'Offline Mode Active'}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'var(--primary-color, #2563eb)',
              color: 'white',
              border: 'none',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: isSyncing || !isOnline ? 'not-allowed' : 'pointer',
              opacity: isSyncing || !isOnline ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: syncStatusMsg.includes('Success') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${syncStatusMsg.includes('Success') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: syncStatusMsg.includes('Success') ? '#16a34a' : '#dc2626',
          fontSize: '0.875rem',
          fontWeight: '500'
        }}>
          {syncStatusMsg}
        </div>
      )}

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        
        {/* Daily Quota Card */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.25rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted, #64748b)' }}>DAILY OFFLINE QUOTA</span>
            <Clock size={18} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>{offlineUsage.formattedUsed}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>used of 5h max quota</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--border-color, #f1f5f9)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
            <div style={{
              width: `${Math.min(100, offlineUsage.percentUsed)}%`,
              height: '100%',
              background: offlineUsage.percentUsed > 80 ? '#ef4444' : offlineUsage.percentUsed > 50 ? '#f59e0b' : '#3b82f6',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Remaining: <strong>{offlineUsage.formattedRemaining}</strong></span>
            <span>{offlineUsage.percentUsed}% used</span>
          </div>
        </div>

        {/* Local Device Cache Card */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.25rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted, #64748b)' }}>DEVICE INDEXEDDB CACHE</span>
            <HardDrive size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>{cachedLeadsCount.toLocaleString()}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Cached Leads</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.75rem' }}>
            With <strong>{cachedNotesCount.toLocaleString()}</strong> Associated Notes
          </div>
          <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={13} />
            <span>Instant 0ms UI Hydration Active</span>
          </div>
        </div>

        {/* Sync Queue Card */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.25rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-muted, #64748b)' }}>SYNC ENGINE STATUS</span>
            <Database size={18} style={{ color: pendingQueue.length > 0 ? '#f59e0b' : '#3b82f6' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '700' }}>{pendingQueue.length}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Pending Offline Actions</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.75rem' }}>
            Synced History: <strong>{syncHistory.length}</strong> past transactions
          </div>
          <div style={{ fontSize: '0.75rem', color: pendingQueue.length > 0 ? '#f59e0b' : '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Activity size={13} />
            <span>{pendingQueue.length > 0 ? 'Will auto-sync on reconnect' : 'All device changes synced to cloud'}</span>
          </div>
        </div>

      </div>

      {/* Core Rules & Specifications */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Allowed Offline Operations */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a'
            }}>
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0 }}>Allowed Offline Operations</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Fully functional even with zero internet</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {allowedFeatures.map((feat, idx) => {
              const IconComp = feat.icon;
              return (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  background: 'var(--bg-hover, #f8fafc)',
                  border: '1px solid var(--border-color, #f1f5f9)'
                }}>
                  <div style={{ color: '#16a34a', marginTop: '0.2rem', flexShrink: 0 }}>
                    <IconComp size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{feat.title}</span>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        color: '#16a34a',
                        fontWeight: '600'
                      }}>{feat.badge}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.4 }}>
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Restricted Operations */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626'
            }}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0 }}>Internet-Required Operations</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>Requires live network connection</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {restrictedFeatures.map((feat, idx) => {
              const IconComp = feat.icon;
              return (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  background: 'var(--bg-hover, #f8fafc)',
                  border: '1px solid var(--border-color, #f1f5f9)'
                }}>
                  <div style={{ color: '#dc2626', marginTop: '0.2rem', flexShrink: 0 }}>
                    <IconComp size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{feat.title}</span>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#dc2626',
                        fontWeight: '600'
                      }}>{feat.reason}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.4 }}>
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Policy Rules Callout */}
          <div style={{
            padding: '1rem',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: '700', margin: '0 0 0.5rem 0', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={15} /> Company Offline Policy Rules
            </h3>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'var(--text-color, #334155)', lineHeight: 1.5 }}>
              <li><strong>5 Hours Daily Cap:</strong> Employees can work offline up to 5 hours per day to allow fieldwork while maintaining audit integrity.</li>
              <li><strong>FIFO Queue:</strong> Offline updates sync in exact sequential order (First In, First Out) when internet connects.</li>
              <li><strong>Delta Sync Efficiency:</strong> On reconnect, the CRM only syncs delta differences, saving 99% bandwidth and avoiding quota exhaustion.</li>
            </ul>
          </div>
        </div>

      </div>

      {/* Pending Queue Inspector */}
      {pendingQueue.length > 0 && (
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={16} /> Pending Queue Items ({pendingQueue.length})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left', color: 'var(--text-muted, #64748b)' }}>
                  <th style={{ padding: '0.5rem' }}>Type</th>
                  <th style={{ padding: '0.5rem' }}>Action</th>
                  <th style={{ padding: '0.5rem' }}>Queued At</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingQueue.map((item, i) => (
                  <tr key={item.queueId || i} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: '600' }}>{item.entityType}</td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>{item.actionType}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: 'var(--text-muted, #64748b)' }}>
                      {new Date(item.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        color: '#d97706',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        {item.status || 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
