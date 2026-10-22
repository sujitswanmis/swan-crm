'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { acknowledgeBroadcast } from '@/app/actions/broadcastNotifications';

const timeIST = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export function BroadcastNotificationCard({ notification, onClose, onRead, preview = false }) {
  const [remaining, setRemaining] = useState(notification.duration_seconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!notification.duration_seconds) return;
    const interval = setInterval(() => {
      if (!document.hidden) setRemaining(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [notification.duration_seconds]);
  useEffect(() => {
    if (notification.duration_seconds && remaining === 0 && !busy) onClose();
  }, [remaining, notification.duration_seconds, onClose, busy]);
  async function read() {
    setBusy(true);
    setError('');
    try {
      const result = await onRead();
      if (result?.success === false) setError('Could not save acknowledgement. Please try again.');
    } catch { setError('Could not save acknowledgement. Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="broadcast-card" role="status" aria-live="polite" aria-label={preview ? 'Notification preview' : 'Admin announcement'}>
      <header><span><Bell size={18} /> {preview ? 'Preview · Admin announcement' : 'Admin announcement'}</span>
        {(notification.duration_seconds > 0 || preview) && <button type="button" onClick={onClose} aria-label="Close announcement without marking read"><X size={18} /></button>}
      </header>
      <h3>{notification.title}</h3>
      <p>{notification.message}</p>
      <small>{notification.created_at ? timeIST(notification.created_at) + ' IST' : 'Time shown in IST'}</small>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      <footer><small>{notification.duration_seconds ? `Closes in ${remaining}s · stays in unread inbox` : 'Stays until you acknowledge'}</small>
        <button type="button" disabled={busy} onClick={read}><Check size={16} /> {busy ? 'Saving…' : 'Samajh gaya'}</button></footer>
      <style jsx>{`
        .broadcast-card { background:var(--bg-card,#fff);color:var(--text-primary,#172554);border:1px solid #c7d2fe;border-top:4px solid #4f46e5;border-radius:14px;box-shadow:0 14px 45px #17255426;padding:18px;width:100%;box-sizing:border-box; }
        header, header span, footer { display:flex;align-items:center;gap:8px;justify-content:space-between; }
        header { font-size:12px;color:#6366f1;font-weight:700; }
        header button { background:transparent;color:inherit;padding:4px; }
        h3 { font-size:18px;margin:15px 0 8px;overflow-wrap:anywhere; }
        p { white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto;font-size:14px;line-height:1.6;margin:0 0 12px; }
        small { font-size:11px;color:var(--text-secondary,#64748b); }
        footer { margin-top:16px;align-items:flex-end; }
        footer small { max-width:55%; }
        button { border:0;border-radius:8px;padding:9px 12px;background:#4f46e5;color:white;cursor:pointer;display:flex;align-items:center;gap:5px;flex-shrink:0; }
        button:disabled { opacity:.6;cursor:wait; }
      `}</style>
    </section>
  );
}

export default function BroadcastNotificationReceiver({ userId }) {
  const [inbox, setInbox] = useState([]);
  const [current, setCurrent] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const refreshRef = useRef(null);
  const currentRef = useRef(null);
  const dismissedRef = useRef(new Set());

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let fetching = false;
    let rerun = false;
    let timer;
    let expiryTimer;
    let fetchController;
    let channel;
    let db;
    let lastFetch = 0;
    let backoff = 60000;
    currentRef.current = null;
    dismissedRef.current = new Set();

    async function refresh() {
      if (stopped || document.hidden || !navigator.onLine) return;
      if (fetching) { rerun = true; return; }
      clearTimeout(timer);
      if (Date.now() - lastFetch < 2000) { timer = setTimeout(refresh, 2000); return; }
      fetching = true;
      lastFetch = Date.now();
      try {
        const requestedCurrentId = currentRef.current?.id || null;
        const params = new URLSearchParams({ mode: 'inbox' });
        if (requestedCurrentId) params.set('currentId', requestedCurrentId);
        fetchController = new AbortController();
        const fetchTimeout = setTimeout(() => fetchController?.abort(), 20000);
        let result;
        try {
          const response = await fetch(`/api/broadcast-notifications?${params}`, {
            credentials: 'same-origin', cache: 'no-store', signal: fetchController.signal
          });
          if (!response.ok) { backoff = 300000; return; }
          result = await response.json();
        } finally { clearTimeout(fetchTimeout); }
        if (stopped) return;
        if (!result.success || result.userId !== userId) { backoff = 300000; return; }
        backoff = 60000;
        const rows = result.inbox || [];
        setInbox(rows);
        const received = [...new Set([...rows, ...(result.pending || [])].filter(r => !r.delivered_at).map(r => r.broadcast_id))];
        if (received.length) await acknowledgeBroadcast(received, 'delivered');
        if (stopped) return;
        if (currentRef.current && (Date.parse(currentRef.current.expires_at) <= Date.now() ||
          (currentRef.current.id === requestedCurrentId && !result.currentUnread))) {
          currentRef.current = null;
          setCurrent(null);
        }
        if (!currentRef.current && !document.hidden) {
          const next = (result.pending || []).find(r => !dismissedRef.current.has(r.broadcast_id) && Date.parse(r.crm_broadcasts.expires_at) > Date.now());
          if (next) {
            // Atomic claim across browsers/tabs: a single user sees each automatic popup once.
            const claim = await acknowledgeBroadcast([next.broadcast_id], 'shown');
            if (!stopped && claim.success && claim.updated.includes(next.broadcast_id)) {
              currentRef.current = next.crm_broadcasts;
              setCurrent(next.crm_broadcasts);
              clearTimeout(expiryTimer);
              expiryTimer = setTimeout(() => {
                if (currentRef.current && Date.parse(currentRef.current.expires_at) <= Date.now()) {
                  currentRef.current = null;
                  setCurrent(null);
                }
                refresh();
              }, Math.min(2147483647, Math.max(1, Date.parse(next.crm_broadcasts.expires_at) - Date.now())));
            }
          }
        }
      } catch { backoff = 300000; }
      finally {
        fetching = false;
        if (!stopped) { timer = setTimeout(refresh, rerun ? 2000 : backoff); rerun = false; }
      }
    }
    refreshRef.current = refresh;
    const wake = () => { if (!document.hidden) refresh(); };
    // Delay optional work until the core workspace has mounted.
    timer = setTimeout(refresh, 3000);
    try {
      db = createClient();
      channel = db.channel(`crm-announcements:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_broadcast_recipients', filter: `user_id=eq.${userId}` }, () => refresh())
        .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    } catch { /* Periodic fetch remains available if realtime is unavailable. */ }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(expiryTimer);
      fetchController?.abort();
      refreshRef.current = null;
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      if (channel && db) db.removeChannel(channel).catch(() => {});
    };
  }, [userId]);

  const close = useCallback(() => {
    const notification = currentRef.current;
    if (!notification) return;
    dismissedRef.current.add(notification.id);
    currentRef.current = null;
    setCurrent(null);
    acknowledgeBroadcast([notification.id], 'dismissed').catch(() => {}).finally(() => refreshRef.current?.());
  }, []);

  async function markRead(id) {
    const result = await acknowledgeBroadcast([id], 'read');
    if (result.success) {
      dismissedRef.current.add(id);
      setInbox(rows => rows.filter(r => r.broadcast_id !== id));
      if (currentRef.current?.id === id) { currentRef.current = null; setCurrent(null); }
      refreshRef.current?.();
    }
    return result;
  }

  return (
    <>
      {current && <div className="broadcast-popup"><BroadcastNotificationCard key={current.id} notification={current} onClose={close} onRead={() => markRead(current.id)} /></div>}
      {inbox.length > 0 && <button type="button" className="broadcast-inbox-button" onClick={() => { setInboxOpen(value => !value); refreshRef.current?.(); }}><Bell size={16} /> Announcements ({inbox.length}{inbox.length === 100 ? '+' : ''})</button>}
      {inboxOpen && <aside className="broadcast-inbox" aria-label="Unread announcements">
        <header><strong>Unread announcements</strong><button type="button" onClick={() => setInboxOpen(false)} aria-label="Close unread announcements"><X size={18} /></button></header>
        <small>Auto-close does not mark read. Showing up to 100 valid unread messages.</small>
        {inboxError && <p role="alert">{inboxError}</p>}
        {!inbox.length && <p>No unread announcements.</p>}
        {inbox.map(row => <article key={row.broadcast_id}>
          <strong>{row.crm_broadcasts.title}</strong><p>{row.crm_broadcasts.message}</p>
          <small>{timeIST(row.crm_broadcasts.created_at)} IST</small>
          <button type="button" onClick={async () => {
            try { const result = await markRead(row.broadcast_id); setInboxError(result.success ? '' : 'Could not save acknowledgement. Try again.'); }
            catch { setInboxError('Could not save acknowledgement. Try again.'); }
          }}>Samajh gaya</button>
        </article>)}
      </aside>}
      <style jsx>{`
        .broadcast-popup { position:fixed;top:80px;right:18px;width:min(400px,calc(100vw - 24px));z-index:9990; }
        .broadcast-inbox-button { position:fixed;bottom:16px;left:16px;z-index:9980;display:flex;align-items:center;gap:8px;background:#4338ca;color:#fff;border:0;border-radius:24px;padding:10px 16px;box-shadow:0 4px 16px #0002;cursor:pointer; }
        .broadcast-inbox { position:fixed;bottom:65px;left:16px;width:min(420px,calc(100vw - 32px));max-height:65vh;overflow:auto;background:var(--bg-card,#fff);color:var(--text-primary,#172554);padding:18px;border:1px solid #c7d2fe;border-radius:14px;box-sizing:border-box;z-index:9981;box-shadow:0 8px 30px #0002; }
        header { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px; }
        button { cursor:pointer;border:0;border-radius:6px;padding:7px 10px;background:#eef2ff;color:#4338ca; }
        article { border-top:1px solid #e2e8f0;padding-top:15px;margin-top:15px;overflow-wrap:anywhere; }
        article p { white-space:pre-wrap;font-size:14px;line-height:1.5; }
        article button { display:block;margin-top:10px; }
        small { color:var(--text-secondary,#64748b);font-size:11px; }
        @media(max-width:600px) { .broadcast-popup { top:12px;right:12px; } }
      `}</style>
    </>
  );
}
