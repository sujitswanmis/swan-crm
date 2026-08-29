/**
 * Multi-Frequency Checklist Helpers & Period Key Generators
 * Frequencies: DAILY, WEEKLY, FORTNIGHTLY (15 Days), MONTHLY, QUARTERLY, HALF_YEARLY (6 Months), YEARLY (1 Year)
 */

export const FREQUENCIES_CONFIG = [
  {
    id: 'DAILY',
    label: 'Daily',
    badgeColor: '#3b82f6',
    description: 'Every day recurring checklist',
    sortOrder: 1,
    icon: '☀️'
  },
  {
    id: 'WEEKLY',
    label: 'Weekly',
    badgeColor: '#10b981',
    description: 'Every week recurring checklist (Mon-Sun)',
    sortOrder: 2,
    icon: '🗓️'
  },
  {
    id: 'FORTNIGHTLY',
    label: '15 Days',
    badgeColor: '#8b5cf6',
    description: 'Bi-monthly / 15-day cycle (1-15 & 16-Month End)',
    sortOrder: 3,
    icon: '🌓'
  },
  {
    id: 'MONTHLY',
    label: 'Monthly',
    badgeColor: '#f59e0b',
    description: 'Once a month recurring checklist',
    sortOrder: 4,
    icon: '📆'
  },
  {
    id: 'QUARTERLY',
    label: 'Quarterly',
    badgeColor: '#ec4899',
    description: 'Every 3 months / quarterly checklist (Q1, Q2, Q3, Q4)',
    sortOrder: 5,
    icon: '📊'
  },
  {
    id: 'HALF_YEARLY',
    label: '6 Months',
    badgeColor: '#06b6d4',
    description: 'Half-yearly checklist (H1: Jan-Jun, H2: Jul-Dec)',
    sortOrder: 6,
    icon: '🏢'
  },
  {
    id: 'YEARLY',
    label: '1 Year',
    badgeColor: '#6366f1',
    description: 'Annual 1-year compliance & audit checklist',
    sortOrder: 7,
    icon: '🏆'
  }
];

export const DEFAULT_HOLIDAYS_LIST = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-03', name: 'Holi' },
  { date: '2026-03-21', name: 'Eid-ul-Fitr' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti' },
  { date: '2026-05-01', name: 'May Day / Labor Day' },
  { date: '2026-05-27', name: 'Bakrid / Eid-ul-Adha' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-09-04', name: 'Janmashtami' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra / Vijayadashami' },
  { date: '2026-11-08', name: 'Diwali / Deepavali' },
  { date: '2026-11-09', name: 'Govardhan Puja' },
  { date: '2026-11-10', name: 'Bhai Dooj' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2027-01-26', name: 'Republic Day' },
  { date: '2027-08-15', name: 'Independence Day' },
  { date: '2027-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2027-12-25', name: 'Christmas Day' }
];

export function isDateHoliday(dateInput = new Date(), customHolidays = []) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const allHolidays = [...(customHolidays || []), ...DEFAULT_HOLIDAYS_LIST];
  return allHolidays.find(h => h.date === dateStr) || null;
}

export function isDateSunday(dateInput = new Date()) {
  const d = new Date(dateInput);
  return d.getDay() === 0;
}

