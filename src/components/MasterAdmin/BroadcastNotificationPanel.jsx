'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Send, Eye, RefreshCw } from 'lucide-react';
import { sendBroadcastNotification } from '@/app/actions/broadcastNotifications';
import { BroadcastNotificationCard } from '@/components/common/BroadcastNotificationReceiver';
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';

const ist = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const METRICS = ['total', 'sent', 'delivered', 'read', 'pending', 'expired'];
const labels = { total: 'Total users', sent: 'Sent', delivered: 'Delivered', read: 'Read / acknowledged', pending: 'Pending', expired: 'Expired undelivered' };
async function readNotifications(params, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(`/api/broadcast-notifications?${new URLSearchParams(params)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal
    });
    const result = await response.json().catch(() => ({ success: false, error: 'The app could not load notifications. Please retry after it is available.' }));
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not load notifications. Please retry.');
    return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Loading timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
function status(row, expired) { return row.read_at ? 'Read' : row.delivered_at ? 'Delivered' : expired ? 'Expired' : 'Pending'; }
function counts(rows, expired) {
  return { total: rows.length, sent: rows.filter(r => r.sent_at).length, delivered: rows.filter(r => r.delivered_at).length,
    read: rows.filter(r => r.read_at).length, pending: expired ? 0 : rows.filter(r => !r.delivered_at).length,
    expired: expired ? rows.filter(r => !r.delivered_at).length : 0 };
}
function matches(row, metric, expired) {
  if (metric === 'delivered') return !!row.delivered_at;
  if (metric === 'read') return !!row.read_at;
  if (metric === 'pending') return !expired && !row.delivered_at;
  if (metric === 'expired') return expired && !row.delivered_at;
  return true;
}

function ReportTable({ columns, rows, storageKey }) {
  const defaults = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c.width || 170])), [columns]);
  const minimums = useMemo(() => Object.fromEntries(columns.map(c => [c.key, 90])), [columns]);
  const resize = useTableColumnResize(storageKey, defaults, minimums);
  return <div style={{ overflowX: 'auto', border: '1px solid var(--border-light,#e2e8f0)', borderRadius: 10 }}>
    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: resize.getTotalTableWidth(), minWidth: '100%', fontSize: 12 }}>
      <thead><tr>{columns.map(c => <th key={c.key} style={{ position: 'relative', width: resize.colWidths[c.key], padding: '12px 16px', textAlign: 'left', background: 'var(--bg-muted,#f1f5f9)', borderBottom: '1px solid #e2e8f0' }}>
        {c.label}<ColumnResizer colKey={c.key} isResizing={resize.resizingCol === c.key} onResizeStart={resize.handleResizeStart} onReset={resize.resetColWidth} />
      </th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={row.key || row.user_id || i}>{columns.map(c => <td key={c.key} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border-light,#e2e8f0)', overflowWrap: 'anywhere', verticalAlign: 'top' }}>{c.render ? c.render(row) : row[c.key]}</td>)}</tr>)}</tbody>
    </table>
    {!rows.length && <p style={{ padding: 16 }}>No users in this selection.</p>}
  </div>;
}

export default function BroadcastNotificationPanel() {
  const [directory, setDirectory] = useState([]);
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [audience, setAudience] = useState({ scope: 'all', workspace: '', locations: [] });
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const [duration, setDuration] = useState(15);
  const [validity, setValidity] = useState(24);
  const [approvedAudience, setApprovedAudience] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState([]);
  const [reportId, setReportId] = useState('');
  const [report, setReport] = useState(null);
  const [metric, setMetric] = useState('total');
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [reportBusy, setReportBusy] = useState(true);
  const reportRequest = useRef(0);
  const sendLock = useRef(false);
  const request = useRef(null);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function load() {
      // Only one authenticated read is needed before the audience can render.
      // History is secondary: load it afterwards without holding back the counts.
      try {
        const result = await readNotifications({ mode: 'audience' }, controller.signal);
        if (live) setDirectory(result.directory);
      } catch (e) { if (live) setError(e.message); }
      finally { if (live) setAudienceLoading(false); }
      if (!live) return;
      const version = ++reportRequest.current;
      try {
        const result = await readNotifications({ mode: 'report' }, controller.signal);
        if (live && version === reportRequest.current) setHistory(result.history);
      } catch (e) { if (live && version === reportRequest.current) setError(previous => previous || e.message); }
      finally { if (live && version === reportRequest.current) setReportBusy(false); }
    }
    load();
    return () => { live = false; controller.abort(); };
  }, []);

  const workspaces = useMemo(() => [...new Map(directory.map(u => [u.workspace_key, { key: u.workspace_key, name: u.workspace_name }])).values()], [directory]);
  const branches = useMemo(() => [...new Map(directory.filter(u => u.workspace_key === audience.workspace && u.location_type === 'Branch').map(u => [u.location_key, { key: u.location_key, name: u.location_name }])).values()], [directory, audience.workspace]);
  const recipients = useMemo(() => directory.filter(u => {
    if (audience.scope === 'all') return true;
    if (u.workspace_key !== audience.workspace) return false;
    if (audience.scope === 'headquarters') return u.location_type === 'Headquarters';
    if (audience.scope === 'branches') return audience.locations.includes(u.location_key);
    return true;
  }), [directory, audience]);
  const onlineKnown = recipients.every(u => u.online !== null);
  const onlineCount = recipients.filter(u => u.online).length;
  const unassigned = recipients.filter(u => u.location_type === 'Unassigned').length;
  const audienceSummary = useMemo(() => {
    const map = new Map();
    for (const u of recipients) {
      const key = u.location_key;
      if (!map.has(key)) map.set(key, { key, workspace: u.workspace_name, location: u.location_name, type: u.location_type, total: 0, online: 0 });
      const row = map.get(key); row.total++; if (u.online) row.online++;
    }
    return [...map.values()];
  }, [recipients]);
  const audienceColumns = useMemo(() => [
    { key: 'workspace', label: 'Client workspace', width: 240 }, { key: 'location', label: 'HQ / branch', width: 230 },
    { key: 'type', label: 'Location type' }, { key: 'total', label: 'Users', width: 110 },
    { key: 'online', label: 'Recently online', render: r => onlineKnown ? r.online : 'Unknown' }
  ], [onlineKnown]);

  function changeAudience(next) { setAudience(next); setApprovedAudience(null); setNotice(''); request.current = null; }
  async function refreshAudience() {
    setBusy('audience'); setError(''); setApprovedAudience(null);
    try {
      const result = await readNotifications({ mode: 'audience', scope: audience.scope, workspace: audience.workspace, locations: JSON.stringify(audience.locations) });
      setDirectory(result.directory);
      setApprovedAudience({ key: JSON.stringify(audience), fingerprint: result.fingerprint });
      request.current = null;
      setNotice(`Audience verified: ${result.recipientCount} unique users. Review the message, then send.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  const loadReport = useCallback(async id => {
    const version = ++reportRequest.current;
    setReportBusy(true);
    try {
      const result = await readNotifications({ mode: 'report', ...(id ? { id } : {}) });
      if (version !== reportRequest.current) return;
      if (!result.success) throw new Error(result.error);
      setHistory(result.history);
      setReport(id ? result : null);
    } catch (e) { if (version === reportRequest.current) setError(e.message); }
    finally { if (version === reportRequest.current) setReportBusy(false); }
  }, []);

  async function send() {
    if (sendLock.current) return;
    sendLock.current = true;
    setBusy('send'); setError(''); setNotice('');
    try {
      if (!approvedAudience || approvedAudience.key !== JSON.stringify(audience)) throw new Error('Refresh audience before sending.');
      const payload = { title, message, duration_seconds: manual ? 0 : Number(duration), validity_hours: Number(validity), audience, fingerprint: approvedAudience.fingerprint };
      const key = JSON.stringify(payload);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const result = await sendBroadcastNotification({ ...payload, id: request.current.id });
      if (!result.success) throw new Error(result.error);
      setNotice(`Sent to ${result.count} users. Delivered and read counts update when their CRM confirms receipt and acknowledgement.`);
      setApprovedAudience(null);
      setReportId(result.id); setMetric('total'); setGroup(''); setPage(0);
      await loadReport(result.id);
    } catch (e) { setError(e.message); }
    finally { sendLock.current = false; setBusy(''); }
  }

  const expired = report ? Date.parse(report.broadcast.expires_at) <= Date.parse(report.checked_at) : false;
  const reportRows = report?.recipients || [];
  const totals = counts(reportRows, expired);
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of report?.recipients || []) {
      if (!map.has(row.location_key)) map.set(row.location_key, { key: row.location_key, workspace: row.workspace_name, location: row.location_name, rows: [] });
      map.get(row.location_key).rows.push(row);
    }
    return [...map.values()].map(row => ({ ...row, ...counts(row.rows, expired) }));
  }, [report, expired]);
  const summaryColumns = useMemo(() => [
    { key: 'workspace', label: 'Workspace', width: 220 }, { key: 'location', label: 'HQ / branch', width: 210 },
    ...METRICS.map(key => ({ key, label: labels[key], width: 140, render: row => <button type="button" className="metric-link" onClick={() => { setMetric(key); setGroup(row.key); setPage(0); }}>{row[key]}</button> }))
  ], []);
  const userColumns = useMemo(() => [
    { key: 'user_name', label: 'User', width: 200 }, { key: 'email', label: 'Email', width: 240 },
    { key: 'workspace_name', label: 'Workspace', width: 210 }, { key: 'location_name', label: 'HQ / branch', width: 210 },
    { key: 'status', label: 'Status', render: row => status(row, expired) },
    { key: 'sent_at', label: 'Sent (IST)', width: 210, render: row => ist(row.sent_at) },
    { key: 'delivered_at', label: 'Delivered (IST)', width: 210, render: row => ist(row.delivered_at) },
    { key: 'read_at', label: 'Read (IST)', width: 210, render: row => ist(row.read_at) }
  ], [expired]);
  const filtered = reportRows.filter(row => (!group || row.location_key === group) && matches(row, metric, expired) && `${row.user_name} ${row.email}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="broadcast-panel">
    <div className="intro"><div><h2><Bell size={22} /> User Notifications</h2><p>Send an announcement to all users, a client workspace, headquarters or selected branches.</p></div><span>In-app popup · IST</span></div>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {notice && <div className="feedback success" role="status">{notice}</div>}
    <fieldset disabled={!!busy}>
      <section className="surface">
        <h3>1. Choose audience</h3>
        <div className="form-grid">
          <label>Send to<select disabled={audienceLoading} value={audience.scope} onChange={e => changeAudience({ ...audience, scope: e.target.value, locations: [] })}>
            <option value="all">All workspaces · all users</option><option value="workspace">Selected client workspace</option><option value="headquarters">Headquarters in selected workspace</option><option value="branches">Selected branches in workspace</option>
          </select></label>
          {audience.scope !== 'all' && <label>Client workspace<select value={audience.workspace} onChange={e => changeAudience({ ...audience, workspace: e.target.value, locations: [] })}>
            <option value="">Choose workspace</option>{workspaces.map(w => <option key={w.key} value={w.key}>{w.name}</option>)}
          </select></label>}
        </div>
        {audience.scope === 'branches' && <div className="branch-list">{!branches.length && <p>No mapped branches with eligible users in this workspace.</p>}{branches.map(b => <label key={b.key}><input type="checkbox" checked={audience.locations.includes(b.key)} onChange={e => changeAudience({ ...audience, locations: e.target.checked ? [...audience.locations, b.key] : audience.locations.filter(k => k !== b.key) })} />{b.name}</label>)}</div>}
        {audienceLoading ? <p role="status" aria-live="polite" className="hint">Loading workspace users… You can write your message below.</p> : <div className="stats"><div><b>{recipients.length}</b><span>Unique users</span></div><div><b>{onlineKnown ? onlineCount : '—'}</b><span>Recently online</span></div><div><b>{onlineKnown ? recipients.length - onlineCount : '—'}</b><span>Offline / not recently active</span></div><div><b>{unassigned}</b><span>Location unassigned</span></div></div>}
        <p className="hint">Online means an active session in the last 5 minutes. Inactive, resigned, draft and held accounts are excluded. Unassigned users are included only for all users or their full workspace; they are never guessed as HQ or branch users.</p>
        {!audienceLoading && <ReportTable columns={audienceColumns} rows={audienceSummary} storageKey="crm-broadcast-audience-widths" />}
        <button className="secondary" type="button" disabled={audienceLoading} onClick={refreshAudience}><RefreshCw size={16} />{busy === 'audience' ? 'Checking…' : 'Refresh & verify audience'}</button>
      </section>
      <section className="surface">
        <h3>2. Write your message</h3>
        <label>Title<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Team meeting at 4 PM" /></label>
        <label>Message<textarea rows={5} value={message} maxLength={4000} onChange={e => setMessage(e.target.value)} placeholder="Write the message users should receive…" /></label><small>{message.length}/4000 characters</small>
        <div className="form-grid timing">
          <label>Close behaviour<select value={manual ? 'manual' : 'auto'} onChange={e => setManual(e.target.value === 'manual')}><option value="auto">Auto-close, keep unread</option><option value="manual">Until user clicks Samajh gaya</option></select></label>
          {!manual && <label>Display time (seconds)<input type="number" min={5} max={300} step={1} value={duration} onChange={e => setDuration(e.target.value)} list="broadcast-durations" /><datalist id="broadcast-durations">{[5, 10, 15, 30, 60].map(n => <option key={n} value={n} />)}</datalist></label>}
          <label>Message validity (hours)<input type="number" min={1} max={720} step={1} value={validity} onChange={e => setValidity(e.target.value)} /></label>
        </div>
        <p className="hint">Offline users receive the message on their next login within validity. The popup does not block CRM work. Only “Samajh gaya” counts as read.</p>
        <div className="actions"><button type="button" className="secondary" disabled={!title.trim() || !message.trim()} onClick={() => setPreview(true)}><Eye size={16} />Preview popup</button>
          <button type="button" className="primary" disabled={!title.trim() || !message.trim() || !recipients.length || !approvedAudience} onClick={send}><Send size={16} />{busy === 'send' ? 'Sending…' : `Send to ${recipients.length} users`}</button></div>
      </section>
    </fieldset>
    {preview && <div className="preview"><BroadcastNotificationCard key={`${title}-${manual}-${duration}`} notification={{ title, message, duration_seconds: manual ? 0 : Math.max(5, Number(duration) || 15) }} preview onClose={() => setPreview(false)} onRead={() => { setPreview(false); return { success: true }; }} /></div>}
    <section className="surface">
      <h3>3. Delivery & read report</h3>
      <p className="hint">Sent = saved for that user. Delivered = their CRM confirmed receipt. Read = user clicked Samajh gaya. Counts overlap. Sending is atomic: a rejected send saves no recipients and shows its error above; it is never reported as sent.</p>
      <div className="report-controls"><label>Sent notifications (latest 100)<select value={reportId} disabled={reportBusy} onChange={e => { setReportId(e.target.value); setReport(null); setGroup(''); setMetric('total'); setPage(0); loadReport(e.target.value); }}>
        <option value="">Choose a notification</option>{history.map(h => <option key={h.id} value={h.id}>{ist(h.created_at)} · {h.title} · {h.recipient_count} users</option>)}</select></label>
        <button type="button" className="secondary" disabled={reportBusy} onClick={() => loadReport(reportId)}><RefreshCw size={16} />{reportBusy ? 'Refreshing…' : 'Refresh report'}</button></div>
      {report && <>
        <p><strong>{report.broadcast.title}</strong> · Valid until {ist(report.broadcast.expires_at)} IST {expired && '· Expired'}</p>
        <p className="hint">Report refreshed {ist(report.checked_at)} IST. Use Refresh report for the latest receipts.</p>
        <div className="stats metrics">{METRICS.map(key => <button type="button" key={key} onClick={() => { setMetric(key); setGroup(''); setPage(0); }}><b>{totals[key]}</b><span>{labels[key]}</span></button>)}</div>
        <ReportTable columns={summaryColumns} rows={groups} storageKey="crm-broadcast-summary-widths" />
        <h4>User details · {labels[metric]} {group && `· ${groups.find(g => g.key === group)?.location}`}</h4>
        <div className="report-controls"><input aria-label="Search report by user or email" placeholder="Search user name or email" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><button type="button" className="secondary" onClick={() => { setMetric('total'); setGroup(''); setSearch(''); setPage(0); }}>Show all users</button></div>
        <ReportTable columns={userColumns} rows={filtered.slice(page * 50, page * 50 + 50)} storageKey="crm-broadcast-users-widths" />
        <div className="actions"><button type="button" className="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>{filtered.length} users · Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 50))}</span><button type="button" className="secondary" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </>}
    </section>
    <style jsx>{`
      .broadcast-panel { color:var(--text-primary,#172554); }
      .intro { display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px; }
      .intro h2 { display:flex;align-items:center;gap:10px;margin:0;font-size:22px; }
      .intro p,.hint { color:var(--text-secondary,#64748b);font-size:13px;line-height:1.6; }
      .intro>span { font-size:12px;color:#4338ca;background:#eef2ff;padding:8px 12px;border-radius:20px;align-self:flex-start; }
      fieldset { border:0;padding:0;margin:0;min-width:0; }
      .surface { border:1px solid var(--border-light,#e2e8f0);border-radius:14px;background:var(--bg-card,#fff);padding:22px;margin-bottom:20px; }
      h3 { font-size:16px;margin:0 0 18px; } h4 { margin:22px 0 12px; }
      label { display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:600;margin-bottom:14px; }
      input,textarea,select { width:100%;box-sizing:border-box;background:var(--bg-card,#fff);color:var(--text-primary,#172554);border:1px solid var(--border-light,#cbd5e1);border-radius:8px;padding:10px 12px;font:inherit;min-width:0; }
      textarea { resize:vertical; } small { color:var(--text-secondary,#64748b);font-size:12px; }
      .form-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px; }.timing { margin-top:20px; }
      .branch-list { display:flex;gap:12px;flex-wrap:wrap; }.branch-list label { flex-direction:row;align-items:center;background:var(--bg-muted,#f8fafc);padding:10px;border-radius:8px; }.branch-list input { width:auto; }
      .stats { display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:16px 0; }
      .stats>div,.stats>button { background:var(--bg-muted,#f8fafc);border:1px solid var(--border-light,#e2e8f0);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px;align-items:flex-start; }
      .stats b { font-size:24px;color:#4f46e5; }.stats span { font-size:11px;color:var(--text-secondary,#64748b); }
      button { cursor:pointer;font:inherit; }button:disabled { opacity:.5;cursor:not-allowed; }
      .primary,.secondary { display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:600;margin-top:14px; }
      .primary { background:#4f46e5;color:white;border:1px solid #4f46e5; }.secondary { background:var(--bg-card,#fff);color:var(--text-primary,#334155);border:1px solid var(--border-light,#cbd5e1); }
      .actions { display:flex;align-items:center;gap:12px;flex-wrap:wrap; }.actions span { font-size:12px;margin-top:14px; }
      .feedback { padding:14px 16px;border-radius:10px;margin-bottom:16px;font-size:13px; }.error { background:#fef2f2;color:#b91c1c; }.success { background:#ecfdf5;color:#047857; }
      .preview { position:fixed;top:80px;right:18px;width:min(400px,calc(100vw - 24px));z-index:9991; }
      .report-controls { display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px; }.report-controls label { flex:1;min-width:220px;margin-bottom:0; }.report-controls>input { flex:1;min-width:220px; }.report-controls button { margin-top:0; }
      :global(.metric-link) { background:transparent;border:0;color:#4f46e5;text-decoration:underline;cursor:pointer;font-weight:700;padding:4px; }
      @media(max-width:600px) { .surface { padding:14px; }.preview { top:12px;right:12px; } }
    `}</style>
  </div>;
}
