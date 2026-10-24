/**
 * Strict Indian Standard Time (IST / Asia/Kolkata) Date Helpers & Frequency Recurrence Math
 */

export function getISTDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

export function getISTCurrentPeriod(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit'
  }).format(date);
}

/**
 * Pure Deterministic Frequency Calculator (Evaluated strictly in IST calendar)
 */
export function calculateNextDueDate(schedule, fromDateStr = null) {
  const baseStr = fromDateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [year, month, day] = baseStr.split('-').map(Number);
  const baseUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const freq = (schedule?.frequency_type || 'MONTHLY').toUpperCase();

  if (freq === 'DAILY') {
    const next = new Date(baseUtc.getTime() + 24 * 60 * 60 * 1000);
    return next.toISOString().slice(0, 10);
  }

  if (freq === 'WEEKLY') {
    const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
    let rawDays = schedule?.weekly_days;
    if (typeof rawDays === 'string') {
      try { rawDays = JSON.parse(rawDays); } catch (_) { rawDays = ['MON']; }
    }
    if (!Array.isArray(rawDays) || rawDays.length === 0) rawDays = ['MON'];

    const targetDays = rawDays
      .map(d => typeof d === 'string' ? dayMap[d.toUpperCase()] : d)
      .filter(d => d !== undefined && !isNaN(d));

    if (targetDays.length === 0) targetDays.push(1);

    for (let offset = 1; offset <= 7; offset++) {
      const probe = new Date(baseUtc.getTime() + offset * 24 * 60 * 60 * 1000);
      if (targetDays.includes(probe.getUTCDay())) {
        return probe.toISOString().slice(0, 10);
      }
    }
    return new Date(baseUtc.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  if (freq === 'HALF_MONTHLY') {
    let dates = schedule?.half_monthly_dates;
    if (typeof dates === 'string') {
      try { dates = JSON.parse(dates); } catch (_) { dates = [1, 16]; }
    }
    if (!Array.isArray(dates) || dates.length !== 2) dates = [1, 16];
    dates = dates.map(Number).sort((a, b) => a - b);
    const [d1, d2] = dates;

    if (day < d1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    } else if (day < d2) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
    } else {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    }
  }

  if (freq === 'MONTHLY') {
    const targetDay = Math.min(31, Math.max(1, Number(schedule?.monthly_date) || 1));
    if (day < targetDay) {
      const maxDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const safeDay = Math.min(targetDay, maxDaysInMonth);
      return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
    } else {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const maxDaysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const safeDay = Math.min(targetDay, maxDaysInNextMonth);
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
    }
  }

  if (freq === 'QUARTERLY') {
    let nextMonth = month + 3;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth -= 12;
      nextYear += 1;
    }
    const safeDay = Math.min(day, new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate());
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
  }

  if (freq === 'HALF_YEARLY') {
    let nextMonth = month + 6;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth -= 12;
      nextYear += 1;
    }
    const safeDay = Math.min(day, new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate());
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
  }

  if (freq === 'YEARLY') {
    const nextYear = year + 1;
    const safeDay = Math.min(day, new Date(Date.UTC(nextYear, month, 0)).getUTCDate());
    return `${nextYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
  }

  if (freq === 'CUSTOM_DAYS') {
    const interval = Math.max(1, Number(schedule?.custom_interval_days) || 15);
    const next = new Date(baseUtc.getTime() + interval * 24 * 60 * 60 * 1000);
    return next.toISOString().slice(0, 10);
  }

  const fallback = new Date(baseUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
  return fallback.toISOString().slice(0, 10);
}
