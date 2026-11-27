'use client';

import React, { useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BarChart3, Check, LayoutList, Repeat2, Send, Sparkles, TrendingUp, Users, XCircle } from 'lucide-react';
import WhatsappMessageLogsTable, { CopyNumber, StatusBadge, TemplateTags } from '@/components/WhatsappMessageLogsTable';
import { buildWhatsappMessageAnalytics, getWhatsappMessageTrend } from '@/utils/whatsappMessageAnalytics';
import { WHATSAPP_LOG_TABS } from '@/config/whatsappMessageLogsConfig';

const NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
const DAY = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
function timestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span className="wa:text-[color:var(--spc-view-muted)]">—</span>;
  const date = new Date(value);
  return <span className="wa:block wa:leading-[1.65] wa:tabular-nums"><span className="wa:block wa:text-[11px] wa:font-medium wa:text-[color:var(--spc-view-muted)]">{DAY.format(date)}</span><span className="wa:block wa:font-mono wa:text-[10px] wa:text-[color:var(--spc-view-muted)]">{TIME.format(date)}</span></span>;
}
function dateLabel(value) { return value && Number.isFinite(Date.parse(`${value}T00:00:00+05:30`)) ? DAY.format(new Date(`${value}T00:00:00+05:30`)) : '—'; }
function Customer({ name, company, repeat, sent }) {
  return <div className="wa:flex wa:min-w-0 wa:items-center wa:gap-2.5"><span className="wa:flex wa:h-8 wa:w-8 wa:shrink-0 wa:items-center wa:justify-center wa:rounded-lg wa:bg-[var(--spc-view-violet-bg)] wa:text-[10px] wa:font-semibold wa:text-[color:var(--spc-view-violet)]">{String(name || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span><span className="wa:min-w-0"><span className="wa:flex wa:items-center wa:gap-1.5"><span title={name} className="wa:truncate wa:text-xs wa:font-semibold wa:text-[color:var(--spc-view-text)]">{name || 'Unknown customer'}</span>{repeat && <span className="wa:shrink-0 wa:rounded-md wa:border wa:border-[var(--spc-view-warning-border)] wa:bg-[var(--spc-view-warning-bg)] wa:px-1.5 wa:py-0.5 wa:font-mono wa:text-[9px] wa:font-semibold wa:text-[color:var(--spc-view-warning)]">{sent}x Sent</span>}</span>{company && company !== name && <span title={company} className="wa:block wa:truncate wa:text-[10px] wa:text-[color:var(--spc-view-muted)]">{company}</span>}</span></div>;
}
const CUSTOMER_COLUMNS = [
  { id: 'customerName', label: 'Customer Name', width: 280, render: row => <Customer name={row.customerName} company={row.customerCompany} repeat={row.repeat} sent={row.sent} /> },
  { id: 'recipientNumbers', label: 'Phone Number', width: 190, render: row => <TemplateTags values={row.recipientNumbers} label="Recipient numbers" phone /> },
  { id: 'attempts', label: 'Attempts', width: 90 }, { id: 'sent', label: 'Sent', width: 75 }, { id: 'failed', label: 'Failed', width: 85 },
  { id: 'sentTemplateNames', label: 'Sent Templates', width: 285, render: row => <TemplateTags values={row.sentTemplateNames} /> },
  { id: 'lastSentAt', label: 'Last Sent Time (IST)', width: 170, render: row => timestamp(row.lastSentAt) }
];
const TEMPLATE_COLUMNS = [
  { id: 'templateName', label: 'Template Name', width: 245, render: row => <span className="wa:block wa:leading-[1.65]"><span title={row.templateName} className="wa:block wa:truncate wa:text-xs wa:font-semibold wa:text-[color:var(--spc-view-text)]">{row.templateName}</span><span title={row.campaignName} className="wa:block wa:truncate wa:text-[10px] wa:text-[color:var(--spc-view-muted)]">{row.campaignName || '—'}</span></span> },
  { id: 'sent', label: 'Total Sent', width: 100 }, { id: 'failed', label: 'Failed', width: 85 },
  { id: 'uniqueCustomers', label: 'Unique Reached', width: 125 },
  { id: 'lastMessageAt', label: 'Last Triggered (IST)', width: 165, render: row => timestamp(row.lastMessageAt) }
];
const DAILY_COLUMNS = [
  { id: 'day', label: 'Date (IST)', width: 120, render: row => <span className="wa:font-mono wa:text-[11px] wa:text-[color:var(--spc-view-muted)]">{dateLabel(row.day)}</span> },
  { id: 'sent', label: 'Sent', width: 75 }, { id: 'failed', label: 'Failed', width: 75 }, { id: 'uniqueCustomers', label: 'Reached', width: 90 }
];
const CARD_CONFIG = [
  { key: 'sent', label: 'Total Sent', icon: Send, accent: 'wa:border-t-emerald-400 wa:hover:border-[var(--spc-view-success-border)]', pill: 'wa:bg-[var(--spc-view-success-bg)] wa:text-[color:var(--spc-view-success)]', sub: 'Messages accepted by the API' },
  { key: 'failed', label: 'Failed', icon: XCircle, accent: 'wa:border-t-rose-400 wa:hover:border-[var(--spc-view-danger-border)]', pill: 'wa:bg-[var(--spc-view-danger-bg)] wa:text-[color:var(--spc-view-danger)]', sub: 'Unsuccessful sending attempts' },
  { key: 'uniqueCustomers', label: 'Unique Customers Reached', icon: Users, accent: 'wa:border-t-indigo-400 wa:hover:border-[var(--spc-view-violet-border)]', pill: 'wa:bg-[var(--spc-view-violet-bg)] wa:text-[color:var(--spc-view-violet)]', sub: 'Distinct CRM customer identities' },
  { key: 'repeatCustomers', label: 'Repeat Customers', icon: Repeat2, accent: 'wa:border-t-amber-400 wa:hover:border-[var(--spc-view-warning-border)]', pill: 'wa:bg-[var(--spc-view-warning-bg)] wa:text-[color:var(--spc-view-warning)]', sub: 'Monitor repeated messaging' },
  { key: 'averageMessagesPerCustomer', label: 'Avg. Messages / Customer', icon: TrendingUp, accent: 'wa:border-t-blue-400 wa:hover:border-[var(--spc-view-info-border)]', pill: 'wa:bg-[var(--spc-view-info-bg)] wa:text-[color:var(--spc-view-info)]', sub: 'Average sends per reached customer' }
];
const TAB_ICONS = { sent_logs_raw: LayoutList, sent_logs_customers: Users, sent_logs_breakdown: BarChart3 };
function Sparkline({ points }) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.map(point => point.count));
  const coords = points.length === 1 ? '0,18 80,18' : points.map((point, index) => `${index / (points.length - 1) * 80},${25 - point.count / max * 22}`).join(' ');
  return <svg aria-hidden="true" viewBox="0 0 80 28" className="wa:h-7 wa:w-20 wa:shrink-0 wa:overflow-visible"><polyline points={coords} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function FrequencyDistribution({ summary, loading }) {
  const reached = summary?.uniqueCustomers || 0, repeat = summary?.repeatCustomers || 0, single = Math.max(0, reached - repeat);
  const singlePercent = reached ? single / reached * 100 : 0;
  const repeatPercent = reached ? repeat / reached * 100 : 0;
  return <div className="wa:rounded-xl wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:p-5 wa:shadow-sm"><div className="wa:mb-1 wa:flex wa:items-center wa:justify-between"><h3 className="wa:m-0 wa:text-[13px] wa:font-semibold wa:text-[color:var(--spc-view-text)]">Messaging Frequency</h3><Repeat2 size={16} className="wa:text-[color:var(--spc-view-warning)]" /></div><p className="wa:mt-0 wa:mb-5 wa:text-[11px] wa:text-[color:var(--spc-view-muted)]">Distribution of unique customers reached</p>
    {loading && !summary ? <div className="wa-loading-shimmer wa:h-20 wa:rounded-lg" /> : <><div role="img" aria-label={`${single} customers with one send; ${repeat} customers with two or more sends`} className="wa:mb-5 wa:flex wa:h-2.5 wa:overflow-hidden wa:rounded-full wa:bg-[var(--spc-view-raised)]"><span style={{ width: `${singlePercent}%` }} className="wa:h-full wa:bg-[var(--spc-view-violet)] wa:transition-all wa:duration-200" /><span style={{ width: `${repeatPercent}%` }} className="wa:h-full wa:bg-[var(--spc-view-warning)] wa:transition-all wa:duration-200" /></div>
      <div className="wa:space-y-3"><div className="wa:flex wa:items-center wa:justify-between wa:text-xs"><span className="wa:flex wa:items-center wa:gap-2 wa:text-[color:var(--spc-view-muted)]"><span className="wa:h-2 wa:w-2 wa:rounded-full wa:bg-[var(--spc-view-violet)]" />1 Message Sent <span className="wa:text-[10px] wa:text-[color:var(--spc-view-muted)]">Single</span></span><span className="wa:font-mono wa:font-semibold wa:tabular-nums wa:text-[color:var(--spc-view-text)]">{NUMBER.format(single)} <span className="wa:ml-1 wa:text-[10px] wa:font-normal wa:text-[color:var(--spc-view-muted)]">{singlePercent.toFixed(0)}%</span></span></div><div className="wa:flex wa:items-center wa:justify-between wa:text-xs"><span className="wa:flex wa:items-center wa:gap-2 wa:text-[color:var(--spc-view-muted)]"><span className="wa:h-2 wa:w-2 wa:rounded-full wa:bg-[var(--spc-view-warning)]" />2+ Messages Sent <span className="wa:text-[10px] wa:text-[color:var(--spc-view-warning)]">Repeat</span></span><span className="wa:font-mono wa:font-semibold wa:tabular-nums wa:text-[color:var(--spc-view-text)]">{NUMBER.format(repeat)} <span className="wa:ml-1 wa:text-[10px] wa:font-normal wa:text-[color:var(--spc-view-muted)]">{repeatPercent.toFixed(0)}%</span></span></div></div></>}
  </div>;
}

export default function WhatsappMessageLogsDashboard({ rows = [], complete, snapshotSummary, snapshotAsOf, filterKey, fromDate, toDate, refreshing, frequencyFor = () => 'Not recorded', allowedViews = [] }) {
  const permitted = WHATSAPP_LOG_TABS.filter(tab => allowedViews.includes(tab.id));
  const [selected, setSelected] = useState('sent_logs_raw');
  const active = permitted.some(tab => tab.id === selected) ? selected : permitted[0]?.id;
  const tabRefs = useRef({});
  const result = useMemo(() => {
    if (!complete) return { analytics: null, error: false, trend: null };
    try { return { analytics: buildWhatsappMessageAnalytics(rows), trend: getWhatsappMessageTrend(rows), error: false }; }
    catch { return { analytics: null, error: true, trend: null }; }
  }, [rows, complete]);
  const data = result.analytics, summary = data?.summary || snapshotSummary;
  const rawColumns = useMemo(() => [
    { id: 'createdAt', label: 'Log Time (IST)', width: 165, render: row => timestamp(row.createdAt) },
    { id: 'recipient', label: 'Recipient Number', width: 175, render: row => <CopyNumber number={row.recipient} /> },
    { id: 'leadName', label: 'Customer Name', width: 240, render: row => <Customer name={row.leadName} company={row.customerCompany} /> },
    { id: 'templateName', label: 'Template / Campaign', width: 265, render: row => <span className="wa:block"><TemplateTags values={[row.templateName]} label="Template" />{row.campaignName && <span title={row.campaignName} className="wa:mt-0.5 wa:block wa:truncate wa:text-[9px] wa:text-[color:var(--spc-view-muted)]">{row.campaignName}</span>}</span> },
    { id: 'frequency', label: 'Frequency', width: 130, render: row => <span title="Current matching automation settings; send-time frequency is not recorded." className="wa:inline-block wa:max-w-full wa:truncate wa:rounded-md wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-canvas)] wa:px-1.5 wa:py-0.5 wa:text-[10px] wa:font-medium wa:text-[color:var(--spc-view-muted)]">{frequencyFor(row)}</span> },
    { id: 'status', label: 'Status', width: 110, render: row => <StatusBadge status={row.status} /> },
    { id: 'error', label: 'Error / Details', width: 250, render: row => <span title={row.error || row.detail || ''} className={row.error ? 'wa:text-[11px] wa:text-[color:var(--spc-view-danger)]' : 'wa:text-[11px] wa:text-[color:var(--spc-view-muted)]'}>{row.error || row.detail || '—'}</span> }
  ], [frequencyFor]);
  const changeTab = (id, focus = false) => { setSelected(id); if (focus) tabRefs.current[id]?.focus(); };
  const keyTab = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % permitted.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + permitted.length) % permitted.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = permitted.length - 1;
    if (next !== undefined) { event.preventDefault(); changeTab(permitted[next].id, true); }
  };
  if (!permitted.length) return <div role="status" className="wa:rounded-xl wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:p-6 wa:text-sm wa:text-[color:var(--spc-view-muted)]">You do not have permission to view message analytics.</div>;
  return <section aria-label="WhatsApp Message Dashboard" className="wa:space-y-5">
    <div className="wa:grid wa:grid-cols-1 wa:gap-3 wa:sm:grid-cols-2 wa:xl:grid-cols-5">
      {CARD_CONFIG.map(card => { const Icon = card.icon, value = summary?.[card.key]; return <div key={card.key} aria-label={card.label} className={`wa:group wa:rounded-xl wa:border wa:border-t-[3px] wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:p-4 wa:shadow-[0_1px_3px_rgba(0,0,0,0.05)] wa:transition-all wa:duration-200 wa:hover:-translate-y-0.5 wa:hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] ${card.accent}`}>
        <div className="wa:flex wa:items-start wa:justify-between wa:gap-2"><span className="wa:min-h-8 wa:text-[11px] wa:leading-4 wa:font-medium wa:text-[color:var(--spc-view-muted)]">{card.label}</span><span className={`wa:flex wa:h-8 wa:w-8 wa:shrink-0 wa:items-center wa:justify-center wa:rounded-lg ${card.pill}`}><Icon size={16} strokeWidth={1.7} /></span></div>
        {Number.isFinite(value) ? <div className="wa:mt-1 wa:flex wa:items-baseline wa:gap-1.5 wa:font-mono wa:tabular-nums"><span className="wa:text-[29px] wa:leading-10 wa:font-semibold wa:tracking-tight wa:text-[color:var(--spc-view-text)]">{NUMBER.format(value)}</span>{card.key === 'averageMessagesPerCustomer' && <span className="wa:text-[11px] wa:text-[color:var(--spc-view-muted)]">/ cust</span>}</div> : <div className="wa-loading-shimmer wa:mt-3 wa:mb-2 wa:h-7 wa:w-20 wa:rounded-md" />}
        <div className="wa:mt-1.5 wa:flex wa:min-h-7 wa:items-center wa:justify-between wa:gap-1">
          {card.key === 'repeatCustomers' && summary ? <span className="wa:inline-flex wa:items-center wa:gap-1 wa:rounded-md wa:border wa:border-[var(--spc-view-warning-border)] wa:bg-[var(--spc-view-warning-bg)] wa:px-2 wa:py-1 wa:text-[10px] wa:font-semibold wa:text-[color:var(--spc-view-warning)]"><Repeat2 size={11} />{NUMBER.format(summary.repeatCustomers)} customers with 2+ sends</span>
            : card.key === 'sent' && result.trend?.points.length ? <><span title="Sends in the latest active IST hour of the selected records" className="wa:text-[9px] wa:font-medium wa:text-[color:var(--spc-view-success)]"><ArrowUpRight size={10} className="wa:mr-0.5 wa:inline" />{NUMBER.format(result.trend.latestHourCount)} latest active hour</span><Sparkline points={result.trend.points} /></>
              : card.key === 'failed' && summary ? <span className="wa:text-[10px] wa:text-[color:var(--spc-view-muted)]">{summary.attempts ? (summary.failed / summary.attempts * 100).toFixed(1) : '0.0'}% of attempts</span>
                : <span className="wa:text-[9px] wa:leading-4 wa:text-[color:var(--spc-view-muted)]">{card.sub}</span>}
        </div>
      </div>; })}
    </div>
    <div role="status" className="wa:flex wa:flex-wrap wa:items-center wa:justify-between wa:gap-2 wa:px-0.5 wa:text-[10px] wa:text-[color:var(--spc-view-muted)]"><span className="wa:flex wa:items-center wa:gap-1.5"><span className="wa:h-1.5 wa:w-1.5 wa:rounded-full wa:bg-[var(--spc-view-success)] wa:shadow-[0_0_7px_#34d39966]" />{data ? `${NUMBER.format(summary.attempts)} API attempts · ${NUMBER.format(summary.templatesUsed)} templates sent` : summary ? 'Showing last complete cached totals' : 'Loading complete-period analytics…'}</span><span className="wa:font-mono wa:tabular-nums">{dateLabel(fromDate)}{fromDate !== toDate ? ` → ${dateLabel(toDate)}` : ''} · IST</span></div>
    {!complete && <div className="wa:rounded-lg wa:border wa:border-[var(--spc-view-violet-border)] wa:bg-[var(--spc-view-violet-bg)] wa:px-3 wa:py-2 wa:text-[11px] wa:text-[color:var(--spc-view-violet)]">{snapshotSummary ? `Last complete totals${snapshotAsOf ? ` · ${TIME.format(new Date(snapshotAsOf))} IST` : ''}. ` : ''}Full-period totals update after all matching records load; preview rows are not final totals.</div>}
    {result.error && <p role="alert" className="wa:text-xs wa:text-[color:var(--spc-view-danger)]">Analytics could not be calculated. Raw message logs remain available.</p>}
    <div role="tablist" aria-label="Message analytics views" className="wa:flex wa:gap-1.5 wa:overflow-x-auto wa:rounded-xl wa:border wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-raised)] wa:p-1.5 wa:shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)]">
      {permitted.map((tab, index) => { const Icon = TAB_ICONS[tab.id], current = active === tab.id; const count = tab.id === 'sent_logs_raw' ? rows.length : tab.id === 'sent_logs_customers' ? data?.customers.length : data?.templates.length; return <button key={tab.id} ref={node => { tabRefs.current[tab.id] = node; }} id={`wa-tab-${tab.id}`} type="button" role="tab" aria-selected={current} aria-controls={`wa-panel-${tab.id}`} tabIndex={current ? 0 : -1} onClick={() => changeTab(tab.id)} onKeyDown={event => keyTab(event, index)} className={`wa:flex wa:min-h-10 wa:flex-1 wa:items-center wa:justify-center wa:gap-2 wa:rounded-lg wa:border wa:px-4 wa:py-2 wa:text-[11px] wa:font-semibold wa:whitespace-nowrap wa:transition-all wa:duration-200 wa:focus-visible:outline-2 wa:focus-visible:outline-indigo-400 ${current ? 'wa:border-[var(--spc-view-border)] wa:bg-[var(--spc-view-surface)] wa:text-[color:var(--spc-view-violet)] wa:shadow-sm' : 'wa:border-transparent wa:bg-transparent wa:text-[color:var(--spc-view-muted)] wa:hover:bg-[var(--spc-view-surface)] wa:hover:text-[color:var(--spc-view-muted)]'}`}><Icon size={14} strokeWidth={1.8} />{tab.label}<span className={`wa:ml-0.5 wa:rounded wa:px-1.5 wa:py-0.5 wa:font-mono wa:text-[9px] wa:tabular-nums ${current ? 'wa:bg-[var(--spc-view-violet-bg)] wa:text-[color:var(--spc-view-violet)]' : 'wa:bg-[var(--spc-view-raised)] wa:text-[color:var(--spc-view-muted)]'}`}>{count === undefined ? '—' : NUMBER.format(count)}</span></button>; })}
    </div>
    <div key={active} id={`wa-panel-${active}`} role="tabpanel" aria-labelledby={`wa-tab-${active}`} tabIndex={0} className="wa-panel-enter wa:rounded-xl wa:focus-visible:outline-2 wa:focus-visible:outline-indigo-300">
      {active === 'sent_logs_raw' && <WhatsappMessageLogsTable id="raw" title="Detailed Raw Logs" description="Every API send attempt in the selected period" rows={rows} columns={rawColumns} filterKey={filterKey} loading={refreshing || !complete} />}
      {active === 'sent_logs_customers' && <WhatsappMessageLogsTable id="customers" title="Customer Frequency Activity" description="Identify repeated sends across every customer number and template" rows={data?.customers || []} columns={CUSTOMER_COLUMNS} filterKey={filterKey} loading={!complete} />}
      {active === 'sent_logs_breakdown' && <div className="wa:grid wa:items-start wa:gap-4 wa:lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]"><WhatsappMessageLogsTable id="templates" title="Template Performance" description="Accepted sends, failures and distinct customer reach" rows={data?.templates || []} columns={TEMPLATE_COLUMNS} filterKey={filterKey} loading={!complete} /><div className="wa:space-y-4"><FrequencyDistribution summary={summary} loading={!complete} /><WhatsappMessageLogsTable id="daily" title="Daily Summary" description="Unique customer counts per IST calendar day" rows={data?.daily.slice().reverse() || []} columns={DAILY_COLUMNS} filterKey={filterKey} loading={!complete} compact /></div></div>}
    </div>
    <div className="wa:flex wa:flex-wrap wa:items-center wa:justify-between wa:gap-2 wa:px-0.5 wa:text-[10px] wa:text-[color:var(--spc-view-muted)]"><span className="wa:flex wa:items-center wa:gap-1.5"><Check size={11} className="wa:text-[color:var(--spc-view-success)]" />Sent = API accepted. Unique customers use CRM identity.</span><span className="wa:flex wa:items-center wa:gap-1"><Sparkles size={10} />Frequency reflects current automation settings.</span></div>
  </section>;
}
