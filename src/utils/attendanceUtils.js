/**
 * Attendance Date & Time Utility Functions & Shift Policy Rules
 * 
 * Shift Policy:
 * - Shift: Regular Shift (09:00 to 18:30)
 * - 5 Minutes Morning Grace Period (09:00:00 to 09:05:59)
 * - Monthly Short Leaves Quota (Total 4 per month, Max 1 per day):
 *   - 2 x 20-Minute Short Leave: Morning (09:06 to 09:20) & Evening (18:10 to 18:30)
 *   - 2 x 2-Hour Short Leave: Morning (09:21 to 11:00) & Evening (16:30 to 18:30)
 *   - Beyond short leave limits or > 11:00 AM / < 16:30 -> Half Day
 */

export const SHIFT_RULES = {
  shiftName: 'Regular Shift',
  startTime: '09:00',
  endTime: '18:30',
  morningGraceSeconds: 5 * 60 + 59, // 09:05:59
  shortLeaveQuota: {
    '20_MIN': 2,
    '2_HOUR': 2,
    total: 4
  }
};

/**
 * Helper to parse "HH:MM" or "HH:MM:SS" into total seconds from midnight
 */
export const parseTimeToSeconds = (timeStr, defaultSeconds = 0) => {
  if (!timeStr) return defaultSeconds;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return defaultSeconds;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2] || '0', 10) || 0;
  return h * 3600 + m * 60 + s;
};

/**
 * Helper to format seconds into "09:00 AM" or "06:30:59 PM"
 */
export const formatSecondsToTime = (totalSec, includeSeconds = false) => {
  let sec = Math.max(0, Math.floor(totalSec));
  let h = Math.floor(sec / 3600) % 24;
  let m = Math.floor((sec % 3600) / 60);
  let s = sec % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  const hh = String(displayH).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (includeSeconds) {
    return `${hh}:${mm}:${ss} ${period}`;
  }
  return `${hh}:${mm} ${period}`;
};

/**
 * Resolve specific shift object from tenant policy
 */
export const resolveShiftFromPolicy = (policy, shiftNameOrCodeOrId = null) => {
  if (!policy) return null;
  const shifts = Array.isArray(policy.shifts) && policy.shifts.length > 0
    ? policy.shifts
    : (Array.isArray(policy) ? policy : null);

  if (shifts && shifts.length > 0) {
    if (shiftNameOrCodeOrId) {
      const search = String(shiftNameOrCodeOrId).trim().toLowerCase();
      const matched = shifts.find(s => 
        (s.id && String(s.id).toLowerCase() === search) ||
        (s.shift_code && String(s.shift_code).toLowerCase() === search) ||
        (s.shift_name && String(s.shift_name).toLowerCase() === search) ||
        (s.shift_name && s.shift_name.toLowerCase().includes(search))
      );
      if (matched) {
        return { ...policy, ...matched };
      }
    }
    const defaultShift = shifts.find(s => s.is_default) || shifts[0];
    return { ...policy, ...defaultShift };
  }

  return policy;
};

/**
 * Smart Auto-Match Closest Shift based on current time or employee preference
 */
export const matchShiftForPunch = (policyOrShifts, punchDateObj = null, preferredShift = null) => {
  const shifts = Array.isArray(policyOrShifts) 
    ? policyOrShifts 
    : (policyOrShifts?.shifts || []);

  if (!shifts || shifts.length === 0) {
    return policyOrShifts || null;
  }

  // 1. If preferred shift specified, match by id, code or name
  if (preferredShift) {
    const pref = String(preferredShift).trim().toLowerCase();
    const found = shifts.find(s => 
      (s.id && String(s.id).toLowerCase() === pref) ||
      (s.shift_code && String(s.shift_code).toLowerCase() === pref) ||
      (s.shift_name && String(s.shift_name).toLowerCase() === pref) ||
      (s.shift_name && s.shift_name.toLowerCase().includes(pref))
    );
    if (found) return found;
  }

  // 2. Proximity search based on punch timestamp
  const d = punchDateObj || new Date();
  const { totalSeconds } = getIstDateParts(d);

  let bestShift = null;
  let minDiff = Infinity;

  shifts.forEach(s => {
    const sStartSec = parseTimeToSeconds(s.start_time || '09:00');
    let diff = Math.abs(totalSeconds - sStartSec);
    if (diff > 12 * 3600) {
      diff = 24 * 3600 - diff;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bestShift = s;
    }
  });

  // If within 3.5 hours of a shift start, select that shift
  if (bestShift && minDiff <= 3.5 * 3600) {
    return bestShift;
  }

  // 3. Fallback to default shift or first shift
  const def = shifts.find(s => s.is_default) || shifts[0];
  return def || null;
};

