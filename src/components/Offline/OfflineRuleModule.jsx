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
  Building2,
  PieChart,
  Bot,
  Phone,
  MessageCircle,
  Globe,
  Archive,
  Briefcase,
  Layers,
  Settings,
  Mail,
  Home,
  CalendarCheck,
  Search,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { 
  getDailyOfflineUsage, 
  getMonthlyOfflineUsage,
  getPendingQueue, 
  getSyncHistory, 
  syncPendingQueue, 
  getLocalLeads,
  getLocalChecklists,
  getLocalDelegationTasks,
  getOfflineRules,
  saveOfflineRulesToLocal
} from '@/utils/offlineSync';
import { getOfflineRuleSettings, saveOfflineRuleSettings } from '@/app/actions/offlineRules';
import { createClient } from '@/utils/supabase/client';

const QUEUED_OFFLINE_ACTIONS = new Set([
  'homeWorkspace', 'checklistSubmit', 'delegationStatusUpdate', 'delegationCreate',
  'attendancePunch', 'attendanceRegularization', 'leadStatusUpdate',
  'leadNotes', 'leadFollowUp', 'clientRegistration', 'profileEdit', 'leadAssign',
  'recruiter'
]);

const GROUP_SECTIONS = [
  {
    id: 'productivity',
    label: '🏠 General & Productivity',
    desc: 'Home Workspace, Analytics, Smart Attendance, Smart Checklist, Delegation Tasks, Task Planner & Field Force',
    categories: ['home', 'general', 'attendance', 'checklist', 'delegation', 'field_operations']
  },
  {
    id: 'sales',
    label: '🎯 Sales & CRM',
    desc: 'New Lead Registration, Lead Data & Pipeline, Party Master, Channel Operations & Location Master',
    categories: ['leads', 'sales_locations']
  },
  {
    id: 'purchase',
    label: '📦 Purchase & MRP',
    desc: 'Material Requirements Planning & Procurement Requisitions',
    categories: ['purchase']
  },
  {
    id: 'hr',
    label: '👔 Human Resources',
    desc: 'Recruiter Pipeline & Joining Process',
    categories: ['hr']
  },
  {
    id: 'system',
    label: '⚙️ System & Governance',
    desc: 'User Management, Team Access, Public Users, Workflow Builder & Settings',
    categories: ['system']
  },
  {
    id: 'comm',
    label: '📞 Communications & AI',
    desc: 'Softphone, Call Admin, WhatsApp, AI Assistant, Knowledge Base & Messaging Gateways',
    categories: ['comm']
  }
];

