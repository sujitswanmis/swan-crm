'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wifi, 
  WifiOff, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Database, 
  HardDrive, 
  Users, 
  FileText, 
  PhoneCall, 
  FileSpreadsheet, 
  Activity,
  Lock,
  Save,
  Check,
  Sliders,
  Calendar,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckSquare,
  ListTodo,
  UserCheck,
  FileCheck,
  Building2
} from 'lucide-react';
import { 
  getDailyOfflineUsage, 
  getMonthlyOfflineUsage,
  getPendingQueue, 
  getSyncHistory, 
  syncPendingQueue, 
  getLocalLeads,
  getOfflineRules,
  saveOfflineRulesToLocal,
  DEFAULT_OFFLINE_RULES
} from '@/utils/offlineSync';
import { getOfflineRuleSettings, saveOfflineRuleSettings } from '@/app/actions/offlineRules';
import { createClient } from '@/utils/supabase/client';

export default function OfflineRuleModule({ userRole = 'admin' }) {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineUsage, setOfflineUsage] = useState(() => getDailyOfflineUsage());
  const [monthlyUsage, setMonthlyUsage] = useState(() => getMonthlyOfflineUsage());
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncHistory, setSyncHistory] = useState([]);
  const [cachedLeadsCount, setCachedLeadsCount] = useState(0);
  const [cachedNotesCount, setCachedNotesCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // Configurable Rules State
  const [rules, setRules] = useState(DEFAULT_OFFLINE_RULES);
  const [hasChanges, setHasChanges] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const supabase = createClient();

  // Load cloud rules and device stats
  const loadAll = useCallback(async () => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      setOfflineUsage(getDailyOfflineUsage());
      setMonthlyUsage(getMonthlyOfflineUsage());
    }

    try {
      // 1. Fetch remote settings
      const res = await getOfflineRuleSettings();
      if (res?.success && res.settings) {
        setRules(res.settings);
        saveOfflineRulesToLocal(res.settings);
      } else {
        const local = getOfflineRules();
        setRules(local);
      }

      // 2. Queue and cache stats
      const queue = await getPendingQueue();
      setPendingQueue(queue || []);
      const hist = await getSyncHistory();
      setSyncHistory(hist || []);

      const cached = await getLocalLeads();
      if (Array.isArray(cached)) {
        setCachedLeadsCount(cached.length);
        let noteCount = 0;
        for (const l of cached) {
          if (Array.isArray(l.lead_notes)) noteCount += l.lead_notes.length;
        }
        setCachedNotesCount(noteCount);
      }
    } catch (err) {
      console.warn('Error loading offline rule data:', err);
    }
  }, []);

  useEffect(() => {
    loadAll();

    const handleOnline = () => {
      setIsOnline(true);
      loadAll();
    };
    const handleOffline = () => {
      setIsOnline(false);
      loadAll();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supuja_offline_queue_changed', loadAll);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supuja_offline_queue_changed', loadAll);
    };
  }, [loadAll]);

  // Handle Save
  const handleSaveRules = async () => {
    setIsSaving(true);
    setStatusMsg({ type: 'info', text: 'Saving offline policy rules to cloud...' });
    try {
      const res = await saveOfflineRuleSettings(rules);
      if (res.success) {
        saveOfflineRulesToLocal(res.settings);
        setRules(res.settings);
        setHasChanges(false);
        setStatusMsg({ type: 'success', text: '✅ Offline Rules successfully saved and applied to all users!' });
        setOfflineUsage(getDailyOfflineUsage());
        setMonthlyUsage(getMonthlyOfflineUsage());
      } else {
        setStatusMsg({ type: 'error', text: 'Failed to save: ' + (res.error || 'Unknown error') });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Error saving rules: ' + (e.message || 'Unknown') });
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 6000);
    }
  };

  // Manual Sync
  const handleManualSync = async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setStatusMsg({ type: 'info', text: 'Flushing pending queue to Supabase cloud...' });
    try {
      const res = await syncPendingQueue(supabase);
      setStatusMsg({ type: 'success', text: `🎉 Successfully synced ${res.count || 0} offline updates to cloud!` });
      await loadAll();
    } catch (e) {
      setStatusMsg({ type: 'error', text: 'Sync failed: ' + (e.message || 'Unknown error') });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setStatusMsg({ type: '', text: '' }), 5000);
    }
  };

  const updateFeature = (key, val) => {
    setRules(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: val
      }
    }));
    setHasChanges(true);
  };

  const featureConfigs = [
    // 📋 Smart Checklist Operations
    {
      key: 'checklistSubmit',
      category: 'checklist',
      categoryLabel: 'Smart Checklist',
      title: 'Smart Checklist Submissions & Slot Responses',
      desc: 'Allow employees to complete, fill checklists, and submit slot responses while offline in the field.',
      icon: CheckSquare
    },
    {
      key: 'checklistTemplateEdit',
      category: 'checklist',
      categoryLabel: 'Smart Checklist',
      title: 'Checklist Template Builder & Configuration',
      desc: 'Allow Admins/Managers to create or modify checklist templates and timing slots offline.',
      icon: FileSpreadsheet,
      warning: 'Recommended: Disabled to prevent schedule definition conflicts.'
    },

    // 👥 Task & Delegation Operations
    {
      key: 'delegationStatusUpdate',
      category: 'delegation',
      categoryLabel: 'Delegation Tasks',
      title: 'Delegation Task Execution & Subtasks',
      desc: 'Allow assignees to mark tasks In-Progress, tick subtasks, and submit completion proof offline.',
      icon: ListTodo
    },
    {
      key: 'delegationCreate',
      category: 'delegation',
      categoryLabel: 'Delegation Tasks',
      title: 'Assign New Delegation Task',
      desc: 'Allow managers and colleagues to delegate new tasks with deadlines to employees while offline.',
      icon: Users
    },
    {
      key: 'delegationApproval',
      category: 'delegation',
      categoryLabel: 'Delegation Tasks',
      title: 'Delegation Task Review & Rating Approval',
      desc: 'Allow delegators to verify, give 5-star ratings, and approve completed tasks while offline.',
      icon: UserCheck,
      warning: 'Recommended: Disabled to prevent concurrent rating conflicts.'
    },

    // 🎯 Sales & Lead Operations
    {
      key: 'leadStatusUpdate',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Lead Pipeline Stage Updates',
      desc: 'Allow employees to change lead stages (New, Contact, Qualification, Follow-up, etc.) while offline.',
      icon: CheckCircle2
    },
    {
      key: 'leadNotes',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Customer Remarks & Notes',
      desc: 'Allow employees to add customer discussion notes and remarks without active internet.',
      icon: FileText
    },
    {
      key: 'leadFollowUp',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Follow-up Date Scheduling',
      desc: 'Allow agents to schedule upcoming follow-up reminder dates offline.',
      icon: Clock
    },
    {
      key: 'clientRegistration',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'New Client Registration Form',
      desc: 'Allow agents to fill and submit complete new lead/client registration forms offline.',
      icon: ShieldCheck
    },
    {
      key: 'profileEdit',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Lead Profile Details Editing',
      desc: 'Allow modifying phone, email, contact person, or address while disconnected.',
      icon: Sliders
    },
    {
      key: 'leadAssign',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Lead Re-Assignment / Transfer',
      desc: 'Allow reassigning leads to another employee while offline.',
      icon: Users,
      warning: 'Disabling prevents two agents from claiming the same lead simultaneously.'
    },

    // ⏰ Attendance & Workforce Operations
    {
      key: 'attendancePunch',
      category: 'attendance',
      categoryLabel: 'Smart Attendance',
      title: 'Smart Attendance Punch Station',
      desc: 'Allow employees to record Punch-In and Punch-Out with GPS location offline.',
      icon: Clock
    },
    {
      key: 'attendanceRegularization',
      category: 'attendance',
      categoryLabel: 'Smart Attendance',
      title: 'Missing Punch Regularization Requests',
      desc: 'Allow employees to submit attendance regularization requests and explanations offline.',
      icon: FileCheck
    },

    // 🏢 Master Records & Accounts
    {
      key: 'partyMasterEdit',
      category: 'master',
      categoryLabel: 'Master Records',
      title: 'Party Master & Customer Records',
      desc: 'Allow creating or modifying business party master profiles while disconnected.',
      icon: Building2
    }
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1300px', margin: '0 auto', color: 'var(--text-color, #1e293b)' }}>
      
      {/* Top Banner & Header */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
            }}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Offline Rule & Policy Center</h1>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
                Configure offline permissions, daily & monthly time quotas, and process-level toggles
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            background: isOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            fontSize: '0.85rem',
            fontWeight: '600',
            color: isOnline ? '#16a34a' : '#dc2626'
          }}>
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{isOnline ? 'Online Connected' : 'Offline Disconnected'}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline || pendingQueue.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              background: 'var(--card-bg, #ffffff)',
              color: pendingQueue.length > 0 ? '#d97706' : 'var(--text-muted, #64748b)',
              border: '1px solid var(--border-color, #e2e8f0)',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: isSyncing || !isOnline || pendingQueue.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isSyncing || !isOnline || pendingQueue.length === 0 ? 0.6 : 1
            }}
          >
            <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : `Sync Queue (${pendingQueue.length})`}</span>
          </button>

          <button
            onClick={handleSaveRules}
            disabled={isSaving || !hasChanges}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              background: hasChanges ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#94a3b8',
              color: 'white',
              border: 'none',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: isSaving || !hasChanges ? 'not-allowed' : 'pointer',
              boxShadow: hasChanges ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Rules Saved'}</span>
          </button>
        </div>
      </div>

      {statusMsg.text && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          background: statusMsg.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : statusMsg.type === 'info' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${statusMsg.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : statusMsg.type === 'info' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: statusMsg.type === 'success' ? '#16a34a' : statusMsg.type === 'info' ? '#2563eb' : '#dc2626',
          fontSize: '0.875rem',
          fontWeight: '600'
        }}>
          {statusMsg.text}
        </div>
      )}

      {/* SECTION 1: MASTER SWITCH & QUOTA LIMITS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Master Switch Card */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em' }}>
                MASTER SWITCH
              </span>
              <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: '700' }}>
                Enable Offline Mode
              </h3>
            </div>
            <button
              onClick={() => {
                setRules(r => ({ ...r, isOfflineEnabled: !r.isOfflineEnabled }));
                setHasChanges(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: rules.isOfflineEnabled ? '#10b981' : '#94a3b8',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {rules.isOfflineEnabled ? <ToggleRight size={44} /> : <ToggleLeft size={44} />}
            </button>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
            {rules.isOfflineEnabled 
              ? '🟢 Offline mode is globally ENABLED. Employees can browse cached leads and perform allowed operations while disconnected.' 
              : '🔴 Offline mode is globally DISABLED. The CRM operates in strict online-only mode; disconnected actions will prompt internet requirement.'}
          </p>

          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: rules.isOfflineEnabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${rules.isOfflineEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            fontSize: '0.8rem',
            fontWeight: '600',
            color: rules.isOfflineEnabled ? '#059669' : '#dc2626'
          }}>
            Status: {rules.isOfflineEnabled ? 'All allowed features operate offline with device IndexedDB' : 'Offline queuing blocked'}
          </div>
        </div>

        {/* Daily Quota Control */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em' }}>
                TIME QUOTA
              </span>
              <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: '700' }}>
                Daily Offline Limit
              </h3>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#2563eb' }}>
              {rules.dailyQuotaHours} Hours / Day
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', margin: '0 0 1rem 0' }}>
            Maximum consecutive/cumulative offline hours allowed for an employee in a single calendar day.
          </p>

          <input
            type="range"
            min="1"
            max="24"
            step="1"
            value={rules.dailyQuotaHours}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setRules(r => ({ ...r, dailyQuotaHours: val }));
              setHasChanges(true);
            }}
            style={{ width: '100%', accentColor: '#2563eb', marginBottom: '0.75rem' }}
          />

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[2, 4, 5, 8, 12].map(h => (
              <button
                key={h}
                onClick={() => {
                  setRules(r => ({ ...r, dailyQuotaHours: h }));
                  setHasChanges(true);
                }}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  background: rules.dailyQuotaHours === h ? '#2563eb' : 'var(--bg-hover, #f1f5f9)',
                  color: rules.dailyQuotaHours === h ? 'white' : 'var(--text-color, #334155)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  cursor: 'pointer'
                }}
              >
                {h}h
              </button>
            ))}
          </div>

          <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Today Used: <strong>{offlineUsage.formattedUsed}</strong></span>
            <span>Remaining: <strong>{offlineUsage.formattedRemaining}</strong></span>
          </div>
        </div>

        {/* Monthly Quota Control */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em' }}>
                MONTHLY CAP
              </span>
              <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: '700' }}>
                Monthly Offline Limit
              </h3>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#7c3aed' }}>
              {rules.monthlyQuotaHours} Hours / Month
            </span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', margin: '0 0 1rem 0' }}>
            Maximum monthly offline cumulative limit across the billing/calendar month.
          </p>

          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={rules.monthlyQuotaHours}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setRules(r => ({ ...r, monthlyQuotaHours: val }));
              setHasChanges(true);
            }}
            style={{ width: '100%', accentColor: '#7c3aed', marginBottom: '0.75rem' }}
          />

          {/* Monthly Presets */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[20, 40, 50, 80, 100].map(h => (
              <button
                key={h}
                onClick={() => {
                  setRules(r => ({ ...r, monthlyQuotaHours: h }));
                  setHasChanges(true);
                }}
                style={{
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  borderRadius: '6px',
                  background: rules.monthlyQuotaHours === h ? '#7c3aed' : 'var(--bg-hover, #f1f5f9)',
                  color: rules.monthlyQuotaHours === h ? 'white' : 'var(--text-color, #334155)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  cursor: 'pointer'
                }}
              >
                {h}h
              </button>
            ))}
          </div>

          <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'flex', justifyContent: 'space-between' }}>
            <span>This Month Used: <strong>{monthlyUsage.hoursUsed}h</strong></span>
            <span>Remaining: <strong>{monthlyUsage.hoursRemaining}h</strong></span>
          </div>
        </div>

      </div>

      {/* SECTION 2: PROCESS-LEVEL PERMISSION MATRIX */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '14px',
        padding: '1.75rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sliders size={20} style={{ color: '#2563eb' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Process-Level Permissions (Online vs. Offline)</h2>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
            Choose which specific operational workflows are permitted without active internet connection.
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {[
            { id: 'all', label: 'All Operations', count: featureConfigs.length },
            { id: 'checklist', label: '📋 Smart Checklist', count: featureConfigs.filter(f => f.category === 'checklist').length },
            { id: 'delegation', label: '👥 Delegation Tasks', count: featureConfigs.filter(f => f.category === 'delegation').length },
            { id: 'leads', label: '🎯 Leads & Sales', count: featureConfigs.filter(f => f.category === 'leads').length },
            { id: 'attendance', label: '⏰ Smart Attendance', count: featureConfigs.filter(f => f.category === 'attendance').length },
            { id: 'master', label: '🏢 Master Records', count: featureConfigs.filter(f => f.category === 'master').length }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === cat.id ? '700' : '500',
                background: categoryFilter === cat.id ? '#2563eb' : 'var(--bg-hover, #f1f5f9)',
                color: categoryFilter === cat.id ? '#ffffff' : 'var(--text-color, #334155)',
                border: `1px solid ${categoryFilter === cat.id ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <span>{cat.label}</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.1rem 0.35rem',
                borderRadius: '10px',
                background: categoryFilter === cat.id ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                color: categoryFilter === cat.id ? '#ffffff' : 'var(--text-muted, #64748b)'
              }}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {featureConfigs.filter(f => categoryFilter === 'all' || f.category === categoryFilter).map((feat) => {
            const IconComp = feat.icon;
            const isEnabled = Boolean(rules.features?.[feat.key]);

            return (
              <div 
                key={feat.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '1rem',
                  borderRadius: '12px',
                  background: isEnabled ? 'rgba(16, 185, 129, 0.03)' : 'rgba(241, 245, 249, 0.5)',
                  border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color, #e2e8f0)'}`,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', paddingRight: '0.75rem' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.15)',
                    color: isEnabled ? '#10b981' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '0.1rem'
                  }}>
                    <IconComp size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                        {feat.categoryLabel}
                      </span>
                      <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>
                        {feat.title}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.4 }}>
                      {feat.desc}
                    </p>
                    {feat.warning && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#d97706', fontWeight: '500' }}>
                        ⚠️ {feat.warning}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => updateFeature(feat.key, !isEnabled)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isEnabled ? '#10b981' : '#94a3b8',
                    padding: 0,
                    flexShrink: 0
                  }}
                  title={isEnabled ? "Click to require Online" : "Click to allow Offline"}
                >
                  {isEnabled ? <ToggleRight size={38} /> : <ToggleLeft size={38} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Locked Cloud Operations */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            MANDATORY ONLINE FEATURES (LOCKED BY SYSTEM ARCHITECTURE)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.8rem', color: '#b91c1c' }}>
              <Lock size={14} />
              <span><strong>VOIP Softphone Calls:</strong> Requires live Plivo WebRTC media stream</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.8rem', color: '#b91c1c' }}>
              <Lock size={14} />
              <span><strong>WhatsApp Broadcasts:</strong> Requires Meta Cloud API network gateway</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '0.8rem', color: '#b91c1c' }}>
              <Lock size={14} />
              <span><strong>Bulk File Import/Export:</strong> Requires heavy cloud database workers</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: DEVICE STORAGE & PENDING SYNC QUEUE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        {/* Device Cache Health */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardDrive size={18} style={{ color: '#10b981' }} />
            Device Local Storage Health (IndexedDB)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-hover, #f8fafc)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Cached Leads on Device:</span>
              <strong>{cachedLeadsCount.toLocaleString()} Records</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-hover, #f8fafc)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Cached Notes on Device:</span>
              <strong>{cachedNotesCount.toLocaleString()} Notes</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-hover, #f8fafc)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Sync Architecture:</span>
              <strong style={{ color: '#10b981' }}>Delta Sync (99% Egress Saved)</strong>
            </div>
          </div>
        </div>

        {/* Live Queue Items */}
        <div style={{
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={18} style={{ color: pendingQueue.length > 0 ? '#f59e0b' : '#3b82f6' }} />
              Live Device Sync Queue ({pendingQueue.length})
            </h3>
            {pendingQueue.length > 0 && (
              <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontWeight: '700' }}>
                Pending Upload
              </span>
            )}
          </div>

          {pendingQueue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted, #64748b)' }}>
              <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 0.5rem auto' }} />
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>All Updates Synced</div>
              <div style={{ fontSize: '0.75rem' }}>No pending offline changes on this device.</div>
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {pendingQueue.map((item, i) => (
                <div key={item.queueId || i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid var(--border-color, #f1f5f9)',
                  fontSize: '0.8rem'
                }}>
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{item.entityType}</strong> ({item.actionType})
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>
                      {new Date(item.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#d97706' }}>Queued</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