/**
 * Dynamic Tenant Policy Boundary Resolver
 * Computes exact start, grace, short leave, and half-day thresholds based on tenant settings & shift
 */
export const getPolicyBoundaries = (policy = null, shiftNameOrCodeOrId = null) => {
  const activeShift = resolveShiftFromPolicy(policy, shiftNameOrCodeOrId);

  const startTimeStr = activeShift?.start_time || '09:00';
  const endTimeStr = activeShift?.end_time || '18:30';
  const startSec = parseTimeToSeconds(startTimeStr, 9 * 3600);
  const endSec = parseTimeToSeconds(endTimeStr, 18 * 3600 + 30 * 60);

  const graceMins = Number(activeShift?.grace_minutes ?? 5);
  const graceEndSec = startSec + graceMins * 60 + 59; // e.g. 09:05:59

  const sl1Mins = Number(activeShift?.short_leave_1_minutes ?? 20);
  const sl1EndSec = startSec + sl1Mins * 60 + 59; // e.g. 09:20:59

  const sl2Mins = Number(activeShift?.short_leave_2_minutes ?? 120);
  const sl2EndSec = startSec + sl2Mins * 60 + 59; // e.g. 11:00:59

  const eveningSl1StartSec = (endSec - sl1Mins * 60 + 86400) % 86400; // e.g. 18:10:00
  const eveningSl2StartSec = (endSec - sl2Mins * 60 + 86400) % 86400; // e.g. 16:30:00

  const minAbsentMins = Number(activeShift?.min_half_day_minutes ?? 270);
  const minFullDayMins = Number(activeShift?.min_full_day_minutes ?? 450);

  const sl1Quota = Number(activeShift?.short_leave_1_quota ?? 2);
  const sl2Quota = Number(activeShift?.short_leave_2_quota ?? 2);
  const totalSlQuota = Number(activeShift?.short_leave_total_monthly ?? (sl1Quota + sl2Quota));
  const maxSlPerDay = Number(activeShift?.max_short_leave_per_day ?? 1);

  const sl1Name = activeShift?.short_leave_1_name || `${sl1Mins}-Minute Short Leave`;
  const sl2Name = activeShift?.short_leave_2_name || `${sl2Mins >= 60 ? Math.round(sl2Mins / 60) + '-Hour' : sl2Mins + '-Minute'} Short Leave`;
  const shiftName = activeShift?.shift_name || 'Regular Shift';
  const shiftCode = activeShift?.shift_code || 'GEN';
  const isDefault = !!activeShift?.is_default;
  const shiftsList = Array.isArray(policy?.shifts) ? policy.shifts : [activeShift].filter(Boolean);

  return {
    startTimeStr,
    endTimeStr,
    startSec,
    endSec,
    graceMins,
    graceEndSec,
    sl1Mins,
    sl1EndSec,
    sl2Mins,
    sl2EndSec,
    eveningSl1StartSec,
    eveningSl2StartSec,
    minAbsentMins,
    minFullDayMins,
    sl1Quota,
    sl2Quota,
    totalSlQuota,
    maxSlPerDay,
    sl1Name,
    sl2Name,
    shiftName,
    shiftCode,
    isDefault,
    shiftsList,
    activeShift
  };
};

export const getIstDateParts = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short'
    });
    const parts = formatter.formatToParts(d);
    const partMap = {};
    parts.forEach(p => { partMap[p.type] = p.value; });

    let hours = parseInt(partMap.hour || '0', 10);
    if (hours === 24) hours = 0;
    const minutes = parseInt(partMap.minute || '0', 10);
    const seconds = parseInt(partMap.second || '0', 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const isSunday = partMap.weekday === 'Sun';

    return {
      hours,
      minutes,
      seconds,
      totalSeconds,
      year: parseInt(partMap.year, 10),
      month: parseInt(partMap.month, 10),
      day: parseInt(partMap.day, 10),
      isSunday
    };
  } catch {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = d.getSeconds();
    return {
      hours,
      minutes,
      seconds,
      totalSeconds: hours * 3600 + minutes * 60 + seconds,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      isSunday: d.getDay() === 0
    };
  }
};