export default function OfflineRuleModule({ userRole = 'admin', userEmail = '' }) {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineUsage, setOfflineUsage] = useState(() => getDailyOfflineUsage());
  const [monthlyUsage, setMonthlyUsage] = useState(() => getMonthlyOfflineUsage());
  const [pendingQueue, setPendingQueue] = useState([]);
  const [syncHistory, setSyncHistory] = useState([]);
  const [cachedLeadsCount, setCachedLeadsCount] = useState(0);
  const [cachedNotesCount, setCachedNotesCount] = useState(0);
  const [cachedChecklistsCount, setCachedChecklistsCount] = useState(0);
  const [cachedDelegationsCount, setCachedDelegationsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // Configurable Rules State
  const [rules, setRules] = useState(() => getOfflineRules());
  const [hasChanges, setHasChanges] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'enabled' | 'disabled'
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const supabase = createClient();

  // Load cloud rules and device stats
  const loadAll = useCallback(async (refreshRules = true) => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      setOfflineUsage(getDailyOfflineUsage());
      setMonthlyUsage(getMonthlyOfflineUsage());
    }

    try {
      // Local policy is usable immediately, including after an offline refresh.
      if (refreshRules) {
        setRules(getOfflineRules());
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const res = await getOfflineRuleSettings();
          if (res?.success && res.settings) {
            setRules(res.settings);
            saveOfflineRulesToLocal(res.settings);
          }
        }
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

      const cachedChecklists = await getLocalChecklists(userEmail);
      if (Array.isArray(cachedChecklists)) {
        setCachedChecklistsCount(cachedChecklists.length);
      }

      const cachedDelegations = await getLocalDelegationTasks(userEmail);
      if (Array.isArray(cachedDelegations)) {
        setCachedDelegationsCount(cachedDelegations.length);
      }
    } catch (err) {
      console.warn('Error loading offline rule data:', err);
    }
  }, [userEmail]);

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
    const handleQueueChanged = () => { loadAll(false); };
    window.addEventListener('supuja_offline_queue_changed', handleQueueChanged);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supuja_offline_queue_changed', handleQueueChanged);
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
        setStatusMsg({ type: 'success', text: '✅ Offline Rules saved. Other devices will load the policy when online.' });
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
      if (res?.failed > 0 && res?.count > 0) {
        setStatusMsg({ type: 'error', text: `⚠️ Synced ${res.count} item(s), but ${res.failed} item(s) failed. Check Live Queue errors below.` });
      } else if (res?.failed > 0) {
        setStatusMsg({ type: 'error', text: `❌ ${res.failed} offline update(s) could not sync. Check Live Queue errors below.` });
      } else {
        setStatusMsg({ type: 'success', text: `🎉 Successfully synced ${res?.count || 0} offline updates to cloud!` });
      }
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

  const updateGroupFeatures = (keys, val) => {
    setRules(prev => {
      const nextFeatures = { ...(prev.features || {}) };
      keys.forEach((k) => { nextFeatures[k] = val; });
      return { ...prev, features: nextFeatures };
    });
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
    {
      key: 'clientReport',
      category: 'leads',
      categoryLabel: 'Leads & Sales',
      title: 'Client Registered Report & Analytics',
      desc: 'Allow browsing registered clients summary and conversion reports offline.',
      icon: FileText
    },

    {
      key: 'fieldForce',
      category: 'field_operations',
      categoryLabel: 'Field Operations',
      title: 'Field Force',
      desc: 'Allow Field Force screens to open offline. Available data depends on the tab and the device cache.',
      icon: Activity,
      offlineSaveNotice: 'Keep this off for staff who record visits until offline check-in and check-out sync has been verified.'
    },

    // 🏢 Sales & Locations
    {
      key: 'partyMasterEdit',
      category: 'sales_locations',
      categoryLabel: 'Sales & Locations',
      title: 'Party Master & Customer Profiles',
      desc: 'Allow creating or modifying business party master profiles while disconnected.',
      icon: Building2
    },
    {
      key: 'locationMaster',
      category: 'sales_locations',
      categoryLabel: 'Sales & Locations',
      title: 'Location Master Directory',
      desc: 'Allow browsing states, districts, tehsils, blocks, and PIN codes while offline.',
      icon: Globe
    },
    {
      key: 'orders',
      category: 'sales_locations',
      categoryLabel: 'Sales & Locations',
      title: 'Order Management & Tracking',
      desc: 'Allow viewing customer sales orders and order status offline.',
      icon: Briefcase
    },
    {
      key: 'channelOperations',
      category: 'sales_locations',
      categoryLabel: 'Sales & Locations',
      title: 'Channel Operations (Order Follow-up, Health Checks, Complaints & End Customers)',
      desc: 'Allow Daily Order Follow-up, Monthly Health Checks, Complaint Management, and End Customer Master to open offline from device cache.',
      icon: Layers
    },

    // 📦 Purchase & Production
    {
      key: 'mrp',
      category: 'purchase',
      categoryLabel: 'Purchase & MRP',
      title: 'MRP System (Material Planning)',
      desc: 'Allow browsing material requirements planning and BOM records offline.',
      icon: Archive
    },
    {
      key: 'mrpAgainst',
      category: 'purchase',
      categoryLabel: 'Purchase & MRP',
      title: 'MRP Against (Procurement Requisitions)',
      desc: 'Allow viewing purchase indent and procurement tracking records offline.',
      icon: Layers
    },

    // 👔 Human Resources
    {
      key: 'recruiter',
      category: 'hr',
      categoryLabel: 'Human Resources',
      title: 'Recruiter Dashboard (S00-S09 Pipeline)',
      desc: 'Allow recruiters to view candidate profiles, interview status, and stages offline.',
      icon: Users
    },
    {
      key: 'joining',
      category: 'hr',
      categoryLabel: 'Human Resources',
      title: 'Joining & Onboarding Process',
      desc: 'Allow HR to track candidate onboarding checklist and joining documents offline.',
      icon: UserCheck
    },

    // 🏠 Home Workspace
    {
      key: 'homeWorkspace',
      category: 'home',
      categoryLabel: 'Home Workspace',
      title: 'Home Workspace & Quick Punch',
      desc: 'Allow Home Workspace widgets and Smart Quick Punch In/Out (queued offline) while disconnected.',
      icon: Home
    },

    // 📊 General & Analytics
    {
      key: 'taskPlanner',
      category: 'general',
      categoryLabel: 'General & Analytics',
      title: 'Task Planner (Day / Week / Kanban)',
      desc: 'Allow opening cached Task Planner boards and time-blocks while disconnected.',
      icon: CalendarCheck,
      offlineSaveNotice: 'Read-only cached view offline; task edits still require internet until planner write-queue is wired.'
    },
    {
      key: 'analytics',
      category: 'general',
      categoryLabel: 'General & Analytics',
      title: 'Executive Analytics Dashboard',
      desc: 'Allow viewing cached high-level performance charts and KPI counters offline.',
      icon: PieChart
    },

    // ⚙️ System & Workplace
    {
      key: 'workplaceWms',
      category: 'system',
      categoryLabel: 'System & WMS',
      title: 'Workflow Builder & Workplace WMS',
      desc: 'Allow browsing workflow definitions, staff directory, designations, and organizational chart offline.',
      icon: Building2
    },
    {
      key: 'userManagement',
      category: 'system',
      categoryLabel: 'System & WMS',
      title: 'User Management (Users, Roles, Hierarchy, Audit & Sessions)',
      desc: 'Allow viewing User Manage, Roles & Permissions, Org Hierarchy, Audit Logs, and Active Sessions offline.',
      icon: Users,
      warning: 'Recommended: Online Only to prevent security, role, and session synchronization conflicts.'
    },
    {
      key: 'teamManagement',
      category: 'system',
      categoryLabel: 'System & WMS',
      title: 'Team Management & User Access Control',
      desc: 'Allow managing employee permissions and roles offline.',
      icon: Users,
      warning: 'Recommended: Online Only to prevent permission synchronization conflicts.'
    },
    {
      key: 'publicUsers',
      category: 'system',
      categoryLabel: 'System & WMS',
      title: 'Public User Account Management',
      desc: 'Allow browsing public portal users and customer accounts offline.',
      icon: Users
    },
    {
      key: 'settings',
      category: 'system',
      categoryLabel: 'System & WMS',
      title: 'System Settings & Security Config',
      desc: 'Allow configuring business preferences and viewing offline rules while disconnected.',
      icon: Settings
    },

    // 📞 Telephony, WhatsApp & AI
    {
      key: 'callCenter',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'Softphone & Call Center',
      desc: 'VoIP calling station. Requires active SIP internet connection.',
      icon: PhoneCall,
      warning: 'Real-time VoIP voice streams cannot operate without active internet connection.'
    },
    {
      key: 'callAdmin',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'Call Admin & Agent Endpoints',
      desc: 'Allow viewing SIP extension configurations and call history logs offline.',
      icon: Phone
    },
    {
      key: 'aiCallCenter',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'Autonomous AI Call Center',
      desc: 'AI automated calling campaigns and speech analysis.',
      icon: Bot,
      warning: 'Real-time AI voice agents require active cloud network connection.'
    },
    {
      key: 'whatsappOfficial',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'Official Meta WhatsApp Business',
      desc: 'Cloud API messaging and approved templates broadcast.',
      icon: MessageCircle,
      warning: 'Requires active internet connection to deliver WhatsApp API messages.'
    },
    {
      key: 'whatsappUnofficial',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'WhatsApp Multi-Device Web Inbox',
      desc: 'Live chat inbox and instance QR manager.',
      icon: MessageCircle,
      warning: 'Requires active WebSocket connection to mobile device instance.'
    },
    {
      key: 'aiAssistant',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'New Swan AI Assistant (LLM)',
      desc: 'Smart generative assistant. Requires active cloud neural network.',
      icon: Bot,
      warning: 'Requires active cloud AI network connection.'
    },
    {
      key: 'aiAdmin',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'User AI Usage & Token Tracking',
      desc: 'Monitor token consumption and employee quotas.',
      icon: Bot
    },
    {
      key: 'aiKnowledgeBase',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'AI Knowledge Base (RAG)',
      desc: 'Vector embeddings and knowledge documents manager.',
      icon: Database
    },
    {
      key: 'adminMessageConfig',
      category: 'comm',
      categoryLabel: 'Communications & AI',
      title: 'Messaging Gateway Configuration (Email / SMS / RCS / Admin Config)',
      desc: 'Manage SMTP Email, Twilio/SMS, RCS, and Admin Message gateway configurations offline.',
      icon: Mail
    }
  ];

  return (
    <div style={{ padding: '0.25rem 0', width: '100%', boxSizing: 'border-box', color: 'var(--text-color, #1e293b)' }}>
      
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
              ? '🟢 Offline mode is enabled. Previously cached data and implemented device-queued actions can work while disconnected.'
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
            Status: {rules.isOfflineEnabled ? 'Supported actions use the device queue when disconnected' : 'Offline queuing blocked'}
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: '600', color: 'var(--text-color, #334155)' }}>Auto-Sync on Reconnect</span>
              <button
                type="button"
                onClick={() => {
                  setRules(r => ({ ...r, autoSyncOnReconnect: !r.autoSyncOnReconnect }));
                  setHasChanges(true);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: rules.autoSyncOnReconnect ? '#10b981' : '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                {rules.autoSyncOnReconnect ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: '600', color: 'var(--text-color, #334155)' }}>Max Queue Items / Device</span>
              <input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={rules.maxQueueItemsPerDevice ?? 500}
                onChange={(e) => {
                  const val = Math.min(2000, Math.max(50, parseInt(e.target.value, 10) || 500));
                  setRules(r => ({ ...r, maxQueueItemsPerDevice: val }));
                  setHasChanges(true);
                }}
                style={{ width: '82px', padding: '0.25rem 0.45rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.8rem', fontWeight: '700', textAlign: 'right' }}
              />
            </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={20} style={{ color: '#2563eb' }} />
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Process-Level Permissions (Group & Module Wise)</h2>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Organized by CRM Sidebar Groups and Modules — choose which workflows work offline.
            </p>
          </div>

          {/* Search + Status Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search module or permission..."
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  fontSize: '0.8rem',
                  background: 'var(--card-bg, #ffffff)',
                  color: 'var(--text-color, #1e293b)'
                }}
              />
            </div>

            <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', overflow: 'hidden' }}>
              {[
                { id: 'all', label: `All (${featureConfigs.length})` },
                { id: 'enabled', label: `🟢 Offline (${featureConfigs.filter(f => Boolean(rules.features?.[f.key])).length})` },
                { id: 'disabled', label: `🔒 Online (${featureConfigs.filter(f => !rules.features?.[f.key]).length})` }
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  style={{
                    padding: '0.42rem 0.7rem',
                    fontSize: '0.75rem',
                    fontWeight: statusFilter === st.id ? '700' : '500',
                    border: 'none',
                    cursor: 'pointer',
                    background: statusFilter === st.id ? '#1e293b' : 'var(--card-bg, #ffffff)',
                    color: statusFilter === st.id ? '#ffffff' : 'var(--text-muted, #475569)'
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Clean 6 Sidebar Group Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {[
            { id: 'all', label: 'All Groups', count: featureConfigs.length },
            ...GROUP_SECTIONS.map((g) => ({
              id: g.id,
              label: g.label,
              count: featureConfigs.filter(f => g.categories.includes(f.category)).length
            }))
          ].map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.85rem',
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
                padding: '0.1rem 0.38rem',
                borderRadius: '10px',
                background: categoryFilter === cat.id ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                color: categoryFilter === cat.id ? '#ffffff' : 'var(--text-muted, #64748b)'
              }}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Grouped Sections -> Module Sub-Groups -> Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {GROUP_SECTIONS
            .filter(g => categoryFilter === 'all' || categoryFilter === g.id)
            .map((group) => {
              const groupAllItems = featureConfigs.filter(f => group.categories.includes(f.category));
              const q = searchQuery.trim().toLowerCase();
              const visibleItems = groupAllItems.filter((f) => {
                const isEnabled = Boolean(rules.features?.[f.key]);
                if (statusFilter === 'enabled' && !isEnabled) return false;
                if (statusFilter === 'disabled' && isEnabled) return false;
                if (q) {
                  const hay = `${f.title} ${f.desc} ${f.categoryLabel} ${group.label}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });
              if (visibleItems.length === 0) return null;

              const enabledCount = groupAllItems.filter(f => Boolean(rules.features?.[f.key])).length;
              const isCollapsed = Boolean(collapsedGroups[group.id]);
              const moduleSubGroups = group.categories
                .map((catId) => {
                  const items = visibleItems.filter(f => f.category === catId);
                  if (items.length === 0) return null;
                  return { catId, label: items[0].categoryLabel, items };
                })
                .filter(Boolean);

              return (
                <div
                  key={group.id}
                  style={{
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'var(--bg-surface, #ffffff)'
                  }}
                >
                  {/* Group Header */}
                  <div
                    onClick={() => setCollapsedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      padding: '0.9rem 1.25rem',
                      background: 'var(--bg-hover, #f8fafc)',
                      borderBottom: isCollapsed ? 'none' : '1px solid var(--border-color, #e2e8f0)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {isCollapsed ? <ChevronRight size={18} color="#64748b" /> : <ChevronDown size={18} color="#2563eb" />}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-color, #0f172a)' }}>{group.label}</span>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            padding: '0.15rem 0.55rem',
                            borderRadius: '9999px',
                            background: enabledCount > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.15)',
                            color: enabledCount > 0 ? '#059669' : '#64748b'
                          }}>
                            {enabledCount} / {groupAllItems.length} Offline Enabled
                          </span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                          {group.desc}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => updateGroupFeatures(groupAllItems.map(f => f.key), true)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          borderRadius: '6px',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          background: 'rgba(16, 185, 129, 0.08)',
                          color: '#059669',
                          cursor: 'pointer'
                        }}
                      >
                        Enable All
                      </button>
                      <button
                        type="button"
                        onClick={() => updateGroupFeatures(groupAllItems.map(f => f.key), false)}
                        style={{
                          padding: '0.3rem 0.65rem',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          background: 'var(--card-bg, #ffffff)',
                          color: 'var(--text-muted, #475569)',
                          cursor: 'pointer'
                        }}
                      >
                        Online Only
                      </button>
                    </div>
                  </div>

                  {/* Module Sub-Sections inside this Group */}
                  {!isCollapsed && (
                    <div style={{ padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
                      {moduleSubGroups.map((mod) => {
                        const modEnabled = mod.items.filter(f => Boolean(rules.features?.[f.key])).length;
                        return (
                          <div key={mod.catId}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '0.75rem',
                              paddingBottom: '0.4rem',
                              borderBottom: '1px dashed var(--border-color, #e2e8f0)'
                            }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                {mod.label}
                              </span>
                              <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted, #64748b)' }}>
                                {modEnabled}/{mod.items.length} Offline
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.85rem' }}>
                              {mod.items.map((feat) => {
                                const IconComp = feat.icon;
                                const isEnabled = Boolean(rules.features?.[feat.key]);

                                return (
                                  <div
                                    key={feat.key}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'flex-start',
                                      padding: '0.95rem',
                                      borderRadius: '10px',
                                      background: isEnabled ? 'rgba(16, 185, 129, 0.03)' : 'rgba(241, 245, 249, 0.55)',
                                      border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.28)' : 'var(--border-color, #e2e8f0)'}`,
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    <div style={{ display: 'flex', gap: '0.75rem', paddingRight: '0.75rem' }}>
                                      <div style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '8px',
                                        background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.15)',
                                        color: isEnabled ? '#10b981' : '#64748b',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: '0.1rem'
                                      }}>
                                        <IconComp size={17} />
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: '700', fontSize: '0.92rem', marginBottom: '0.2rem' }}>
                                          {feat.title}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.4 }}>
                                          {feat.desc}
                                        </p>
                                        {feat.warning && (
                                          <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#d97706', fontWeight: '500' }}>
                                            ⚠️ {feat.warning}
                                          </div>
                                        )}
                                        {!QUEUED_OFFLINE_ACTIONS.has(feat.key) && (
                                          <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#b45309', fontWeight: '600' }}>
                                            {feat.offlineSaveNotice || 'No offline save queue for this action. Internet is still required to submit changes.'}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => updateFeature(feat.key, !isEnabled)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: isEnabled ? '#10b981' : '#94a3b8',
                                        padding: 0,
                                        flexShrink: 0
                                      }}
                                      title={isEnabled ? 'Click to require Online' : 'Click to allow Offline'}
                                    >
                                      {isEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Cached Checklists on Device:</span>
              <strong>{cachedChecklistsCount.toLocaleString()} Tasks</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-hover, #f8fafc)', borderRadius: '8px' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Cached Delegations on Device:</span>
              <strong>{cachedDelegationsCount.toLocaleString()} Tasks</strong>
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
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {pendingQueue.map((item, i) => (
                <div key={item.queueId || i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.55rem 0.75rem',
                  borderBottom: '1px solid var(--border-color, #f1f5f9)',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: '700', color: 'var(--text-color, #1e293b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title || `${item.entityType} (${item.actionType})`}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>
                      {item.entityType} • {item.actionType} • {new Date(item.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })} IST
                    </div>
                    {item.lastError && (
                      <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px', wordBreak: 'break-word' }}>
                        ⚠️ {item.lastError}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '6px',
                    background: item.lastError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    color: item.lastError ? '#dc2626' : '#d97706',
                    flexShrink: 0
                  }}>
                    {item.lastError ? 'FAILED' : 'Queued'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {syncHistory.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted, #64748b)', marginBottom: '0.5rem' }}>
                RECENTLY SYNCHRONIZED ({syncHistory.length})
              </div>
              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {syncHistory.slice(0, 5).map((h, idx) => (
                  <div key={h.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '0.35rem 0.5rem', background: 'var(--bg-hover, #f8fafc)', borderRadius: '6px' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-color, #334155)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>{h.title}</span>
                    <span style={{ color: '#16a34a', fontWeight: '600', flexShrink: 0 }}>
                      ✓ {new Date(h.syncedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
