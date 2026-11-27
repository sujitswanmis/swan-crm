'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw, Search, Send } from 'lucide-react';
import DateRangePicker from '@/components/common/DateRangePicker';
import ErrorBoundary from '@/components/ErrorBoundary';
import WhatsappMessageLogsDashboard from '@/components/WhatsappMessageLogsDashboard';
import WhatsappMessageLogsFilter from '@/components/WhatsappMessageLogsFilter';
import { filterWhatsappMessageLogs } from '@/utils/whatsappMessageAnalytics';
import { getSubItemPermissions } from '@/utils/permissionUtils';
import { WHATSAPP_LOG_VIEW_IDS } from '@/config/whatsappMessageLogsConfig';
import './WhatsappMessageLogs.css';
import { getWhatsappMessageLogs } from '@/app/actions/whatsappMessageLogs';
import {
  createWhatsappMessageLogsScope, mergeWhatsappMessageLogs, readFastWhatsappMessageLogs,
  readWhatsappMessageLogsLocally, upsertWhatsappMessageLogsLocally, whatsappMessageLogsStorageKey
} from '@/utils/whatsappMessageLogsCache';

const EMPTY = { rows: [], complete: false, syncedThrough: null, tenants: [], tenantCode: '', branches: [], frequencyRules: [] };
const FIELD = 'wa:h-10 wa:w-full wa:min-w-0 wa:rounded-lg wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:px-3 wa:text-xs wa:text-[color:var(--spc-view-muted)] wa:shadow-none wa:transition-all wa:duration-200 wa:placeholder:text-[color:var(--spc-view-muted)] wa:focus:border-[var(--spc-view-violet-border)] wa:focus:outline-none wa:focus:ring-2 wa:focus:ring-[var(--spc-view-violet-border)] wa:disabled:opacity-70';
const DATE_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['thisWeek', 'This Week'],
  ['lastWeek', 'Last Week'], ['last7', 'Last 7 Days'],
  ['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['custom', 'Custom Date Range']
];
const DATE_PICKER_OPTIONS = DATE_PRESETS.map(([id, label]) => ({ id, label }));
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses', description: 'Every API outcome', tone: 'indigo' },
  { value: 'sent', label: 'Sent', description: 'Accepted by the WhatsApp API', tone: 'emerald' },
  { value: 'failed', label: 'Failed', description: 'Unsuccessful send attempts', tone: 'rose' },
  { value: 'other', label: 'Other', description: 'Other API outcomes', tone: 'amber' }
];

