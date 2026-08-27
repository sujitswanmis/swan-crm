/**
 * Attendance Date & Time Utility Functions
 */

// Helper to get formatted today date YYYY-MM-DD in local time
export const getTodayDateString = (offsetDays = 0) => {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