// Helper to get formatted today date YYYY-MM-DD in Asia/Kolkata time
export const getTodayDateString = (offsetDays = 0) => {
  try {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() + offsetDays);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch {
    const d = new Date();
    if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

// Calculate duration in minutes between two timestamps
export const calculateMinutesBetween = (inTimeStr, outTimeStr) => {
  if (!inTimeStr || !outTimeStr) return 0;
  const start = new Date(inTimeStr).getTime();
  const end = new Date(outTimeStr).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / (1000 * 60));
};

// Format minutes into "8h 30m"
export const formatMinutesToHours = (totalMinutes = 0) => {
  if (!totalMinutes || totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

// Calculate monthly short leave usage for a user with tenant policy awareness
export const calculateMonthlyShortLeaveUsage = (
  records = [], 
  targetYear, 
  targetMonth, 
  excludeDate = null,
  customPolicy = null
) => {
  let used20Min = 0;
  let used2Hr = 0;

  const y = targetYear || new Date().getFullYear();
  const m = targetMonth || (new Date().getMonth() + 1);

  (records || []).forEach(r => {
    if (!r.attendance_date) return;
    if (excludeDate && r.attendance_date === excludeDate) return;

    const [recY, recM] = r.attendance_date.split('-').map(Number);
    if (recY === y && recM === m) {
      if (r.short_leave_type === '20_MIN_IN' || r.short_leave_type === '20_MIN_OUT') {
        used20Min += 1;
      } else if (r.short_leave_type === '2_HR_IN' || r.short_leave_type === '2_HR_OUT') {
        used2Hr += 1;
      }
    }
  });

  const b = getPolicyBoundaries(customPolicy);

  return {
    used_20_min: used20Min,
    remaining_20_min: Math.max(0, b.sl1Quota - used20Min),
    used_2_hr: used2Hr,
    remaining_2_hr: Math.max(0, b.sl2Quota - used2Hr),
    total_used: used20Min + used2Hr,
    total_remaining: Math.max(0, b.totalSlQuota - (used20Min + used2Hr))
  };
};

/**
 * Evaluate Morning Punch In against Tenant Shift Rules
 */
export const evaluateMorningInPunch = (
  inDateObj, 
  monthlyUsage = { used_20_min: 0, used_2_hr: 0 }, 
  userName = 'User',
  customPolicy = null
) => {
  const d = inDateObj || new Date();
  const { totalSeconds } = getIstDateParts(d);
  const timeFormatted = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

  const b = getPolicyBoundaries(customPolicy);

  // Case 1: Early or Within Grace Period (<= graceEndSec)
  if (totalSeconds <= b.graceEndSec) {
    const isGrace = totalSeconds > b.startSec;
    return {
      status: 'PRESENT',
      short_leave_type: 'NONE',
      is_grace_applied: isGrace,
      remarks: isGrace 
        ? `On Time (Within ${b.graceMins}-Minute Morning Grace Period: ${formatSecondsToTime(b.startSec)} - ${formatSecondsToTime(b.graceEndSec, true)})` 
        : `On Time (${b.shiftName})`,
      voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आप समय पर हैं। आपका दिन शुभ और मंगलमय हो!`,
      ruleTitle: isGrace ? `On Time (${b.graceMins}m Grace)` : 'On Time'
    };
  }

  // Case 2: Arrival between grace and Short Leave 1 (<= sl1EndSec)
  if (totalSeconds <= b.sl1EndSec) {
    if (monthlyUsage.used_20_min < b.sl1Quota) {
      return {
        status: 'PRESENT',
        short_leave_type: '20_MIN_IN',
        is_grace_applied: false,
        remarks: `${b.sl1Name} Applied (Morning arrival between ${formatSecondsToTime(b.graceEndSec + 1)} - ${formatSecondsToTime(b.sl1EndSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आपका ${b.sl1Mins} मिनट का शॉर्ट लीव अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: `${b.sl1Name} Applied`
      };
    } else if (monthlyUsage.used_2_hr < b.sl2Quota) {
      return {
        status: 'PRESENT',
        short_leave_type: '2_HR_IN',
        is_grace_applied: false,
        remarks: `${b.sl2Name} Applied (${b.sl1Name} quota exhausted, morning arrival ${formatSecondsToTime(b.graceEndSec + 1)} - ${formatSecondsToTime(b.sl1EndSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव समाप्त होने पर 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: `${b.sl2Name} Applied`
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        is_grace_applied: false,
        remarks: `Half Day Marked: Late arrival (${formatSecondsToTime(b.graceEndSec + 1)} - ${formatSecondsToTime(b.sl1EndSec)}) and Monthly Short Leaves Exhausted`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (Short Leaves Exhausted)'
      };
    }
  }

  // Case 3: Arrival between Short Leave 1 and Short Leave 2 (<= sl2EndSec)
  if (totalSeconds <= b.sl2EndSec) {
    if (monthlyUsage.used_2_hr < b.sl2Quota) {
      return {
        status: 'PRESENT',
        short_leave_type: '2_HR_IN',
        is_grace_applied: false,
        remarks: `${b.sl2Name} Applied (Morning arrival between ${formatSecondsToTime(b.sl1EndSec + 1)} - ${formatSecondsToTime(b.sl2EndSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आपका ${b.sl2Name} अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: `${b.sl2Name} Applied`
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        is_grace_applied: false,
        remarks: `Half Day Marked: Late arrival between ${formatSecondsToTime(b.sl1EndSec + 1)} - ${formatSecondsToTime(b.sl2EndSec)} and Short Leaves Exhausted`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव कोटा समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: `Half Day (${b.sl2Name} Exhausted)`
      };
    }
  }

  // Case 4: Arrival after Short Leave 2 (> sl2EndSec)
  const cutoffTime = formatSecondsToTime(b.sl2EndSec);
  return {
    status: 'HALF_DAY',
    short_leave_type: 'NONE',
    is_grace_applied: false,
    remarks: `Half Day Marked: Late arrival after ${cutoffTime} (Beyond permissible Short Leave window)`,
    voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। ${cutoffTime} के बाद आने के कारण हाफ डे मार्क हुआ है।`,
    ruleTitle: `Half Day (After ${cutoffTime})`
  };
};

/**
 * Evaluate Evening Punch Out against Tenant Shift Rules
 */
export const evaluateEveningOutPunch = (
  outDateObj, 
  inDateObj, 
  currentRecord = null, 
  monthlyUsage = { used_20_min: 0, used_2_hr: 0 }, 
  userName = 'User',
  customPolicy = null
) => {
  const b = getPolicyBoundaries(customPolicy);
  const outD = outDateObj || new Date();
  const { totalSeconds, isSunday } = getIstDateParts(outD);

  const timeFormatted = outD.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

  const inD = inDateObj ? new Date(inDateObj) : (currentRecord?.in_time ? new Date(currentRecord.in_time) : null);
  const totalMins = inD ? Math.max(0, Math.floor((outD.getTime() - inD.getTime()) / 60000)) : 0;
  const durationFormatted = formatMinutesToHours(totalMins);

  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const hindiDuration = (hrs > 0 && mins > 0) ? `${hrs} घंटे ${mins} मिनट` : (hrs > 0 ? `${hrs} घंटे` : `${mins} मिनट`);

  const morningSlUsed = currentRecord?.short_leave_type && currentRecord.short_leave_type !== 'NONE';
  const initialStatus = currentRecord?.status || 'PRESENT';

  const isMonToSat = !isSunday;

  // RULE: If Monday to Saturday and total worked time < minAbsentMins (default 270 = 4h 30m) -> ABSENT
  if (isMonToSat && totalMins < b.minAbsentMins) {
    const minHoursFormatted = formatMinutesToHours(b.minAbsentMins);
    return {
      status: 'ABSENT',
      short_leave_type: currentRecord?.short_leave_type || 'NONE',
      total_working_minutes: totalMins,
      remarks: `Absent Marked: Total working time (${durationFormatted}) is less than ${minHoursFormatted} on Mon-Sat (< ${b.minAbsentMins} mins)`,
      voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आज आपने कुल ${hindiDuration} काम किया है, जो कि ${minHoursFormatted} से कम है, इसलिए आज एब्सेंट मार्क हुआ है।`,
      ruleTitle: `Absent (< ${minHoursFormatted} on Mon-Sat)`
    };
  }

  // Case 1: Shift Completed On Time (>= endSec)
  if (totalSeconds >= b.endSec) {
    const finalStatus = (initialStatus === 'HALF_DAY') ? 'HALF_DAY' : 'PRESENT';
    return {
      status: finalStatus,
      short_leave_type: currentRecord?.short_leave_type || 'NONE',
      total_working_minutes: totalMins,
      remarks: currentRecord?.remarks ? `${currentRecord.remarks} | Shift Completed on Time` : 'Shift Completed on Time',
      voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आज आपने कुल ${hindiDuration} काम किया। धन्यवाद और शुभ संध्या!`,
      ruleTitle: 'Shift Completed'
    };
  }

  // Case 2: Early Departure between eveningSl1StartSec and endSec
  if (totalSeconds >= b.eveningSl1StartSec) {
    if (morningSlUsed && b.maxSlPerDay === 1) {
      // Rule: Max 1 Short Leave per day
      const finalStatus = (initialStatus === 'HALF_DAY' || totalMins < b.minFullDayMins) ? 'HALF_DAY' : 'PRESENT';
      return {
        status: finalStatus,
        short_leave_type: currentRecord.short_leave_type,
        total_working_minutes: totalMins,
        remarks: `${currentRecord.remarks || ''} | Early departure (Short Leave already consumed in Morning - Max 1/day)`.trim(),
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आज आपने कुल ${hindiDuration} काम किया। शुभ संध्या!`,
        ruleTitle: 'Early Out (Morning SL Used)'
      };
    }

    if (monthlyUsage.used_20_min < b.sl1Quota) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '20_MIN_OUT',
        total_working_minutes: totalMins,
        remarks: `${b.sl1Name} Applied (Evening departure between ${formatSecondsToTime(b.eveningSl1StartSec)} - ${formatSecondsToTime(b.endSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका ${b.sl1Name} अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: `${b.sl1Name} Applied`
      };
    } else if (monthlyUsage.used_2_hr < b.sl2Quota) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '2_HR_OUT',
        total_working_minutes: totalMins,
        remarks: `${b.sl2Name} Applied (${b.sl1Name} quota exhausted, evening departure ${formatSecondsToTime(b.eveningSl1StartSec)} - ${formatSecondsToTime(b.endSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: `${b.sl2Name} Applied`
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        total_working_minutes: totalMins,
        remarks: `Half Day Marked: Early departure (${formatSecondsToTime(b.eveningSl1StartSec)} - ${formatSecondsToTime(b.endSec)}) and Short Leaves Exhausted`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है। शुभ संध्या!`,
        ruleTitle: 'Half Day (Short Leaves Exhausted)'
      };
    }
  }

  // Case 3: Early Departure between eveningSl2StartSec and eveningSl1StartSec
  if (totalSeconds >= b.eveningSl2StartSec) {
    if (morningSlUsed && b.maxSlPerDay === 1) {
      return {
        status: 'HALF_DAY',
        short_leave_type: currentRecord.short_leave_type,
        total_working_minutes: totalMins,
        remarks: `${currentRecord.remarks || ''} | Half Day: Early departure before ${formatSecondsToTime(b.eveningSl1StartSec)} and Short Leave already used in morning`.trim(),
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। सुबह शॉर्ट लीव लेने के कारण शाम को हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (Multiple SL Not Allowed)'
      };
    }

    if (monthlyUsage.used_2_hr < b.sl2Quota) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '2_HR_OUT',
        total_working_minutes: totalMins,
        remarks: `${b.sl2Name} Applied (Evening departure between ${formatSecondsToTime(b.eveningSl2StartSec)} - ${formatSecondsToTime(b.endSec)})`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: `${b.sl2Name} Applied`
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        total_working_minutes: totalMins,
        remarks: `Half Day Marked: Early departure between ${formatSecondsToTime(b.eveningSl2StartSec)} - ${formatSecondsToTime(b.eveningSl1StartSec)} and Short Leaves Exhausted`,
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। 2 घंटे का शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: `Half Day (${b.sl2Name} Exhausted)`
      };
    }
  }

  // Case 4: Departure before eveningSl2StartSec
  const earlyCutoff = formatSecondsToTime(b.eveningSl2StartSec);
  return {
    status: 'HALF_DAY',
    short_leave_type: currentRecord?.short_leave_type || 'NONE',
    total_working_minutes: totalMins,
    remarks: `Half Day Marked: Early departure before ${earlyCutoff} (Exceeds permissible Short Leave limit)`,
    voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। ${earlyCutoff} से पहले निकलने के कारण हाफ डे मार्क हुआ है।`,
    ruleTitle: `Half Day (Left before ${earlyCutoff})`
  };
};