export function generateDefaultDailySlots(count = 1) {
  const n = Math.max(1, Math.min(12, parseInt(count, 10) || 1));
  if (n === 1) {
    return [{ slot_id: 'S1', label: 'Daily Cutoff', due_time: '18:00' }];
  }
  if (n === 2) {
    return [
      { slot_id: 'S1', label: 'Morning Slot', due_time: '10:30' },
      { slot_id: 'S2', label: 'Evening Slot', due_time: '20:00' }
    ];
  }
  if (n === 3) {
    return [
      { slot_id: 'S1', label: 'Morning Opening', due_time: '10:00' },
      { slot_id: 'S2', label: 'Mid-Day Audit', due_time: '14:30' },
      { slot_id: 'S3', label: 'Evening Closing', due_time: '20:30' }
    ];
  }
  if (n === 4) {
    return [
      { slot_id: 'S1', label: 'Morning Opening', due_time: '09:30' },
      { slot_id: 'S2', label: 'Noon Check', due_time: '12:30' },
      { slot_id: 'S3', label: 'Tea Time Audit', due_time: '16:00' },
      { slot_id: 'S4', label: 'Evening Closing', due_time: '20:30' }
    ];
  }
  if (n === 5) {
    return [
      { slot_id: 'S1', label: 'Slot 1 (Opening)', due_time: '09:30' },
      { slot_id: 'S2', label: 'Slot 2 (Mid-Morning)', due_time: '12:00' },
      { slot_id: 'S3', label: 'Slot 3 (Afternoon)', due_time: '14:30' },
      { slot_id: 'S4', label: 'Slot 4 (Evening)', due_time: '17:30' },
      { slot_id: 'S5', label: 'Slot 5 (Closing)', due_time: '20:30' }
    ];
  }

  // For 6, 7, 8... distribute evenly across operational hours (09:00 - 21:00)
  const startMins = 9 * 60; // 09:00 AM
  const endMins = 21 * 60; // 09:00 PM
  const step = Math.floor((endMins - startMins) / (n - 1));

  const slots = [];
  for (let i = 0; i < n; i++) {
    const currentMins = startMins + (i * step);
    const h = String(Math.floor(currentMins / 60)).padStart(2, '0');
    const m = String(currentMins % 60).padStart(2, '0');
    const slotNum = i + 1;
    const label = i === 0 ? 'Slot 1 (Opening)' : i === n - 1 ? `Slot ${slotNum} (Closing)` : `Slot ${slotNum}`;
    slots.push({
      slot_id: `S${slotNum}`,
      label,
      due_time: `${h}:${m}`
    });
  }
  return slots;
}

