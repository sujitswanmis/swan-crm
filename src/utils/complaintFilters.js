const DAY_MS = 86400000;
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

export const COMPLAINT_DATE_PRESETS = [
  ['all', 'All Time'], ['today', 'Today'], ['yesterday', 'Yesterday'],
  ['this_week', 'This Week'], ['last_week', 'Last Week'],
  ['last_7_days', 'Last 7 Days'], ['last_30_days', 'Last 30 Days'],
  ['this_month', 'This Month'], ['last_month', 'Last Month'], ['custom', 'Custom From–To']
];

export const COMPLAINT_STATUSES = {
  PENDING: { label: 'Pending', color: '#d97706' },
  COMPLETED: { label: 'Completed', color: '#059669' },
  REJECTED: { label: 'Rejected', color: '#dc2626' }
};

export function getComplaintStatus(ticket = {}) {
  const status = String(ticket.ticket_status || '').trim().toUpperCase();
  if (status === 'REJECTED') return 'REJECTED';
  return status === 'RESOLVED_CLOSED' || ticket.stage_id === 'C06' ? 'COMPLETED' : 'PENDING';
}

export function getComplaintISTDay(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+05:30`);
    return !Number.isNaN(date.getTime()) && dayFormatter.format(date) === value ? value : '';
  }
  // Legacy timestamps without an offset are interpreted in IST, never the host timezone.
  const input = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
    ? `${value.replace(' ', 'T')}+05:30` : value;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : dayFormatter.format(date);
}

export function getComplaintDateRange(preset = 'all', startDate = '', endDate = '', now = new Date()) {
  const range = (start = '', end = '', error = '') => ({ startDate: start, endDate: end, error });
  if (preset === 'all') return range();
  if (preset === 'custom') {
    if (!startDate || !endDate) return range(startDate, endDate, 'Select both From and To dates.');
    if (getComplaintISTDay(startDate) !== startDate || getComplaintISTDay(endDate) !== endDate) return range(startDate, endDate, 'Enter valid dates.');
    if (startDate > endDate) return range(startDate, endDate, 'From date must be on or before To date.');
    return range(startDate, endDate);
  }
  const today = getComplaintISTDay(now);
  if (!today) return range('', '', 'Unable to determine the current IST date.');
  const shift = (day, offset) => getComplaintISTDay(new Date(new Date(`${day}T00:00:00+05:30`).getTime() + offset * DAY_MS));
  if (preset === 'today') return range(today, today);
  if (preset === 'yesterday') return range(shift(today, -1), shift(today, -1));
  if (preset === 'last_7_days') return range(shift(today, -6), today);
  if (preset === 'last_30_days') return range(shift(today, -29), today);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  if (preset === 'this_month') return range(firstOfMonth, today);
  if (preset === 'last_month') {
    const last = shift(firstOfMonth, -1);
    return range(`${last.slice(0, 7)}-01`, last);
  }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(`${today}T00:00:00+05:30`));
  const monday = shift(today, -['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday));
  if (preset === 'this_week') return range(monday, today);
  if (preset === 'last_week') return range(shift(monday, -7), shift(monday, -1));
  return range('', '', 'Choose a valid date preset.');
}

export function isComplaintSlaBreached(ticket) {
  return getComplaintStatus(ticket) === 'PENDING' && Boolean(ticket.isSlaBreached);
}

export function filterComplaintTickets(tickets = [], { status = 'ALL', category = 'ALL', search = '', range = {} } = {}) {
  const term = String(search).trim().toLowerCase();
  return tickets.filter(ticket => {
    if (!ticket || range.error) return false;
    if (status !== 'ALL' && getComplaintStatus(ticket) !== status) return false;
    if (category !== 'ALL' && ticket.category !== category) return false;
    if (range.startDate || range.endDate) {
      const day = getComplaintISTDay(ticket.created_at);
      if (!day || (range.startDate && day < range.startDate) || (range.endDate && day > range.endDate)) return false;
    }
    return !term || [ticket.ticket_number, ticket.party?.firm_name, ticket.customer_name, ticket.issue_description, ticket.technician_name]
      .some(value => String(value || '').toLowerCase().includes(term));
  });
}
