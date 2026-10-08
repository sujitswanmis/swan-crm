export const PLANNING_MODES = ['ACTUAL_PLUS_TAT', 'PLANNED_PLUS_TAT'];

export function validatePlanningMode(mode = 'ACTUAL_PLUS_TAT') {
  if (!PLANNING_MODES.includes(mode)) throw new Error('Invalid workflow planning rule');
  return mode;
}

export function tatHours(value, unit = 'HOURS') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('TAT must be greater than zero');
  const multiplier = { MINUTES: 1 / 60, HOURS: 1, DAYS: 24 }[unit];
  if (!multiplier) throw new Error('Invalid TAT unit');
  const hours = amount * multiplier;
  if (hours > 9999.99) throw new Error('TAT cannot exceed 9999.99 hours');
  return hours;
}

function timestamp(value) {
  // Only accept absolute timestamps. An unqualified wall-clock time must never
  // accidentally be interpreted using the browser or server's local timezone.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error('Timestamp must include an explicit timezone');
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error('Invalid timestamp');
  return millis;
}

export function plannedCompletion({ mode = 'ACTUAL_PLUS_TAT', startedAt, previousPlannedEnd, previousActualEnd, hours }) {
  validatePlanningMode(mode);
  const base = mode === 'PLANNED_PLUS_TAT'
    ? previousPlannedEnd || startedAt
    : previousActualEnd || startedAt;
  return new Date(timestamp(base) + tatHours(hours) * 3600000).toISOString();
}

export function formatWorkflowIST(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(new Date(timestamp(value))) + ' IST';
  } catch {
    return '—';
  }
}

export function workflowVariance(plannedEnd, actualEnd, now = new Date().toISOString()) {
  if (!plannedEnd) return 'Awaiting plan';
  try {
    const delta = timestamp(actualEnd || now) - timestamp(plannedEnd);
    if (!actualEnd && delta <= 0) return 'Within TAT';
    if (delta === 0) return 'On time';
    const minutes = Math.ceil(Math.abs(delta) / 60000);
    return `${minutes} min ${delta > 0 ? (actualEnd ? 'late' : 'overdue') : 'early'}`;
  } catch {
    return '—';
  }
}
