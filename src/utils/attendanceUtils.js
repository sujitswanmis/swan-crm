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

// Calculate monthly short leave usage for a user
export const calculateMonthlyShortLeaveUsage = (records = [], targetYear, targetMonth, excludeDate = null) => {
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

  return {
    used_20_min: used20Min,
    remaining_20_min: Math.max(0, 2 - used20Min),
    used_2_hr: used2Hr,
    remaining_2_hr: Math.max(0, 2 - used2Hr),
    total_used: used20Min + used2Hr,
    total_remaining: Math.max(0, 4 - (used20Min + used2Hr))
  };
};

/**
 * Evaluate Morning Punch In against Regular Shift Rules
 * 
 * Rules:
 * 1. 09:00:00 to 09:05:59 -> ON_TIME (Grace period, 0 Short Leave used)
 * 2. 09:06:00 to 09:20:59 -> 20-Min Short Leave (if available) -> Else 2-Hr Short Leave -> Else Half Day
 * 3. 09:21:00 to 11:00:59 -> 2-Hour Short Leave (if available) -> Else Half Day
 * 4. After 11:01:00 -> Half Day
 */
export const evaluateMorningInPunch = (inDateObj, monthlyUsage = { used_20_min: 0, used_2_hr: 0 }, userName = 'User') => {
  const d = inDateObj || new Date();
  const { totalSeconds } = getIstDateParts(d);

  const timeFormatted = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

  const SEC_09_00 = 9 * 3600; // 32400
  const SEC_09_05_59 = 9 * 3600 + 5 * 60 + 59; // 32759
  const SEC_09_20_59 = 9 * 3600 + 20 * 60 + 59; // 33659
  const SEC_11_00_59 = 11 * 3600 + 59; // 39659

  // Case 1: Early or Within 5-Minute Grace Period (<= 09:05:59)
  if (totalSeconds <= SEC_09_05_59) {
    const isGrace = totalSeconds > SEC_09_00;
    return {
      status: 'PRESENT',
      short_leave_type: 'NONE',
      is_grace_applied: isGrace,
      remarks: isGrace 
        ? 'On Time (Within 5-Minute Morning Grace Period: 09:00 - 09:05:59)' 
        : 'On Time (Morning Regular Shift)',
      voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आप समय पर हैं। आपका दिन शुभ और मंगलमय हो!`,
      ruleTitle: isGrace ? 'On Time (5m Grace)' : 'On Time'
    };
  }

  // Case 2: Arrival between 09:06:00 and 09:20:59 (20-Minute Window)
  if (totalSeconds <= SEC_09_20_59) {
    if (monthlyUsage.used_20_min < 2) {
      return {
        status: 'PRESENT',
        short_leave_type: '20_MIN_IN',
        is_grace_applied: false,
        remarks: '20-Minute Short Leave Applied (Morning arrival between 09:06 - 09:20)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आपका 20 मिनट का शॉर्ट लीव अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: '20-Min Short Leave Applied'
      };
    } else if (monthlyUsage.used_2_hr < 2) {
      return {
        status: 'PRESENT',
        short_leave_type: '2_HR_IN',
        is_grace_applied: false,
        remarks: '2-Hour Short Leave Applied (20-Min Short Leaves exhausted, morning arrival 09:06 - 09:20)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। 20 मिनट का कोटा समाप्त होने पर 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: '2-Hour Short Leave Applied'
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        is_grace_applied: false,
        remarks: 'Half Day Marked: Late arrival (09:06 - 09:20) and Monthly Short Leaves Exhausted',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (Short Leaves Exhausted)'
      };
    }
  }

  // Case 3: Arrival between 09:21:00 and 11:00:59 (2-Hour Window)
  if (totalSeconds <= SEC_11_00_59) {
    if (monthlyUsage.used_2_hr < 2) {
      return {
        status: 'PRESENT',
        short_leave_type: '2_HR_IN',
        is_grace_applied: false,
        remarks: '2-Hour Short Leave Applied (Morning arrival between 09:21 - 11:00)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। आपका 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। आपका दिन शुभ हो!`,
        ruleTitle: '2-Hour Short Leave Applied'
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        is_grace_applied: false,
        remarks: 'Half Day Marked: Late arrival between 09:21 - 11:00 and 2-Hour Short Leaves Exhausted',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। 2 घंटे का शॉर्ट लीव कोटा समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (2-Hr Short Leave Exhausted)'
      };
    }
  }

  // Case 4: Arrival after 11:01:00 (Beyond 11:00 AM limit)
  return {
    status: 'HALF_DAY',
    short_leave_type: 'NONE',
    is_grace_applied: false,
    remarks: 'Half Day Marked: Late arrival after 11:00 AM (Beyond permissible Short Leave window)',
    voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच इन समय ${timeFormatted} दर्ज हो गया है। 11 बजे के बाद आने के कारण हाफ डे मार्क हुआ है।`,
    ruleTitle: 'Half Day (After 11:00 AM)'
  };
};

/**
 * Evaluate Evening Punch Out against Regular Shift Rules
 * 
 * Rules:
 * 1. 18:30:00 or later -> Shift Completed on Time (No SL needed)
 * 2. 18:10:00 to 18:29:59 -> 20-Min Short Leave (if no SL used today and quota available) -> Else 2-Hr SL -> Else Half Day
 * 3. 16:30:00 to 18:09:59 -> 2-Hour Short Leave (if no SL used today and quota available) -> Else Half Day
 * 4. Before 16:30:00 -> Half Day (Exceeds permissible early departure)
 * 5. Constraint: Max 1 Short Leave per day.
 */
export const evaluateEveningOutPunch = (
  outDateObj, 
  inDateObj, 
  currentRecord = null, 
  monthlyUsage = { used_20_min: 0, used_2_hr: 0 }, 
  userName = 'User'
) => {
  const outD = outDateObj || new Date();
  const { totalSeconds, isSunday } = getIstDateParts(outD);

  const timeFormatted = outD.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

  const inD = inDateObj ? new Date(inDateObj) : (currentRecord?.in_time ? new Date(currentRecord.in_time) : null);
  const totalMins = inD ? Math.max(0, Math.floor((outD.getTime() - inD.getTime()) / 60000)) : 0;
  const durationFormatted = formatMinutesToHours(totalMins);

  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const hindiDuration = (hrs > 0 && mins > 0) ? `${hrs} घंटे ${mins} मिनट` : (hrs > 0 ? `${hrs} घंटे` : `${mins} मिनट`);

  const SEC_16_30 = 16 * 3600 + 30 * 60; // 59400
  const SEC_18_10 = 18 * 3600 + 10 * 60; // 65400
  const SEC_18_30 = 18 * 3600 + 30 * 60; // 66600

  const morningSlUsed = currentRecord?.short_leave_type && currentRecord.short_leave_type !== 'NONE';
  const initialStatus = currentRecord?.status || 'PRESENT';

  const isMonToSat = !isSunday;

  // RULE: If Monday to Saturday and total worked time < 4 hours 30 minutes (< 270 mins) -> ABSENT
  if (isMonToSat && totalMins < 270) {
    return {
      status: 'ABSENT',
      short_leave_type: currentRecord?.short_leave_type || 'NONE',
      total_working_minutes: totalMins,
      remarks: `Absent Marked: Total working time (${durationFormatted}) is less than 4 Hours 30 Minutes on Mon-Sat (< 270 mins)`,
      voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आज आपने कुल ${hindiDuration} काम किया है, जो कि 4 घंटे 30 मिनट से कम है, इसलिए आज एब्सेंट मार्क हुआ है।`,
      ruleTitle: 'Absent (< 4h 30m on Mon-Sat)'
    };
  }

  // Case 1: Shift Completed On Time (>= 18:30:00)
  if (totalSeconds >= SEC_18_30) {
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

  // Case 2: Early Departure between 18:10:00 and 18:29:59 (20-Min Window)
  if (totalSeconds >= SEC_18_10) {
    if (morningSlUsed) {
      // Rule: Max 1 Short Leave per day
      const finalStatus = (initialStatus === 'HALF_DAY' || totalMins < 450) ? 'HALF_DAY' : 'PRESENT';
      return {
        status: finalStatus,
        short_leave_type: currentRecord.short_leave_type,
        total_working_minutes: totalMins,
        remarks: `${currentRecord.remarks || ''} | Early departure (Short Leave already consumed in Morning - Max 1/day)`.trim(),
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आज आपने कुल ${hindiDuration} काम किया। शुभ संध्या!`,
        ruleTitle: 'Early Out (Morning SL Used)'
      };
    }

    if (monthlyUsage.used_20_min < 2) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '20_MIN_OUT',
        total_working_minutes: totalMins,
        remarks: '20-Minute Short Leave Applied (Evening departure between 18:10 - 18:30)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका 20 मिनट का शॉर्ट लीव अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: '20-Min Short Leave Applied'
      };
    } else if (monthlyUsage.used_2_hr < 2) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '2_HR_OUT',
        total_working_minutes: totalMins,
        remarks: '2-Hour Short Leave Applied (20-Min SLs exhausted, evening departure 18:10 - 18:30)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: '2-Hour Short Leave Applied'
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        total_working_minutes: totalMins,
        remarks: 'Half Day Marked: Early departure (18:10 - 18:30) and Short Leaves Exhausted',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है। शुभ संध्या!`,
        ruleTitle: 'Half Day (Short Leaves Exhausted)'
      };
    }
  }

  // Case 3: Early Departure between 16:30:00 and 18:09:59 (2-Hour Window)
  if (totalSeconds >= SEC_16_30) {
    if (morningSlUsed) {
      return {
        status: 'HALF_DAY',
        short_leave_type: currentRecord.short_leave_type,
        total_working_minutes: totalMins,
        remarks: `${currentRecord.remarks || ''} | Half Day: Early departure before 18:10 and Short Leave already used in morning`.trim(),
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। सुबह शॉर्ट लीव लेने के कारण शाम को हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (Multiple SL Not Allowed)'
      };
    }

    if (monthlyUsage.used_2_hr < 2) {
      return {
        status: initialStatus === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT',
        short_leave_type: '2_HR_OUT',
        total_working_minutes: totalMins,
        remarks: '2-Hour Short Leave Applied (Evening departure between 16:30 - 18:30)',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। आपका 2 घंटे का शॉर्ट लीव अप्लाई हुआ है। कुल काम ${hindiDuration}। शुभ संध्या!`,
        ruleTitle: '2-Hour Short Leave Applied'
      };
    } else {
      return {
        status: 'HALF_DAY',
        short_leave_type: 'NONE',
        total_working_minutes: totalMins,
        remarks: 'Half Day Marked: Early departure between 16:30 - 18:10 and 2-Hour Short Leaves Exhausted',
        voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। 2 घंटे का शॉर्ट लीव समाप्त होने के कारण हाफ डे मार्क हुआ है।`,
        ruleTitle: 'Half Day (2-Hr Short Leave Exhausted)'
      };
    }
  }

  // Case 4: Departure before 16:30:00 (Beyond 2-Hour permissible limit)
  return {
    status: 'HALF_DAY',
    short_leave_type: currentRecord?.short_leave_type || 'NONE',
    total_working_minutes: totalMins,
    remarks: 'Half Day Marked: Early departure before 16:30 (Exceeds permissible 2-Hour limit)',
    voiceMessageHindi: `नमस्ते ${userName} जी! आपका पंच आउट समय ${timeFormatted} दर्ज हो गया है। 4:30 बजे से पहले निकलने के कारण हाफ डे मार्क हुआ है।`,
    ruleTitle: 'Half Day (Left before 4:30 PM)'
  };
};