function todayIST(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function presetRange(preset, now = new Date()) {
  const today = todayIST(now);
  const midnight = new Date(`${today}T00:00:00+05:30`);
  const daysAgo = days => todayIST(new Date(midnight.getTime() - days * 86400000));
  if (preset === 'today') return { fromDate: today, toDate: today };
  if (preset === 'yesterday') return { fromDate: daysAgo(1), toDate: daysAgo(1) };
  if (preset === 'thisWeek' || preset === 'lastWeek') {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(midnight);
    const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
    return preset === 'thisWeek'
      ? { fromDate: daysAgo(sinceMonday), toDate: today }
      : { fromDate: daysAgo(sinceMonday + 7), toDate: daysAgo(sinceMonday + 1) };
  }
  if (preset === 'last7') return { fromDate: daysAgo(6), toDate: today };
  if (preset === 'thisMonth') return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
  if (preset === 'lastMonth') {
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
    const last = todayIST(new Date(first.getTime() - 86400000));
    return { fromDate: `${last.slice(0, 7)}-01`, toDate: last };
  }
  return null;
}

// Reuse the CRM picker UI with this view's explicit IST date arithmetic.
function resolvePickerRange(preset, customStart = '', customEnd = '') {
  const range = presetRange(preset);
  return {
    startDate: range?.fromDate || customStart || todayIST(),
    endDate: range?.toDate || customEnd || todayIST(),
    label: DATE_PRESETS.find(([id]) => id === preset)?.[1] || 'Custom'
  };
}

export default function WhatsappOfficialMessageLogs({ userId, tenantId, userCompany, userRole, moduleAccess, isMasterAdmin, isActive = true, allowedLogViews }) {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [datePreset, setDatePreset] = useState('today');
  const [fromDate, setFromDate] = useState(todayIST);
  const [toDate, setToDate] = useState(todayIST);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const scope = createWhatsappMessageLogsScope({ userId, tenantId: selectedTenant || tenantId, userCompany, userRole, moduleAccess, fromDate, toDate });
  const tenantScope = String(selectedTenant || tenantId || userCompany || 'own');
  const [display, setDisplay] = useState(() => ({ scope, tenantScope, entry: readFastWhatsappMessageLogs(scope) || EMPTY }));
  // Never render the previous tenant/period while the next cache is hydrating.
  const entry = display.scope === scope ? display.entry : readFastWhatsappMessageLogs(scope) || EMPTY;
  // Keep the verified branch directory visible while another date range loads.
  const lookups = entry.tenantCode ? entry : display.tenantScope === tenantScope ? display.entry : EMPTY;
  const refreshRef = useRef(null);
  const permittedKey = (allowedLogViews || (isMasterAdmin ? WHATSAPP_LOG_VIEW_IDS : WHATSAPP_LOG_VIEW_IDS.filter(id => getSubItemPermissions(moduleAccess, userRole, 'whatsapp_official', id).view))).join('|');
  const permittedViews = useMemo(() => permittedKey.split('|').filter(id => WHATSAPP_LOG_VIEW_IDS.includes(id)), [permittedKey]);
  const allowedViews = permittedViews.filter(id => !entry.allowedViews || entry.allowedViews.includes(id));
  const validDates = Boolean(fromDate && toDate && fromDate <= toDate);

  useEffect(() => {
    if (!isActive || !scope || !validDates || !permittedKey) return;
    let stopped = false;
    let busy = false;
    let accessDenied = false;
    let current = readFastWhatsappMessageLogs(scope) || EMPTY;
    const show = value => {
      if (stopped) return;
      current = value;
      setDisplay({ scope, tenantScope, entry: value });
    };
    const refresh = async () => {
      if (stopped || busy || accessDenied || document.visibilityState === 'hidden') return;
      const range = presetRange(datePreset);
      if (range && (range.fromDate !== fromDate || range.toDate !== toDate)) {
        setFromDate(range.fromDate);
        setToDate(range.toDate);
        return;
      }
      busy = true;
      setRefreshing(true);
      setError('');
      try {
        const local = await readWhatsappMessageLogsLocally(scope);
        if (stopped) return;
        if (local) show(local);
        if (!navigator.onLine) return;
        const started = current;
        // Overlap protects equal timestamps and sends committed just after a
        // prior snapshot. Stable IDs deduplicate the small overlap locally.
        const after = started.complete && started.syncedThrough
          ? new Date(Date.parse(started.syncedThrough) - 5000).toISOString() : null;
        let cursor = null;
        let until = null;
        do {
          const result = await getWhatsappMessageLogs({ tenantId: selectedTenant || tenantId, fromDate, toDate, after, cursor, until });
          if (stopped) return;
          if (!result.success) {
            if (result.denied) { accessDenied = true; show(EMPTY); }
            throw new Error(result.error);
          }
          until = result.until;
          cursor = result.nextCursor;
          const next = {
            rows: mergeWhatsappMessageLogs(current.rows, result.data),
            allowedViews: result.allowedViews,
            tenantCode: result.tenantCode,
            tenants: result.tenants,
            branches: result.branches || [],
            frequencyRules: result.frequencyRules || [],
            lookupWarning: result.lookupWarning || '',
            complete: started.complete || !result.hasMore,
            snapshotComplete: !result.hasMore,
            syncedThrough: result.hasMore ? started.syncedThrough : until,
            dashboardSummary: current.dashboardSummary,
            dashboardAsOf: current.dashboardAsOf
          };
          show(next);
          await upsertWhatsappMessageLogsLocally(scope, result.data, next);
          if (stopped) return;
        } while (cursor);
      } catch (err) {
        if (!stopped) setError(err.message || 'API message logs could not be refreshed.');
      } finally {
        busy = false;
        if (!stopped) setRefreshing(false);
      }
    };
    refreshRef.current = refresh;
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onStorage = event => {
      if (event.key !== whatsappMessageLogsStorageKey(scope) || busy) return;
      // Cross-tab cache reads never echo another server refresh back and forth.
      void readWhatsappMessageLogsLocally(scope).then(local => { if (local && !busy) show(local); });
    };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('online', refresh);
    window.addEventListener('crm_trigger_delta_sync', refresh);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      refreshRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('crm_trigger_delta_sync', refresh);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isActive, scope, tenantScope, validDates, selectedTenant, tenantId, fromDate, toDate, datePreset, permittedKey]);

  const frequencyIndex = useMemo(() => {
    const index = new Map();
    (entry.frequencyRules || []).forEach(rule => {
      if (!rule.templateId || !rule.frequency) return;
      const key = JSON.stringify([rule.templateId, rule.company]);
      const values = index.get(key) || [];
      if (!values.includes(rule.frequency)) values.push(rule.frequency);
      index.set(key, values);
    });
    return index;
  }, [entry.frequencyRules]);
  const frequencyFor = useCallback(row => {
    const specific = (row.frequencyScopes || []).flatMap(company => frequencyIndex.get(JSON.stringify([row.templateId, company])) || []);
    const values = specific.length ? specific : frequencyIndex.get(JSON.stringify([row.templateId, 'all'])) || [];
    return [...new Set(values)].sort().join(' / ') || 'Not recorded';
  }, [frequencyIndex]);

  const changeDatePreset = ({ preset, startDate, endDate }) => {
    setDatePreset(preset);
    setFromDate(startDate);
    setToDate(endDate);
  };

  const filtered = useMemo(() => filterWhatsappMessageLogs(entry.rows, {
    branchCode: selectedBranch, status, search, frequencyFor
  }), [entry.rows, search, status, selectedBranch, frequencyFor]);
  const dashboardComplete = entry.complete === true && entry.snapshotComplete !== false;
  const dashboardFilterKey = JSON.stringify([scope, search, status, selectedBranch]);

  return (
    <section id="wa-message-analytics" aria-label="API Message Sent Logs" className="wa:rounded-2xl wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-canvas)] wa:p-4 wa:text-[color:var(--spc-view-text)] wa:sm:p-6">
      <div className="wa:mb-5 wa:flex wa:flex-wrap wa:items-start wa:justify-between wa:gap-3">
        <div><div className="wa:mb-2 wa:flex wa:items-center wa:gap-2 wa:text-[9px] wa:font-semibold wa:tracking-[0.14em] wa:text-[color:var(--spc-view-muted)] wa:uppercase"><span className="wa:h-1.5 wa:w-1.5 wa:rounded-full wa:bg-[var(--spc-view-success)] wa:shadow-[0_0_8px_#34d39966]" />Communication Intelligence <span className="wa:text-[color:var(--spc-view-muted)]">/</span> WhatsApp Official</div><h2 className="wa:m-0 wa:flex wa:items-center wa:gap-2.5 wa:text-[22px] wa:font-semibold wa:tracking-tight wa:text-[color:var(--spc-view-text)]"><span className="wa:flex wa:h-9 wa:w-9 wa:items-center wa:justify-center wa:rounded-xl wa:border wa:border-[var(--spc-view-success-border)] wa:bg-[var(--spc-view-success-bg)] wa:text-[color:var(--spc-view-success)]"><Send size={18} strokeWidth={1.7} /></span>API Message Sent Logs</h2><p className="wa:mt-2 wa:mb-0 wa:text-xs wa:text-[color:var(--spc-view-muted)]">Track customer reach, sending performance and repeat messaging in one place.</p></div>
        <span className="wa:mt-1 wa:inline-flex wa:items-center wa:gap-1.5 wa:rounded-full wa:border wa:border-[var(--spc-view-violet-border)] wa:bg-[var(--spc-view-violet-bg)] wa:px-2.5 wa:py-1.5 wa:text-[10px] wa:font-medium wa:text-[color:var(--spc-view-violet)]"><span className="wa:h-1 wa:w-1 wa:rounded-full wa:bg-[var(--spc-view-violet)]" />IST · Asia/Kolkata</span>
      </div>
      <div className="wa:sticky wa:top-0 wa:z-20 wa:mb-5 wa:flex wa:flex-wrap wa:items-end wa:gap-3 wa:rounded-xl wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:p-4 wa:shadow-[0_1px_3px_rgba(0,0,0,0.05)] wa:backdrop-blur-md">
        <label className="wa:block wa:min-w-[230px] wa:flex-1"><span className="wa:mb-1.5 wa:block wa:text-[9px] wa:font-semibold wa:tracking-[0.06em] wa:text-[color:var(--spc-view-muted)] wa:uppercase">Search Messages</span><span className="wa:relative wa:block"><Search size={15} className="wa:pointer-events-none wa:absolute wa:top-1/2 wa:left-3 wa:-translate-y-1/2 wa:text-[color:var(--spc-view-muted)]" /><input aria-label="Search API message logs" placeholder="Search number, customer, template, error…" value={search} onChange={event => setSearch(event.target.value)} className={`${FIELD} wa:pl-9`} /></span></label>
        <div className="wa-filter-date wa:min-w-[170px]"><span className="wa:mb-1.5 wa:block wa:text-[9px] wa:font-semibold wa:tracking-[0.06em] wa:text-[color:var(--spc-view-muted)] wa:uppercase">Quick Date Presets (IST)</span><DateRangePicker preset={datePreset} startDate={fromDate} endDate={toDate} onChange={changeDatePreset} title="Filter API Message Sent Logs by Date (IST)" presetOptions={DATE_PICKER_OPTIONS} rangeResolver={resolvePickerRange} style={{ fontSize: '11px', fontWeight: 500, padding: '0.5rem 0.7rem' }} /></div>
        <WhatsappMessageLogsFilter label="API Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} width="wa:w-[145px]" />
        <WhatsappMessageLogsFilter label="Company / Tenant" kind="company" searchable disabled={!isMasterAdmin || lookups.tenants.length < 2} value={selectedTenant || lookups.tenants.find(item => item.id === tenantId || item.code === tenantId || item.code === lookups.tenantCode)?.id || ''} onChange={value => { setSelectedTenant(value); setSelectedBranch(''); }} width="wa:w-[200px]" options={lookups.tenants.length ? lookups.tenants.map(item => ({ value: item.id, label: item.code, description: item.name })) : [{ value: '', label: lookups.tenantCode || 'Current workspace' }]} />
        <WhatsappMessageLogsFilter label="Branch / Plant" kind="branch" searchable value={selectedBranch} onChange={setSelectedBranch} width="wa:w-[195px]" options={[{ value: '', label: 'All Branches' }, ...(lookups.branches || []).map(branch => ({ value: branch.code, label: branch.code, description: branch.name }))]} />
        <button type="button" disabled={refreshing || !validDates || !scope || !isActive || !permittedKey} onClick={() => refreshRef.current?.()} className="wa:inline-flex wa:h-10 wa:shrink-0 wa:items-center wa:justify-center wa:gap-2 wa:rounded-lg wa:border wa:border-[var(--spc-view-violet-border)] wa:bg-[var(--spc-view-action)] wa:px-4 wa:text-[11px] wa:font-semibold wa:text-white wa:shadow-sm wa:transition-all wa:duration-200 wa:hover:-translate-y-0.5 wa:hover:bg-[var(--spc-view-action-hover)] wa:hover:shadow-md wa:focus-visible:outline-2 wa:focus-visible:outline-offset-2 wa:focus-visible:outline-indigo-400 wa:disabled:cursor-wait wa:disabled:opacity-60"><RefreshCw size={13} className={refreshing ? 'wa-refresh-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh Logs'}</button>
      </div>
      {(!validDates || error || !scope) && <div role="alert" className="wa:mb-4 wa:flex wa:items-center wa:gap-2 wa:rounded-lg wa:border wa:border-[var(--spc-view-danger-border)] wa:bg-[var(--spc-view-danger-bg)] wa:px-3 wa:py-2.5 wa:text-xs wa:text-[color:var(--spc-view-danger)]"><AlertCircle size={15} />{!scope ? 'Please sign in again to view API message logs.' : !validDates ? 'Choose a valid custom date range.' : error}</div>}
      {entry.lookupWarning && <p role="status" className="wa:mb-3 wa:text-[11px] wa:text-[color:var(--spc-view-warning)]">{entry.lookupWarning}</p>}
      <ErrorBoundary key={scope} fallback={<p role="alert" className="wa:rounded-xl wa:border wa:border-[var(--spc-view-danger-border)] wa:bg-[var(--spc-view-surface)] wa:p-5 wa:text-xs wa:text-[color:var(--spc-view-danger)]">Analytics are temporarily unavailable. Switch tabs or refresh to retry.</p>}>
        <WhatsappMessageLogsDashboard rows={filtered} complete={dashboardComplete} snapshotSummary={!search.trim() && status === 'all' && !selectedBranch ? entry.dashboardSummary : null} snapshotAsOf={entry.dashboardAsOf} filterKey={dashboardFilterKey} fromDate={fromDate} toDate={toDate} refreshing={refreshing} frequencyFor={frequencyFor} allowedViews={allowedViews} />
      </ErrorBoundary>
    </section>
  );
}