export function getISOWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getCurrentPeriodKey(frequency = 'DAILY', dateInput = new Date(), slotId = null) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  switch (frequency?.toUpperCase()) {
    case 'DAILY':
      return slotId ? `${year}-${month}-${day}_${slotId}` : `${year}-${month}-${day}`;
    case 'WEEKLY': {
      const week = String(getISOWeekNumber(d)).padStart(2, '0');
      return `${year}-W${week}`;
    }
    case 'FORTNIGHTLY': {
      const dayNum = d.getDate();
      const period = dayNum <= 15 ? 'P1' : 'P2';
      return `${year}-${month}-${period}`;
    }
    case 'MONTHLY':
      return `${year}-${month}`;
    case 'QUARTERLY': {
      const quarter = Math.floor(d.getMonth() / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    case 'HALF_YEARLY': {
      const half = d.getMonth() < 6 ? 'H1' : 'H2';
      return `${year}-${half}`;
    }
    case 'YEARLY':
      return `${year}`;
    default:
      return slotId ? `${year}-${month}-${day}_${slotId}` : `${year}-${month}-${day}`;
  }
}

export function getHumanPeriodLabel(frequency = 'DAILY', periodKey = '', slotLabel = '') {
  if (!periodKey) return '';
  const freq = frequency?.toUpperCase();

  if (freq === 'DAILY') {
    const [rawDate, slotId] = periodKey.split('_');
    const parts = (rawDate || '').split('-');
    let dateStr = periodKey;
    if (parts.length === 3) {
      const d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
      dateStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
    }
    if (slotLabel) {
      return `${dateStr} (${slotLabel})`;
    }
    if (slotId) {
      return `${dateStr} (Slot ${slotId.replace('S', '')})`;
    }
    return dateStr;
  }

  if (freq === 'WEEKLY') {
    const parts = periodKey.split('-W');
    if (parts.length === 2) {
      return `Week ${parts[1]}, ${parts[0]}`;
    }
    return periodKey;
  }

  if (freq === 'FORTNIGHTLY') {
    const parts = periodKey.split('-');
    if (parts.length === 3) {
      const monthName = new Date(parts[0], parseInt(parts[1], 10) - 1, 1).toLocaleString('en-US', { month: 'long' });
      const slot = parts[2] === 'P1' ? '1st to 15th' : '16th to Month-End';
      return `${slot} ${monthName} ${parts[0]}`;
    }
    return periodKey;
  }

  if (freq === 'MONTHLY') {
    const parts = periodKey.split('-');
    if (parts.length === 2) {
      const d = new Date(parts[0], parseInt(parts[1], 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return periodKey;
  }

  if (freq === 'QUARTERLY') {
    const parts = periodKey.split('-');
    if (parts.length === 2) {
      const q = parts[1];
      const qMap = {
        'Q1': 'Q1 (Jan - Mar)',
        'Q2': 'Q2 (Apr - Jun)',
        'Q3': 'Q3 (Jul - Sep)',
        'Q4': 'Q4 (Oct - Dec)'
      };
      return `${qMap[q] || q} ${parts[0]}`;
    }
    return periodKey;
  }

  if (freq === 'HALF_YEARLY') {
    const parts = periodKey.split('-');
    if (parts.length === 2) {
      const h = parts[1] === 'H1' ? '1st Half (Jan - Jun)' : '2nd Half (Jul - Dec)';
      return `${h} ${parts[0]}`;
    }
    return periodKey;
  }

  if (freq === 'YEARLY') {
    return `Annual Year ${periodKey}`;
  }

  return periodKey;
}

export const CHECKLIST_ITEM_TYPES = [
  { id: 'done_not_done', label: 'Done / Not Done', opt1: 'Done', opt2: 'Not Done', icon1: '✅', icon2: '❌', color1: '#16a34a', color2: '#dc2626' },
  { id: 'working_not_working', label: 'Working / Not Working', opt1: 'Working', opt2: 'Not Working', icon1: '🟢', icon2: '🔴', color1: '#16a34a', color2: '#dc2626' },
  { id: 'updated_not_updated', label: 'Updated / Not Updated', opt1: 'Updated', opt2: 'Not Updated', icon1: '✅', icon2: '❌', color1: '#16a34a', color2: '#dc2626' },
  { id: 'completed_not_completed', label: 'Completed / Not Completed', opt1: 'Completed', opt2: 'Not Completed', icon1: '✅', icon2: '❌', color1: '#16a34a', color2: '#dc2626' },
  { id: 'number', label: 'Number / Reading' },
  { id: 'photo', label: 'Photo / Proof Required' },
  { id: 'text', label: 'Text Remarks' }
];

export function calculateChecklistCompletion(items = [], responses = {}) {
  if (!items || items.length === 0) return { completedCount: 0, totalCount: 0, percent: 0, isAllDone: false };

  let completedCount = 0;
  items.forEach(item => {
    const val = responses[item.id];
    const itemType = item.type || 'done_not_done';

    if (['done_not_done', 'working_not_working', 'updated_not_updated', 'completed_not_completed', 'checkbox'].includes(itemType)) {
      if (val !== undefined && val !== null && val !== '') completedCount++;
    } else if (itemType === 'number') {
      if (val !== undefined && val !== null && val !== '') completedCount++;
    } else if (itemType === 'photo' || itemType === 'file') {
      if (val && typeof val === 'string' && val.trim() !== '') completedCount++;
    } else {
      if (val && typeof val === 'string' && val.trim() !== '') completedCount++;
    }
  });

  const totalCount = items.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllDone = completedCount >= totalCount;

  return { completedCount, totalCount, percent, isAllDone };
}

export function formatDurationHuman(diffMs) {
  if (!diffMs || diffMs <= 0) return '0 mins';
  const totalMins = Math.floor(diffMs / (1000 * 60));
  if (totalMins < 60) return `${totalMins} min${totalMins === 1 ? '' : 's'}`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days} day${days === 1 ? '' : 's'}`;
}

export function getPeriodCutoffDateTime(frequency = 'DAILY', periodKey = '', dueTime = '18:00', dayOfMonth = 1) {
  const [hours, minutes] = (dueTime || '18:00').split(':').map(Number);
  const freq = frequency?.toUpperCase();

  if (freq === 'DAILY') {
    const rawDate = (periodKey || '').split('_')[0];
    const parts = (rawDate || '').split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), hours || 18, minutes || 0, 0);
    }
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours || 18, minutes || 0, 0);
  }

  if (freq === 'WEEKLY') {
    const parts = (periodKey || '').split('-W');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const week = parseInt(parts[1], 10);
      // Find Sunday (end of that ISO week)
      const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
      const dow = simple.getUTCDay();
      const isoSunday = new Date(simple);
      if (dow <= 4) isoSunday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 7);
      else isoSunday.setUTCDate(simple.getUTCDate() + 7 - simple.getUTCDay());
      return new Date(isoSunday.getFullYear(), isoSunday.getMonth(), isoSunday.getDate(), hours || 18, minutes || 0, 0);
    }
  }

  if (freq === 'FORTNIGHTLY') {
    const parts = (periodKey || '').split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const slot = parts[2];
      if (slot === 'P1') {
        return new Date(year, monthIndex, 15, hours || 18, minutes || 0, 0);
      } else {
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        return new Date(year, monthIndex, lastDay, hours || 18, minutes || 0, 0);
      }
    }
  }

  if (freq === 'MONTHLY') {
    const parts = (periodKey || '').split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const targetDay = dayOfMonth && dayOfMonth > 1 ? dayOfMonth : new Date(year, monthIndex + 1, 0).getDate();
      return new Date(year, monthIndex, targetDay, hours || 18, minutes || 0, 0);
    }
  }

  if (freq === 'QUARTERLY') {
    const parts = (periodKey || '').split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const q = parts[1];
      const monthEnd = q === 'Q1' ? 2 : q === 'Q2' ? 5 : q === 'Q3' ? 8 : 11;
      const lastDay = new Date(year, monthEnd + 1, 0).getDate();
      return new Date(year, monthEnd, lastDay, hours || 18, minutes || 0, 0);
    }
  }

  if (freq === 'HALF_YEARLY') {
    const parts = (periodKey || '').split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const isH1 = parts[1] === 'H1';
      const monthEnd = isH1 ? 5 : 11; // June or Dec
      const lastDay = new Date(year, monthEnd + 1, 0).getDate();
      return new Date(year, monthEnd, lastDay, hours || 18, minutes || 0, 0);
    }
  }

  if (freq === 'YEARLY') {
    const year = parseInt(periodKey, 10) || new Date().getFullYear();
    return new Date(year, 11, 31, hours || 18, minutes || 0, 0);
  }

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours || 18, minutes || 0, 0);
}

export function calculateDelayStatus({
  frequency = 'DAILY',
  periodKey = '',
  dueTime = '18:00',
  dayOfMonth = 1,
  submittedAt = null,
  isCompleted = false,
  now = new Date()
}) {
  const cutoffDate = getPeriodCutoffDateTime(frequency, periodKey, dueTime, dayOfMonth);
  const currentTime = new Date(now);
  const isPastCutoff = currentTime.getTime() > cutoffDate.getTime();

  // If submitted already:
  if (isCompleted && submittedAt) {
    const submitTime = new Date(submittedAt);
    const wasLate = submitTime.getTime() > cutoffDate.getTime();
    const delayMs = wasLate ? submitTime.getTime() - cutoffDate.getTime() : 0;

    return {
      cutoffDate,
      isPastCutoff,
      isCompleted: true,
      isDelayed: wasLate,
      delayMinutes: Math.floor(delayMs / 60000),
      delayText: wasLate ? `Delayed by ${formatDurationHuman(delayMs)}` : 'On Time',
      badgeStatus: wasLate ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME',
      formattedCutoff: cutoffDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
  }

  // If not completed yet:
  if (isPastCutoff) {
    const overdueMs = currentTime.getTime() - cutoffDate.getTime();
    return {
      cutoffDate,
      isPastCutoff: true,
      isCompleted: false,
      isDelayed: true,
      delayMinutes: Math.floor(overdueMs / 60000),
      delayText: `Overdue (Delayed by ${formatDurationHuman(overdueMs)})`,
      badgeStatus: 'OVERDUE',
      formattedCutoff: cutoffDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
  }

  // On track, due soon:
  const remainingMs = cutoffDate.getTime() - currentTime.getTime();
  return {
    cutoffDate,
    isPastCutoff: false,
    isCompleted: false,
    isDelayed: false,
    delayMinutes: 0,
    delayText: `Due in ${formatDurationHuman(remainingMs)}`,
    badgeStatus: 'ON_TRACK',
    formattedCutoff: cutoffDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
}

/**
 * Metadata serialization helpers to guarantee 100% persistence of advance recurrence, slots, Sunday & Holiday rules
 */
export function serializeTemplateDescription(userDesc = '', scheduleMeta = {}) {
  const cleanUserDesc = (userDesc || '').replace(/<!--__SWAN_SCHEDULE_META__[\s\S]*?__END_META__-->/g, '').trim();
  const metaStr = `<!--__SWAN_SCHEDULE_META__${JSON.stringify(scheduleMeta)}__END_META__-->`;
  return cleanUserDesc ? `${cleanUserDesc}\n${metaStr}` : metaStr;
}

export function parseTemplateDescription(rawDesc = '') {
  let userDesc = rawDesc || '';
  let scheduleMeta = {};
  const match = (userDesc || '').match(/<!--__SWAN_SCHEDULE_META__([\s\S]*?)__END_META__-->/);
  if (match) {
    try {
      scheduleMeta = JSON.parse(match[1]) || {};
    } catch (e) {
      console.warn('Error parsing schedule metadata:', e.message);
    }
    userDesc = userDesc.replace(/<!--__SWAN_SCHEDULE_META__[\s\S]*?__END_META__-->/g, '').trim();
  }
  return { userDescription: userDesc, scheduleMeta };
}

