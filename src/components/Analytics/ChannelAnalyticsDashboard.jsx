'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Building2, ChartNoAxesColumnIncreasing, ChevronDown, Clock, Database, IndianRupee, Package, Phone, RefreshCw, Search, ShieldAlert, TrendingUp, Truck, User, Users, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getChannelAnalytics } from '@/app/actions/channelAnalytics';
import DateRangePicker from '@/components/common/DateRangePicker';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import { COMPLAINT_DATE_PRESETS, getComplaintDateRange } from '@/utils/complaintFilters';
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';
import styles from './ChannelAnalyticsDashboard.module.css';

const PICKER_PRESETS = COMPLAINT_DATE_PRESETS
  .filter(([id]) => !['last_7_days', 'last_30_days', 'custom'].includes(id))
  .map(([id, label]) => ({ id, label }));
const DB_STATUS_LABELS = { active: 'Local DB Active', syncing: 'Delta Syncing…', unavailable: 'Local DB Inactive' };

const REPORTS = {
  party_master: {
    title: 'Party Master Dashboard',
    description: 'Track partner registrations, current activation and onboarding by branch.',
    chart: 'Daily partner registrations',
    primary: 'Party entries',
    metrics: [
      ['total', 'Party entries', Building2],
      ['activePartners', 'Active partners', ChartNoAxesColumnIncreasing],
      ['onboarding', 'In onboarding', Clock],
      ['distributors', 'Distributors', Truck],
      ['dealers', 'Dealers', Package],
    ],
    note: 'Totals cover party records created in the selected period. Activation and onboarding reflect their current status.',
  },
  order_followup: {
    title: 'Order Desk Calling',
    description: 'Track partner follow-up activity and conversion from logged calls.',
    chart: 'Daily calling activity',
    primary: 'Calls logged',
    metrics: [
      ['total', 'Calls logged', Phone],
      ['orders', 'Orders placed', Package],
      ['conversion', 'Conversion rate', ChartNoAxesColumnIncreasing, 'percent'],
      ['callbacks', 'Callbacks logged', Clock],
      ['unreachable', 'Unreachable', ShieldAlert],
    ],
  },
  order_pipeline: {
    title: 'Order Pipeline',
    description: 'Track sales bookings and the current delivery stages of orders created in the selected period.',
    chart: 'Daily order bookings',
    primary: 'Orders booked',
    metrics: [
      ['orders', 'Orders booked', Package],
      ['value', 'Booked value', IndianRupee, 'currency'],
      ['open', 'Open pipeline records', Clock],
      ['delivered', 'Delivered records', Truck],
    ],
    note: 'Booking totals exclude draft and cancelled orders and split lots. The stage breakdown includes split lots.',
  },
  complaints: {
    title: 'Complaint Dashboard',
    description: 'Track complaint volume, current resolution status and SLA breaches for tickets created in the selected period.',
    chart: 'Daily complaints logged',
    primary: 'Complaints logged',
    secondary: 'Now closed',
    metrics: [
      ['total', 'Total complaints', ChartNoAxesColumnIncreasing],
      ['open', 'Open complaints', Clock],
      ['closed', 'Closed complaints', Package],
      ['breached', 'Active SLA breaches', ShieldAlert],
    ],
  },
};

const valueFormats = {
  count: new Intl.NumberFormat('en-IN'),
  percent: new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 1 }),
  currency: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }),
  difference: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, signDisplay: 'exceptZero' }),
};
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const fullDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const ordersChart = { chart: 'Daily orders placed', primary: 'Orders placed' };
const outcomeKeys = { total: 'all', orders: 'ORDER_PLACED', callbacks: 'RESCHEDULED', unreachable: 'UNREACHABLE' };
const callbackLabels = { overdue: 'Overdue', today: 'Due Today', upcoming: 'Upcoming' };
const columnWidths = { time: 178, party: 228, caller: 148, branch: 235, outcome: 145, reference: 150 };

