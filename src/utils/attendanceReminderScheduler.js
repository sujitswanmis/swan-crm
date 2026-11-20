'use client';

import { getTodayUserAttendanceStatus } from '@/app/actions/fieldTasks';

/**
 * Attendance Shift Reminder Scheduler
 * Sends automatic notifications:
 * 1. 15 minutes before Shift Start (Punch In Reminder)
 * 2. At Shift End (Punch Out Reminder)
 * Strictly strictly adheres to IST (Asia/Kolkata) timezone.
 */

function getISTDateAndMinutes() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(now);

  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
  }

  return {
    todayIST: dateStr,
    nowMinutes: hour * 60 + minute
  };
}

function parseTimeToMinutes(timeStr, fallbackMinutes) {
  if (!timeStr || typeof timeStr !== 'string') return fallbackMinutes;
  try {
    const clean = timeStr.trim().toLowerCase();
    const isPM = clean.includes('pm');
    const isAM = clean.includes('am');
    const timeOnly = clean.replace(/[^\d:]/g, '');
    const [hStr, mStr] = timeOnly.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  } catch {
    return fallbackMinutes;
  }
}

export function dispatchAttendancePushNotification(title, message) {
  try {
    // 1. Native Android App Notification if Capacitor is available
    if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.FieldTracker) {
      const plugin = window.Capacitor.Plugins.FieldTracker;
      if (typeof plugin.showNotification === 'function') {
        plugin.showNotification({ title, message });
      }
    }

    // 2. Browser Web Push Notification (Desktop & Mobile Chrome/Edge/Safari)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'attendance-shift-reminder',
          renotify: true
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, {
              body: message,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: 'attendance-shift-reminder'
            });
          }
        });
      }
    }
  } catch (e) {
    console.warn('[attendanceReminderScheduler] Notification error:', e);
  }
}

export function initAttendanceReminderScheduler({ userId, userEmail = '', shiftStartTime = '09:00', shiftEndTime = '18:00' }) {
  if (typeof window === 'undefined' || (!userId && !userEmail)) return () => {};

  const startMinutes = parseTimeToMinutes(shiftStartTime, 9 * 60); // Default 09:00 AM (540 mins)
  const endMinutes = parseTimeToMinutes(shiftEndTime, 18 * 60);     // Default 06:00 PM (1080 mins)

  const checkReminders = async () => {
    try {
      const { todayIST, nowMinutes } = getISTDateAndMinutes();

      // Check 1: 15 minutes before Shift Start -> Punch In Reminder
      const reminderWindowStart = startMinutes - 15;
      const reminderWindowEnd = startMinutes + 45;
      const punchInKey = `spc_att_reminder_in_${todayIST}`;

      if (nowMinutes >= reminderWindowStart && nowMinutes <= reminderWindowEnd) {
        const alreadySent = window.localStorage?.getItem(punchInKey);
        if (!alreadySent) {
          const status = await getTodayUserAttendanceStatus(userId, userEmail);
          if (!status?.hasPunchedInToday) {
            window.localStorage?.setItem(punchInKey, '1');
            dispatchAttendancePushNotification(
              '⏰ Shift Punch In Reminder',
              `Aapki shift shuru hone wali hai. Kripya samay par Punch In karein!`
            );
          }
        }
      }

      // Check 2: At or after Shift End -> Punch Out Reminder
      const punchOutKey = `spc_att_reminder_out_${todayIST}`;
      if (nowMinutes >= endMinutes && nowMinutes <= (endMinutes + 90)) {
        const alreadySent = window.localStorage?.getItem(punchOutKey);
        if (!alreadySent) {
          const status = await getTodayUserAttendanceStatus(userId, userEmail);
          if (status?.isPunchedIn && !status?.isPunchedOut) {
            window.localStorage?.setItem(punchOutKey, '1');
            dispatchAttendancePushNotification(
              '⏰ Shift Punch Out Reminder',
              `Aapka shift samay pura ho chuka hai. Kripya Punch Out karna na bhoolein!`
            );
          }
        }
      }
    } catch (err) {
      // Non-blocking reminder check
    }
  };

  // Initial check after 3 seconds
  const initTimer = setTimeout(checkReminders, 3000);
  // Interval check every 60 seconds
  const interval = setInterval(checkReminders, 60000);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') checkReminders();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    clearTimeout(initTimer);
    clearInterval(interval);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
