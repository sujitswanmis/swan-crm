'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Monitor, LogOut, Search, Calendar, History, ShieldOff, RefreshCw, Smartphone, Laptop, Clock, ShieldCheck, CheckCircle2, AlertCircle, Sliders, Activity, Download, FileSpreadsheet, Check, UserCheck, Coffee, Briefcase, Award, Users, UserX, X, Utensils, Droplets, ChevronRight, ChevronDown, Plus, Trash2, Edit3, Timer, ArrowRight, AlertTriangle, Sparkles, TrendingUp, Info } from 'lucide-react';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';
import { getSessionSecuritySettings, saveSessionSecuritySettings, getEmployeeDailyActivitySummary } from '@/app/actions/sessionSettings';
import { createClient } from '@/utils/supabase/client';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';

function parseDeviceInfo(deviceStr = '') {
  if (!deviceStr) return { os: 'Unknown OS', browser: 'Web Browser', icon: '🌐', label: 'Web Browser' };
  const d = deviceStr.toLowerCase();

  let os = 'Windows';
  let icon = '🖥️';
  if (d.includes('android')) {
    os = 'Android';
    icon = '📱';
  } else if (d.includes('iphone') || d.includes('ipad') || d.includes('ios')) {
    os = 'iOS';
    icon = '📱';
  } else if (d.includes('macintosh') || d.includes('mac os')) {
    os = 'macOS';
    icon = '🍎';
  } else if (d.includes('linux')) {
    os = 'Linux';
    icon = '🐧';
  }

  let browser = 'Chrome';
  if (d.includes('edg/')) {
    browser = 'Edge';
  } else if (d.includes('chrome') && !d.includes('edg/')) {
    browser = 'Chrome';
  } else if (d.includes('safari') && !d.includes('chrome')) {
    browser = 'Safari';
  } else if (d.includes('firefox')) {
    browser = 'Firefox';
  } else if (d.includes('opera') || d.includes('opr/')) {
    browser = 'Opera';
  }

  return {
    os,
    browser,
    icon,
    label: `${browser} on ${os}`,
    raw: deviceStr
  };
}

function isBreakMatchingRule(breakItemOrType, rule) {
  if (!rule) return false;
  const breakTypeStr = typeof breakItemOrType === 'string' ? breakItemOrType : (breakItemOrType?.type || '');
  if (!breakTypeStr) return false;
  
  const bt = breakTypeStr.trim().toLowerCase();
  const rl = (rule.label || '').trim().toLowerCase();
  const rid = (rule.id || '').trim().toLowerCase();

  if (bt === rl || bt === rid) return true;

  const normBt = bt.replace(/\s+/g, ' ');
  const normRl = rl.replace(/\s+/g, ' ');

  if (normBt === normRl) return true;

  if (normRl.includes('tea') || normRl.includes('coffee')) {
    return normBt.includes('tea') || normBt.includes('coffee');
  }
  if (normRl.includes('lunch')) {
    return normBt.includes('lunch');
  }
  if (normRl.includes('washroom') || normRl.includes('restroom') || normRl.includes('toilet')) {
    return normBt.includes('washroom') || normBt.includes('restroom') || normBt.includes('toilet');
  }
  if (normRl.includes('breakfast')) {
    return normBt.includes('breakfast');
  }
  if (normRl.includes('snacks') || normRl.includes('snack')) {
    return normBt.includes('snacks') || normBt.includes('snack');
  }
  if (normRl.includes('water') || normRl.includes('hydration')) {
    return normBt.includes('water') || normBt.includes('hydration');
  }
  if (normRl.includes('rest') || normRl.includes('short break')) {
    return normBt.includes('rest') || normBt.includes('short break');
  }
  if (normRl.includes('meeting') || normRl.includes('discussion')) {
    return normBt.includes('meeting') || normBt.includes('discussion');
  }

  if (normRl && normBt.includes(normRl)) return true;

  return false;
}

function getInitialSessionTab() {
  if (typeof window === 'undefined') return 'report';
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('sessionTab') || params.get('tab') || params.get('subtab') || params.get('view');
  if (!tabParam) return 'report';
  const t = tabParam.toLowerCase();
  if (['report', 'breakdown', 'live', 'inactivity', 'breaks'].includes(t)) return t;
  if (t === 'work_report' || t === 'daily_report' || t === 'work-report' || t === 'daily') return 'report';
  if (t === 'break_breakdown' || t === 'break_usage' || t === 'employee_breaks' || t === 'break') return 'breakdown';
  if (t === 'active_sessions' || t === 'live_sessions' || t === 'active' || t === 'sessions') return 'live';
  if (t === 'inactivity_rules' || t === 'idle_rules' || t === 'timeout' || t === 'rules') return 'inactivity';
  if (t === 'break_rules' || t === 'custom_breaks' || t === 'custom_rules' || t === 'custom') return 'breaks';
  return 'report';
}