function formatDate(day, formatter = shortDate) {
  return formatter.format(new Date(day + 'T12:00:00+05:30'));
}

function employeeSelectionLabel(employees, fallback) {
  if (employees.length === 1) return employees[0].name;
  return employees.length ? employees.length + ' team members' : fallback;
}

function ActivityChart({ report, rows, compact = false }) {
  const tickFormat = rows[0]?.day.slice(0, 4) === rows.at(-1)?.day.slice(0, 4) ? shortDate : fullDate;
  return (
    <section className={compact ? styles.panel + ' ' + styles.compactPanel : styles.panel} aria-label={report.chart}>
      <h2>{report.chart}</h2>
      <div className={styles.legend}>
        <span><i />{report.primary}</span>
        {report.secondary && <span><i />{report.secondary}</span>}
      </div>
      <div className={compact ? styles.compactChart : styles.chart}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--report-line)" strokeDasharray="4 5" />
            <XAxis dataKey="day" tickFormatter={day => formatDate(day, tickFormat)} tick={{ fill: 'var(--report-muted)', fontSize: 12 }} minTickGap={24} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={35} tick={{ fill: 'var(--report-muted)', fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={day => formatDate(day, fullDate)}
              cursor={{ fill: 'var(--report-raised)' }}
              contentStyle={{ background: 'var(--report-surface)', borderColor: 'var(--report-line)', borderRadius: 10, color: 'var(--report-text)' }}
            />
            <Bar dataKey={compact ? 'secondary' : 'value'} name={report.primary} radius={[5, 5, 0, 0]} maxBarSize={34} fill={compact ? 'var(--report-series-secondary)' : 'var(--report-series-primary)'} isAnimationActive={false} />
            {report.secondary && <Bar dataKey="secondary" name={report.secondary} radius={[5, 5, 0, 0]} maxBarSize={34} fill="var(--report-series-secondary)" isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Breakdown({ group, total, onSelect }) {
  const denominator = (total ?? group.rows[0]?.count) || 1;
  return (
    <section className={styles.panel} aria-label={group.title}>
      <h2>{group.title}</h2>
      <ul className={onSelect ? styles.outcomeList : styles.breakdown}>
        {group.rows.map(row => (
          <li key={row.label}>
            {onSelect ? (
              <button type="button" className={styles.outcomeButton} onClick={event => onSelect('outcome', row.key, row.label, event.currentTarget)}>
                <span>{row.label}</span>
                <strong>{valueFormats.count.format(row.count)} · {valueFormats.percent.format(row.count / denominator)}</strong>
              </button>
            ) : (
              <div><span>{row.label}</span><strong>{valueFormats.count.format(row.count)}</strong></div>
            )}
            <span className={styles.barTrack} aria-hidden="true">
              <span style={{ width: (row.count / denominator * 100) + '%' }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatTimestamp(value) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? dateTime.format(timestamp) : '—';
}

function formatCallback(row) {
  return row.dueTime ? formatTimestamp(row.dueTime) : formatDate(row.dueDay, fullDate) + ' · Time not set';
}

function reportPageSize() {
  try {
    const stored = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize;
    if (stored === 'All') return 100000;
    const size = Number(stored);
    if (Number.isInteger(size) && size > 0 && size <= 100000) return size;
  } catch {
    // Browser storage may be unavailable.
  }
  return 15;
}

function CallingRecords({ request, filter, onClose }) {
  const region = useRef(null);
  const headingId = useId();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(reportPageSize);
  const [result, setResult] = useState(null);
  const key = page + ':' + pageSize;
  const current = result?.key === key ? result.payload : null;
  const { kind, filterKey, title } = filter;
  const isQueue = kind === 'queue';
  const columns = [
    ['time', isQueue ? 'Callback time (IST)' : 'Call logged (IST)'],
    ['party', 'Partner'], ['caller', 'Caller'], ['branch', 'Branch'], ['outcome', 'Outcome'],
    ['reference', isQueue ? 'Call logged (IST)' : 'Order reference'],
  ];
  const sizing = useTableColumnResize('orderDeskAnalyticsColumnWidths', columnWidths);

  useEffect(() => {
    region.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    getChannelAnalytics({ ...request, detail: { kind, key: filterKey, page, pageSize } }).then(payload => {
      if (active) setResult({ key, payload });
    }).catch(() => {
      if (active) setResult({ key, payload: { success: false, error: 'The records could not be loaded.' } });
    });
    return () => { active = false; };
  }, [request, kind, filterKey, page, pageSize, key]);

  return (
    <section ref={region} tabIndex={-1} className={styles.recordsPanel} aria-labelledby={headingId} aria-busy={!current}>
      <div className={styles.recordsHeading}>
        <h2 id={headingId}>{title}</h2>
        <button type="button" className={styles.closeRecords} onClick={onClose} aria-label="Close records"><X size={18} aria-hidden="true" /></button>
      </div>
      {!current ? <p role="status">Loading records…</p> : !current.success ? <p role="alert">{current.error}</p> : (
        <>
          <div className={styles.recordsScroll} role="region" aria-label={title + ' table'} tabIndex={0}>
            <table className={styles.recordsTable} style={{ minWidth: sizing.getTotalTableWidth() }}>
              <colgroup>{columns.map(([id]) => <col key={id} style={{ width: sizing.colWidths[id] }} />)}</colgroup>
              <thead>
                <tr>{columns.map(([id, label]) => <th key={id} scope="col">
                  {label}
                  <ColumnResizer colKey={id} isResizing={sizing.isResizing(id)} onResizeStart={sizing.handleResizeStart} onReset={sizing.resetColWidth} />
                </th>)}</tr>
              </thead>
              <tbody>
                {current.detail.rows.map(row => (
                  <tr key={row.id}>
                    <td>{isQueue ? formatCallback(row) : formatTimestamp(row.loggedAt)}</td>
                    <td><strong>{row.party}</strong>{row.partyCode && <small>{row.partyCode}</small>}</td>
                    <td>{row.caller}</td><td>{row.branch}</td><td>{row.outcome}</td>
                    <td>{isQueue ? formatTimestamp(row.loggedAt) : row.orderNumber || '—'}</td>
                  </tr>
                ))}
                {!current.detail.rows.length && <tr><td colSpan={columns.length}>No matching records.</td></tr>}
              </tbody>
            </table>
          </div>
          <StandardTablePagination currentPage={current.detail.page} totalRecords={current.detail.total} pageSize={pageSize}
            onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
        </>
      )}
    </section>
  );
}

function CallComparison({ comparison, current }) {
  const { range, kpis } = comparison;
  const rows = [
    ['Calls logged', kpis.total, current.total, 'count'],
    ['Unreachable rate', kpis.total ? kpis.unreachable / kpis.total : null, current.total ? current.unreachable / current.total : null, 'percent'],
    ['Conversion', kpis.conversion, current.conversion, 'percent'],
  ];
  return (
    <section className={styles.panel} aria-label="Previous period comparison">
      <h2>Previous period</h2>
      <p className={styles.panelCaption}>{formatDate(range.startDate, fullDate)}{range.startDate !== range.endDate ? ' – ' + formatDate(range.endDate, fullDate) : ''}</p>
      <ul className={styles.compareList}>
        {rows.map(([label, previous, value, format]) => {
          const change = value == null || previous == null ? null : (value - previous) * (format === 'percent' ? 100 : 1);
          const formatted = change == null ? '—' : valueFormats.difference.format(change) + (format === 'percent' ? ' pp' : '');
          return <li key={label}><span>{label}<small>Previous {previous == null ? '—' : valueFormats[format].format(previous)}</small></span><strong>{formatted}</strong></li>;
        })}
      </ul>
    </section>
  );
}

function OrderDeskDashboard({ report, data, request }) {
  const [detail, setDetail] = useState(null);
  const activeButton = useRef(null);
  const { kpis, calling, total, trend, breakdowns } = data;
  const unreachableRate = total ? valueFormats.percent.format(kpis.unreachable / total) + ' of calls' : null;
  function showRecords(kind, filterKey, title, button) {
    activeButton.current = button;
    setDetail({ kind, filterKey, title });
  }
  function closeRecords() {
    setDetail(null);
    activeButton.current?.focus();
  }

  return (
    <>
      <div className={styles.kpis} aria-label="Calling metrics">
        {report.metrics.map(([key, label, Icon, format = 'count']) => {
          const outcome = outcomeKeys[key];
          const contents = <>
            <span className={styles.metricIcon}><Icon size={19} aria-hidden="true" /></span>
            <span className={styles.callMetricLabel}>{label}</span>
            <strong className={styles.callMetricValue}>{kpis[key] == null ? '—' : valueFormats[format].format(kpis[key])}</strong>
            {key === 'unreachable' && unreachableRate && <span className={styles.metricShare}>{unreachableRate}</span>}
          </>;
          return outcome ? (
            <button key={key} type="button" className={styles.callMetricButton} data-metric={key}
              aria-pressed={detail?.kind === 'outcome' && detail.filterKey === outcome}
              onClick={event => showRecords('outcome', outcome, label, event.currentTarget)}>{contents}</button>
          ) : <div key={key} className={styles.metric}>{contents}</div>;
        })}
      </div>
      {detail && <CallingRecords key={detail.kind + ':' + detail.filterKey} filter={detail} request={request} onClose={closeRecords} />}
      <div className={styles.reports}>
        <div className={styles.breakdowns}>
          {total ? <>
            <ActivityChart report={report} rows={trend} />
            <ActivityChart report={ordersChart} rows={trend} compact />
          </> : <div className={styles.status} role="status">No calls match the selected filters.</div>}
        </div>
        <div className={styles.breakdowns}>
          <section className={styles.panel} aria-label="Callback queue">
            <h2>Callback queue</h2>
            <p className={styles.panelCaption}>Open callbacks as of now (IST)</p>
            {calling.callbacks ? (
              <div className={styles.queueBuckets}>
                {Object.entries(callbackLabels).map(([key, label]) => (
                  <button key={key} type="button" className={styles.queueButton} data-bucket={key}
                    aria-pressed={detail?.kind === 'queue' && detail.filterKey === key}
                    onClick={event => showRecords('queue', key, label + ' callbacks', event.currentTarget)}>
                    <span>{label}</span><strong>{valueFormats.count.format(calling.callbacks[key])}</strong>
                  </button>
                ))}
              </div>
            ) : <p className={styles.panelCaption}>Callback queue unavailable. Refresh to retry.</p>}
            {calling.callbackPreview.length > 0 && <ul className={styles.callbackPreview}>
              {calling.callbackPreview.map(row => (
                <li key={row.id}>
                  <span><strong>{row.party}</strong><small>{row.caller}</small></span>
                  <span>{formatCallback(row)}</span>
                </li>
              ))}
            </ul>}
          </section>
          {total > 0 && <Breakdown group={breakdowns[0]} total={total} onSelect={showRecords} />}
          {calling.comparison && <CallComparison comparison={calling.comparison} current={kpis} />}
          {calling.comparisonUnavailable && <p className={styles.status} role="status">Previous-period comparison unavailable.</p>}
        </div>
      </div>
      {total > 0 && <div className={styles.callGroups}>
        {calling.groups.map(group => <Breakdown key={group.title} group={group} total={total} />)}
      </div>}
    </>
  );
}

function EmployeeFilter({ employees, selected, onChange, loading, unavailable, placeholder }) {
  const panelId = useId();
  const trigger = useRef(null);
  const search = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const options = [...new Map([...selected, ...employees].map(employee => [employee.id, employee])).values()];
  const visible = options.filter(employee => !term || [employee.name, employee.code]
    .some(value => value.toLowerCase().includes(term)));

  useEffect(() => {
    if (isOpen) search.current?.focus();
  }, [isOpen]);

  return (
    <div
      className={styles.employeeFilter}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className={styles.employeeTrigger}
        ref={trigger}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => {
          setQuery('');
          setIsOpen(!isOpen);
        }}
      >
        <Users size={16} aria-hidden="true" />
        <span>{employeeSelectionLabel(selected, placeholder)}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className={styles.employeePanel} id={panelId} role="group" aria-label="Team member filter">
          <label className={styles.employeeSearch}>
            <Search size={15} aria-hidden="true" />
            <input ref={search} type="search" aria-label="Search team members" placeholder="Search team members" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          {selected.length > 0 && (
            <button type="button" className={styles.clearFilter} onClick={() => {
              search.current?.focus();
              onChange([]);
            }}>
              Clear team filter
            </button>
          )}
          <div className={styles.employeeOptions}>
            {visible.map(employee => {
              const checked = selected.some(item => item.id === employee.id);
              return (
                <label key={employee.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(checked ? selected.filter(item => item.id !== employee.id) : [...selected, employee])}
                  />
                  <span>{employee.name}{employee.code && <small>{employee.code}</small>}</span>
                </label>
              );
            })}
            {!visible.length && <p>{unavailable ? 'Team members unavailable. Refresh to retry.'
              : loading ? 'Loading team members…' : term ? 'No matching team members.' : 'No team members with recorded activity.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChannelAnalyticsDashboard({ page, tenantId, viewer, branch, localDbStatus = 'unavailable', onOpenOperations }) {
  const report = REPORTS[page];
  const [{ preset, startDate, endDate }, setDateFilter] = useState({ preset: 'today', startDate: '', endDate: '' });
  const [selection, setSelection] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [result, setResult] = useState(null);
  const context = JSON.stringify([page, tenantId, viewer, branch]);
  const { workScope = 'all', employees: selectedEmployees = [] } = selection?.context === context ? selection : {};
  const employeeKey = selectedEmployees.map(employee => employee.id).sort().join(',');
  const periodKey = JSON.stringify([preset, startDate, endDate]);
  const requestKey = JSON.stringify([context, periodKey, workScope, employeeKey, refreshCount]);
  const request = useMemo(() => ({
    page, tenantId, viewer, branch, preset, startDate, endDate, workScope,
    employeeIds: employeeKey ? employeeKey.split(',') : [],
  }), [page, tenantId, viewer, branch, preset, startDate, endDate, workScope, employeeKey]);
  const current = result?.key === requestKey ? result.data : null;
  const periodEmployees = result?.context === context && result.periodKey === periodKey ? result.data.employees || [] : [];
  const range = current?.success ? current.range : getComplaintDateRange(preset, startDate, endDate);
  const viewingLabel = workScope === 'mine' ? 'My Work' : employeeSelectionLabel(selectedEmployees, 'All Team Members');
  const periodLabel = preset === 'custom' ? 'Custom Date Range' : PICKER_PRESETS.find(option => option.id === preset)?.label;
  const displayRange = range.startDate && range.endDate && !range.error
    ? formatDate(range.startDate, fullDate) +
      (range.startDate === range.endDate ? '' : ' – ' + formatDate(range.endDate, fullDate))
    : undefined;

  useEffect(() => {
    let currentRequest = true;
    getChannelAnalytics(request).then(data => {
      if (currentRequest) setResult({ key: requestKey, context, periodKey, data });
    }).catch(() => {
      if (currentRequest) setResult({ key: requestKey, data: { success: false, error: 'The report could not be loaded. Try refreshing.' } });
    });
    return () => { currentRequest = false; };
  }, [request, requestKey, context, periodKey]);

  function changeScope(scope, employees = []) {
    setSelection({ context, workScope: scope, employees });
  }

  return (
    <div data-spc-module-theme className={styles.dashboard} aria-busy={!current}>
      <header className={styles.header}>
        <div className={styles.headerSummary}>
          <p className={styles.headerTitle}>
            <TrendingUp size={20} aria-hidden="true" /> Performance &amp; Analytics Dashboard
          </p>
          <p className={styles.scope}>
            Viewing: <strong>{viewingLabel}</strong>
            {' · '}<span title={displayRange}>{periodLabel}</span>
            {current?.success && <>{' · '}{current.branchLabel}</>}
          </p>
        </div>

        <div className={styles.toolbar} role="group" aria-label="Analytics quick tools">
          <div className={styles.workScope} role="group" aria-label="Work scope">
            <button type="button" aria-pressed={workScope === 'mine'} onClick={() => changeScope('mine')}>
              <User size={15} aria-hidden="true" /> My Work
            </button>
            <button type="button" aria-pressed={workScope === 'all'} onClick={() => changeScope('all')}>
              <Users size={15} aria-hidden="true" /> All Team
            </button>
          </div>
          <EmployeeFilter
            key={context}
            employees={periodEmployees}
            selected={selectedEmployees}
            onChange={employees => changeScope(employees.length ? 'employees' : 'all', employees)}
            loading={!current}
            unavailable={current?.employeeFilterUnavailable || current?.success === false}
            placeholder={workScope === 'mine' ? 'Filter by team member' : 'All Team Members (Click to filter)'}
          />
          <div className={styles.datePicker}>
            <DateRangePicker
              preset={preset}
              startDate={range.startDate}
              endDate={range.endDate}
              allowAllTime
              presetOptions={PICKER_PRESETS}
              rangeResolver={getComplaintDateRange}
              title="Select Performance Period (IST)"
              onChange={next => setDateFilter(next.preset === 'custom'
                ? { preset: next.preset, startDate: next.startDate, endDate: next.endDate }
                : { preset: next.preset, startDate: '', endDate: '' })}
            />
          </div>
          <span className={styles.dbStatus} data-status={localDbStatus} role="status" title="Workspace local database status">
            {localDbStatus === 'syncing' ? <RefreshCw size={14} aria-hidden="true" /> : <Database size={14} aria-hidden="true" />}
            {DB_STATUS_LABELS[localDbStatus]}
          </span>
          <button type="button" className={styles.refresh} aria-label="Refresh report" title="Refresh report" disabled={!current} onClick={() => setRefreshCount(count => count + 1)}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.reportHeader}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><ChartNoAxesColumnIncreasing size={20} aria-hidden="true" /></span>
          <div>
            <h1>{report.title}</h1>
            <p>{report.description}</p>
          </div>
        </div>
        <button type="button" className={styles.openOperations} onClick={onOpenOperations}>
          Open Operations <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>

      {!current ? (
        <div className={styles.status} role="status">Loading dashboard…</div>
      ) : !current.success ? (
        <div className={styles.status} role="alert">{current.error}</div>
      ) : page === 'order_followup' ? (
        <OrderDeskDashboard key={requestKey} data={current} report={report} request={request} />
      ) : (
        <>
          <dl className={styles.kpis}>
            {report.metrics.map(([key, label, Icon, format = 'count']) => (
              <div className={styles.metric} key={key}>
                <span className={styles.metricIcon}><Icon size={19} aria-hidden="true" /></span>
                <dt>{label}</dt>
                <dd>{current.kpis[key] == null ? '—' : valueFormats[format].format(current.kpis[key])}</dd>
              </div>
            ))}
          </dl>

          {current.total === 0 ? (
            <div className={styles.status} role="status">No activity matches the current filters.</div>
          ) : (
            <div className={styles.reports}>
              <ActivityChart report={report} rows={current.trend} />
              <div className={styles.breakdowns}>
                {current.breakdowns.map(group => <Breakdown key={group.title} group={group} />)}
              </div>
            </div>
          )}
          {report.note && <p className={styles.note}>{report.note}</p>}
        </>
      )}
    </div>
  );
}