export default function ActiveSessionsConfig() {
  const [activeTab, setActiveTab] = useState(getInitialSessionTab);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('setting', 'sessions');
      params.set('sessionTab', newTab);
      window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const currentTab = getInitialSessionTab();
      if (currentTab && currentTab !== activeTab) {
        setActiveTab(currentTab);
      }
    };

    const handleExternalChange = (e) => {
      if (e.detail && ['report', 'breakdown', 'live', 'inactivity', 'breaks'].includes(e.detail)) {
        setActiveTab(e.detail);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('session_subtab_change', handleExternalChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('session_subtab_change', handleExternalChange);
    };
  }, [activeTab]);

  // Sessions State
  const [allSessions, setAllSessions] = useState([]);
  const [filteredActive, setFilteredActive] = useState([]);
  const [filteredInactive, setFilteredInactive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Date Range Filter State
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);
  const [customStartDate, setCustomStartDate] = useState(() => computeDateRange('today').startDate);
  const [customEndDate, setCustomEndDate] = useState(() => computeDateRange('today').endDate);
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);

  const [dailyEmployees, setDailyEmployees] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFilterStatus, setReportFilterStatus] = useState('all'); // 'all' | 'present' | 'completed' | 'absent'
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  // Break Detail Modal State
  const [selectedEmployeeBreaks, setSelectedEmployeeBreaks] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    inactivityTimeoutMinutes: 60,
    enableAutoLogout: true,
    showTimerInHeader: true,
    warningSeconds: 60,
    idleThresholdSeconds: 60,
    dailyWorkTargetHours: 9,
    dailyLunchBreakMinutes: 30,
    breakRules: []
  });
  const [isCustomTimeout, setIsCustomTimeout] = useState(false);
  const [customTimeoutInput, setCustomTimeoutInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState(null);

  // New Custom Break Form State in Tab 3
  const [showAddBreakModal, setShowAddBreakModal] = useState(false);
  const [openEmojiPickerIdx, setOpenEmojiPickerIdx] = useState(null);
  const [newBreakForm, setNewBreakForm] = useState({
    label: '',
    icon: '☕',
    defaultMins: 15
  });

  // Filters for Live Sessions tab
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filters for Break Breakdown Tab
  const [breakdownSearchQuery, setBreakdownSearchQuery] = useState('');
  const [breakdownFilter, setBreakdownFilter] = useState('all'); // 'all' | 'with_breaks' | 'over_quota'

  // Date Preset Handler
  const handleDatePresetChange = (newPreset) => {
    if (newPreset === 'custom') {
      setShowCustomDateModal(true);
      return;
    }
    setDatePreset(newPreset);
    const { startDate: s, endDate: e } = computeDateRange(newPreset);
    setStartDate(s);
    setEndDate(e);
    setCustomStartDate(s);
    setCustomEndDate(e);
  };

  const handleApplyCustomDateRange = () => {
    if (!customStartDate || !customEndDate) {
      alert('Please select both Start Date and End Date');
      return;
    }
    if (customStartDate > customEndDate) {
      alert('Start Date cannot be after End Date');
      return;
    }
    setDatePreset('custom');
    setStartDate(customStartDate);
    setEndDate(customEndDate);
    setShowCustomDateModal(false);
  };

  // 1. Fetch Admin Session Security Settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await getSessionSecuritySettings();
      if (res?.success && res?.settings) {
        setSettings(res.settings);
        const standardPresets = [5, 15, 30, 45, 60, 120];
        if (!standardPresets.includes(res.settings.inactivityTimeoutMinutes)) {
          setIsCustomTimeout(true);
          setCustomTimeoutInput(String(res.settings.inactivityTimeoutMinutes));
        } else {
          setIsCustomTimeout(false);
        }
      }
    } catch (err) {
      console.error('Error fetching session settings:', err);
    }
  }, []);

  // 2. Fetch Daily / Period Shift Report
  const fetchDailyReport = useCallback(async (startToFetch = startDate, endToFetch = endDate) => {
    setReportLoading(true);
    try {
      const res = await getEmployeeDailyActivitySummary(startToFetch, endToFetch);
      if (res?.success && res?.employees) {
        setDailyEmployees(res.employees);
      } else {
        setDailyEmployees([]);
      }
    } catch (err) {
      console.error('Error fetching daily report:', err);
    } finally {
      setReportLoading(false);
    }
  }, [startDate, endDate]);

  // 3. Fetch Live User Sessions
  const fetchSessions = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const supabase = createClient();
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, email, emp_name');
        
      const userMap = {};
      (userRoles || []).forEach(u => {
        if (u.user_id && u.emp_name) userMap[u.user_id] = u.emp_name;
        if (u.email && u.emp_name) userMap[u.email.toLowerCase()] = u.emp_name;
      });

      let query = supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false });
        
      if (dateFrom) {
        query = query.gte('last_active', new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('last_active', endOfDay.toISOString());
      }

      query = query.limit(500);
      const { data: sessionsData, error: sessionErr } = await query;

      if (sessionErr) throw new Error('Session DB Error: ' + sessionErr.message);

      if (sessionsData) {
        const now = Date.now();
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;

        const formattedSessions = sessionsData.map(s => {
          let resolvedName = s.emp_name;
          if (!resolvedName || resolvedName === 'System User') {
            if (s.user_id && userMap[s.user_id]) resolvedName = userMap[s.user_id];
            else if (s.email && userMap[s.email.toLowerCase()]) resolvedName = userMap[s.email.toLowerCase()];
            else if (s.email) resolvedName = s.email.split('@')[0];
            else resolvedName = 'System User';
          }

          const lastActiveDate = new Date(s.last_active);
          const isWithin30Mins = (now - lastActiveDate.getTime()) < THIRTY_MINUTES_MS;
          const isActive = s.is_active === true && isWithin30Mins;
          const parsedDevice = parseDeviceInfo(s.device);

          return {
            id: s.id,
            user: resolvedName,
            email: s.email,
            deviceObj: parsedDevice,
            ip: s.ip_address || 'Logged via Web App',
            lastActive: lastActiveDate.toLocaleString('en-IN', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
              hour12: true
            }),
            lastActiveRaw: lastActiveDate,
            isActive,
            liveStatus: isActive ? 'working' : 'offline',
            current: false
          };
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const mySession = formattedSessions.find(s => s.email === user.email && s.isActive);
          if (mySession) mySession.current = true;
        }
        
        setAllSessions(formattedSessions);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (activeTab === 'live') {
      fetchSessions();
      const timer = setInterval(() => fetchSessions(false), 20000);
      return () => clearInterval(timer);
    }
  }, [activeTab, fetchSessions]);

  useEffect(() => {
    if (activeTab === 'report' || activeTab === 'breakdown') {
      fetchDailyReport(startDate, endDate);
    }
  }, [startDate, endDate, activeTab, fetchDailyReport]);

  useEffect(() => {
    let filtered = allSessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.user && s.user.toLowerCase().includes(q)) || 
        (s.email && s.email.toLowerCase().includes(q)) || 
        (s.deviceObj?.label && s.deviceObj.label.toLowerCase().includes(q)) ||
        (s.ip && s.ip.toLowerCase().includes(q))
      );
    }
    
    setFilteredActive(filtered.filter(s => s.isActive));
    setFilteredInactive(filtered.filter(s => !s.isActive));
  }, [searchQuery, allSessions]);

  const handleForceLogout = async (sessionId) => {
    if (!confirm('Are you sure you want to terminate this user session? The user will be instantly logged out.')) return;
    try {
      const res = await forceLogoutSession(sessionId);
      if (res?.success) {
        setAllSessions(prev => prev.filter(s => s.id !== sessionId));
      } else {
        alert(res?.error || 'Failed to logout session');
      }
    } catch (e) {
      alert(e.message || 'Error executing force logout');
    }
  };

  const handleForceLogoutAllOthers = async () => {
    if (!confirm('Are you sure you want to terminate all other active user sessions?')) return;
    try {
      const res = await forceLogoutAllOtherSessions();
      if (res?.success) {
        setAllSessions(prev => prev.filter(s => s.current));
      } else {
        alert(res?.error || 'Failed to logout all other sessions');
      }
    } catch (e) {
      alert(e.message || 'Error executing force logout');
    }
  };

  const handleForceLogoutAll = handleForceLogoutAllOthers;

  // Break Types Editor Handlers in Tab 3
  const handleUpdateBreakRule = (idx, field, value) => {
    const updated = [...(settings.breakRules || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    setSettings(prev => ({ ...prev, breakRules: updated }));
  };

  const handleDeleteBreakRule = (idx) => {
    if (!confirm('Are you sure you want to delete this break type?')) return;
    const updated = (settings.breakRules || []).filter((_, i) => i !== idx);
    setSettings(prev => ({ ...prev, breakRules: updated }));
  };

  const handleAddBreakRule = () => {
    if (!newBreakForm.label.trim()) {
      alert('Please enter a Break Name');
      return;
    }
    const newId = `custom_${Date.now()}`;
    const newRule = {
      id: newId,
      label: newBreakForm.label.trim(),
      icon: newBreakForm.icon || '☕',
      defaultMins: Math.max(1, Number(newBreakForm.defaultMins) || 15),
      maxPerDay: newBreakForm.maxPerDay !== undefined && newBreakForm.maxPerDay !== '' ? Number(newBreakForm.maxPerDay) : 2,
      enabled: true
    };
    setSettings(prev => ({
      ...prev,
      breakRules: [...(prev.breakRules || []), newRule]
    }));
    setNewBreakForm({ label: '', icon: '☕', defaultMins: 15, maxPerDay: 2 });
    setShowAddBreakModal(false);
  };

  // Save Settings Handler
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSuccessMsg(null);
    setError(null);

    let finalTimeout = settings.inactivityTimeoutMinutes;
    if (isCustomTimeout) {
      const parsedCustom = parseInt(customTimeoutInput, 10);
      if (isNaN(parsedCustom) || parsedCustom < 1) {
        setError('Please enter a valid custom timeout in minutes (minimum 1 minute).');
        setSavingSettings(false);
        return;
      }
      finalTimeout = parsedCustom;
    }

    const payload = {
      ...settings,
      inactivityTimeoutMinutes: finalTimeout
    };

    const res = await saveSessionSecuritySettings(payload);
    setSavingSettings(false);

    if (res?.success) {
      setSettings(res.settings);
      setSettingsSuccessMsg(`✅ Break rules & session settings saved! All agents will immediately see updated break options.`);
      window.dispatchEvent(new Event('session_config_updated'));
      setTimeout(() => setSettingsSuccessMsg(null), 5000);
    } else {
      setError(res?.error || 'Failed to save session settings');
    }
  };

  // Filtered Daily Employees
  const filteredDailyEmployees = useMemo(() => {
    return dailyEmployees.filter(emp => {
      if (reportFilterStatus === 'present' && !emp.hasActivityToday) return false;
      if (reportFilterStatus === 'absent' && emp.hasActivityToday) return false;
      if (reportFilterStatus === 'completed' && !emp.isTargetMet) return false;

      if (reportSearchQuery.trim()) {
        const q = reportSearchQuery.toLowerCase();
        const matchName = (emp.empName || '').toLowerCase().includes(q);
        const matchEmail = (emp.email || '').toLowerCase().includes(q);
        const matchDept = (emp.department || '').toLowerCase().includes(q);
        const matchDesig = (emp.designation || '').toLowerCase().includes(q);
        const matchEmpId = (emp.empId || '').toLowerCase().includes(q);
        return matchName || matchEmail || matchDept || matchDesig || matchEmpId;
      }
      return true;
    });
  }, [dailyEmployees, reportFilterStatus, reportSearchQuery]);

  // 📥 Export 9.0h Daily Report CSV Handler
  const handleExportCSV = () => {
    if (!filteredDailyEmployees || filteredDailyEmployees.length === 0) {
      alert('No employee shift activity records found to export for this date range.');
      return;
    }

    const dateRangeLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const dateFileLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;

    const headers = [
      'Report Period',
      'Employee ID',
      'Employee Name',
      'Department',
      'Designation',
      'Official Email',
      'Check-In Time (First Log)',
      'Last Active Time',
      'Total Shift Span (In to Last)',
      'Active Screen Work Time',
      'Lunch / Break Time',
      'Total Breaks Count',
      'Target Met',
      'Completion %',
      'Shift Evaluation Status'
    ];

    const rows = filteredDailyEmployees.map(emp => [
      `"${dateRangeLabel}"`,
      `"${emp.empId || ''}"`,
      `"${emp.empName || ''}"`,
      `"${emp.department || ''}"`,
      `"${emp.designation || ''}"`,
      `"${emp.email || ''}"`,
      `"${emp.firstSeenFormatted || ''}"`,
      `"${emp.lastSeenFormatted || ''}"`,
      `"${emp.shiftSpanFormatted || emp.totalDurationFormatted || ''}"`,
      `"${emp.activeDurationFormatted || ''}"`,
      `"${emp.idleDurationFormatted || ''}"`,
      `"${emp.breakCount || 0} Breaks"`,
      `"${emp.isTargetMet ? 'YES (Target Completed)' : 'NO'}"`,
      `"${emp.workProgressPercent || 0}%"`,
      `"${emp.isTargetMet ? 'Full Shift (Target Met)' : (emp.liveStatus === 'working' ? 'In Progress' : (emp.hasActivityToday ? 'Shortfall' : 'Not Logged In / Absent'))}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Swan_CRM_9Hour_Work_Report_${dateFileLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 📥 Export Breakdown CSV Handler
  const handleExportBreakdownCSV = () => {
    if (!dailyEmployees || dailyEmployees.length === 0) {
      alert('No employee activity data available to export.');
      return;
    }

    const dateRangeLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const dateFileLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;

    const breakRulesList = (settings.breakRules && settings.breakRules.length > 0)
      ? settings.breakRules.filter(b => b.enabled !== false)
      : [
          { id: 'tea', label: 'Tea / Coffee Break' },
          { id: 'lunch', label: 'Lunch Break' },
          { id: 'washroom', label: 'Washroom Break' },
          { id: 'water', label: 'Drinking Water' },
          { id: 'rest', label: 'Rest / Short Break' },
          { id: 'meeting', label: 'Meeting' },
          { id: 'smoking', label: 'Smoking' }
        ];

    const headers = [
      'Employee ID',
      'Employee Name',
      'Email',
      'Department',
      'Designation',
      'Period',
      'Total Breaks Count',
      'Total Break Duration',
      'Policy Adherence',
      ...breakRulesList.map(r => `${r.label} (Count)`),
      ...breakRulesList.map(r => `${r.label} (Duration)`)
    ];

    const formatSec = (sec) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m === 0) return `${s}s`;
      if (s === 0) return `${m}m`;
      return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    };

    const rows = dailyEmployees.map(emp => {
      const breaks = emp.breaks || [];
      const totalBreakSec = breaks.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
      
      const counts = breakRulesList.map(r => {
        return breaks.filter(b => isBreakMatchingRule(b, r)).length;
      });

      const durations = breakRulesList.map(r => {
        const sec = breaks.filter(b => isBreakMatchingRule(b, r)).reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
        return formatSec(sec);
      });

      return [
        `"${emp.empId || ''}"`,
        `"${emp.empName || ''}"`,
        `"${emp.email || ''}"`,
        `"${emp.department || 'Operations'}"`,
        `"${emp.designation || 'Staff'}"`,
        `"${dateRangeLabel}"`,
        breaks.length,
        `"${formatSec(totalBreakSec)}"`,
        breaks.length === 0 ? '"No Breaks Taken"' : '"Completed"',
        ...counts,
        ...durations.map(d => `"${d}"`)
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Swan_CRM_Break_Breakdown_${dateFileLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Breakdown Employees
  const filteredBreakdownEmployees = useMemo(() => {
    return dailyEmployees.filter(emp => {
      const breaks = emp.breaks || [];
      const hasBreaks = breaks.length > 0;
      
      // Check if any quota or limit exceeded
      let isOverQuota = false;
      const activeRules = (settings.breakRules && settings.breakRules.length > 0)
        ? settings.breakRules
        : [
            { id: 'tea', label: 'Tea / Coffee Break', maxPerDay: 2 },
            { id: 'lunch', label: 'Lunch Break', maxPerDay: 1 },
            { id: 'washroom', label: 'Washroom Break', maxPerDay: 4 },
            { id: 'water', label: 'Drinking Water', maxPerDay: 4 },
            { id: 'rest', label: 'Rest / Short Break', maxPerDay: 1 },
            { id: 'custom_1787827858042', label: 'Breakfast', maxPerDay: 1 },
            { id: 'custom_1787827866658', label: 'Snacks', maxPerDay: 2 }
          ];

      activeRules.forEach(rule => {
        const maxLimit = rule.maxPerDay !== undefined ? Number(rule.maxPerDay) : 2;
        const count = breaks.filter(b => isBreakMatchingRule(b, rule)).length;
        if (maxLimit > 0 && count > maxLimit) {
          isOverQuota = true;
        }
      });

      if ((breakdownFilter === 'with_breaks' || breakdownFilter === 'took_breaks') && !hasBreaks) return false;
      if ((breakdownFilter === 'over_quota' || breakdownFilter === 'violations') && !isOverQuota) return false;

      if (breakdownSearchQuery.trim()) {
        const q = breakdownSearchQuery.toLowerCase();
        const matchName = (emp.empName || '').toLowerCase().includes(q);
        const matchEmail = (emp.email || '').toLowerCase().includes(q);
        const matchDept = (emp.department || '').toLowerCase().includes(q);
        const matchDesig = (emp.designation || '').toLowerCase().includes(q);
        const matchEmpId = (emp.empId || '').toLowerCase().includes(q);
        return matchName || matchEmail || matchDept || matchDesig || matchEmpId;
      }
      return true;
    });
  }, [dailyEmployees, breakdownFilter, breakdownSearchQuery, settings.breakRules]);

  // Breakdown KPIs
  const totalCompanyBreaksCount = useMemo(() => {
    return dailyEmployees.reduce((acc, e) => acc + (e.breaks?.length || 0), 0);
  }, [dailyEmployees]);

  const totalCompanyBreakDurationSec = useMemo(() => {
    return dailyEmployees.reduce((acc, e) => {
      const sum = (e.breaks || []).reduce((bAcc, b) => bAcc + (b.durationSeconds || 0), 0);
      return acc + sum;
    }, 0);
  }, [dailyEmployees]);

  const employeesWithBreaksCount = useMemo(() => {
    return dailyEmployees.filter(e => (e.breaks?.length || 0) > 0).length;
  }, [dailyEmployees]);

  const totalCompanyViolationsCount = useMemo(() => {
    let violations = 0;
    const activeRules = (settings.breakRules && settings.breakRules.length > 0)
      ? settings.breakRules
      : [
          { id: 'tea', label: 'Tea / Coffee Break', maxPerDay: 2 },
          { id: 'lunch', label: 'Lunch Break', maxPerDay: 1 },
          { id: 'washroom', label: 'Washroom Break', maxPerDay: 4 },
          { id: 'water', label: 'Drinking Water', maxPerDay: 4 },
          { id: 'rest', label: 'Rest / Short Break', maxPerDay: 1 },
          { id: 'custom_1787827858042', label: 'Breakfast', maxPerDay: 1 },
          { id: 'custom_1787827866658', label: 'Snacks', maxPerDay: 2 }
        ];

    dailyEmployees.forEach(e => {
      const breaks = e.breaks || [];
      activeRules.forEach(rule => {
        const maxLimit = rule.maxPerDay !== undefined ? Number(rule.maxPerDay) : 2;
        const count = breaks.filter(b => isBreakMatchingRule(b, rule)).length;
        if (maxLimit > 0 && count > maxLimit) violations++;
      });
    });
    return violations;
  }, [dailyEmployees, settings.breakRules]);

  // Report KPIs
  const totalRosterCount = dailyEmployees.length;
  const presentCount = dailyEmployees.filter(e => e.hasActivityToday).length;
  const absentCount = totalRosterCount - presentCount;
  const targetCompletedCount = dailyEmployees.filter(e => e.isTargetMet).length;

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxSizing: 'border-box' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem' }}>
            <Monitor size={24} color="var(--accent-color)" />
            Employee Shift Monitoring & Inactivity Rules
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            9-Hour (540 mins) Active Working Goal + Custom Breaks & Inactivity Policy Manager.
          </p>
        </div>

        <button
          onClick={() => {
            fetchSessions(true);
            fetchDailyReport(startDate, endDate);
          }}
          disabled={refreshing || loading || reportLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.85rem',
            color: 'var(--text-primary)'
          }}
        >
          <RefreshCw size={15} style={{ animation: (refreshing || reportLoading) ? 'spin 1s linear infinite' : 'none' }} />
          {(refreshing || reportLoading) ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {settingsSuccessMsg && (
        <div style={{ padding: '1rem', background: '#dcfce7', color: '#166534', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{settingsSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3-TAB SWITCHER NAVIGATION */}
      {/* ========================================================================= */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '0.5rem',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={() => handleTabChange('report')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor: activeTab === 'report' ? 'var(--accent-color)' : 'var(--bg-surface)',
            color: activeTab === 'report' ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: activeTab === 'report' ? '0 2px 5px rgba(67, 56, 202, 0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <Briefcase size={16} />
          <span>Daily 9.5h Work Report</span>
          <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '10px', backgroundColor: activeTab === 'report' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeTab === 'report' ? '#fff' : '#475569' }}>
            {totalRosterCount} Employees
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('breakdown')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor: activeTab === 'breakdown' ? '#ea580c' : 'var(--bg-surface)',
            color: activeTab === 'breakdown' ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: activeTab === 'breakdown' ? '0 2px 5px rgba(234, 88, 12, 0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <Coffee size={16} />
          <span>Breakdown</span>
          <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '10px', backgroundColor: activeTab === 'breakdown' ? 'rgba(255,255,255,0.25)' : '#fed7aa', color: activeTab === 'breakdown' ? '#fff' : '#c2410c', fontWeight: 700 }}>
            {totalCompanyBreaksCount} Breaks Today
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('live')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor: activeTab === 'live' ? 'var(--accent-color)' : 'var(--bg-surface)',
            color: activeTab === 'live' ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: activeTab === 'live' ? '0 2px 5px rgba(67, 56, 202, 0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
          <span>Live Active Sessions ({filteredActive.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('inactivity')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor: activeTab === 'inactivity' ? 'var(--accent-color)' : 'var(--bg-surface)',
            color: activeTab === 'inactivity' ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: activeTab === 'inactivity' ? '0 2px 5px rgba(67, 56, 202, 0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <Sliders size={16} />
          <span>Inactivity Rules</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('breaks')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor: activeTab === 'breaks' ? '#ea580c' : 'var(--bg-surface)',
            color: activeTab === 'breaks' ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: activeTab === 'breaks' ? '0 2px 5px rgba(234, 88, 12, 0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <Coffee size={16} />
          <span>Custom Break Rules</span>
          <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '10px', backgroundColor: activeTab === 'breaks' ? 'rgba(255,255,255,0.25)' : '#fed7aa', color: activeTab === 'breaks' ? '#fff' : '#c2410c', fontWeight: 700 }}>
            {(settings.breakRules || []).length} Rules
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY 9.5-HOUR SHIFT WORK REPORT & EXCEL EXPORT */}
      {/* ========================================================================= */}
      {activeTab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Shift Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
            color: '#ffffff',
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 10px 15px -3px rgba(67, 56, 202, 0.3)'
          }}>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '0.2rem' }}>
                Office Working Shift Standard
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span>💼 9.0 Hours (540 Mins) Active Work</span>
                <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>+</span>
                <span>🍱 30 Mins Lunch Break</span>
              </h3>
              <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.35rem' }}>
                Total Shift Duration: <b>9 Hours 30 Minutes (570 Mins)</b>
              </div>
            </div>

            {/* Date Selector & Export Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <DateRangePicker
                variant="glass"
                preset={datePreset}
                startDate={startDate}
                endDate={endDate}
                title="Select Shift Report Period"
                onChange={({ preset, startDate, endDate }) => {
                  setDatePreset(preset);
                  setStartDate(startDate);
                  setEndDate(endDate);
                }}
              />

              <button
                type="button"
                onClick={handleExportCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.9rem',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Download size={15} />
                <span>Export Excel / CSV</span>
              </button>
            </div>
          </div>

          {/* Daily KPIs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Company Roster</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                {totalRosterCount} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Employees</span>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>Present / Active Today</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.35rem' }}>
                {presentCount} <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#16a34a' }}>({Math.round((presentCount / (totalRosterCount || 1)) * 100)}%)</span>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: '#4338ca', fontWeight: 600 }}>9-Hour Goal Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4338ca', marginTop: '0.35rem' }}>
                {targetCompletedCount}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>Not Logged In / Absent</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.35rem' }}>
                {absentCount}
              </div>
            </div>
          </div>

          {/* Search & Status Filter Toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            {/* Status Filter Pills */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setReportFilterStatus('all')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: reportFilterStatus === 'all' ? 'var(--accent-color)' : 'var(--bg-primary)',
                  color: reportFilterStatus === 'all' ? '#ffffff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                All ({totalRosterCount})
              </button>

              <button
                type="button"
                onClick={() => setReportFilterStatus('present')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid #bbf7d0',
                  backgroundColor: reportFilterStatus === 'present' ? '#16a34a' : 'rgba(22, 163, 74, 0.08)',
                  color: reportFilterStatus === 'present' ? '#ffffff' : '#15803d',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Present Today ({presentCount})
              </button>

              <button
                type="button"
                onClick={() => setReportFilterStatus('completed')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid #c7d2fe',
                  backgroundColor: reportFilterStatus === 'completed' ? '#4338ca' : 'rgba(67, 56, 202, 0.08)',
                  color: reportFilterStatus === 'completed' ? '#ffffff' : '#4338ca',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                9h Met ({targetCompletedCount})
              </button>

              <button
                type="button"
                onClick={() => setReportFilterStatus('absent')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid #fecaca',
                  backgroundColor: reportFilterStatus === 'absent' ? '#dc2626' : 'rgba(220, 38, 38, 0.08)',
                  color: reportFilterStatus === 'absent' ? '#ffffff' : '#b91c1c',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Not Logged In ({absentCount})
              </button>
            </div>

            {/* Quick Search */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-primary)',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              width: '320px'
            }}>
              <Search size={15} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Search name, department, ID..."
                value={reportSearchQuery}
                onChange={(e) => setReportSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', width: '100%', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Detailed Employee 9-Hour Shift Table */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Company Employee Shift & Productivity Breakdown ({filteredDailyEmployees.length})
            </h3>

            {reportLoading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                ⏳ Loading shift work records for {startDate === endDate ? startDate : `${startDate} to ${endDate}`}...
              </div>
            ) : filteredDailyEmployees.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                No employee matched the filter criteria for {startDate === endDate ? startDate : `${startDate} to ${endDate}`}.
              </div>
            ) : (
              <div style={{ maxHeight: '520px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--th-bg)' }}>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee Details</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Check-In & Last Seen (Total Shift)</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>🖥️ Active Screen Work</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>🟡 Away / Idle Time</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>☕ Lunch & Breaks</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, minWidth: '160px' }}>9h Goal Progress</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Shift Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyEmployees.map((emp, i) => {
                      const isComplete = emp.isTargetMet;
                      const pct = emp.workProgressPercent || 0;
                      const hasBreaks = emp.breaks && emp.breaks.length > 0;
                      const isOnBreak = emp.currentBreak || emp.liveStatus === 'on_break';
                      
                      return (
                        <tr 
                          key={emp.userId || emp.email || i} 
                          style={{ 
                            borderBottom: i < dailyEmployees.length - 1 ? '1px solid var(--border-light)' : 'none', 
                            background: isComplete ? 'rgba(16, 185, 129, 0.04)' : (emp.hasActivityToday ? 'var(--bg-surface)' : 'rgba(0,0,0,0.015)')
                          }}
                        >
                          {/* Name, ID, Department */}
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{emp.empName}</span>
                              {emp.empId && (
                                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '4px', fontWeight: 600 }}>
                                  {emp.empId}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                              {emp.department || emp.designation ? `${emp.department} ${emp.designation ? '• ' + emp.designation : ''}` : emp.email}
                            </div>
                          </td>

                          {/* Check-In & Last Seen + Total Shift Span */}
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {emp.hasActivityToday ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <span>In: <b style={{ color: '#16a34a', fontWeight: 700 }}>{emp.firstSeenFormatted}</b></span>
                                  <span>•</span>
                                  <span>Last: <b style={{ color: 'var(--text-primary)' }}>{emp.lastSeenFormatted}</b></span>
                                </div>
                                <div style={{ marginTop: '0.2rem' }}>
                                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: '6px', fontWeight: 600, border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>⏱️ Shift Span:</span>
                                    <b>{emp.shiftSpanFormatted || emp.totalDurationFormatted}</b>
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not Logged In</span>
                            )}
                          </td>

                          {/* Active Screen Work Time */}
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ color: isComplete ? '#15803d' : (emp.hasActivityToday ? '#4338ca' : '#94a3b8'), fontWeight: 800, fontFamily: 'monospace', fontSize: '0.95rem' }}>
                              {emp.activeDurationFormatted}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600, marginTop: '0.1rem' }}>Active on Screen</div>
                          </td>

                          {/* Idle / Away Time */}
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ color: '#64748b', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {emp.idleDurationFormatted || '0m 00s'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.1rem' }}>Screen Inactive</div>
                          </td>

                          {/* Lunch / Breaks Timeline Button */}
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {isOnBreak ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem', backgroundColor: '#fff7ed', border: '1px solid #fdba74', color: '#c2410c', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, animation: 'pulse 1.5s infinite' }}>
                                <span>{emp.currentBreak?.icon || '☕'}</span>
                                <span>On {emp.currentBreak?.type || 'Break'}</span>
                              </div>
                            ) : (
                              <div>
                                <div style={{ color: emp.lunchTakenMinutes > 30 ? '#d97706' : (emp.hasActivityToday ? '#0f172a' : '#94a3b8'), fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                  {emp.breakDurationFormatted || (emp.breaks?.length > 0 ? emp.idleDurationFormatted : '0m 00s')}
                                </div>
                                {hasBreaks ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedEmployeeBreaks({ empName: emp.empName, email: emp.email, breaks: emp.breaks })}
                                    style={{
                                      marginTop: '0.2rem',
                                      padding: '0.15rem 0.45rem',
                                      backgroundColor: '#fff7ed',
                                      border: '1px solid #fed7aa',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      color: '#c2410c',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem'
                                    }}
                                  >
                                    <Coffee size={11} color="#ea580c" />
                                    <span>{emp.breakCount} Breaks (View)</span>
                                  </button>
                                ) : (
                                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                                    No Breaks
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Progress Bar */}
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                              <span style={{ color: isComplete ? '#16a34a' : (emp.hasActivityToday ? 'var(--text-primary)' : '#94a3b8') }}>{pct}% Complete</span>
                              {isComplete && <Check size={13} color="#16a34a" />}
                            </div>
                            <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${pct}%`, 
                                  height: '100%', 
                                  backgroundColor: isComplete ? '#16a34a' : (pct > 50 ? '#4338ca' : '#f59e0b'),
                                  borderRadius: '6px',
                                  transition: 'width 0.3s'
                                }} 
                              />
                            </div>
                          </td>

                          {/* Shift Evaluation Status */}
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            {isComplete ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.76rem', border: '1px solid #bbf7d0' }}>
                                <Award size={13} /> Full Day (9h Met)
                              </span>
                            ) : isOnBreak ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.76rem', border: '1px solid #fdba74' }}>
                                {emp.currentBreak?.icon || '☕'} On {emp.currentBreak?.type || 'Break'}
                              </span>
                            ) : emp.liveStatus === 'working' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#e0e7ff', color: '#3730a3', fontWeight: 600, fontSize: '0.76rem' }}>
                                🟢 In Progress
                              </span>
                            ) : emp.liveStatus === 'away' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: '0.76rem' }}>
                                🟡 Away / Idle
                              </span>
                            ) : emp.hasActivityToday ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#ffedd5', color: '#c2410c', fontWeight: 600, fontSize: '0.76rem' }}>
                                🟠 Shortfall (&lt;9h)
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: '#f1f5f9', color: '#64748b', fontWeight: 500, fontSize: '0.76rem' }}>
                                🔴 Not Logged In
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: BREAK USAGE BREAKDOWN MATRIX */}
      {/* ========================================================================= */}
      {activeTab === 'breakdown' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)',
            color: '#ffffff',
            padding: '1.25rem 1.5rem',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 10px 15px -3px rgba(234, 88, 12, 0.3)'
          }}>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.85, marginBottom: '0.2rem' }}>
                Employee Shift & Break Analytics
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span>📊 Employee Break Usage & Quota Breakdown</span>
              </h3>
              <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.35rem' }}>
                Exact frequency count vs daily quota, time spent on each break type, and policy adherence for <b>{startDate === endDate ? startDate : `${startDate} to ${endDate}`}</b>.
              </div>
            </div>

            {/* Date Selector & Export Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <DateRangePicker
                variant="glass"
                preset={datePreset}
                startDate={startDate}
                endDate={endDate}
                title="Select Break Breakdown Period"
                onChange={({ preset, startDate, endDate }) => {
                  setDatePreset(preset);
                  setStartDate(startDate);
                  setEndDate(endDate);
                }}
              />

              <button
                type="button"
                onClick={handleExportBreakdownCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.9rem',
                  backgroundColor: '#ffffff',
                  color: '#c2410c',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)'
                }}
              >
                <Download size={15} />
                <span>Export Breakdown CSV</span>
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Company Breaks</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ea580c', marginTop: '0.35rem' }}>
                {totalCompanyBreaksCount} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Events</span>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Break Time Taken</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                {Math.floor(totalCompanyBreakDurationSec / 3600) > 0 ? `${Math.floor(totalCompanyBreakDurationSec / 3600)}h ` : ''}
                {Math.floor((totalCompanyBreakDurationSec % 3600) / 60)}m
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>Employees Who Took Breaks</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.35rem' }}>
                {employeesWithBreaksCount} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {totalRosterCount}</span>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '0.8rem', color: totalCompanyViolationsCount > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>Over-Quota / Violations</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalCompanyViolationsCount > 0 ? '#dc2626' : '#16a34a', marginTop: '0.35rem' }}>
                {totalCompanyViolationsCount === 0 ? '0 (100% Compliant)' : `${totalCompanyViolationsCount} Flags`}
              </div>
            </div>
          </div>

          {/* Search and Filters Toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            {/* Filter Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setBreakdownFilter('all')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: breakdownFilter === 'all' ? '#ea580c' : 'var(--bg-primary)',
                  color: breakdownFilter === 'all' ? '#ffffff' : 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                All Employees ({totalRosterCount})
              </button>

              <button
                type="button"
                onClick={() => setBreakdownFilter('took_breaks')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid #fed7aa',
                  backgroundColor: breakdownFilter === 'took_breaks' ? '#ea580c' : 'rgba(234, 88, 12, 0.08)',
                  color: breakdownFilter === 'took_breaks' ? '#ffffff' : '#c2410c',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Took Breaks ({employeesWithBreaksCount})
              </button>

              <button
                type="button"
                onClick={() => setBreakdownFilter('violations')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  border: '1px solid #fecaca',
                  backgroundColor: breakdownFilter === 'violations' ? '#dc2626' : 'rgba(220, 38, 38, 0.08)',
                  color: breakdownFilter === 'violations' ? '#ffffff' : '#b91c1c',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                ⚠️ Over Quota ({totalCompanyViolationsCount})
              </button>
            </div>

            {/* Quick Search */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-primary)',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              width: '320px'
            }}>
              <Search size={15} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="Search name, email, department..."
                value={breakdownSearchQuery}
                onChange={(e) => setBreakdownSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', width: '100%', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Breakdown Table */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            {reportLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
                <div>Loading break usage breakdown...</div>
              </div>
            ) : filteredBreakdownEmployees.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No employee break data matches the selected filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)' }}>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)' }}>Employee</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Total Breaks</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Total Break Time</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)' }}>Break Types & Quota Usage</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>Policy Status</th>
                      <th style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBreakdownEmployees.map((emp, empIdx) => {
                      const breaks = emp.breaks || [];
                      const totalBreakSec = breaks.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
                      const breakRulesList = (settings.breakRules && settings.breakRules.length > 0)
                        ? settings.breakRules.filter(b => b.enabled !== false)
                        : [];

                      // Calculate violations
                      let employeeViolations = 0;
                      breakRulesList.forEach(rule => {
                        const maxLimit = rule.maxPerDay !== undefined ? Number(rule.maxPerDay) : 2;
                        const count = breaks.filter(b => isBreakMatchingRule(b, rule)).length;
                        if (maxLimit > 0 && count > maxLimit) employeeViolations++;
                      });

                      const formatSecClean = (sec) => {
                        const m = Math.floor(sec / 60);
                        const s = sec % 60;
                        if (m === 0) return `${s}s`;
                        if (s === 0) return `${m}m`;
                        return `${m}m ${s < 10 ? '0' : ''}${s}s`;
                      };

                      return (
                        <tr 
                          key={emp.id || emp.email || empIdx}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            backgroundColor: empIdx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary)'
                          }}
                        >
                          {/* Employee Info */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: '#ea580c',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.85rem'
                              }}>
                                {(emp.empName || 'U')[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                  {emp.empName}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {emp.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Total Breaks Count */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '0.25rem 0.65rem',
                              borderRadius: '12px',
                              backgroundColor: breaks.length > 0 ? '#fff7ed' : '#f1f5f9',
                              color: breaks.length > 0 ? '#ea580c' : '#64748b',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              border: `1px solid ${breaks.length > 0 ? '#fed7aa' : '#e2e8f0'}`
                            }}>
                              {breaks.length} {breaks.length === 1 ? 'Break' : 'Breaks'}
                            </span>
                          </td>

                          {/* Total Break Duration */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800, color: '#ea580c', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                            {breaks.length > 0 ? formatSecClean(totalBreakSec) : '0m'}
                          </td>

                          {/* Break Types Breakdown Badges */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {breaks.length === 0 ? (
                              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                No breaks taken today
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {breakRulesList.map(rule => {
                                  const matchingBreaks = breaks.filter(b => isBreakMatchingRule(b, rule));
                                  const count = matchingBreaks.length;
                                  if (count === 0) return null;

                                  const durationSec = matchingBreaks.reduce((sum, b) => sum + (b.durationSeconds || 0), 0);
                                  const maxQuota = rule.maxPerDay !== undefined ? Number(rule.maxPerDay) : 2;
                                  const isOver = maxQuota > 0 && count > maxQuota;

                                  return (
                                    <div
                                      key={rule.id}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        padding: '0.25rem 0.55rem',
                                        borderRadius: '8px',
                                        backgroundColor: isOver ? '#fee2e2' : '#f8fafc',
                                        border: `1px solid ${isOver ? '#fca5a5' : '#e2e8f0'}`,
                                        fontSize: '0.78rem'
                                      }}
                                    >
                                      <span>{rule.icon || '☕'}</span>
                                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{rule.label}:</span>
                                      <span style={{ color: isOver ? '#dc2626' : '#166534', fontWeight: 800 }}>
                                        {count}{maxQuota > 0 ? `/${maxQuota}` : ''}
                                      </span>
                                      <span style={{ color: '#64748b', fontSize: '0.72rem' }}>
                                        ({formatSecClean(durationSec)})
                                      </span>
                                      {isOver && (
                                        <span style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.7rem' }}>
                                          ⚠️ Over Quota
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Compliance Status */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            {breaks.length === 0 ? (
                              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                                No Breaks
                              </span>
                            ) : employeeViolations > 0 ? (
                              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #fca5a5' }}>
                                ⚠️ {employeeViolations} Over Quota
                              </span>
                            ) : (
                              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                                ✅ Within Quota
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedEmployeeBreaks(emp)}
                              style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #fed7aa',
                                backgroundColor: '#fff7ed',
                                color: '#ea580c',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                            >
                              <span>View Timeline</span>
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BREAK DETAILS MODAL FOR SELECTED EMPLOYEE (RICH TIMELINE DASHBOARD) */}
      {/* ========================================================================= */}
      {selectedEmployeeBreaks && (() => {
        const breaksList = selectedEmployeeBreaks.breaks || [];
        const breakRulesList = (settings?.breakRules && settings.breakRules.length > 0)
          ? settings.breakRules.filter(b => b.enabled !== false)
          : [];

        let totalUsedSec = 0;
        let totalAllowedSec = 0;
        let exceededCount = 0;
        let totalExcessSec = 0;

        breaksList.forEach(b => {
          const used = b.durationSeconds || 0;
          totalUsedSec += used;
          
          const rule = breakRulesList.find(r => isBreakMatchingRule(b, r));
          const allowedMins = rule?.defaultMins || (
            b.type?.toLowerCase().includes('lunch') ? 30 :
            b.type?.toLowerCase().includes('washroom') ? 5 :
            b.type?.toLowerCase().includes('water') ? 3 :
            b.type?.toLowerCase().includes('smoking') ? 8 :
            b.type?.toLowerCase().includes('meeting') ? 60 : 5
          );
          const allowedSec = allowedMins * 60;
          totalAllowedSec += allowedSec;

          if (used > allowedSec) {
            exceededCount++;
            totalExcessSec += (used - allowedSec);
          }
        });

        // Category usage summary
        const categorySummary = breakRulesList.map(rule => {
          const matching = breaksList.filter(b => isBreakMatchingRule(b, rule));
          const count = matching.length;
          const durSec = matching.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
          const maxQuota = rule.maxPerDay !== undefined ? Number(rule.maxPerDay) : 2;
          const isOver = maxQuota > 0 && count > maxQuota;
          return {
            rule,
            count,
            durSec,
            maxQuota,
            isOver
          };
        }).filter(c => c.count > 0);

        const totalViolations = categorySummary.filter(c => c.isOver).length;

        const formatSecDisplay = (sec) => {
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          if (m === 0) return `${s}s`;
          if (s === 0) return `${m}m`;
          return `${m}m ${s < 10 ? '0' : ''}${s}s`;
        };

        const activeSec = selectedEmployeeBreaks.activeSeconds || 0;
        const totalShiftSec = (selectedEmployeeBreaks.shiftSpanSeconds || (activeSec + totalUsedSec)) || 1;
        const breakPercentage = Math.min(100, Math.round((totalUsedSec / totalShiftSec) * 100));
        const activePercentage = Math.max(0, 100 - breakPercentage);

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            boxSizing: 'border-box'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '960px',
              width: '100%',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              {/* 1. Header & Employee Profile Banner (Compact) */}
              <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                color: '#ffffff',
                padding: '0.9rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.15rem',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                    border: '2px solid rgba(255, 255, 255, 0.2)'
                  }}>
                    {(selectedEmployeeBreaks.empName || 'U')[0].toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        {selectedEmployeeBreaks.empName}
                      </h3>
                      {selectedEmployeeBreaks.empId && (
                        <span style={{
                          padding: '0.1rem 0.45rem',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.15)',
                          color: '#f8fafc',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          fontFamily: 'monospace'
                        }}>
                          ID: {selectedEmployeeBreaks.empId}
                        </span>
                      )}
                      <span style={{
                        padding: '0.1rem 0.5rem',
                        borderRadius: '6px',
                        backgroundColor: selectedEmployeeBreaks.liveStatus === 'working' ? 'rgba(34, 197, 94, 0.2)' : selectedEmployeeBreaks.liveStatus === 'on_break' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                        color: selectedEmployeeBreaks.liveStatus === 'working' ? '#4ade80' : selectedEmployeeBreaks.liveStatus === 'on_break' ? '#fb923c' : '#cbd5e1',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        border: `1px solid ${selectedEmployeeBreaks.liveStatus === 'working' ? 'rgba(34, 197, 94, 0.4)' : selectedEmployeeBreaks.liveStatus === 'on_break' ? 'rgba(249, 115, 22, 0.4)' : 'rgba(148, 163, 184, 0.3)'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: selectedEmployeeBreaks.liveStatus === 'working' ? '#4ade80' : selectedEmployeeBreaks.liveStatus === 'on_break' ? '#fb923c' : '#94a3b8' }} />
                        {selectedEmployeeBreaks.liveStatus === 'working' ? 'Active Now' : selectedEmployeeBreaks.liveStatus === 'on_break' ? 'On Break' : 'Offline'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem', fontSize: '0.75rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                      <span>📧 {selectedEmployeeBreaks.email}</span>
                      {selectedEmployeeBreaks.department && <span>🏢 {selectedEmployeeBreaks.department}</span>}
                      {selectedEmployeeBreaks.designation && <span>💼 {selectedEmployeeBreaks.designation}</span>}
                      <span>📅 Period: <b style={{ color: '#f1f5f9' }}>{startDate === endDate ? startDate : `${startDate} to ${endDate}`}</b></span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {selectedEmployeeBreaks.firstSeenFormatted && selectedEmployeeBreaks.firstSeenFormatted !== '--:--' && (
                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', textAlign: 'right' }}>
                      <div>First In: <b style={{ color: '#ffffff' }}>{selectedEmployeeBreaks.firstSeenFormatted}</b></div>
                      {selectedEmployeeBreaks.lastSeenFormatted && selectedEmployeeBreaks.lastSeenFormatted !== '--:--' && (
                        <div>Last Active: <b style={{ color: '#ffffff' }}>{selectedEmployeeBreaks.lastSeenFormatted}</b></div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeBreaks(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '0.4rem',
                      cursor: 'pointer',
                      color: '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = '#e2e8f0';
                    }}
                    title="Close Modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* 2. Compact 4 KPI Stats Row */}
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '0.65rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.65rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                  <span style={{ fontSize: '1.3rem' }}>☕</span>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>Total Breaks</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#c2410c' }}>
                      {breaksList.length} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>({categorySummary.length} types)</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <Clock size={20} color="#2563eb" />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Break Duration</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace' }}>
                      {formatSecDisplay(totalUsedSec)} <span style={{ fontSize: '0.72rem', color: '#64748b' }}>/ {formatSecDisplay(totalAllowedSec)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.65rem', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                  <Activity size={20} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Shift Active Ratio</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#15803d' }}>
                      {activePercentage}% <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.65rem', backgroundColor: totalViolations === 0 ? '#ffffff' : '#fff5f5', borderRadius: '10px', border: `1px solid ${totalViolations === 0 ? '#86efac' : '#fca5a5'}` }}>
                  {totalViolations === 0 ? <CheckCircle2 size={20} color="#16a34a" /> : <AlertTriangle size={20} color="#dc2626" />}
                  <div>
                    <div style={{ fontSize: '0.68rem', color: totalViolations === 0 ? '#166534' : '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>Policy Status</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: totalViolations === 0 ? '#15803d' : '#dc2626' }}>
                      {totalViolations === 0 ? 'Within Quota' : `${totalViolations} Over Quota`}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Category Quota Chips (Inline Ribbon) */}
              {categorySummary.length > 0 && (
                <div style={{
                  backgroundColor: '#ffffff',
                  padding: '0.45rem 1.25rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginRight: '0.2rem' }}>Categories:</span>
                  {categorySummary.map(cat => (
                    <div
                      key={cat.rule.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '8px',
                        backgroundColor: cat.isOver ? '#fee2e2' : '#f8fafc',
                        border: `1px solid ${cat.isOver ? '#fca5a5' : '#cbd5e1'}`,
                        fontSize: '0.74rem'
                      }}
                    >
                      <span>{cat.rule.icon || '☕'}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{cat.rule.label}:</span>
                      <span style={{
                        padding: '0.05rem 0.35rem',
                        borderRadius: '4px',
                        backgroundColor: cat.isOver ? '#dc2626' : '#16a34a',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.7rem'
                      }}>
                        {cat.count}{cat.maxQuota > 0 ? `/${cat.maxQuota}` : ''}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                        ({formatSecDisplay(cat.durSec)})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Large Scrollable Table Area with Frozen Sticky Headers */}
              <div style={{ flex: 1, minHeight: '380px', maxHeight: '62vh', overflowY: 'auto', position: 'relative' }}>
                {breaksList.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    <Coffee size={36} style={{ margin: '0 auto 0.5rem auto', color: '#cbd5e1' }} />
                    <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.95rem' }}>No Breaks Recorded Today</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                      This employee has maintained active working status without logging break intervals.
                    </div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.83rem', textAlign: 'left' }}>
                    {/* Sticky Freeze Table Header */}
                    <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                      <tr style={{
                        backgroundColor: '#f1f5f9',
                        color: '#1e293b',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                      }}>
                        <th style={{ padding: '0.7rem 0.85rem', width: '45px', textAlign: 'center', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>#</th>
                        <th style={{ padding: '0.7rem 0.85rem', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>Break Type</th>
                        <th style={{ padding: '0.7rem 0.85rem', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>Time Window (IST)</th>
                        <th style={{ padding: '0.7rem 0.85rem', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>Prior Work Interval</th>
                        <th style={{ padding: '0.7rem 0.85rem', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>Duration vs Policy</th>
                        <th style={{ padding: '0.7rem 0.85rem', textAlign: 'right', fontWeight: 800, borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>Policy Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaksList.map((b, idx) => {
                        const used = b.durationSeconds || 0;
                        const rule = breakRulesList.find(r => isBreakMatchingRule(b, r));
                        const allowedMins = rule?.defaultMins || (
                          b.type?.toLowerCase().includes('lunch') ? 30 :
                          b.type?.toLowerCase().includes('washroom') ? 5 :
                          b.type?.toLowerCase().includes('water') ? 3 :
                          b.type?.toLowerCase().includes('smoking') ? 8 :
                          b.type?.toLowerCase().includes('meeting') ? 60 : 5
                        );
                        const allowedSec = allowedMins * 60;
                        const isOver = used > allowedSec;
                        const diffSec = Math.abs(used - allowedSec);
                        const percentUsed = Math.min(100, Math.round((used / allowedSec) * 100));

                        // Calculate working gap between breaks
                        const prevBreak = idx > 0 ? breaksList[idx - 1] : null;
                        let workIntervalFormatted = null;
                        if (prevBreak && prevBreak.endTime && b.startTime) {
                          const gapSec = Math.max(0, Math.round((new Date(b.startTime).getTime() - new Date(prevBreak.endTime).getTime()) / 1000));
                          if (gapSec >= 60) {
                            const gh = Math.floor(gapSec / 3600);
                            const gm = Math.floor((gapSec % 3600) / 60);
                            workIntervalFormatted = gh > 0 ? `${gh}h ${String(gm).padStart(2, '0')}m` : `${gm}m`;
                          }
                        }

                        return (
                          <tr
                            key={b.id || idx}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: isOver ? '#fffbfb' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                              transition: 'background-color 0.15s'
                            }}
                          >
                            {/* Column 1: # Step Badge */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: isOver ? '#fee2e2' : '#ffedd5',
                                color: isOver ? '#dc2626' : '#c2410c',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                border: `1px solid ${isOver ? '#fca5a5' : '#fed7aa'}`
                              }}>
                                {idx + 1}
                              </span>
                            </td>

                            {/* Column 2: Break Type + Icon */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '1.25rem' }}>{b.icon || '☕'}</span>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.86rem' }}>
                                    {b.type}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Break #{idx + 1}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Column 3: Time Window */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#334155', fontSize: '0.82rem', fontWeight: 600 }}>
                                <Clock size={13} color="#64748b" />
                                <span>{b.startTimeFormatted}</span>
                                <span style={{ color: '#cbd5e1' }}>➔</span>
                                <span>{b.endTimeFormatted || 'In Progress'}</span>
                              </div>
                            </td>

                            {/* Column 4: Prior Work Interval */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              {workIntervalFormatted ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#f1f5f9',
                                  color: '#475569',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  border: '1px solid #e2e8f0'
                                }}>
                                  <Briefcase size={12} color="#64748b" />
                                  <span>Worked <b>{workIntervalFormatted}</b></span>
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                  {idx === 0 ? '🏁 Shift In-Time' : '--'}
                                </span>
                              )}
                            </td>

                            {/* Column 5: Duration vs Allowed with Micro Bar */}
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '130px' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                  <span style={{
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    color: isOver ? '#dc2626' : '#0f172a',
                                    fontFamily: 'monospace'
                                  }}>
                                    {formatSecDisplay(used)}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    (Allowed: {allowedMins}m)
                                  </span>
                                </div>

                                {/* Progress track */}
                                <div style={{ width: '100%', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${Math.min(100, percentUsed)}%`,
                                    height: '100%',
                                    backgroundColor: isOver ? '#dc2626' : '#16a34a',
                                    borderRadius: '3px'
                                  }} />
                                </div>
                              </div>
                            </td>

                            {/* Column 6: Policy Status Badge */}
                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                              {isOver ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  border: '1px solid #fca5a5'
                                }}>
                                  <AlertTriangle size={12} />
                                  <span>Exceeded +{formatSecDisplay(diffSec)}</span>
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  backgroundColor: '#dcfce7',
                                  color: '#166534',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  border: '1px solid #bbf7d0'
                                }}>
                                  <Check size={12} />
                                  <span>Within Policy ({formatSecDisplay(diffSec)} left)</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 5. Modal Footer */}
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}>
                <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Info size={14} color="#94a3b8" />
                  <span>All break timestamps are synchronized from audit logs in IST.</span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEmployeeBreaks(null)}
                  style={{
                    padding: '0.45rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1e293b';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0f172a';
                  }}
                >
                  Close Timeline
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE ACTIVE SESSIONS TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'live' && (
        <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                Real-Time Active User Sessions ({filteredActive.length})
              </h3>
            </div>

            {filteredActive.length > 1 && (
              <button 
                onClick={handleForceLogoutAll}
                style={{ padding: '0.45rem 1rem', background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <LogOut size={14} /> Force Logout All Other Devices
              </button>
            )}
          </div>
          
          {filteredActive.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
              No active user sessions right now. (Users become active on login/action).
            </div>
          ) : (
            <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--th-bg)' }}>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee Name & Email</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Real-Time Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device / Browser</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Source</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Heartbeat</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActive.map((session, i) => (
                    <tr 
                      key={session.id} 
                      style={{ 
                        borderBottom: i < filteredActive.length - 1 ? '1px solid var(--border-light)' : 'none', 
                        background: session.current ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)' 
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600 }}>{session.user}</span>
                          {session.current && (
                            <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', background: '#10b981', color: 'white', borderRadius: '10px', fontWeight: 600 }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '0.1rem' }}>{session.email}</div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontWeight: 600, fontSize: '0.78rem' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                          🟢 Working (Live)
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }} title={session.deviceObj?.raw}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          <span>{session.deviceObj?.icon}</span>
                          <span>{session.deviceObj?.label}</span>
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.ip}</td>

                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {session.lastActive}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {!session.current ? (
                          <button 
                            onClick={() => handleForceLogout(session.id)}
                            style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, padding: '0.35rem 0.65rem', borderRadius: '6px', transition: 'all 0.15s' }}
                          >
                            <LogOut size={13} /> Force Logout
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Your session</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: INACTIVITY TIMEOUT, SHIFT RULES & AUTO-LOGOUT POLICY */}
      {/* ========================================================================= */}
      {activeTab === 'inactivity' && (
        <div style={{
          background: 'var(--bg-primary)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sliders size={20} color="var(--accent-color)" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                Inactivity Auto-Logout & Shift Standard Policy
              </h3>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Saved to Supabase & applies company-wide to all logged-in agents
            </span>
          </div>

          {/* Section A: Inactivity Timeout */}
          <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Inactivity Auto-Logout Duration (Countdown Timer)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {[5, 15, 30, 45, 60, 120].map((mins) => {
                const isSelected = !isCustomTimeout && settings.inactivityTimeoutMinutes === mins;
                return (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setIsCustomTimeout(false);
                      setSettings(prev => ({ ...prev, inactivityTimeoutMinutes: mins }));
                    }}
                    style={{
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                      backgroundColor: isSelected ? 'rgba(67, 56, 202, 0.08)' : 'var(--bg-surface)',
                      color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {mins} Minutes
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setIsCustomTimeout(true);
                  if (!customTimeoutInput) setCustomTimeoutInput(String(settings.inactivityTimeoutMinutes || 90));
                }}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: '8px',
                  border: isCustomTimeout ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                  backgroundColor: isCustomTimeout ? 'rgba(67, 56, 202, 0.08)' : 'var(--bg-surface)',
                  color: isCustomTimeout ? 'var(--accent-color)' : 'var(--text-primary)',
                  fontWeight: isCustomTimeout ? 700 : 500,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Custom
              </button>

              {isCustomTimeout && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={customTimeoutInput}
                    onChange={(e) => setCustomTimeoutInput(e.target.value)}
                    placeholder="e.g. 90"
                    style={{
                      width: '90px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--accent-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      fontWeight: 600
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mins</span>
                </div>
              )}
            </div>
          </div>

          {/* Section B: Away Threshold & Pre-Logout Warning */}
          <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Away (Idle) Detection & Pre-Logout Warning Threshold
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Idle / Away Mark Threshold</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Seconds of no mouse/keyboard activity before user is marked 🟡 Away.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={settings.idleThresholdSeconds || 60}
                    onChange={(e) => setSettings(prev => ({ ...prev, idleThresholdSeconds: Number(e.target.value) }))}
                    style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Seconds</span>
                </div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Pre-Logout Warning Popup</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Countdown warning modal appears before session auto-terminates.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={settings.warningSeconds || 60}
                    onChange={(e) => setSettings(prev => ({ ...prev, warningSeconds: Number(e.target.value) }))}
                    style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Seconds</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Office Shift Standard Configuration */}
          <div style={{ paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
            <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Office Working Hours & Lunch Standard
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Target Active Work Time</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4338ca', marginTop: '0.2rem' }}>
                  9 Hours (540 Minutes)
                </div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Designated Lunch Break</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#d97706', marginTop: '0.2rem' }}>
                  30 Minutes
                </div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total Office Shift Length</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a', marginTop: '0.2rem' }}>
                  9 Hours 30 Mins (570m)
                </div>
              </div>
            </div>
          </div>

          {/* Section D: Security Toggles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Automatic Logout</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Log out user when countdown reaches 00:00</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableAutoLogout}
                onChange={(e) => setSettings(prev => ({ ...prev, enableAutoLogout: e.target.checked }))}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-color)' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Show Timer in Header</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Users can see countdown clock in topbar</div>
              </div>
              <input
                type="checkbox"
                checked={settings.showTimerInHeader}
                onChange={(e) => setSettings(prev => ({ ...prev, showTimerInHeader: e.target.checked }))}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-color)' }}
              />
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: 'var(--accent-color)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: savingSettings ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(67, 56, 202, 0.25)'
              }}
            >
              {savingSettings ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
              {savingSettings ? 'Saving...' : 'Save Inactivity & Shift Rules'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: COMPANY BREAK TYPES & CUSTOM RULES POLICY MANAGER */}
      {/* ========================================================================= */}
      {activeTab === 'breaks' && (
        <div style={{
          background: 'var(--bg-primary)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Coffee size={22} color="#ea580c" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                  Company Break Types & Policy Rules Manager
                </h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
                Configure allowed break types, time limits, daily frequency quotas, or add new custom breaks for agents.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddBreakModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.1rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
              }}
            >
              <Plus size={16} />
              <span>Add Custom Break</span>
            </button>
          </div>

          {/* Editable Break Types List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(settings.breakRules || []).map((rule, idx) => (
              <div
                key={rule.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.1rem',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '10px',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                {/* Icon & Name Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 260px' }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setOpenEmojiPickerIdx(openEmojiPickerIdx === idx ? null : idx)}
                      style={{
                        width: '42px',
                        height: '42px',
                        fontSize: '1.4rem',
                        borderRadius: '10px',
                        border: openEmojiPickerIdx === idx ? '2px solid #ea580c' : '1px solid var(--border-light, #cbd5e1)',
                        backgroundColor: 'var(--bg-primary, #ffffff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontFamily: '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                      }}
                      title="Click to change icon"
                    >
                      {rule.icon || '☕'}
                    </button>

                    {openEmojiPickerIdx === idx && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          zIndex: 10000,
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '0.6rem',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(6, 1fr)',
                          gap: '0.35rem',
                          boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
                          width: '230px'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EMOJI_OPTIONS.map(em => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              handleUpdateBreakRule(idx, 'icon', em);
                              setOpenEmojiPickerIdx(null);
                            }}
                            style={{
                              fontSize: '1.3rem',
                              padding: '0.35rem',
                              borderRadius: '6px',
                              border: rule.icon === em ? '2px solid #ea580c' : '1px solid transparent',
                              backgroundColor: rule.icon === em ? '#fff7ed' : 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif'
                            }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={rule.label}
                    onChange={(e) => handleUpdateBreakRule(idx, 'label', e.target.value)}
                    placeholder="Break Label (e.g. Tea Break)"
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      fontWeight: 600
                    }}
                  />
                </div>

                {/* Standard Duration Input & Max Daily Quota & Toggle & Delete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  {/* Time Limit */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Limit:</span>
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={rule.defaultMins || 15}
                      onChange={(e) => handleUpdateBreakRule(idx, 'defaultMins', Number(e.target.value))}
                      style={{
                        width: '58px',
                        padding: '0.45rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textAlign: 'center'
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>mins</span>
                  </div>

                  {/* Max Times Allowed Per Day */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Daily Quota:</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={rule.maxPerDay !== undefined ? rule.maxPerDay : 2}
                      onChange={(e) => handleUpdateBreakRule(idx, 'maxPerDay', Number(e.target.value))}
                      style={{
                        width: '52px',
                        padding: '0.45rem 0.4rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textAlign: 'center'
                      }}
                      title="Maximum times an agent can take this break per day (0 for unlimited)"
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {Number(rule.maxPerDay) === 0 ? 'times (∞)' : 'times/day'}
                    </span>
                  </div>

                  {/* Enable / Disable Checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: rule.enabled !== false ? '#16a34a' : '#94a3b8', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled !== false}
                      onChange={(e) => handleUpdateBreakRule(idx, 'enabled', e.target.checked)}
                      style={{ accentColor: '#16a34a', width: '16px', height: '16px' }}
                    />
                    <span>{rule.enabled !== false ? 'Active' : 'Disabled'}</span>
                  </label>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteBreakRule(idx)}
                    style={{
                      padding: '0.4rem',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                    title="Delete this break type"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: savingSettings ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
              }}
            >
              {savingSettings ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={18} />}
              {savingSettings ? 'Saving...' : 'Save Custom Break Rules'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW CUSTOM BREAK TYPE */}
      {/* ========================================================================= */}
      {showAddBreakModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Coffee size={22} color="#ea580c" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  Add Custom Break Type
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBreakModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Choose Emoji Icon:
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {EMOJI_OPTIONS.map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setNewBreakForm(p => ({ ...p, icon: em }))}
                      style={{
                        width: '36px',
                        height: '36px',
                        fontSize: '1.25rem',
                        borderRadius: '8px',
                        border: newBreakForm.icon === em ? '2px solid #ea580c' : '1px solid #e2e8f0',
                        backgroundColor: newBreakForm.icon === em ? '#fff7ed' : '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Break Name / Reason:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Prayer / Namaz Break"
                  value={newBreakForm.label}
                  onChange={(e) => setNewBreakForm(p => ({ ...p, label: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Standard Duration Limit (Minutes):
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={newBreakForm.defaultMins}
                  onChange={(e) => setNewBreakForm(p => ({ ...p, defaultMins: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Max Times Allowed Per Day (0 for Unlimited):
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  placeholder="e.g. 2 (or 0 for unlimited)"
                  value={newBreakForm.maxPerDay !== undefined ? newBreakForm.maxPerDay : 2}
                  onChange={(e) => setNewBreakForm(p => ({ ...p, maxPerDay: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setShowAddBreakModal(false)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleAddBreakRule}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
                }}
              >
                Add Break
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
