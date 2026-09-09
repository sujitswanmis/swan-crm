'use client';

import React, { useState, useEffect, useRef } from 'react';
import pkg from '../../package.json';
import LeadTable from '@/components/LeadTable';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import TeamManagement from '@/components/TeamManagement';
import PublicUserManagement from '@/components/PublicUserManagement';
import ClientRegistration from '@/components/ClientRegistration';
import ClientReport from '@/components/ClientReport';
import WhatsappOfficial from '@/components/WhatsappOfficial';
import WhatsappUnofficialModule from './WhatsappUnofficial/WhatsappUnofficialModule';
import AiAssistantModule from './AiAssistant/AiAssistantModule';
import CallCenterModule from './CallCenter/CallCenterModule';
import CallAdminModule from './CallCenter/CallAdminModule';
import AiCallCenterModule from './AiCallCenter/AiCallCenterModule';
import GlobalSoftphoneWidget from './CallCenter/GlobalSoftphoneWidget';
import AiAdminModule from './AiAdmin/AiAdminModule';
import AIKnowledgeBaseModule from './AiAdmin/AIKnowledgeBaseModule';
import { Database, LayoutDashboard, Users, Settings, Bell, Search, Shield, LogOut, FilePlus2, FileSpreadsheet, CheckCircle, Archive, FileText, PieChart, UserPlus, MessageCircle, ChevronDown, ChevronRight, ChevronLeft, Menu, Palette, Check, Bot, PhoneCall, Phone, BookOpen, Building2, MapPin, Globe, ShieldCheck, Camera, User, Upload, Loader2, Trash2, Calendar, Clock, AlertTriangle, AlertCircle, X, ExternalLink, CheckSquare, WifiOff, Sparkles, Volume2, CheckCircle2, Play } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getTeamMembers } from '@/app/actions/team';
import { logAuditAction } from '@/app/actions/audit';
import { uploadUserAvatar, removeUserAvatar } from '@/app/actions/userProfile';
import html2canvas from 'html2canvas';
import SettingsContainer from './Settings/SettingsContainer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { PremiumProgressLoader } from './PremiumProgressLoader';
import RecruiterDashboard from './Recruiter/RecruiterDashboard';
import UniversalWorkplaceModule from './Workplace/UniversalWorkplaceModule';
import PartyMasterModule from './Party/PartyMasterModule';
import LocationTerritoryModule from './Workplace/LocationTerritoryModule';
import LocationManagementModule from './Location/LocationManagementModule';
import AdminMessageConfig from './AdminMessageConfig/AdminMessageConfig';
import EmailConfigModule from './EmailConfig/EmailConfigModule';
import AttendanceModule from './Attendance/AttendanceModule';
import ChecklistModule from './Checklist/ChecklistModule';
import DelegationTaskModule from './Delegation/DelegationTaskModule';
import GlobalSpotlightModal from './GlobalSearch/GlobalSpotlightModal';
import SessionExpiryTracker from './SessionExpiryTracker';
import OfflineSyncCenter from './OfflineSyncCenter';
import OfflineRuleModule from './Offline/OfflineRuleModule';
import OfflineBlockScreen from './Offline/OfflineBlockScreen';
import { saveLeadsLocally, getLocalLeads, isModuleAllowedOffline } from '@/utils/offlineSync';
import { getUserPendingAlerts } from '@/app/actions/userAlerts';
import UserNotificationPreferencesModal from '@/components/common/UserNotificationPreferencesModal';

import { MODULES_CONFIG } from '@/config/modulesConfig';
import { getSubItemPermissions, getModulePermissions } from '@/utils/permissionUtils';

const THEMES = [
  { id: 'default', name: 'Default', icon: '🔵' },
  { id: 'theme-light', name: 'Light', icon: '⚪' },
  { id: 'theme-dark', name: 'Dark', icon: '⚫' },
  { id: 'theme-m3-light', name: 'Material 3 Light', icon: '🎨' },
  { id: 'theme-m3-dark', name: 'Material 3 Dark', icon: '🌌' },
  { id: 'theme-stylish-1', name: 'Ocean Blue', icon: '🌊' },
  { id: 'theme-stylish-2', name: 'Cyberpunk', icon: '🚀' },
  { id: 'theme-stylish-3', name: 'Emerald', icon: '🌲' },
  { id: 'theme-stylish-4', name: 'Royal Velvet', icon: '👑' },
  { id: 'theme-stylish-5', name: 'Rose Gold', icon: '🌸' },
  { id: 'theme-premium-1', name: 'Obsidian Gold', icon: '👑' },
  { id: 'theme-premium-2', name: 'Nordic Frost', icon: '❄️' },
  { id: 'theme-premium-3', name: 'Crimson Executive', icon: '🍷' },
  { id: 'theme-premium-4', name: 'Warm Amber', icon: '🔥' },
  { id: 'theme-premium-5', name: 'Monochrome Sleek', icon: '🔳' },
  { id: 'theme-aurora', name: 'Midnight Aurora', icon: '🌌' },
  { id: 'theme-forest', name: 'Forest Moss', icon: '🍃' },
  { id: 'theme-carbon', name: 'Carbon Gold', icon: '🖤' },
  { id: 'theme-sunset', name: 'Sunset Crimson', icon: '🌅' },
  { id: 'theme-platina', name: 'Platina Clean', icon: '🥈' },
];

// Helper to map DB status to Team Management Stage format
export const getStageFromStatus = (status) => {
  if (!status) return '01 - New Stage';
  if (status.startsWith('1;')) return '01 - New Stage';
  if (status.startsWith('2;')) return '02 - Contact Stage';
  if (status.startsWith('3;')) return '03 - Qualification Stage';
  if (status.startsWith('4;')) return '04 - Follow Up Stage';
  if (status.startsWith('5;')) return '05 - Sales Process Stage';
  if (status.startsWith('6;')) return '06 - Conversion Stage';
  if (status.startsWith('7;')) return '07 - Final Stage';
  if (['New', 'Pending'].includes(status)) return '01 - New Stage';
  if (['Converted', 'Order Received', 'Closed', 'Won', 'Lost'].some(k => (status || '').toLowerCase().includes(k.toLowerCase()))) return '07 - Final Stage';
  return '01 - New Stage';
};

// Formats follow-up date with exact 4-digit year DD/MM/YYYY and hh:mm am/pm
export const formatFollowUpDateTime = (dateVal) => {
  if (!dateVal) return { dateStr: '', timeStr: '', fullStr: '' };
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return { dateStr: '', timeStr: '', fullStr: '' };
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return {
    dateStr: `${day}/${month}/${year}`,
    timeStr: `${strHours}:${minutes} ${ampm}`,
    fullStr: `${day}/${month}/${year}, ${strHours}:${minutes} ${ampm}`
  };
};

const KeepAliveTab = React.memo(
  function KeepAliveTab({ isActive, isVisited, children, style = {} }) {
    if (!isVisited) return null;
    return (
      <div
        style={{
          display: isActive ? 'flex' : 'none',
          flex: 1,
          minHeight: 0,
          flexDirection: 'column',
          height: '100%',
          contain: isActive ? 'none' : 'strict',
          contentVisibility: isActive ? 'visible' : 'hidden',
          ...style,
        }}
      >
        {children}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 1. If the tab was inactive and remains inactive, completely skip rendering!
    if (!prevProps.isActive && !nextProps.isActive) {
      return true;
    }
    // 2. When the tab is active or toggling visibility, always re-render immediately for live realtime updates!
    return false;
  }
);

export function isTabPermitted(tabId, moduleAccess = {}, userRole = '') {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  if (isAdmin) return true;
  if (!moduleAccess) return false;

  if (tabId === 'dashboard') return moduleAccess['analytics']?.view !== false;
  if (tabId === 'ai') return moduleAccess['ai']?.view === true || moduleAccess['new_swan_ai']?.view === true;
  if (tabId === 'callcenter') return moduleAccess['callcenter']?.view === true;
  if (tabId === 'registration') return moduleAccess['registration']?.view === true;
  if (tabId === 'report') return moduleAccess['report']?.view === true;
  if (tabId === 'leads') return moduleAccess['leads']?.view === true;
  if (tabId === 'orders') return moduleAccess['orders']?.view === true;
  if (tabId === 'mrp') return moduleAccess['mrp']?.view === true;
  if (tabId === 'mrp_against') return moduleAccess['mrp_against']?.view === true;
  if (tabId === 'recruiter') return moduleAccess['recruiter']?.view === true;
  if (tabId === 'joining') return moduleAccess['joining']?.view === true;
  if (tabId === 'attendance') return moduleAccess['attendance']?.view !== false;
  if (tabId === 'checklist') return moduleAccess['checklist']?.view !== false;
  if (tabId === 'delegation') return moduleAccess['delegation']?.view !== false;
  if (tabId === 'team') return moduleAccess['team']?.view === true;
  if (tabId === 'workplace') return moduleAccess['workplace']?.view === true || moduleAccess['team']?.view === true;
  if (tabId === 'party') return moduleAccess['party']?.view === true || moduleAccess['team']?.view === true;
  if (tabId === 'location_master' || tabId === 'location_territory' || tabId === 'location-master') {
    return moduleAccess['location_master']?.view === true || moduleAccess['location_territory']?.view === true;
  }
  if (tabId === 'public_users') return moduleAccess['public_users']?.view === true;
  if (tabId === 'aiadmin') return moduleAccess['aiadmin']?.view === true;
  if (tabId === 'aiknowledgebase') return moduleAccess['aiknowledgebase']?.view === true;
  if (tabId === 'calladmin') return moduleAccess['calladmin']?.view === true;
  if (tabId === 'aicallcenter') return moduleAccess['aicallcenter']?.view === true;
  if (tabId === 'whatsapp_official') return moduleAccess['whatsapp_official']?.view === true;
  if (tabId === 'whatsapp_unofficial') return moduleAccess['whatsapp_unofficial']?.view === true;
  if (tabId === 'sms_config') return moduleAccess['sms_config']?.view === true;
  if (tabId === 'rcs_config') return moduleAccess['rcs_config']?.view === true;
  if (tabId === 'email_config') return moduleAccess['email_config']?.view === true;
  if (tabId === 'admin_message_config') return moduleAccess['admin_message_config']?.view === true;
  if (tabId === 'settings') return moduleAccess['settings']?.view === true;

  return moduleAccess[tabId]?.view === true;
}

export const MODULE_DISPLAY_NAMES = {
  dashboard: 'Analytics Dashboard',
  leads: 'Leads & Sales Database',
  registration: 'New Client Registration',
  report: 'Client Analytics & Reports',
  orders: 'Order Management',
  mrp: 'MRP System',
  mrp_against: 'MRP Against',
  recruiter: 'Recruiter Dashboard',
  joining: 'Joining Process',
  attendance: 'Smart Attendance Station',
  checklist: 'Smart Checklist Management',
  delegation: 'Delegation Task Management',
  party: 'Party Master Directory',
  location_master: 'Location Management',
  location_territory: 'Location Management',
  'location-master': 'Location Management',
  callcenter: 'Softphone & Call Center',
  calladmin: 'Call Admin Dashboard',
  aicallcenter: 'AI Call Center',
  ai: 'AI Assistant',
  aiadmin: 'AI Admin Panel',
  aiknowledgebase: 'AI Knowledge Base',
  whatsapp_official: 'Official WhatsApp Center',
  whatsapp_unofficial: 'Unofficial WhatsApp Center',
  team: 'Team Management',
  workplace: 'Workplace Directory',
  public_users: 'Public User Management',
  settings: 'System Settings',
  system_offline_rules: 'Offline Rule Settings'
};

export default function CRMContainer({ 
  initialLeads, 
  userRole, 
  canImportExport, 
  canRead = true, 
  canWrite = true, 
  moduleAccess: initialModuleAccess = {}, 
  userId, 
  userEmail: initialUserEmail = '',
  userCompany, 
  userName, 
  initialAvatar = null,
  isImpersonating = false,
  impersonatorAdmin = null,
  impersonatedUser = null,
  initialRoute = '',
  initialSearchParams = null
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const supabase = createClient();
  
  const [moduleAccess, setModuleAccess] = useState(initialModuleAccess);
  const [userEmail, setUserEmail] = useState(initialUserEmail);

  useEffect(() => {
    setModuleAccess(initialModuleAccess);
  }, [initialModuleAccess]);

  useEffect(() => {
    if (initialUserEmail) {
      setUserEmail(initialUserEmail);
    }
  }, [initialUserEmail]);

  // Real-time Permission Synchronizer: Automatically updates permissions without refreshing
  useEffect(() => {
    if (!userId) return;

    // 1. Broadcast channel listener (instant cross-session notification)
    const broadcastChannel = supabase
      .channel('crm_realtime_permission_sync')
      .on('broadcast', { event: 'permission_updated' }, (message) => {
        if (message?.payload?.userId === userId) {
          setModuleAccess(message.payload.moduleAccess || {});
        }
      })
      .subscribe();

    // 2. Postgres changes fallback on user_roles
    const roleChannel = supabase
      .channel(`user_role_realtime_${userId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'user_roles', 
        filter: `user_id=eq.${userId}` 
      }, (payload) => {
        if (payload.new && payload.new.module_access) {
          setModuleAccess(payload.new.module_access);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(roleChannel);
    };
  }, [userId, supabase]);

  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const hasLeadsAccess = isAdmin || 
    !!(moduleAccess?.['leads']?.view || 
      moduleAccess?.['callcenter']?.view || 
      moduleAccess?.['analytics']?.view ||
      moduleAccess?.['calladmin']?.view ||
      moduleAccess?.['aicallcenter']?.view);

  // State variables
  const [dashboardSubTab, setDashboardSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (cleanPath === 'pipeline' || cleanPath === 'leads-data') cleanPath = 'lead-data';
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (queryTab === 'pipeline' || queryTab === 'leads-data') queryTab = 'lead-data';
    if (['scorecard', 'overview', 'lead-data'].includes(cleanPath)) return cleanPath;
    if (cleanPath && cleanPath.startsWith('dashboard/')) {
      let sub = cleanPath.split('/')[1] || 'overview';
      if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
      return sub;
    }
    if (queryTab && ['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(queryTab)) return queryTab;
    return 'overview';
  });

  const [activeTab, setActiveTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let path = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!path) {
      path = (searchParams?.get('tab') || initialSearchParams?.tab || '').toLowerCase();
    }
    
    // Check if path is a dashboard subtab or alias
    if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(path) || (path && path.startsWith('dashboard/'))) {
      return 'dashboard';
    }
    if (['sessions', 'shift-monitoring', 'shift-analytics', 'breakdown'].includes(path)) {
      return 'settings';
    }
    if (path === 'location-master' || path === 'location_territory') {
      return 'location_master';
    }

    if (!path) {
      const isAdmin = userRole === 'admin' || userRole === 'Admin';
      if (isAdmin || moduleAccess['analytics']?.view) path = 'dashboard';
      else if (moduleAccess['new_swan_ai']?.view) path = 'ai';
      else if (moduleAccess['callcenter']?.view) path = 'callcenter';
      else if (moduleAccess['aiadmin']?.view) path = 'aiadmin';
      else if (moduleAccess['aiknowledgebase']?.view) path = 'aiknowledgebase';
      else if (moduleAccess['calladmin']?.view) path = 'calladmin';
      else if (moduleAccess['aicallcenter']?.view) path = 'aicallcenter';
      else {
        // Fallback to first available module access
        const firstAllowed = Object.keys(moduleAccess || {}).find(k => moduleAccess[k]?.view);
        if (firstAllowed) path = firstAllowed;
        else path = 'dashboard';
      }
    }
    return path;
  });
  const [isMounted, setIsMounted] = useState(false);
  const [leads, setLeads] = useState([]);
  const [rawLeads, setRawLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [adminCompanyFilter, setAdminCompanyFilter] = useState('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [messageMenuExpanded, setMessageMenuExpanded] = useState(false);
  const [aiMenuExpanded, setAiMenuExpanded] = useState(false);
  const [attendanceMenuExpanded, setAttendanceMenuExpanded] = useState(false);
  const [attendanceSubTab, setAttendanceSubTab] = useState('my_attendance');
  const [checklistMenuExpanded, setChecklistMenuExpanded] = useState(false);
  const [checklistSubTab, setChecklistSubTab] = useState('dashboard');
  const [delegationMenuExpanded, setDelegationMenuExpanded] = useState(false);
  const [delegationSubTab, setDelegationSubTab] = useState('dashboard');
  const [settingsMenuExpanded, setSettingsMenuExpanded] = useState(false);
  const [currentSettingSubTab, setCurrentSettingSubTab] = useState('business');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const search = new URLSearchParams(window.location.search);
      const param = search.get('setting');
      if (param) {
        setCurrentSettingSubTab(param);
      }
      const attTab = search.get('tab') || search.get('subtab');
      if (attTab && (path === 'attendance' || (path && path.startsWith('attendance/')))) {
        setAttendanceSubTab(attTab);
      }
      if (attTab && (path === 'checklist' || (path && path.startsWith('checklist/')))) {
        setChecklistSubTab(attTab);
      }
      if (attTab && (path === 'delegation' || (path && path.startsWith('delegation/')))) {
        setDelegationSubTab(attTab);
      }
      if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(path)) {
        setDashboardSubTab(path === 'pipeline' || path === 'leads-data' ? 'lead-data' : path);
      } else if (path && path.startsWith('dashboard/')) {
        let sub = path.split('/')[1];
        if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
        if (sub) setDashboardSubTab(sub);
      } else if (path === 'dashboard' && attTab) {
        setDashboardSubTab(attTab === 'pipeline' || attTab === 'leads-data' ? 'lead-data' : attTab);
      }
    }
  }, [pathname]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [globalRolePermissions, setGlobalRolePermissions] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [impersonationInfo, setImpersonationInfo] = useState(null);
  const [adminRestoreToken, setAdminRestoreToken] = useState(null);

  // Online / Offline Detection & Dynamic Rule Synchronization
  const [isOnline, setIsOnline] = useState(true);
  const [offlineRuleVersion, setOfflineRuleVersion] = useState(0);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleRulesChanged = () => setOfflineRuleVersion(v => v + 1);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supuja_offline_rules_changed', handleRulesChanged);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supuja_offline_rules_changed', handleRulesChanged);
    };
  }, []);

  const isCurrentTabAllowedOffline = isOnline || isModuleAllowedOffline(activeTab);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const search = new URLSearchParams(window.location.search);
        const viewAs = search.get('view_as') || search.get('impersonate');
        if (viewAs || isImpersonating) {
          setImpersonationInfo({
            impersonated: true,
            name: userName,
            role: userRole,
            impersonatorAdmin: impersonatorAdmin || 'Admin',
            isTabIsolated: true
          });
          return;
        }

        const stored = sessionStorage.getItem('crm_impersonator');
        if (stored) {
          setImpersonationInfo(JSON.parse(stored));
        } else {
          // Check cookie
          const matchInfo = document.cookie.match(/crm_impersonator_info=([^;]+)/);
          if (matchInfo) {
            try {
              setImpersonationInfo(JSON.parse(decodeURIComponent(matchInfo[1])));
            } catch (e) {}
          }
        }

        const matchRestore = document.cookie.match(/crm_admin_restore_token=([^;]+)/);
        if (matchRestore) {
          setAdminRestoreToken(decodeURIComponent(matchRestore[1]));
        }
      }
    } catch (e) {
      console.error('Error reading impersonator session:', e);
    }
  }, [isImpersonating, userName, userRole, impersonatorAdmin]);

  const handleReturnToAdmin = () => {
    try {
      sessionStorage.removeItem('crm_impersonator');
    } catch (e) {}
    if (impersonationInfo?.isTabIsolated || isImpersonating) {
      if (window.opener) {
        window.close();
        return;
      }
      window.location.href = '/';
      return;
    }
    if (adminRestoreToken) {
      window.location.href = `/auth/restore-admin?token=${encodeURIComponent(adminRestoreToken)}`;
    } else {
      window.location.href = '/auth/restore-admin';
    }
  };

  const handleExitImpersonation = () => {
    try {
      sessionStorage.removeItem('crm_impersonator');
    } catch (e) {}
    window.location.href = '/auth/logout';
  };
  const [syncLoadedCount, setSyncLoadedCount] = useState(0);
  const [syncTotalCount, setSyncTotalCount] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));

  useEffect(() => {
    if (activeTab) {
      setVisitedTabs(prev => {
        if (prev.has(activeTab)) return prev;
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab]);

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch('/api/settings/permissions');
        if (res.ok) {
           const data = await res.json();
           const roleKey = userRole?.toLowerCase() || 'agent';
           if (data.permissions && data.permissions[roleKey]) {
             setGlobalRolePermissions(data.permissions[roleKey]);
           }
        }
      } catch (e) { console.error(e); }
    }
    loadPermissions();
    
    const handleUpdate = () => loadPermissions();
    window.addEventListener('global_permissions_updated', handleUpdate);
    return () => window.removeEventListener('global_permissions_updated', handleUpdate);
  }, [userRole]);

  // Global Config Migration Hook
  useEffect(() => {
    const defaultStages = [
      { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
      { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] }
    ];

    const saved = localStorage.getItem('crm_config');
    let config = saved ? JSON.parse(saved) : {};
    
    // If stages are missing or outdated (e.g. conversion stage doesn't have 20+ substages), force update
    if (!config.stages || config.stages.length === 0 || (config.stages[5]?.substages?.length || 0) < 20) {
      config.stages = defaultStages;
      localStorage.setItem('crm_config', JSON.stringify(config));
      window.dispatchEvent(new Event('crm_config_updated'));
    }

    // Sync Page Navigation Settings from Database
    fetch('/api/settings/page-navigation')
      .then(res => res.json())
      .then(data => {
        if (data?.settings) {
          localStorage.setItem('crmPageNavSettings', JSON.stringify(data.settings));
          window.dispatchEvent(new Event('crm_page_nav_updated'));
        }
      })
      .catch(() => {});
  }, []);

  const [leadDataExpanded, setLeadDataExpanded] = useState(false);
  const [recruiterMenuExpanded, setRecruiterMenuExpanded] = useState(false);
  const [recruiterFilterStage, setRecruiterFilterStage] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({
    'Sales': false,
    'Purchase': false,
    'Human Resource': false,
    'System': false
  });

  useEffect(() => {
    localStorage.setItem('crm-sidebar-collapsed', isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  // Auto-expand categories and submenus when activeTab changes
  useEffect(() => {
    let categoryToExpand = null;
    const salesTabs = ['registration', 'report', 'leads', 'orders'];
    const purchaseTabs = ['mrp', 'mrp_against'];
    const hrTabs = ['recruiter', 'joining'];
    const systemTabs = ['team', 'public_users', 'aiadmin', 'aiknowledgebase', 'calladmin', 'aicallcenter', 'whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config', 'settings'];

    if (salesTabs.includes(activeTab)) {
      categoryToExpand = 'Sales';
    } else if (purchaseTabs.includes(activeTab)) {
      categoryToExpand = 'Purchase';
    } else if (hrTabs.includes(activeTab)) {
      categoryToExpand = 'Human Resource';
    } else if (systemTabs.includes(activeTab)) {
      categoryToExpand = 'System';
    }

    if (categoryToExpand) {
      setExpandedCategories({
        'Sales': categoryToExpand === 'Sales',
        'Purchase': categoryToExpand === 'Purchase',
        'Human Resource': categoryToExpand === 'Human Resource',
        'System': categoryToExpand === 'System'
      });
    }

    // Auto-expand submenus
    setLeadDataExpanded(activeTab === 'leads');
    setRecruiterMenuExpanded(activeTab === 'recruiter');
    setAttendanceMenuExpanded(activeTab === 'attendance');
    setChecklistMenuExpanded(activeTab === 'checklist');
    setDelegationMenuExpanded(activeTab === 'delegation');
    setAiMenuExpanded(['aiadmin', 'aiknowledgebase'].includes(activeTab));
    setMessageMenuExpanded(['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(activeTab));
    setSettingsMenuExpanded(activeTab === 'settings');
  }, [activeTab]);

  useEffect(() => {
    const handleSubTabChange = (e) => {
      if (e.detail) {
        setCurrentSettingSubTab(e.detail);
      }
    };
    window.addEventListener('setting_subtab_change', handleSubTabChange);
    return () => window.removeEventListener('setting_subtab_change', handleSubTabChange);
  }, []);

  const toggleCategory = (categoryName) => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };
  
  const [currentTheme, setCurrentTheme] = useState('default');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const profileMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [userAvatar, setUserAvatar] = useState(initialAvatar || null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Load and apply theme & avatar
  useEffect(() => {
    const savedTheme = localStorage.getItem('crm-theme') || 'default';
    setCurrentTheme(savedTheme);
    
    if (initialAvatar) {
      setUserAvatar(initialAvatar);
      if (userId) {
        localStorage.setItem(`crm_user_avatar_${userId}`, initialAvatar);
      }
      localStorage.setItem('crm_user_avatar', initialAvatar);
    } else {
      const userKey = userId ? `crm_user_avatar_${userId}` : 'crm_user_avatar';
      const savedAvatar = localStorage.getItem(userKey) || localStorage.getItem('crm_user_avatar');
      if (savedAvatar) setUserAvatar(savedAvatar);
    }

    // Sync latest avatar from Supabase Auth only if not already provided via server props
    if (!initialAvatar) {
      const userKey = userId ? `crm_user_avatar_${userId}` : 'crm_user_avatar';
      const savedAvatar = typeof window !== 'undefined' ? (localStorage.getItem(userKey) || localStorage.getItem('crm_user_avatar')) : null;
      if (!savedAvatar) {
        supabase.auth.getUser().then(({ data }) => {
          const liveAvatar = data?.user?.user_metadata?.avatar_url;
          if (liveAvatar) {
            setUserAvatar(liveAvatar);
            if (userId) localStorage.setItem(`crm_user_avatar_${userId}`, liveAvatar);
            localStorage.setItem('crm_user_avatar', liveAvatar);
          }
        }).catch(() => {});
      }
    }
  }, [initialAvatar, userId]);

  useEffect(() => {
    document.documentElement.className = '';
    if (currentTheme !== 'default') {
      document.documentElement.classList.add(currentTheme);
    }
    localStorage.setItem('crm-theme', currentTheme);
  }, [currentTheme]);

  // Click outside for all top header dropdowns (desktop + mobile touch)
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setShowThemeMenu(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const compressAvatarFile = (file) => {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            const maxDim = 320;
            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressed);
          };
          img.onerror = () => resolve(readerEvent.target?.result || '');
          img.src = readerEvent.target?.result;
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      } catch (err) {
        console.warn('Canvas compression fallback:', err);
        resolve('');
      }
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 15 * 1024 * 1024) {
      alert("Please select an image smaller than 15MB.");
      return;
    }

    const isImage = file.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|jfif|heic|svg)$/i.test(file.name);
    if (!isImage) {
      alert("Please select a valid image file (JPG, PNG, WEBP, GIF, etc.).");
      return;
    }

    setIsUploadingAvatar(true);
    const prevAvatar = userAvatar;
    
    try {
      // 1. Fast client-side compression for instant 15KB payload
      const base64Data = await compressAvatarFile(file);

      if (!base64Data) {
        throw new Error("Failed to process image file");
      }

      // 2. Instant Local State & Preview
      setUserAvatar(base64Data);
      const userKey = userId ? `crm_user_avatar_${userId}` : 'crm_user_avatar';
      localStorage.setItem(userKey, base64Data);
      localStorage.setItem('crm_user_avatar', base64Data);

      // 3. Upload to Supabase Storage and save public URL across all devices
      let targetUserId = userId;
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      const formData = new FormData();
      formData.append('base64', base64Data);
      if (targetUserId) formData.append('userId', targetUserId);

      const res = await uploadUserAvatar(formData);
      if (res?.success && res?.avatarUrl) {
        setUserAvatar(res.avatarUrl);
        if (targetUserId) {
          localStorage.setItem(`crm_user_avatar_${targetUserId}`, res.avatarUrl);
        }
        localStorage.setItem('crm_user_avatar', res.avatarUrl);
      }
    } catch (err) {
      console.error('Photo upload exception:', err);
      if (!userAvatar) setUserAvatar(prevAvatar);
      alert('Photo upload failed. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Are you sure you want to remove your profile photo?")) return;
    setIsUploadingAvatar(true);
    try {
      let targetUserId = userId;
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }
      if (targetUserId) {
        await removeUserAvatar(targetUserId);
        localStorage.removeItem(`crm_user_avatar_${targetUserId}`);
      }
      localStorage.removeItem('crm_user_avatar');
      setUserAvatar(null);
    } catch (err) {
      console.error('Remove avatar error:', err);
      alert('Failed to remove photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Auto-track session with periodic heartbeat & force logout enforcement
  useEffect(() => {
    let isMounted = true;
    async function trackSession() {
      // 0. If device is offline, skip online session verification to prevent false logouts
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      try {
        const { logUserSession, checkSessionValidity } = await import('@/app/actions/audit');
        const device = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Device';
        
        // 1. Check if admin terminated this session FIRST
        // When in impersonation mode, the admin is actively viewing the employee view
        const isImpersonating = typeof window !== 'undefined' && !!(
          sessionStorage.getItem('crm_impersonator') || 
          document.cookie.includes('crm_impersonator_info')
        );

        if (!isImpersonating && typeof navigator !== 'undefined' && navigator.onLine) {
          const validity = await checkSessionValidity(device);
          if (isMounted && validity && validity.valid === false && validity.forceLogout === true) {
            alert("Your session has been terminated by the administrator.");
            await supabase.auth.signOut();
            window.location.href = '/auth/logout?reason=force_logout';
            return;
          }
        }

        // 2. Send heartbeat only if session is active
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const logRes = await logUserSession(device);
          if (!isImpersonating && isMounted && logRes && logRes.valid === false && logRes.forceLogout === true) {
            alert("Your session has been terminated by the administrator.");
            await supabase.auth.signOut();
            window.location.href = '/auth/logout?reason=force_logout';
            return;
          }
        }
      } catch (e) {
        console.warn('Session tracking non-blocking network error:', e);
      }
    }
    
    // Initial session track on mount (SessionExpiryTracker handles ongoing heartbeats)
    trackSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch user email & metadata avatar only if missing from server props
  useEffect(() => {
    async function fetchUser() {
      if (initialUserEmail) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isImpersonating && !initialUserEmail && user?.email) {
          setUserEmail(user.email);
        }
        if (!isImpersonating && user?.user_metadata?.avatar_url) {
          setUserAvatar(user.user_metadata.avatar_url);
          localStorage.setItem(`crm_user_avatar_${user.id}`, user.user_metadata.avatar_url);
          localStorage.setItem('crm_user_avatar', user.user_metadata.avatar_url);
        }
      } catch (err) {
        console.warn('Error fetching auth user in CRMContainer:', err);
      }
    }
    if (!initialUserEmail) {
      fetchUser();
    }
  }, [isImpersonating, initialUserEmail]);
  
  // Fetch team members for LeadTable dropdown
  useEffect(() => {
    async function loadTeam() {
      try {
        const response = await getTeamMembers();
        if (response && Array.isArray(response)) {
          setTeamMembers(response);
        } else if (response?.data) {
          setTeamMembers(response.data);
        }
      } catch (error) {
        console.error("Failed to load team members:", error);
      }
    }
    loadTeam();
  }, []);
  
  const prevLeadsSigRef = useRef('');
  const initialSyncFinishedRef = useRef(false);
  const saveLeadsTimeoutRef = useRef(null);

  const debouncedSaveLeadsLocally = (updatedLeads) => {
    if (saveLeadsTimeoutRef.current) {
      clearTimeout(saveLeadsTimeoutRef.current);
    }
    saveLeadsTimeoutRef.current = setTimeout(() => {
      saveLeadsLocally(updatedLeads);
    }, 800);
  };

  const updateLeadsIfChanged = (newList) => {
    const listToProcess = Array.isArray(newList) ? newList : (newList ? [newList] : []);
    const sig = listToProcess.map(l => `${l.id}-${l.status}-${l.assigned_to}-${l.follow_up_date || ''}-${l.lead_notes?.length || 0}`).join('|');
    if (prevLeadsSigRef.current !== sig) {
      prevLeadsSigRef.current = sig;
      setLeads(Array.isArray(newList) ? newList : (prev => {
        if (!newList) return prev;
        return prev.map(l => l.id === newList.id ? { ...l, ...newList } : l);
      }));
    }
  };

  // Client-side fetch of all leads (Progressive Loading with sync tracking)
  useEffect(() => {
    if (!hasLeadsAccess) {
      setLoadingLeads(false);
      setIsSyncing(false);
      return;
    }

    async function loadLeads() {
      setIsSyncing(true);
      const supabase = createClient();
      
      // 0. Instant 0ms Cache Hydration from IndexedDB
      let localCachedLeads = [];
      try {
        localCachedLeads = await getLocalLeads();
        if (Array.isArray(localCachedLeads) && localCachedLeads.length > 0) {
          setRawLeads(localCachedLeads);
          setSyncLoadedCount(localCachedLeads.length);
          setLoadingLeads(false);
        } else {
          setLoadingLeads(true);
        }
      } catch (cacheErr) {
        console.warn("Local leads cache read error:", cacheErr);
        setLoadingLeads(true);
      }

      let total = 0;
      try {
        const { count, error: countError } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true });
        if (!countError && count) {
          total = count;
          setSyncTotalCount(total);
        }
      } catch (e) {
        console.error("Failed to fetch leads count:", e);
      }

      // Default to optimal 1000 pageSize to minimize HTTP requests
      let pageSize = 1000;
      try {
        const saved = localStorage.getItem('crm_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.leadSyncChunkSize) {
            if (parsed.leadSyncChunkSize === 'all') {
              pageSize = 100000;
            } else {
              pageSize = parseInt(parsed.leadSyncChunkSize, 10) || 1000;
            }
          }
        }
      } catch (e) {
        console.error("Failed to load leadSyncChunkSize:", e);
      }
      
      // Cap at Supabase page size limit (1000)
      const queryPageSize = Math.min(1000, pageSize);
      const numPages = total > 0 ? Math.ceil(total / queryPageSize) : 1;
      
      let loadedLeads = [];
      
      // Helper function to fetch a single page of leads with retry logic
      const fetchLeadsPageWithRetry = async (p, retries = 3) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const { data, error } = await supabase
              .from('leads')
              .select('*')
              .order('created_at', { ascending: false })
              .order('id')
              .range(p * queryPageSize, (p + 1) * queryPageSize - 1);
            
            if (error) throw error;
            return data || [];
          } catch (err) {
            console.warn(`Attempt ${attempt} failed for leads Page ${p}:`, err);
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      };

      // Helper function to fetch a single page of notes with retry logic
      const fetchNotesPageWithRetry = async (p, notesPageSize, retries = 3) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const { data, error } = await supabase
              .from('lead_notes')
              .select('id, lead_id, created_at, note_text, created_by')
              .order('created_at', { ascending: false })
              .range(p * notesPageSize, (p + 1) * notesPageSize - 1);
            
            if (error) throw error;
            return data || [];
          } catch (err) {
            console.warn(`Attempt ${attempt} failed for notes Page ${p}:`, err);
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      };

      try {
        const hasValidLocalCache = Array.isArray(localCachedLeads) && localCachedLeads.length > 0 &&
          localCachedLeads.some(l => Array.isArray(l.lead_notes) && l.lead_notes.length > 0);

        if (hasValidLocalCache) {
          // =========================================================================
          // HIGH-EFFICIENCY DELTA SYNC (Conserves 99% Supabase Egress & Eliminates Lag)
          // =========================================================================
          let maxLeadCreatedAt = null;
          let maxNoteCreatedAt = null;

          for (const l of localCachedLeads) {
            if (l.created_at && (!maxLeadCreatedAt || l.created_at > maxLeadCreatedAt)) {
              maxLeadCreatedAt = l.created_at;
            }
            if (Array.isArray(l.lead_notes)) {
              for (const n of l.lead_notes) {
                if (n.created_at && (!maxNoteCreatedAt || n.created_at > maxNoteCreatedAt)) {
                  maxNoteCreatedAt = n.created_at;
                }
              }
            }
          }

          // 1. Fetch Page 0 (top 1000 most recent leads) to sync status/assignment updates on active leads
          const page0Data = await fetchLeadsPageWithRetry(0);

          // 2. Fetch new notes created since last sync
          let newNotes = [];
          if (maxNoteCreatedAt) {
            try {
              const { data: deltaNotes, error: dNoteErr } = await supabase
                .from('lead_notes')
                .select('id, lead_id, created_at, note_text, created_by')
                .gt('created_at', maxNoteCreatedAt)
                .order('created_at', { ascending: false })
                .limit(2000);
              if (!dNoteErr && Array.isArray(deltaNotes)) {
                newNotes = deltaNotes;
              }
            } catch (e) {
              console.warn("Delta notes fetch error:", e);
            }
          }

          // 3. Fetch any newly added leads
          let newLeads = [];
          if (maxLeadCreatedAt && total > localCachedLeads.length) {
            try {
              const { data: deltaLeads, error: dLeadErr } = await supabase
                .from('leads')
                .select('*')
                .gt('created_at', maxLeadCreatedAt)
                .order('created_at', { ascending: false })
                .limit(1000);
              if (!dLeadErr && Array.isArray(deltaLeads)) {
                newLeads = deltaLeads;
              }
            } catch (e) {
              console.warn("Delta leads fetch error:", e);
            }
          }

          // 4. Merge cleanly: Preserve existing notes, apply fresh Page 0 updates, add new leads & notes
          const leadsMap = new Map();
          for (const l of localCachedLeads) {
            leadsMap.set(l.id, { ...l, lead_notes: Array.isArray(l.lead_notes) ? [...l.lead_notes] : [] });
          }

          // Merge recent page 0 leads (preserves existing notes)
          for (const rl of page0Data) {
            const existing = leadsMap.get(rl.id);
            if (existing) {
              leadsMap.set(rl.id, { ...existing, ...rl, lead_notes: existing.lead_notes });
            } else {
              leadsMap.set(rl.id, { ...rl, lead_notes: [] });
            }
          }

          // Add brand new leads
          for (const nl of newLeads) {
            if (!leadsMap.has(nl.id)) {
              leadsMap.set(nl.id, { ...nl, lead_notes: [] });
            }
          }

          // Merge newly arrived notes
          if (newNotes.length > 0) {
            for (const n of newNotes) {
              const targetLead = leadsMap.get(n.lead_id);
              if (targetLead) {
                const notesList = targetLead.lead_notes || [];
                if (!notesList.some(existingN => existingN.id === n.id)) {
                  targetLead.lead_notes = [n, ...notesList];
                }
              }
            }
          }

          const finalMerged = Array.from(leadsMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          setRawLeads(finalMerged);
          setSyncLoadedCount(finalMerged.length);
          saveLeadsLocally(finalMerged);
        } else {
          // =========================================================================
          // FULL INITIAL SYNC (Only for cold start / first time browser / empty cache)
          // =========================================================================
          // 1. Fetch Page 0 of leads first for instant UI response
          const page0Data = await fetchLeadsPageWithRetry(0);
          loadedLeads = [...page0Data];
          
          // Render first chunk immediately
          setRawLeads(loadedLeads.map(l => ({ ...l, lead_notes: [] })));
          setSyncLoadedCount(loadedLeads.length);
          setLoadingLeads(false);

          // 2. Fetch remaining pages of leads in parallel batches of 2
          const remainingPages = Array.from({ length: numPages - 1 }, (_, i) => i + 1);
          const leadsBatchSize = 2;
          
          for (let i = 0; i < remainingPages.length; i += leadsBatchSize) {
            const batch = remainingPages.slice(i, i + leadsBatchSize);
            const batchResults = await Promise.all(batch.map(p => fetchLeadsPageWithRetry(p)));
            for (const data of batchResults) {
              loadedLeads = loadedLeads.concat(data);
            }
            setSyncLoadedCount(loadedLeads.length);
            
            // Deduplicate and update state cleanly without quadratic array duplication
            const currentSnapshot = [...loadedLeads];
            const unique = [];
            const seen = new Set();
            for (const lead of currentSnapshot) {
              if (!seen.has(lead.id)) {
                seen.add(lead.id);
                unique.push({ ...lead, lead_notes: [] });
              }
            }
            const finalLeads = unique.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setRawLeads(finalLeads);
            saveLeadsLocally(finalLeads);
          }

          // 3. Fetch ALL lead notes so every lead has full history and accurate Last Status
          try {
            const { count: totalNotesCount } = await supabase
              .from('lead_notes')
              .select('*', { count: 'exact', head: true });

            const notesPageSize = 1000;
            const totalNotes = totalNotesCount || 0;
            const notesNumPages = totalNotes > 0 ? Math.ceil(totalNotes / notesPageSize) : 1;
            
            let allNotes = [];
            const notesBatches = Array.from({ length: notesNumPages }, (_, i) => i);
            const notesBatchSize = 4; // Fetch 4 pages (4,000 notes) in parallel batches
            
            for (let i = 0; i < notesBatches.length; i += notesBatchSize) {
              const currentBatch = notesBatches.slice(i, i + notesBatchSize);
              const results = await Promise.all(currentBatch.map(p => fetchNotesPageWithRetry(p, notesPageSize)));
              for (const data of results) {
                if (Array.isArray(data)) {
                  allNotes = allNotes.concat(data);
                }
              }
            }

            if (allNotes.length > 0) {
              const notesMap = {};
              for (const note of allNotes) {
                if (!notesMap[note.lead_id]) {
                  notesMap[note.lead_id] = [];
                }
                notesMap[note.lead_id].push(note);
              }

              setRawLeads(prev => {
                const withNotes = prev.map(lead => ({
                  ...lead,
                  lead_notes: notesMap[lead.id] || lead.lead_notes || []
                })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                saveLeadsLocally(withNotes);
                return withNotes;
              });
            }
          } catch (notesErr) {
            console.error("Failed to fetch all lead notes:", notesErr);
          }
        }

      } catch (err) {
        console.error("Lead sync failed, falling back to local IndexedDB storage:", err);
        try {
          const localCache = await getLocalLeads();
          if (localCache && localCache.length > 0) {
            setRawLeads(localCache);
          }
        } catch (e) {}
      } finally {
        setLoadingLeads(false);
        setIsSyncing(false);
      }
    }
    loadLeads();

    // Setup Realtime Subscription for CRMContainer
    const channel = supabase
      .channel('crm_container_leads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => {
          if (current.some(item => item.id === payload.new.id)) return current;
          const updated = [{ ...payload.new, lead_notes: [] }, ...current];
          debouncedSaveLeadsLocally(updated);
          return updated;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => {
          const updated = current.map(item => item.id === payload.new.id ? { ...item, ...payload.new, lead_notes: item.lead_notes || [] } : item);
          debouncedSaveLeadsLocally(updated);
          return updated;
        });
        setLeads((current) => current.map(item => item.id === payload.new.id ? { ...item, ...payload.new, lead_notes: item.lead_notes || [] } : item));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => {
          const updated = current.filter(item => item.id !== payload.old.id);
          debouncedSaveLeadsLocally(updated);
          return updated;
        });
        setLeads((current) => current.filter(item => item.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes' }, (payload) => {
        const incoming = payload.new;
        setRawLeads((current) => {
          const updated = current.map(item => {
            if (item.id !== incoming.lead_id) return item;
            const existingNotes = item.lead_notes || [];
            if (existingNotes.some(n => n.id === incoming.id)) return item;
            return { ...item, lead_notes: [incoming, ...existingNotes] };
          });
          debouncedSaveLeadsLocally(updated);
          return updated;
        });
        setLeads((current) => current.map(item => {
          if (item.id !== incoming.lead_id) return item;
          const existingNotes = item.lead_notes || [];
          if (existingNotes.some(n => n.id === incoming.id)) return item;
          return { ...item, lead_notes: [incoming, ...existingNotes] };
        }));
      })
      .subscribe();

    // Reactive listener for local offline actions (instant 0ms front-end table update)
    const handleOfflineQueueChanged = async () => {
      const cached = await getLocalLeads();
      if (cached && cached.length > 0) {
        setRawLeads(cached.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    };
    window.addEventListener('supuja_offline_queue_changed', handleOfflineQueueChanged);

    return () => {
      if (saveLeadsTimeoutRef.current) clearTimeout(saveLeadsTimeoutRef.current);
      supabase.removeChannel(channel);
      window.removeEventListener('supuja_offline_queue_changed', handleOfflineQueueChanged);
    };
  }, [hasLeadsAccess]);

  // Filter leads based on company and step assignments
  useEffect(() => {
    if (loadingLeads) return;
    
    let preFilteredLeads = rawLeads;
    
    // 1. Apply Company Filter
    if (userRole === 'admin' || userRole === 'Admin') {
      if (adminCompanyFilter !== 'All') {
        preFilteredLeads = rawLeads.filter(l => l.our_company === adminCompanyFilter);
      }
    } else {
      // Regular Agents only see their assigned company's leads
      if (userCompany) {
         preFilteredLeads = rawLeads.filter(l => l.our_company === userCompany);
      }
    }
    
    // 2. Admins always see everything (within their chosen company)
    if (userRole === 'admin' || userRole === 'Admin') {
      updateLeadsIfChanged(preFilteredLeads);
      return;
    }
    
    const leadsAccess = moduleAccess?.leads || {};
    
    // 3. If manager access or viewAll permission, see everything (within their company)
    if (leadsAccess.is_manager || globalRolePermissions?.viewAll) {
      updateLeadsIfChanged(preFilteredLeads);
      return;
    }
    
    // 4. If agent access, only see leads in assigned steps AND that are either open (null) or assigned to them
    const assignedSteps = leadsAccess.assigned_steps && leadsAccess.assigned_steps.length > 0 
      ? leadsAccess.assigned_steps 
      : Object.keys(leadsAccess.sub_items || {}).filter(k => k !== 'lead_dashboard' && k !== 'hourly_work' && leadsAccess.sub_items[k]?.view === true);
    
    if (assignedSteps.length > 0) {
      const filteredLeads = preFilteredLeads.filter(lead => {
        const leadStage = getStageFromStatus(lead.status);
        return assignedSteps.includes(leadStage) && 
               (lead.assigned_to === null || lead.assigned_to === undefined || lead.assigned_to === userId);
      });
      updateLeadsIfChanged(filteredLeads);
    } else {
      // If view is true but no steps assigned, they see nothing
      updateLeadsIfChanged([]);
    }
  }, [rawLeads, loadingLeads, moduleAccess, userRole, adminCompanyFilter, userCompany, userId, globalRolePermissions]);

  // Handle local updates from child components so background fetches don't overwrite them
  const handleLeadsChange = (updatedFilteredLeads) => {
    const leadsArray = Array.isArray(updatedFilteredLeads) ? updatedFilteredLeads : (updatedFilteredLeads ? [updatedFilteredLeads] : []);
    if (leadsArray.length === 0) return;

    setRawLeads(prevRaw => {
      const updatedMap = new Map(leadsArray.map(l => [l.id, l]));
      return prevRaw.map(l => {
        if (updatedMap.has(l.id)) {
          return { ...l, ...updatedMap.get(l.id) };
        }
        return l;
      });
    });

    setLeads(prevLeads => {
      const updatedMap = new Map(leadsArray.map(l => [l.id, l]));
      return prevLeads.map(l => {
        if (updatedMap.has(l.id)) {
          return { ...l, ...updatedMap.get(l.id) };
        }
        return l;
      });
    });
  };

  const [currentTime, setCurrentTime] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'yesterday' | 'today' | 'tomorrow' | 'overdue' | 'upcoming'
  const [notifSearch, setNotifSearch] = useState('');
  const [collapsedDates, setCollapsedDates] = useState(new Set());
  const [notifMainTab, setNotifMainTab] = useState('all'); // 'all' | 'checklist' | 'delegation' | 'leads'
  const [userDelegationTasks, setUserDelegationTasks] = useState([]);
  const [userChecklistSlots, setUserChecklistSlots] = useState([]);
  const [pendingLeadToOpen, setPendingLeadToOpen] = useState(null);
  const [pendingChecklistSlot, setPendingChecklistSlot] = useState(null);
  const [activeCornerToast, setActiveCornerToast] = useState(null);
  const [activeCenterModal, setActiveCenterModal] = useState(null);
  const [showNotificationPreferencesModal, setShowNotificationPreferencesModal] = useState(false);
  const [isDesktopPromptDismissed, setIsDesktopPromptDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm_desktop_notif_dismissed') === 'true';
    }
    return false;
  });
  const [browserPermission, setBrowserPermission] = useState('default');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScreenCapture, setLastScreenCapture] = useState(null);
  const [leadsFilterStage, setLeadsFilterStage] = useState(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Global Keyboard shortcut for Intelligent Spotlight Search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check browser notification permission status on mount and listen for test alert preview
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }

    const handleTestEvent = (e) => {
      const testPrefs = e.detail || {};
      triggerUnifiedAlert({
        id: `test_${Date.now()}`,
        type: 'test',
        title: '🔔 Alert Preview: Notifications Working!',
        subtitle: 'SuPuja Creations CRM',
        details: 'This is a live preview of your chosen popup style and sound alert settings.',
        dueTime: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
        targetTab: 'leads',
        isUrgent: true,
        forcePopupStyle: testPrefs.popupStyle
      });
    };

    window.addEventListener('test_user_screen_alert', handleTestEvent);
    return () => window.removeEventListener('test_user_screen_alert', handleTestEvent);
  }, []);

  const handleRequestDesktopPermission = async (e) => {
    if (e) e.stopPropagation();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setBrowserPermission(result);
        if (result === 'granted') {
          localStorage.setItem('crm_desktop_notif_dismissed', 'true');
          setIsDesktopPromptDismissed(true);
          try {
            const existing = localStorage.getItem('crm_config');
            const parsed = existing ? JSON.parse(existing) : {};
            parsed.browserPushEnabled = true;
            localStorage.setItem('crm_config', JSON.stringify(parsed));
            window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: parsed }));
          } catch (err) {}
        }
      } catch (err) {
        console.error('Error requesting desktop permission:', err);
      }
    }
  };

  const handleDismissDesktopPrompt = (e) => {
    if (e) e.stopPropagation();
    localStorage.setItem('crm_desktop_notif_dismissed', 'true');
    setIsDesktopPromptDismissed(true);
  };

  // Sync stage with localStorage when it changes (initial load covered by state initializer)
  useEffect(() => {
    if (leadsFilterStage) {
      localStorage.setItem('crmActiveStage', leadsFilterStage);
    } else {
      localStorage.removeItem('crmActiveStage');
    }
  }, [leadsFilterStage]);

  useEffect(() => {
    setIsMounted(true);
    
    // Sync initial sidebar collapse state from localStorage on mount
    const collapsed = localStorage.getItem('crm-sidebar-collapsed') === 'true';
    setIsSidebarCollapsed(collapsed);

    // Sync initial route path and parameters on mount
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const params = new URLSearchParams(window.location.search);
    let tab = path || params.get('tab');
    if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(tab)) {
      setDashboardSubTab(tab === 'pipeline' || tab === 'leads-data' ? 'lead-data' : tab);
      tab = 'dashboard';
    } else if (tab && tab.startsWith('dashboard/')) {
      let sub = tab.split('/')[1];
      if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
      if (sub) setDashboardSubTab(sub);
      tab = 'dashboard';
    } else if (tab === 'dashboard') {
      let sub = params.get('subtab') || params.get('tab');
      if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
      if (sub) setDashboardSubTab(sub);
    } else if (tab === 'sessions' || tab === 'shift-monitoring' || tab === 'shift-analytics' || tab === 'breakdown') {
      tab = 'settings';
      setCurrentSettingSubTab('sessions');
    } else if (tab === 'settings') {
      const settingParam = params.get('setting') || (params.get('sessionTab') ? 'sessions' : null);
      if (settingParam) {
        setCurrentSettingSubTab(settingParam);
      }
    } else if (tab === 'location-master' || tab === 'location_territory') {
      tab = 'location_master';
    }
    if (tab) {
      setActiveTab(tab);
      let stage = params.get('stage');
      if (stage === 'all') stage = null;
      if (stage) {
        setLeadsFilterStage(stage);
      } else {
        const savedStage = localStorage.getItem('crmActiveStage');
        if (savedStage) setLeadsFilterStage(savedStage);
      }
    } else {
      const savedStage = localStorage.getItem('crmActiveStage');
      if (savedStage) setLeadsFilterStage(savedStage);
    }

    // Set client-safe current time
    setCurrentTime(Date.now());

    // Keep track of time every 10 seconds to trigger exact-time notifications
    const interval = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // Listen for browser back/forward popstate events
  useEffect(() => {
    const handlePopState = () => {
      let tab = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const params = new URLSearchParams(window.location.search);
      if (!tab) tab = params.get('tab');
      if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(tab)) {
        setDashboardSubTab(tab === 'pipeline' || tab === 'leads-data' ? 'lead-data' : tab);
        tab = 'dashboard';
      } else if (tab && tab.startsWith('dashboard/')) {
        let sub = tab.split('/')[1];
        if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
        if (sub) setDashboardSubTab(sub);
        tab = 'dashboard';
      } else if (tab === 'dashboard') {
        let sub = params.get('subtab') || params.get('tab');
        if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
        if (sub) setDashboardSubTab(sub);
      } else if (tab === 'sessions' || tab === 'shift-monitoring' || tab === 'shift-analytics' || tab === 'breakdown') {
        tab = 'settings';
        setCurrentSettingSubTab('sessions');
      } else if (tab === 'settings') {
        const settingParam = params.get('setting') || (params.get('sessionTab') ? 'sessions' : null);
        if (settingParam) {
          setCurrentSettingSubTab(settingParam);
        }
      } else if (tab === 'location-master' || tab === 'location_territory') {
        tab = 'location_master';
      }
      
      if (!tab) {
        const isAdmin = userRole === 'admin' || userRole === 'Admin';
        if (isAdmin || moduleAccess['analytics']?.view) tab = 'dashboard';
        else if (moduleAccess['new_swan_ai']?.view) tab = 'ai';
        else if (moduleAccess['callcenter']?.view) tab = 'callcenter';
        else if (moduleAccess['aiadmin']?.view) tab = 'aiadmin';
        else if (moduleAccess['aiknowledgebase']?.view) tab = 'aiknowledgebase';
        else if (moduleAccess['calladmin']?.view) tab = 'calladmin';
        else if (moduleAccess['aicallcenter']?.view) tab = 'aicallcenter';
        else {
          const firstAllowed = Object.keys(moduleAccess || {}).find(k => moduleAccess[k]?.view);
          if (firstAllowed) tab = firstAllowed;
          else tab = 'dashboard';
        }
      }
      
      setActiveTab(tab);
      
      let stage = params.get('stage');
      if (stage === 'all') stage = null;
      setLeadsFilterStage(stage);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [moduleAccess, userRole]);

  // Ensure active lead filter stage is allowed based on granular permissions
  useEffect(() => {
    if (activeTab === 'leads' && leadsFilterStage) {
      if (leadsFilterStage === 'hourly_work') {
        const canHourly = getSubItemPermissions(moduleAccess, userRole, 'leads', 'hourly_work').view;
        if (!canHourly) {
          const canDashboard = getSubItemPermissions(moduleAccess, userRole, 'leads', 'lead_dashboard').view;
          handleStageChange(canDashboard ? 'lead_dashboard' : null);
        }
      } else if (leadsFilterStage === 'lead_dashboard' || leadsFilterStage === 'dashboard') {
        const canDashboard = getSubItemPermissions(moduleAccess, userRole, 'leads', 'lead_dashboard').view;
        if (!canDashboard) {
          const canHourly = getSubItemPermissions(moduleAccess, userRole, 'leads', 'hourly_work').view;
          handleStageChange(canHourly ? 'hourly_work' : null);
        }
      }
    }
  }, [moduleAccess, userRole, activeTab, leadsFilterStage]);

  // Live Active Tab Access Guard: If current active tab is revoked by Admin, immediately switch to first allowed tab
  useEffect(() => {
    if (isAdmin) return;
    if (!isTabPermitted(activeTab, moduleAccess, userRole)) {
      const allPossibleTabs = [
        'dashboard', 'leads', 'registration', 'report', 'orders', 'mrp', 'mrp_against',
        'recruiter', 'joining', 'party', 'workplace', 'callcenter', 'whatsapp_official',
        'whatsapp_unofficial', 'calladmin', 'aicallcenter', 'email_config', 'admin_message_config', 'settings'
      ];
      const nextAllowedTab = allPossibleTabs.find(t => isTabPermitted(t, moduleAccess, userRole));
      if (nextAllowedTab) {
        handleTabChange(nextAllowedTab);
      }
    }
  }, [moduleAccess, userRole, activeTab, isAdmin]);

  const handleTabChange = async (tabId) => {
    if (tabId === 'ai' && activeTab !== 'ai') {
      try {
        const canvas = await html2canvas(document.body, { scale: Math.min(window.devicePixelRatio || 1, 1.5) });
        setLastScreenCapture(canvas.toDataURL('image/jpeg', 0.4));
      } catch (err) {
        console.error("Screenshot capture failed", err);
      }
    } else if (tabId !== 'ai') {
      setLastScreenCapture(null);
    }

    if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(tabId)) {
      const canonical = (tabId === 'pipeline' || tabId === 'leads-data') ? 'lead-data' : tabId;
      React.startTransition(() => {
        setActiveTab('dashboard');
        setDashboardSubTab(canonical);
      });
      window.history.pushState(null, '', `/${canonical}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    React.startTransition(() => {
      setActiveTab(tabId);
    });
    
    const newPath = `/${tabId}`;
    
    // Update URL instantly using native History API with a clean slate
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSettingSubTabChange = (subTabId) => {
    setCurrentSettingSubTab(subTabId);
    if (activeTab !== 'settings') {
      React.startTransition(() => {
        setActiveTab('settings');
      });
    }
    const newPath = `/settings?setting=${subTabId}`;
    window.history.pushState(null, '', newPath);
    window.dispatchEvent(new CustomEvent('setting_subtab_change', { detail: subTabId }));
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleAttendanceSubTabChange = (subTabId) => {
    setAttendanceSubTab(subTabId);
    if (activeTab !== 'attendance') {
      React.startTransition(() => {
        setActiveTab('attendance');
      });
    }
    const newPath = `/attendance?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleChecklistSubTabChange = (subTabId) => {
    setChecklistSubTab(subTabId);
    if (activeTab !== 'checklist') {
      React.startTransition(() => {
        setActiveTab('checklist');
      });
    }
    const newPath = `/checklist?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleDelegationSubTabChange = (subTabId) => {
    setDelegationSubTab(subTabId);
    if (activeTab !== 'delegation') {
      React.startTransition(() => {
        setActiveTab('delegation');
      });
    }
    const newPath = `/delegation?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleStageChange = (stage, subtab = null) => {
    setLeadsFilterStage(stage);
    
    const params = new URLSearchParams(window.location.search);
    if (stage) {
      params.set('stage', stage);
      localStorage.setItem('crmActiveStage', stage);
      if (subtab) {
        params.set('subtab', subtab);
        localStorage.setItem('crm_lead_dashboard_subtab', subtab);
      } else if (stage === 'hourly_work') {
        params.set('subtab', 'hourly');
        localStorage.setItem('crm_lead_dashboard_subtab', 'hourly');
      } else if (stage === 'lead_dashboard' || stage === 'dashboard') {
        const existingSub = params.get('subtab') || localStorage.getItem('crm_lead_dashboard_subtab') || 'overview';
        params.set('subtab', existingSub);
      }
    } else {
      params.set('stage', 'all');
      params.delete('subtab');
      localStorage.removeItem('crmActiveStage');
    }
    
    // Update URL instantly
    const queryString = params.toString() ? `?${params.toString()}` : '';
    window.history.pushState(null, '', `${window.location.pathname}${queryString}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('popstate'));
    }
  };

  // Seamless cross-module navigation directly to Lead profile & table
  const handleNavigateToLead = (lead) => {
    if (!lead) return;
    const targetStage = getStageFromStatus(lead.status);

    const params = new URLSearchParams();
    if (targetStage && targetStage !== 'all') {
      params.set('stage', targetStage);
      localStorage.setItem('crmActiveStage', targetStage);
    } else {
      params.set('stage', 'all');
      localStorage.removeItem('crmActiveStage');
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    window.history.pushState(null, '', `/leads${queryString}`);

    setLeadsFilterStage(targetStage);
    setActiveTab('leads');
    setVisitedTabs(prev => {
      const next = new Set(prev);
      next.add('leads');
      return next;
    });

    const query = lead.lead_ref_id || lead.phone || lead.name || '';
    setActiveSearchQuery(query);

    setPendingLeadToOpen(lead);
    setShowNotifications(false);

    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }

    window.dispatchEvent(new CustomEvent('open_lead_details', {
      detail: {
        leadId: lead.id,
        leadRefId: lead.lead_ref_id,
        lead
      }
    }));
  };

  // Seamless navigation directly into specific Checklist slot execution modal
  const handleNavigateToChecklistSlot = (slot) => {
    if (!slot) return;
    setPendingChecklistSlot(slot);
    setChecklistSubTab('my_checklists');

    window.history.pushState(null, '', '/checklist?tab=my_checklists');
    setActiveTab('checklist');
    setVisitedTabs(prev => {
      const next = new Set(prev);
      next.add('checklist');
      return next;
    });

    setShowNotifications(false);

    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }

    window.dispatchEvent(new CustomEvent('open_checklist_slot', { detail: slot }));
  };

  // Seamless navigation directly into assigned Delegation tasks
  const handleNavigateToDelegationTask = (task) => {
    if (!task) return;
    setDelegationSubTab('to_me');

    window.history.pushState(null, '', '/delegation?tab=to_me');
    setActiveTab('delegation');
    setVisitedTabs(prev => {
      const next = new Set(prev);
      next.add('delegation');
      return next;
    });

    setShowNotifications(false);

    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }

    window.dispatchEvent(new CustomEvent('open_delegation_task', { detail: task }));
  };

  const handleLogout = () => {
    // 1. Non-blocking audit log in background
    try {
      logAuditAction('User Logout', 'User logged out of active session').catch(() => {});
    } catch (e) {}

    // 2. Clear client session in background
    try {
      supabase.auth.signOut().catch(() => {});
      sessionStorage.clear();
    } catch (e) {}

    // 3. Instant direct navigation to logout endpoint
    window.location.href = '/auth/logout';
  };

  // Comprehensive Follow-up categorization: All, Yesterday, Today, Tomorrow, Overdue, Upcoming
  const categorizedFollowUps = React.useMemo(() => {
    if (!leads || leads.length === 0) {
      return { all: [], yesterday: [], today: [], tomorrow: [], overdue: [], upcoming: [] };
    }
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const yesterdayEnd = todayStart - 1;
    const tomorrowStart = todayEnd + 1;
    const tomorrowEnd = tomorrowStart + 24 * 60 * 60 * 1000 - 1;

    const all = [];
    const yesterday = [];
    const today = [];
    const tomorrow = [];
    const overdue = [];
    const upcoming = [];

    leads.forEach(lead => {
      if (!lead.follow_up_date) return;

      const statusLower = (lead.status || '').toLowerCase();
      if (['converted', 'closed', 'order received', 'won', 'lost'].some(keyword => statusLower.includes(keyword))) {
        return;
      }

      const fTime = new Date(lead.follow_up_date).getTime();
      if (isNaN(fTime)) return;

      let category = 'upcoming';
      if (fTime >= yesterdayStart && fTime <= yesterdayEnd) {
        category = 'yesterday';
        yesterday.push(lead);
        overdue.push(lead);
      } else if (fTime < yesterdayStart) {
        category = 'overdue';
        overdue.push(lead);
      } else if (fTime >= todayStart && fTime <= todayEnd) {
        category = 'today';
        today.push(lead);
      } else if (fTime >= tomorrowStart && fTime <= tomorrowEnd) {
        category = 'tomorrow';
        tomorrow.push(lead);
      } else {
        category = 'upcoming';
        upcoming.push(lead);
      }

      all.push({ ...lead, followUpTimestamp: fTime, followUpCategory: category });
    });

    // Sort descending (latest / newest follow-up dates first)
    all.sort((a, b) => b.followUpTimestamp - a.followUpTimestamp);
    yesterday.sort((a, b) => new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime());
    today.sort((a, b) => new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime());
    tomorrow.sort((a, b) => new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime());
    overdue.sort((a, b) => new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime());
    upcoming.sort((a, b) => new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime());

    return { all, yesterday, today, tomorrow, overdue, upcoming };
  }, [leads]);

  // Filtered follow-ups based on selected tab and search query
  const filteredNotificationList = React.useMemo(() => {
    let list = [];
    if (notifFilter === 'today') list = categorizedFollowUps.today;
    else if (notifFilter === 'yesterday') list = categorizedFollowUps.yesterday;
    else if (notifFilter === 'tomorrow') list = categorizedFollowUps.tomorrow;
    else if (notifFilter === 'overdue') list = categorizedFollowUps.overdue;
    else if (notifFilter === 'upcoming') list = categorizedFollowUps.upcoming;
    else list = categorizedFollowUps.all;

    if (!notifSearch.trim()) return list;

    const q = notifSearch.toLowerCase().trim();
    return list.filter(lead => {
      const name = (lead.name || '').toLowerCase();
      const company = (lead.company || '').toLowerCase();
      const phone = (lead.phone || lead.business_contact_1 || lead.business_contact_2 || '').toLowerCase();
      const refId = (lead.lead_ref_id || '').toLowerCase();
      const status = (lead.status || '').toLowerCase();
      const city = (lead.district_name || lead.city_name || lead.state_name || '').toLowerCase();
      return name.includes(q) || company.includes(q) || phone.includes(q) || refId.includes(q) || status.includes(q) || city.includes(q);
    });
  }, [categorizedFollowUps, notifFilter, notifSearch]);

  // Group filtered notifications by Date with Expand / Collapse
  const groupedFollowUpsByDate = React.useMemo(() => {
    const groups = new Map();
    
    filteredNotificationList.forEach(lead => {
      const d = new Date(lead.follow_up_date);
      if (isNaN(d.getTime())) return;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateKey = `${year}-${month}-${day}`;
      const displayDate = `${day}/${month}/${year}`;

      if (!groups.has(dateKey)) {
        let label = displayDate;
        let color = 'var(--text-primary)';
        let bg = 'var(--th-bg)';
        let badgeBg = 'rgba(59, 130, 246, 0.15)';
        let badgeColor = '#3b82f6';

        if (lead.followUpCategory === 'today') {
          label = `🟡 Today (${displayDate})`;
          color = '#d97706';
          bg = 'rgba(234, 179, 8, 0.12)';
          badgeBg = 'rgba(234, 179, 8, 0.2)';
          badgeColor = '#d97706';
        } else if (lead.followUpCategory === 'yesterday') {
          label = `🔴 Yesterday (${displayDate})`;
          color = '#ef4444';
          bg = 'rgba(239, 68, 68, 0.12)';
          badgeBg = 'rgba(239, 68, 68, 0.2)';
          badgeColor = '#ef4444';
        } else if (lead.followUpCategory === 'tomorrow') {
          label = `🟢 Tomorrow (${displayDate})`;
          color = '#059669';
          bg = 'rgba(16, 185, 129, 0.12)';
          badgeBg = 'rgba(16, 185, 129, 0.2)';
          badgeColor = '#059669';
        } else if (lead.followUpCategory === 'overdue') {
          label = `🔴 Overdue (${displayDate})`;
          color = '#ef4444';
          bg = 'rgba(239, 68, 68, 0.08)';
          badgeBg = 'rgba(239, 68, 68, 0.15)';
          badgeColor = '#ef4444';
        } else {
          label = `🔵 Upcoming (${displayDate})`;
          color = '#3b82f6';
          bg = 'rgba(59, 130, 246, 0.08)';
          badgeBg = 'rgba(59, 130, 246, 0.15)';
          badgeColor = '#3b82f6';
        }

        groups.set(dateKey, {
          dateKey,
          displayDate,
          label,
          color,
          bg,
          badgeBg,
          badgeColor,
          leads: []
        });
      }
      groups.get(dateKey).leads.push(lead);
    });

    return Array.from(groups.values());
  }, [filteredNotificationList]);

  const toggleDateGroup = (dateKey) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const toggleAllDateGroups = () => {
    const allKeys = groupedFollowUpsByDate.map(g => g.dateKey);
    setCollapsedDates(prev => {
      if (prev.size >= allKeys.length) {
        return new Set(); // Expand all
      } else {
        return new Set(allKeys); // Collapse all
      }
    });
  };

  // Calculate due follow-ups (overdue + today) for alerts & notifications
  const dueFollowUps = React.useMemo(() => {
    return categorizedFollowUps.all;
  }, [categorizedFollowUps]);

  const prevDueCount = useRef(dueFollowUps.length);
  const notifiedFollowUpKeysRef = useRef(new Set());
  const notificationAudioRef = useRef(null);
  const notifiedTaskIdsRef = useRef(new Set());
  const notifiedChecklistKeysRef = useRef(new Set());
  const initialAlertSyncFinishedRef = useRef(false);
  const toastTimeoutRef = useRef(null);

  // Helper to safely play audio alert
  const playUnifiedAlertSound = (customSoundUrl, durationSec) => {
    try {
      if (notificationAudioRef.current) {
        try {
          notificationAudioRef.current.pause();
          notificationAudioRef.current.currentTime = 0;
        } catch (e) {}
      }

      if (customSoundUrl) {
        const audio = new Audio(customSoundUrl);
        notificationAudioRef.current = audio;
        const durationMs = (parseInt(durationSec, 10) || 3) * 1000;
        audio.play().then(() => {
          setTimeout(() => {
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch (e) {}
          }, durationMs);
        }).catch(() => {});
      } else {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 3.0);
      }
    } catch (err) {
      console.warn('Audio play failed:', err);
    }
  };

  // Helper to dispatch native browser desktop notification
  const dispatchDesktopNotification = (title, body, onClick) => {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, {
          body: body || '',
          icon: '/favicon.ico'
        });
        if (typeof onClick === 'function') {
          n.onclick = () => {
            window.focus();
            onClick();
            n.close();
          };
        }
      }
    } catch (e) {
      console.warn('Desktop notification error:', e);
    }
  };

  // Central unified notification trigger checking user preferences in crm_config
  const triggerUnifiedAlert = ({
    id,
    type = 'delegation', // 'delegation' | 'checklist' | 'lead' | 'test'
    title,
    subtitle = '',
    details = '',
    dueTime = '',
    targetTab = 'leads',
    rawItem = null,
    isUrgent = false,
    forcePopupStyle = null
  }) => {
    let config = {
      soundEnabled: true,
      popupStyle: 'corner_toast',
      notifyChecklist: true,
      notifyDelegation: true,
      notifyLeads: true,
      browserPushEnabled: true
    };

    try {
      const savedConfig = localStorage.getItem('crm_config');
      if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
      }
    } catch (e) {}

    // Check module notification suppressions - strictly for Admin user only if configured in System Settings.
    // Regular operational employees CANNOT suppress checklist, delegation, or lead alerts.
    if (userRole === 'admin') {
      if (type === 'checklist' && config.notifyChecklist === false) return;
      if (type === 'delegation' && config.notifyDelegation === false) return;
      if (type === 'lead' && config.notifyLeads === false) return;
    }

    // 1. Play sound (always active for employees to ensure deadlines and tasks are never missed)
    const isSoundAllowed = userRole === 'admin' ? config.soundEnabled !== false : true;
    if (isSoundAllowed) {
      playUnifiedAlertSound(config.alertSound, config.alertDuration);
    }

    // 2. Dispatch native desktop notification if enabled
    if (config.browserPushEnabled !== false) {
      dispatchDesktopNotification(title, `${subtitle ? subtitle + ' - ' : ''}${details || ''}`, () => {
        if (targetTab) handleTabChange(targetTab);
      });
    }

    // 3. Screen popup based on chosen style
    let style = forcePopupStyle || config.popupStyle || 'both';
    if (userRole !== 'admin' && style === 'bell_only') {
      style = 'corner_toast'; // Regular employees MUST receive screen popups; cannot hide them
    }

    if (style === 'corner_toast') {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setActiveCornerToast({ id, type, title, subtitle, details, dueTime, targetTab, rawItem });
      toastTimeoutRef.current = setTimeout(() => setActiveCornerToast(null), 9000);
    } else if (style === 'center_modal') {
      setActiveCenterModal({ id, type, title, subtitle, details, dueTime, targetTab, rawItem });
    } else if (style === 'both') {
      if (type === 'checklist' || isUrgent) {
        setActiveCenterModal({ id, type, title, subtitle, details, dueTime, targetTab, rawItem });
      } else {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setActiveCornerToast({ id, type, title, subtitle, details, dueTime, targetTab, rawItem });
        toastTimeoutRef.current = setTimeout(() => setActiveCornerToast(null), 9000);
      }
    }
    // 'bell_only' only applicable for admin users who explicitly configured it
  };

  // Fetch & process checklist and delegation alerts for logged-in user
  const fetchAndProcessUserAlerts = async () => {
    if (!userEmail) return;
    try {
      const res = await getUserPendingAlerts({ userEmail });
      if (!res.success) return;

      const tasks = Array.isArray(res.delegationTasks) ? res.delegationTasks : [];
      const slots = Array.isArray(res.checklistSlots) ? res.checklistSlots : [];

      setUserDelegationTasks(tasks);
      setUserChecklistSlots(slots);

      // Baseline establishment on first fetch
      if (!initialAlertSyncFinishedRef.current) {
        tasks.forEach(t => notifiedTaskIdsRef.current.add(t.id));
        slots.forEach(s => notifiedChecklistKeysRef.current.add(`${s.templateId}_${s.periodKey}`));
        initialAlertSyncFinishedRef.current = true;
        return;
      }

      // Check genuinely new delegation tasks assigned to user
      for (const t of tasks) {
        if (!notifiedTaskIdsRef.current.has(t.id)) {
          notifiedTaskIdsRef.current.add(t.id);
          triggerUnifiedAlert({
            id: t.id,
            type: 'delegation',
            title: `🎯 New Task Assigned: ${t.title}`,
            subtitle: `Delegated by ${t.delegated_by_name}`,
            details: t.description || `Priority: ${t.priority}`,
            dueTime: t.deadline ? new Date(t.deadline).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '',
            targetTab: 'delegation',
            rawItem: t,
            isUrgent: t.priority === 'URGENT' || t.priority === 'HIGH'
          });
        }
      }

      // Check genuinely new due checklist slots (strictly active and executable)
      for (const s of slots) {
        if (s.isExpired || s.isBeforeStart || s.canExecute === false) continue;
        const slotKey = `${s.templateId}_${s.periodKey}`;
        if (!notifiedChecklistKeysRef.current.has(slotKey)) {
          notifiedChecklistKeysRef.current.add(slotKey);
          triggerUnifiedAlert({
            id: slotKey,
            type: 'checklist',
            title: `📋 Checklist Due: ${s.baseTitle}`,
            subtitle: `${s.slotLabel} (Due: ${s.dueTime})`,
            details: 'Your scheduled checklist is open and awaiting submission.',
            dueTime: s.dueTime,
            targetTab: 'checklist',
            rawItem: s,
            isUrgent: true
          });
        }
      }
    } catch (e) {
      console.warn('Error processing user alerts:', e);
    }
  };

  // Sync browser document title for SuPuja Creations & AI Chatbot
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = activeTab === 'ai' ? 'AI Chatbot | SuPuja Creations' : 'SuPuja Creations';
    }
  }, [activeTab]);

  // Lead Follow-up Notifications Engine
  useEffect(() => {
    const currentDueKeys = dueFollowUps.map(lead => `${lead.id}:${lead.follow_up_date}`);

    if (isSyncing || loadingLeads) {
      currentDueKeys.forEach(k => notifiedFollowUpKeysRef.current.add(k));
      prevDueCount.current = dueFollowUps.length;
      return;
    }

    if (!initialSyncFinishedRef.current) {
      initialSyncFinishedRef.current = true;
      currentDueKeys.forEach(k => notifiedFollowUpKeysRef.current.add(k));
      prevDueCount.current = dueFollowUps.length;
      return;
    }

    let hasNewNotification = false;
    for (const key of currentDueKeys) {
      if (!notifiedFollowUpKeysRef.current.has(key)) {
        notifiedFollowUpKeysRef.current.add(key);
        hasNewNotification = true;
      }
    }

    if (hasNewNotification) {
      const topLead = dueFollowUps[0];
      triggerUnifiedAlert({
        id: `lead_${Date.now()}`,
        type: 'lead',
        title: `📞 Follow-up Due: ${topLead?.company || topLead?.name || 'Lead Follow-up'}`,
        subtitle: topLead?.phone ? `Contact: ${topLead.phone}` : '',
        details: 'Scheduled lead follow-up reminder is due now.',
        dueTime: topLead?.follow_up_date ? new Date(topLead.follow_up_date).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '',
        targetTab: 'leads',
        rawItem: topLead
      });
    }
    prevDueCount.current = dueFollowUps.length;
  }, [dueFollowUps, isSyncing, loadingLeads]);

  // Realtime & Periodic Alert Synchronization for Checklist & Delegation
  useEffect(() => {
    if (!userEmail) return;

    fetchAndProcessUserAlerts();

    // 1. Supabase Realtime channel for instant delegation task assignments
    const delegationRealtimeChannel = supabase
      .channel(`realtime_delegation_alerts_${userEmail}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delegation_tasks',
        filter: `assigned_to_email=eq.${userEmail.toLowerCase().trim()}`
      }, (payload) => {
        if (payload?.new) {
          const t = payload.new;
          if (!notifiedTaskIdsRef.current.has(t.id)) {
            notifiedTaskIdsRef.current.add(t.id);
            setUserDelegationTasks(prev => [t, ...prev]);
            triggerUnifiedAlert({
              id: t.id,
              type: 'delegation',
              title: `🎯 New Task Assigned: ${t.title}`,
              subtitle: `Delegated by ${t.delegated_by_name || 'Team Member'}`,
              details: t.description || `Priority: ${t.priority || 'MEDIUM'}`,
              dueTime: t.deadline ? new Date(t.deadline).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '',
              targetTab: 'delegation',
              rawItem: t,
              isUrgent: t.priority === 'URGENT' || t.priority === 'HIGH'
            });
          }
        }
      })
      .subscribe();

    // 2. Window event listeners for live test alerts & config updates from Settings
    const handleTestNotificationEvent = (e) => {
      const d = e.detail || {};
      triggerUnifiedAlert({
        id: `test_${Date.now()}`,
        type: 'test',
        title: d.title || '🎯 Test Alert Preview',
        subtitle: d.message || 'Notification preview from Settings',
        details: 'This alert was triggered by Settings > Notifications & Alerts demo test.',
        dueTime: d.dueTime || '18:00',
        targetTab: 'settings',
        forcePopupStyle: d.popupStyle
      });
    };

    const handleConfigUpdatedEvent = () => {
      fetchAndProcessUserAlerts();
    };

    // Periodic background sync every 5 minutes (Realtime handles instant delegation alerts)
    const alertInterval = setInterval(fetchAndProcessUserAlerts, 5 * 60 * 1000);

    window.addEventListener('crm_test_notification', handleTestNotificationEvent);
    window.addEventListener('crm_config_updated', handleConfigUpdatedEvent);

    return () => {
      clearInterval(alertInterval);
      supabase.removeChannel(delegationRealtimeChannel);
      window.removeEventListener('crm_test_notification', handleTestNotificationEvent);
      window.removeEventListener('crm_config_updated', handleConfigUpdatedEvent);
    };
  }, [userEmail]);

  // Periodic check for checklist slot times (runs purely in-memory against local state, ZERO network calls)
  useEffect(() => {
    if (!currentTime || !userChecklistSlots || userChecklistSlots.length === 0) return;
    for (const s of userChecklistSlots) {
      if (s.isExpired || s.isBeforeStart || s.canExecute === false) continue;
      const slotKey = `${s.templateId}_${s.periodKey}`;
      if (!notifiedChecklistKeysRef.current.has(slotKey)) {
        notifiedChecklistKeysRef.current.add(slotKey);
        triggerUnifiedAlert({
          id: slotKey,
          type: 'checklist',
          title: `📋 Checklist Due: ${s.baseTitle}`,
          subtitle: `${s.slotLabel} (Due: ${s.dueTime})`,
          details: 'Your scheduled checklist is open and awaiting submission.',
          dueTime: s.dueTime,
          targetTab: 'checklist',
          rawItem: s,
          isUrgent: true
        });
      }
    }
  }, [currentTime, userChecklistSlots]);

  if (userRole === 'customer') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'linear-gradient(135deg, #020617 0%, #0b1329 50%, #030712 100%)' }}>
        <header style={{ height: '64px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.4rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={20} />
            </div>
            <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>SuPuja Customer Assistant</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>Logged in as {userName || 'Customer'}</span>
            <button 
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.45rem 1rem', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s' }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <AiAssistantModule userRole={userRole} userId={userId} lastScreenCapture={null} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Mobile Overlay */}
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', alignItems: 'center', position: 'relative', padding: isSidebarCollapsed ? '1rem 0.5rem' : '0.9rem 1rem', borderBottom: '1px solid var(--border-light)' }}>
          <div 
            onClick={() => { if (isSidebarCollapsed) setIsSidebarCollapsed(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', minWidth: 0, cursor: isSidebarCollapsed ? 'pointer' : 'default', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', width: isSidebarCollapsed ? '100%' : 'auto' }}
            title={isSidebarCollapsed ? "Click to expand sidebar" : undefined}
          >
            <div style={{
              width: isSidebarCollapsed ? '38px' : '36px',
              height: isSidebarCollapsed ? '38px' : '36px',
              borderRadius: '10px',
              background: '#ffffff',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px var(--border-light)',
              overflow: 'hidden'
            }}>
              <img 
                src="/supuja-logo.png" 
                alt="SuPuja Creations" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            </div>
            {!isSidebarCollapsed && (
              <div className="sidebar-brand-text" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span className="sidebar-title" style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>SuPuja</span>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-color)', letterSpacing: '-0.01em' }}>Creations</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: 'var(--accent-color)',
                    background: 'var(--nav-active-bg)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '9999px',
                    border: '1px solid rgba(37, 99, 235, 0.2)',
                    letterSpacing: '0.02em'
                  }}>
                    v{pkg.version || '1.0.526'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="sidebar-collapse-toggle desktop-only-icon"
            style={{
              background: isSidebarCollapsed ? 'var(--bg-surface)' : 'var(--nav-active-bg)',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              color: 'var(--accent-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem',
              borderRadius: isSidebarCollapsed ? '50%' : '8px',
              position: isSidebarCollapsed ? 'absolute' : 'static',
              right: isSidebarCollapsed ? '-10px' : 'auto',
              top: isSidebarCollapsed ? '50%' : 'auto',
              transform: isSidebarCollapsed ? 'translateY(-50%)' : 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              zIndex: 25,
              width: isSidebarCollapsed ? '24px' : '26px',
              height: isSidebarCollapsed ? '24px' : '26px',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={15} />}
          </button>
        </div>
        <nav className="nav-list">
          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['analytics']?.view) && (
            <button 
              onClick={() => handleTabChange('dashboard')}
              className="nav-item" 
              data-active={activeTab === 'dashboard'}
              title={isSidebarCollapsed ? "Analytics Dashboard" : undefined}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <PieChart size={20} style={{ flexShrink: 0 }} />
              <span>Analytics Dashboard</span>
            </button>
          )}

          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['ai']?.view || moduleAccess['new_swan_ai']?.view) && (
            <button
              onClick={() => handleTabChange('ai')}
              className="nav-item"
              data-active={activeTab === 'ai'}
              title={isSidebarCollapsed ? "AI Chatbot" : undefined}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <Bot size={20} style={{ flexShrink: 0 }} />
              <span>AI Chatbot</span>
            </button>
          )}

          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['callcenter']?.view) && (
            <button 
              onClick={() => handleTabChange('callcenter')}
              className="nav-item" 
              data-active={activeTab === 'callcenter'}
              title={isSidebarCollapsed ? "Call Center" : undefined}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <PhoneCall size={20} style={{ flexShrink: 0 }} />
              <span>Call Center</span>
            </button>
          )}

          {/* Smart Attendance (Positioned Above Sales) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['attendance']?.view) && (
            <div className="nav-item-wrapper" style={{ position: 'relative' }}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setAttendanceMenuExpanded(true);
                  } else {
                    setAttendanceMenuExpanded(!attendanceMenuExpanded);
                  }
                  handleTabChange('attendance');
                }}
                className="nav-item" 
                data-active={activeTab === 'attendance'}
                title={isSidebarCollapsed ? "Smart Attendance" : undefined}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {attendanceMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Clock size={20} style={{ flexShrink: 0 }} />
                <span>Smart Attendance</span>
              </button>
              
              <div className={`submenu-list ${attendanceMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleAttendanceSubTabChange('my_attendance')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'my_attendance'}
                  >
                    ⏱️ Daily Punch Station
                  </button>
                  <button
                    onClick={() => handleAttendanceSubTabChange('monthly_logs')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'monthly_logs'}
                  >
                    📅 Monthly Attendance Log
                  </button>
                  <button
                    onClick={() => handleAttendanceSubTabChange('regularization')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'regularization'}
                  >
                    📝 Missing Punch / Regularize
                  </button>
                  {((userRole === 'admin' || userRole === 'Admin') || userRole === 'manager' || userRole === 'hod' || moduleAccess['attendance']?.is_manager) && (
                    <>
                      <button
                        onClick={() => handleAttendanceSubTabChange('hod_approvals')}
                        className="submenu-item"
                        data-active={activeTab === 'attendance' && attendanceSubTab === 'hod_approvals'}
                      >
                        🛡️ HOD Approvals
                      </button>
                      <button
                        onClick={() => handleAttendanceSubTabChange('team_report')}
                        className="submenu-item"
                        data-active={activeTab === 'attendance' && attendanceSubTab === 'team_report'}
                      >
                        👥 Team Attendance Report
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Smart Checklist (Daily, Weekly, 15-Day, Monthly, Quarterly, 6-Month, 1-Year) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['checklist']?.view !== false) && (
            <div className="nav-item-wrapper" style={{ position: 'relative' }}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setChecklistMenuExpanded(true);
                  } else {
                    setChecklistMenuExpanded(!checklistMenuExpanded);
                  }
                  handleTabChange('checklist');
                }}
                className="nav-item" 
                data-active={activeTab === 'checklist'}
                title={isSidebarCollapsed ? "Smart Checklist" : undefined}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {checklistMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <CheckSquare size={20} style={{ flexShrink: 0 }} />
                <span>Smart Checklist</span>
              </button>
              
              <div className={`submenu-list ${checklistMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleChecklistSubTabChange('dashboard')}
                    className="submenu-item"
                    data-active={activeTab === 'checklist' && (checklistSubTab === 'dashboard' || !checklistSubTab)}
                  >
                    📊 Checklist Dashboard
                  </button>
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['checklist']?.sub_items?.my_checklists?.view !== false) && (
                    <button
                      onClick={() => handleChecklistSubTabChange('my_checklists')}
                      className="submenu-item"
                      data-active={activeTab === 'checklist' && checklistSubTab === 'my_checklists'}
                    >
                      📋 My Checklists
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || userRole === 'manager' || userRole === 'hod' || moduleAccess['checklist']?.is_manager || moduleAccess['checklist']?.sub_items?.templates?.view === true) && (
                    <button
                      onClick={() => handleChecklistSubTabChange('templates')}
                      className="submenu-item"
                      data-active={activeTab === 'checklist' && checklistSubTab === 'templates'}
                    >
                      📑 Templates Master
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || userRole === 'manager' || userRole === 'hod' || moduleAccess['checklist']?.is_manager || moduleAccess['checklist']?.sub_items?.compliance?.view === true) && (
                    <button
                      onClick={() => handleChecklistSubTabChange('compliance')}
                      className="submenu-item"
                      data-active={activeTab === 'checklist' && checklistSubTab === 'compliance'}
                    >
                      🛡️ Compliance & Audit
                    </button>
                  )}
                  <button
                    onClick={() => handleChecklistSubTabChange('holidays')}
                    className="submenu-item"
                    data-active={activeTab === 'checklist' && checklistSubTab === 'holidays'}
                  >
                    🎉 Holidays Calendar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delegation Tasks (Emp-to-Emp Task Management) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['delegation']?.view !== false) && (
            <div className="nav-item-wrapper" style={{ position: 'relative' }}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setDelegationMenuExpanded(true);
                  } else {
                    setDelegationMenuExpanded(!delegationMenuExpanded);
                  }
                  handleTabChange('delegation');
                }}
                className="nav-item" 
                data-active={activeTab === 'delegation'}
                title={isSidebarCollapsed ? "Delegation Tasks" : undefined}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {delegationMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Users size={20} style={{ flexShrink: 0 }} />
                <span>Delegation Tasks</span>
              </button>
              
              <div className={`submenu-list ${delegationMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['delegation']?.sub_items?.dashboard?.view !== false) && (
                    <button
                      onClick={() => handleDelegationSubTabChange('dashboard')}
                      className="submenu-item"
                      data-active={activeTab === 'delegation' && delegationSubTab === 'dashboard'}
                    >
                      📊 Delegation Dashboard
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['delegation']?.sub_items?.to_me?.view !== false) && (
                    <button
                      onClick={() => handleDelegationSubTabChange('to_me')}
                      className="submenu-item"
                      data-active={activeTab === 'delegation' && delegationSubTab === 'to_me'}
                    >
                      📥 Tasks To Me
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['delegation']?.sub_items?.by_me?.view !== false) && (
                    <button
                      onClick={() => handleDelegationSubTabChange('by_me')}
                      className="submenu-item"
                      data-active={activeTab === 'delegation' && delegationSubTab === 'by_me'}
                    >
                      📤 Tasks By Me
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || userRole === 'manager' || userRole === 'hod' || moduleAccess['delegation']?.is_manager || moduleAccess['delegation']?.sub_items?.all?.view === true) && (
                    <button
                      onClick={() => handleDelegationSubTabChange('all')}
                      className="submenu-item"
                      data-active={activeTab === 'delegation' && delegationSubTab === 'all'}
                    >
                      👥 Team Task Board
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {['Sales', 'Purchase', 'Human Resource'].map(category => {
            const visibleModules = MODULES_CONFIG.filter(m => 
              m.category === category && 
              ((userRole === 'admin' || userRole === 'Admin') || moduleAccess[m.id]?.view)
            );

            if (visibleModules.length === 0) return null;

            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="category-header"
                >
                  {expandedCategories[category] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{category}</span>
                </button>
                
                <div className={`category-modules-list ${(isSidebarCollapsed || expandedCategories[category]) ? 'expanded' : ''}`}>
                  <div className="category-modules-inner">
                    {visibleModules.map(module => (
                      <div key={module.id} className="nav-item-wrapper" style={{ position: 'relative' }}>
                        <button 
                          onClick={() => { 
                            if (module.id === 'leads') {
                              if (isSidebarCollapsed) {
                                setIsSidebarCollapsed(false);
                                setLeadDataExpanded(true);
                              } else {
                                setLeadDataExpanded(!leadDataExpanded);
                              }
                            } else if (module.id === 'recruiter') {
                              if (isSidebarCollapsed) {
                                setIsSidebarCollapsed(false);
                                setRecruiterMenuExpanded(true);
                              } else {
                                setRecruiterMenuExpanded(!recruiterMenuExpanded);
                              }
                            } else if (module.id === 'attendance') {
                              if (isSidebarCollapsed) {
                                setIsSidebarCollapsed(false);
                                setAttendanceMenuExpanded(true);
                              } else {
                                setAttendanceMenuExpanded(!attendanceMenuExpanded);
                              }
                              handleTabChange('attendance');
                            } else {
                              handleTabChange(module.path || module.id); 
                            }
                          }}
                          className="nav-item" 
                          data-active={activeTab === (module.path || module.id)}
                          title={isSidebarCollapsed ? module.label : undefined}
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        >
                          {module.id === 'leads' && (
                            <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                              {leadDataExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          )}
                          {module.id === 'recruiter' && (
                            <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                              {recruiterMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          )}
                          {module.id === 'attendance' && (
                            <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                              {attendanceMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          )}
                          {React.cloneElement(module.icon, { style: { flexShrink: 0 } })}
                          <span>{module.label}</span>
                        </button>
                        
                        {module.id === 'recruiter' && (
                          <div className={`submenu-list ${recruiterMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                            <div className="submenu-inner">
                              {/* Determine allowed stages for this user */}
                              {(() => {
                                const isAdmin = userRole === 'admin' || userRole === 'Admin';
                                const recruiterAccess = moduleAccess['recruiter'];
                                const isFullAccess = isAdmin || recruiterAccess?.is_manager;
                                const allowedSteps = recruiterAccess?.assigned_steps || [];

                                const canSeeStage = (stageId) => isFullAccess || allowedSteps.includes(stageId);

                                return (
                                  <>
                                    {/* Dashboard & All Stages - always for admins/full access */}
                                    {isFullAccess && (
                                      <>
                                        <button
                                          onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('dashboard'); }}
                                          className="submenu-item"
                                          data-active={activeTab === 'recruiter' && recruiterFilterStage === 'dashboard'}
                                          style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}
                                        >
                                          📊 Recruiter Dashboard
                                        </button>
                                        <button
                                          onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('all_stages'); }}
                                          className="submenu-item"
                                          data-active={activeTab === 'recruiter' && recruiterFilterStage === 'all_stages'}
                                          style={{ fontWeight: 'bold' }}
                                        >
                                          🔍 Recruiter All Stage
                                        </button>
                                        <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '0.4rem 0.75rem' }} />
                                      </>
                                    )}

                                    {/* S00 & S01 */}
                                    {canSeeStage('S00') && (
                                      <button
                                        onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('S00'); }}
                                        className="submenu-item"
                                        data-active={activeTab === 'recruiter' && recruiterFilterStage === 'S00'}
                                      >
                                        S00 - Requirements Received
                                      </button>
                                    )}
                                    {canSeeStage('S01') && (
                                      <button
                                        onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('S01'); }}
                                        className="submenu-item"
                                        data-active={activeTab === 'recruiter' && recruiterFilterStage === 'S01'}
                                      >
                                        S01 - JDs Prepared & Posted
                                      </button>
                                    )}

                                    {/* S02–S09 */}
                                    {[
                                      { id: 'S02', label: 'S02 - Resume Filtered' },
                                      { id: 'S03', label: 'S03 - Interview Executed' },
                                      { id: 'S04', label: 'S04 - Test Result Updated' },
                                      { id: 'S05', label: 'S05 - ED Approval Pending' },
                                      { id: 'S06', label: 'S06 - Salary Negotiating' },
                                      { id: 'S07', label: 'S07 - Shortlisted' },
                                      { id: 'S08', label: 'S08 - LOI Released' },
                                      { id: 'S09', label: 'S09 - Joined' }
                                    ].filter(stage => canSeeStage(stage.id)).map(stage => (
                                      <button
                                        key={stage.id}
                                        onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage(stage.id); }}
                                        className="submenu-item"
                                        data-active={activeTab === 'recruiter' && recruiterFilterStage === stage.id}
                                      >
                                        {stage.label}
                                      </button>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                        
                        {module.id === 'leads' && (
                          <div className={`submenu-list ${leadDataExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                            <div className="submenu-inner">
                              {(() => {
                                const canSeeDashboard = getSubItemPermissions(moduleAccess, userRole, 'leads', 'lead_dashboard').view;
                                const canSeeHourly = getSubItemPermissions(moduleAccess, userRole, 'leads', 'hourly_work').view;

                                return (
                                  <>
                                    {canSeeDashboard && (
                                      <button
                                        onClick={() => { 
                                          handleTabChange('leads'); 
                                          handleStageChange('lead_dashboard', 'overview'); 
                                        }}
                                        className="submenu-item"
                                        data-active={activeTab === 'leads' && (leadsFilterStage === 'lead_dashboard' || leadsFilterStage === 'dashboard')}
                                      >
                                        📊 Lead Dashboard
                                      </button>
                                    )}
                                    {canSeeHourly && (
                                      <button
                                        onClick={() => { 
                                          handleTabChange('leads'); 
                                          handleStageChange('hourly_work', 'hourly');
                                        }}
                                        className="submenu-item"
                                        data-active={activeTab === 'leads' && leadsFilterStage === 'hourly_work'}
                                        style={{ fontSize: '0.82rem', paddingLeft: '1.75rem', opacity: 0.9 }}
                                      >
                                        ⏰ Hourly Work
                                      </button>
                                    )}
                                  </>
                                );
                              })()}

                              <button
                                onClick={() => { handleTabChange('leads'); handleStageChange(null); }}
                                className="submenu-item"
                                data-active={activeTab === 'leads' && leadsFilterStage === null}
                              >
                                All Leads
                              </button>

                              {['01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage'].map(stage => {
                                const stagePerms = getSubItemPermissions(moduleAccess, userRole, 'leads', stage);
                                if (!stagePerms.view) {
                                  return null;
                                }

                                return (
                                  <button
                                    key={stage}
                                    onClick={() => { handleTabChange('leads'); handleStageChange(stage); }}
                                    className="submenu-item"
                                    data-active={activeTab === 'leads' && leadsFilterStage === stage}
                                  >
                                    {stage}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* SYSTEM CATEGORY ACCORDION */}
          {((userRole === 'admin' || userRole === 'Admin') || 
            moduleAccess['team']?.view || 
            moduleAccess['aiadmin']?.view || 
            moduleAccess['aiknowledgebase']?.view || 
            moduleAccess['calladmin']?.view || 
            moduleAccess['aicallcenter']?.view || 
            moduleAccess['whatsapp_official']?.view || 
            moduleAccess['whatsapp_unofficial']?.view || 
            moduleAccess['sms_config']?.view || 
            moduleAccess['rcs_config']?.view || 
            moduleAccess['email_config']?.view ||
            moduleAccess['settings']?.view || 
            globalRolePermissions?.editSettings) && (
              <div>
                <button
                  onClick={() => toggleCategory('System')}
                  className="category-header"
                >
                  {expandedCategories['System'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>System</span>
                </button>

                <div className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['System']) ? 'expanded' : ''}`}>
                  <div className="category-modules-inner">
                    {/* Team Management */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['team']?.view) && (
                      <button 
                        onClick={() => handleTabChange('team')}
                        className="nav-item" 
                        data-active={activeTab === 'team'}
                        title={isSidebarCollapsed ? "Team Management" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Shield size={20} style={{ flexShrink: 0 }} />
                        <span>Team Management</span>
                      </button>
                    )}

                    {/* Universal Workplace Management */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['team']?.view) && (
                      <button 
                        onClick={() => handleTabChange('workplace')}
                        className="nav-item" 
                        data-active={activeTab === 'workplace'}
                        title={isSidebarCollapsed ? "Workplace WMS" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Building2 size={20} style={{ flexShrink: 0 }} />
                        <span>Workplace (WMS)</span>
                      </button>
                    )}

                    {/* Public User Management */}
                    {(userRole === 'admin' || userRole === 'Admin') && (
                      <button 
                        onClick={() => handleTabChange('public_users')}
                        className="nav-item" 
                        data-active={activeTab === 'public_users'}
                        title={isSidebarCollapsed ? "Public User Management" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Users size={20} style={{ flexShrink: 0 }} />
                        <span>Public User Management</span>
                      </button>
                    )}

                    {/* AI Admin */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aiadmin']?.view || moduleAccess['aiknowledgebase']?.view) && (
                      <div className="nav-item-wrapper" style={{ position: 'relative' }}>
                        <button 
                          onClick={() => {
                            if (isSidebarCollapsed) {
                              setIsSidebarCollapsed(false);
                              setAiMenuExpanded(true);
                            } else {
                              setAiMenuExpanded(!aiMenuExpanded);
                            }
                          }}
                          className="nav-item" 
                          data-active={['aiadmin', 'aiknowledgebase'].includes(activeTab)}
                          title={isSidebarCollapsed ? "AI Admin" : undefined}
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        >
                          <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                            {aiMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <Bot size={20} style={{ flexShrink: 0 }} />
                          <span>AI Admin</span>
                        </button>
                        
                        <div className={`submenu-list ${aiMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                          <div className="submenu-inner">
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aiadmin']?.view) && (
                              <button
                                onClick={() => handleTabChange('aiadmin')}
                                className="submenu-item"
                                data-active={activeTab === 'aiadmin'}
                              >
                                User AI Usage
                              </button>
                            )}
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aiknowledgebase']?.view) && (
                              <button
                                onClick={() => handleTabChange('aiknowledgebase')}
                                className="submenu-item"
                                data-active={activeTab === 'aiknowledgebase'}
                              >
                                AI Knowledge Base (RAG)
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Call Admin */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['calladmin']?.view) && (
                      <button 
                        onClick={() => handleTabChange('calladmin')}
                        className="nav-item" 
                        data-active={activeTab === 'calladmin'}
                        title={isSidebarCollapsed ? "Call Admin" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Phone size={20} style={{ flexShrink: 0 }} />
                        <span>Call Admin</span>
                      </button>
                    )}
                    
                    {/* AI Call Center */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aicallcenter']?.view) && (
                      <button 
                        onClick={() => handleTabChange('aicallcenter')}
                        className="nav-item" 
                        data-active={activeTab === 'aicallcenter'}
                        title={isSidebarCollapsed ? "AI Call Center" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Bot size={20} style={{ flexShrink: 0 }} />
                        <span>AI Call Center</span>
                      </button>
                    )}

                    {/* Message Config */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['whatsapp_official']?.view || moduleAccess['whatsapp_unofficial']?.view || moduleAccess['sms_config']?.view || moduleAccess['rcs_config']?.view || moduleAccess['email_config']?.view) && (
                      <div className="nav-item-wrapper" style={{ position: 'relative' }}>
                        <button 
                          onClick={() => {
                            if (isSidebarCollapsed) {
                              setIsSidebarCollapsed(false);
                              setMessageMenuExpanded(true);
                            } else {
                              setMessageMenuExpanded(!messageMenuExpanded);
                            }
                          }}
                          className="nav-item" 
                          data-active={['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(activeTab)}
                          title={isSidebarCollapsed ? "Message Config" : undefined}
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        >
                          <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                            {messageMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <MessageCircle size={20} style={{ flexShrink: 0 }} />
                          <span>Message Config</span>
                        </button>
                        
                        <div className={`submenu-list ${messageMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                          <div className="submenu-inner">
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['whatsapp_official']?.view) && (
                              <button
                                onClick={() => handleTabChange('whatsapp_official')}
                                className="submenu-item"
                                data-active={activeTab === 'whatsapp_official'}
                              >
                                WhatsApp Official
                              </button>
                            )}
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['whatsapp_unofficial']?.view) && (
                              <button
                                onClick={() => handleTabChange('whatsapp_unofficial')}
                                className="submenu-item"
                                data-active={activeTab === 'whatsapp_unofficial'}
                              >
                                WhatsApp UnOfficial
                              </button>
                            )}
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['sms_config']?.view) && (
                              <button
                                onClick={() => handleTabChange('sms_config')}
                                className="submenu-item"
                                data-active={activeTab === 'sms_config'}
                              >
                                SMS
                              </button>
                            )}
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['rcs_config']?.view) && (
                              <button
                                onClick={() => handleTabChange('rcs_config')}
                                className="submenu-item"
                                data-active={activeTab === 'rcs_config'}
                              >
                                RCS
                              </button>
                            )}
                            {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['email_config']?.view) && (
                              <button
                                onClick={() => handleTabChange('email_config')}
                                className="submenu-item"
                                data-active={activeTab === 'email_config'}
                              >
                                Email
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Admin Message Config (SuPuja Creations / Admin System) */}
                    {(userRole === 'admin' || userRole === 'Admin') && (
                      <button 
                        onClick={() => handleTabChange('admin_message_config')}
                        className="nav-item" 
                        data-active={activeTab === 'admin_message_config'}
                        title={isSidebarCollapsed ? "Admin Message Config" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <ShieldCheck size={20} style={{ flexShrink: 0, color: '#4338ca' }} />
                        <span>Admin Message Config</span>
                      </button>
                    )}

                    {/* Offline Rule (System Page) */}
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['offline_rule']?.view !== false) && (
                      <button 
                        onClick={() => handleTabChange('offline_rule')}
                        className="nav-item" 
                        data-active={activeTab === 'offline_rule'}
                        title={isSidebarCollapsed ? "Offline Rule" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <WifiOff size={20} style={{ flexShrink: 0, color: '#f59e0b' }} />
                        <span>Offline Rule</span>
                      </button>
                    )}

                    {/* Settings Accordion with Sub-Menu */}
                    {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['settings']?.view || globalRolePermissions?.editSettings) && (
                      <div className="nav-item-wrapper" style={{ position: 'relative' }}>
                        <button 
                          onClick={() => {
                            if (isSidebarCollapsed) {
                              setIsSidebarCollapsed(false);
                              setSettingsMenuExpanded(true);
                            } else {
                              setSettingsMenuExpanded(!settingsMenuExpanded);
                            }
                            if (activeTab !== 'settings') {
                              handleTabChange('settings');
                            }
                          }}
                          className="nav-item" 
                          data-active={activeTab === 'settings'}
                          title={isSidebarCollapsed ? "Settings" : undefined}
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        >
                          <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                            {settingsMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <Settings size={20} style={{ flexShrink: 0 }} />
                          <span>Settings</span>
                        </button>
                        
                        <div className={`submenu-list ${settingsMenuExpanded && !isSidebarCollapsed ? 'expanded' : ''}`}>
                          <div className="submenu-inner">
                            <button
                              onClick={() => handleSettingSubTabChange('business')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'business'}
                            >
                              Business Profile
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('crm')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'crm'}
                            >
                              CRM & Lead Config
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('fields')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'fields'}
                            >
                              Custom Fields
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('notifications')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'notifications'}
                            >
                              Notifications & Alerts
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('roles')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'roles'}
                            >
                              Roles & Permissions
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('automation')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'automation'}
                            >
                              Automation & API
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('sessions')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'sessions'}
                            >
                              Monitor Sessions
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('audit')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'audit'}
                            >
                              Activity Audit Logs
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('data')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'data'}
                            >
                              Data Management
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('targets')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'targets'}
                            >
                              Targets & Performance
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('media')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'media'}
                            >
                              File & Media Settings
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('navigation')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'navigation'}
                            >
                              Page Navigation
                            </button>
                            <button
                              onClick={() => handleSettingSubTabChange('departments')}
                              className="submenu-item"
                              data-active={activeTab === 'settings' && currentSettingSubTab === 'departments'}
                            >
                              Manage Departments
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Impersonation Floating Notification Banner */}
        {impersonationInfo && (
          <div style={{
            background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#ffffff',
            padding: '0.45rem 1.25rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            zIndex: 45,
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem' }}>🕶️</span>
              <span>
                <strong>Impersonation Mode:</strong> Currently logged in as <span style={{ textDecoration: 'underline' }}>{userName}</span> ({userRole})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
              <button
                type="button"
                onClick={handleReturnToAdmin}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#4338ca',
                  border: 'none',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🔄</span>
                Return to Admin Account
              </button>
              <button
                type="button"
                onClick={handleExitImpersonation}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.18)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <LogOut size={13} />
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Top Header */}
        <header className="top-header" style={{ position: 'sticky', top: 0, zIndex: 40, flexShrink: 0 }}>
          {isSyncing && (
            <div 
              className="sync-progress-bar" 
              style={{ 
                width: `${syncTotalCount > 0 ? (syncLoadedCount / syncTotalCount) * 100 : 0}%` 
              }} 
              title={`Syncing Leads: ${syncLoadedCount}/${syncTotalCount}`}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)} style={{ padding: '0.35rem', flexShrink: 0, background: 'transparent' }}>
              <Menu size={22} />
            </button>
            
            {activeTab !== 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <h1 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, minWidth: 0, flex: 1, letterSpacing: '-0.015em' }}>
                  {activeTab === 'dashboard' && 'Analytics Dashboard'}
                  {activeTab === 'leads' && (
                    leadsFilterStage === 'hourly_work' 
                      ? 'Hourly Work Report'
                      : (leadsFilterStage === 'lead_dashboard' || leadsFilterStage === 'dashboard' 
                        ? 'Lead Dashboard' 
                        : (leadsFilterStage ? `Lead Data — ${leadsFilterStage}` : 'Lead Data — All Leads'))
                  )}
                  {activeTab === 'orders' && 'Order Management'}
                  {activeTab === 'mrp' && 'MRP System'}
                  {activeTab === 'mrp_against' && 'MRP Against'}
                  {activeTab === 'recruiter' && (
                    recruiterFilterStage === 'dashboard' ? 'Recruiter Dashboard' :
                    recruiterFilterStage === 'all_stages' ? 'Recruiter — All Stages' :
                    recruiterFilterStage ? `Recruiter — ${recruiterFilterStage}` : 'Recruiter'
                  )}
                  {activeTab === 'joining' && 'Joining Process'}
                  {activeTab === 'attendance' && 'Smart Attendance & Regularization'}
                  {activeTab === 'checklist' && 'Smart Checklist Management'}
                  {activeTab === 'delegation' && 'Employee-to-Employee Task Delegation'}
                  {activeTab === 'registration' && 'Client Registration'}
                  {activeTab === 'report' && 'Client Registered Report'}
                  {activeTab === 'aiadmin' && 'AI Admin'}
                  {activeTab === 'aiknowledgebase' && 'AI Knowledge Base'}
                  {activeTab === 'callcenter' && 'Telecalling'}
                  {activeTab === 'calladmin' && 'Call Admin'}
                  {activeTab === 'aicallcenter' && 'AI Call Center'}
                  {activeTab === 'team' && 'Team Management'}
                  {activeTab === 'workplace' && 'Universal Workplace (WMS)'}
                  {activeTab === 'public_users' && 'Public Applicants'}
                  {activeTab === 'party' && 'Fully Managed Party Master'}
                  {activeTab === 'location_territory' && 'Universal Location & Territory Master'}
                  {activeTab === 'location_master' && 'Central Location Master'}
                  {activeTab === 'whatsapp_official' && 'WhatsApp Official'}
                  {activeTab === 'whatsapp_unofficial' && 'WhatsApp UnOfficial'}
                  {activeTab === 'sms_config' && 'SMS Config'}
                  {activeTab === 'rcs_config' && 'RCS Config'}
                  {activeTab === 'email_config' && 'Email Config'}
                  {activeTab === 'admin_message_config' && 'Admin Messaging Config'}
                  {activeTab === 'settings' && 'Enterprise Settings'}
                </h1>
                
                <span className="desktop-only" style={{ 
                  fontSize: '0.66rem', 
                  padding: '0.15rem 0.5rem', 
                  borderRadius: '9999px', 
                  background: (userRole === 'admin' || userRole === 'Admin') ? 'rgba(245, 158, 11, 0.12)' : 'rgba(37, 99, 235, 0.12)', 
                  color: (userRole === 'admin' || userRole === 'Admin') ? '#d97706' : 'var(--accent-color)', 
                  border: (userRole === 'admin' || userRole === 'Admin') ? '1px solid rgba(245, 158, 11, 0.28)' : '1px solid rgba(37, 99, 235, 0.28)',
                  textTransform: 'uppercase', 
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                  {userRole}
                </span>
              </div>
            )}

            {activeTab !== 'ai' && (
              <div className="desktop-only" style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-light)', margin: '0 0.4rem' }}></div>
            )}

            {/* Desktop Intelligent Global Spotlight Search Trigger */}
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="global-search-trigger-btn desktop-only"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '0.38rem 0.75rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: 'var(--shadow-xs)',
                flexShrink: 0
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-color)';
                e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
              }}
              title="Quick Spotlight Search (Ctrl + K)"
            >
              <Search size={14} style={{ color: 'var(--accent-color)' }} />
              <span className="desktop-only-text" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Type <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>/</strong> or search CRM...
              </span>
              <kbd className="desktop-only" style={{
                fontSize: '0.68rem',
                padding: '0.12rem 0.4rem',
                borderRadius: '6px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)',
                fontWeight: 700,
                lineHeight: 1,
                boxShadow: '0 1px 1px rgba(0,0,0,0.05)'
              }}>
                ⌘K
              </kbd>
            </button>
            {isSyncing && (
              <span className="desktop-only skeleton-glow" style={{ 
                fontSize: '0.75rem', 
                color: 'var(--accent-color)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4rem',
                backgroundColor: 'var(--nav-active-bg)',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                fontWeight: '600'
              }}>
                <svg className="animate-spin" style={{ width: '12px', height: '12px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
                </svg>
                Syncing: {syncLoadedCount} / {syncTotalCount || '...'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'relative', flexShrink: 0 }}>
            {/* Mobile Global Spotlight Search Trigger */}
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="header-icon-btn mobile-only"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--accent-color)',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                flexShrink: 0
              }}
              title="Search CRM"
            >
              <Search size={16} />
            </button>

            {/* Admin Company Filter */}
            {(userRole === 'admin' || userRole === 'Admin') && (
              <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.25rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Company:</span>
                <select 
                  value={adminCompanyFilter} 
                  onChange={(e) => setAdminCompanyFilter(e.target.value)}
                  style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                >
                  <option value="All">All Companies</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
            )}

            {/* Softphone Launcher Button (Square Button Box) */}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toggle-softphone'));
              }}
              className="header-icon-btn desktop-only"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: 'var(--shadow-xs)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-color)';
                e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                e.currentTarget.style.color = 'var(--accent-color)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
              }}
              title="Toggle CRM Softphone"
            >
              <PhoneCall size={17} />
            </button>

            {/* Notifications Button (Square Button Box) */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={notificationMenuRef}>
              {(() => {
                const totalAlertCount = (dueFollowUps?.length || 0) + (userChecklistSlots?.length || 0) + (userDelegationTasks?.length || 0);
                return (
                  <button
                    type="button"
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="header-icon-btn"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: showNotifications ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: showNotifications ? 'var(--accent-color)' : 'var(--text-primary)',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: 'var(--shadow-xs)',
                      position: 'relative'
                    }}
                    onMouseOver={(e) => {
                      if (!showNotifications) {
                        e.currentTarget.style.borderColor = 'var(--accent-color)';
                        e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                        e.currentTarget.style.color = 'var(--accent-color)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!showNotifications) {
                        e.currentTarget.style.borderColor = 'var(--border-light)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                      }
                    }}
                    title="Notifications & Alerts"
                  >
                    <Bell size={17} />
                    {totalAlertCount > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        minWidth: '17px',
                        height: '17px',
                        padding: '0 4px',
                        borderRadius: '9999px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--bg-surface)',
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.45)',
                        pointerEvents: 'none',
                        lineHeight: 1,
                        whiteSpace: 'nowrap'
                      }}>
                        {totalAlertCount}
                      </div>
                    )}
                  </button>
                );
              })()}

              {showNotifications && (
                <div style={{
                  position: 'fixed',
                  top: '58px',
                  bottom: '10px',
                  right: '8px',
                  left: '8px',
                  width: 'auto',
                  maxWidth: '480px',
                  margin: '0 auto',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '16px',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
                  zIndex: 10000,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  animation: 'fadeIn 0.15s ease-out'
                }}>
                  {/* Header */}
                  <div style={{
                    padding: '0.85rem 1.1rem',
                    borderBottom: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                        Notifications & Alerts
                      </span>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--accent-color)',
                        color: '#fff',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px'
                      }}>
                        {(dueFollowUps?.length || 0) + (userChecklistSlots?.length || 0) + (userDelegationTasks?.length || 0)} Total
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowNotificationPreferencesModal(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                        title="Alert & Notification Preferences"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNotifications(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                        title="Close"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* One-time Smart Permission Banner (Auto-dismisses on Allow or Dismiss) */}
                  {browserPermission !== 'granted' && !isDesktopPromptDismissed && (
                    <div style={{
                      padding: '0.55rem 0.9rem',
                      backgroundColor: 'rgba(59, 130, 246, 0.09)',
                      borderBottom: '1px solid rgba(59, 130, 246, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                        <Bell size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                        <span>Get desktop popups even when CRM is minimized.</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={handleRequestDesktopPermission}
                          style={{
                            padding: '0.22rem 0.55rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--accent-color)',
                            color: '#ffffff',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Enable
                        </button>
                        <button
                          type="button"
                          onClick={handleDismissDesktopPrompt}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.15rem 0.3rem', fontSize: '0.78rem' }}
                          title="Don't ask again"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Category Tabs (All | Checklists | Delegated Tasks | Leads) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.45rem 0.75rem',
                    gap: '0.35rem',
                    backgroundColor: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border-light)',
                    overflowX: 'auto'
                  }}>
                    {[
                      { id: 'all', label: 'All', icon: '🔔', count: (dueFollowUps?.length || 0) + (userChecklistSlots?.length || 0) + (userDelegationTasks?.length || 0) },
                      { id: 'checklist', label: 'Checklist', icon: '📋', count: userChecklistSlots.length },
                      { id: 'delegation', label: 'Delegation', icon: '🎯', count: userDelegationTasks.length },
                      { id: 'leads', label: 'Leads', icon: '📞', count: dueFollowUps.length }
                    ].map(tab => {
                      const isActive = notifMainTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNotifMainTab(tab.id)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '8px',
                            border: isActive ? '1.5px solid var(--accent-color)' : '1px solid var(--border-light)',
                            backgroundColor: isActive ? 'var(--accent-color)' : 'var(--bg-primary)',
                            color: isActive ? '#ffffff' : 'var(--text-primary)',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s'
                          }}
                        >
                          <span>{tab.icon} {tab.label}</span>
                          {tab.count > 0 && (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.05rem 0.35rem',
                              borderRadius: '6px',
                              backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--th-bg)',
                              color: isActive ? '#ffffff' : 'var(--text-secondary)'
                            }}>
                              {tab.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* TAB CONTENT: CHECKLISTS */}
                  {notifMainTab === 'checklist' && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '180px' }}>
                      {userChecklistSlots.length === 0 ? (
                        <div style={{ padding: '2.5rem 1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <CheckSquare size={28} style={{ opacity: 0.4, color: '#10b981' }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>All Checklists Submitted!</span>
                          <span style={{ fontSize: '0.78rem' }}>You have no pending checklist slots for today.</span>
                        </div>
                      ) : (
                        userChecklistSlots.map((slot, idx) => (
                          <div
                            key={`${slot.templateId}_${slot.slotId}_${idx}`}
                            onClick={() => handleNavigateToChecklistSlot(slot)}
                            style={{
                              padding: '0.75rem 0.85rem',
                              borderRadius: '10px',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'var(--bg-primary)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.4rem',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                              e.currentTarget.style.borderColor = 'var(--accent-color)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                              e.currentTarget.style.borderColor = 'var(--border-light)';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                📋 {slot.baseTitle}
                              </span>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: '6px',
                                backgroundColor: slot.isDelayed ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                color: slot.isDelayed ? '#ef4444' : '#3b82f6',
                                border: `1px solid ${slot.isDelayed ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`
                              }}>
                                {slot.isDelayed ? `Delayed (${slot.delayMinutes}m)` : `Due: ${slot.dueTime}`}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              Slot: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{slot.slotLabel}</span> (Cutoff: {slot.dueTime})
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNavigateToChecklistSlot(slot);
                                }}
                                style={{
                                  padding: '0.35rem 0.8rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'var(--accent-color)',
                                  color: '#ffffff',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Fill Checklist 👉
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB CONTENT: DELEGATION TASKS */}
                  {notifMainTab === 'delegation' && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '180px' }}>
                      {userDelegationTasks.length === 0 ? (
                        <div style={{ padding: '2.5rem 1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <Sparkles size={28} style={{ opacity: 0.4, color: '#3b82f6' }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No Delegated Tasks Pending!</span>
                          <span style={{ fontSize: '0.78rem' }}>You have no open tasks assigned to you right now.</span>
                        </div>
                      ) : (
                        userDelegationTasks.map(task => {
                          const priorityColor = task.priority === 'URGENT' ? '#ef4444' : (task.priority === 'HIGH' ? '#f59e0b' : '#3b82f6');
                          const priorityBg = task.priority === 'URGENT' ? 'rgba(239, 68, 68, 0.12)' : (task.priority === 'HIGH' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)');
                          const deadlineStr = task.deadline ? new Date(task.deadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : 'No deadline';

                          return (
                            <div
                              key={task.id}
                              onClick={() => handleNavigateToDelegationTask(task)}
                              style={{
                                padding: '0.75rem 0.85rem',
                                borderRadius: '10px',
                                border: '1px solid var(--border-light)',
                                backgroundColor: 'var(--bg-primary)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                                e.currentTarget.style.borderColor = 'var(--accent-color)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                                e.currentTarget.style.borderColor = 'var(--border-light)';
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                                  #{task.task_code}
                                </span>
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '6px',
                                  backgroundColor: priorityBg,
                                  color: priorityColor,
                                  border: `1px solid ${priorityColor}40`
                                }}>
                                  {task.priority}
                                </span>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                                {task.title}
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                Delegated by: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{task.delegated_by_name}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                                <span style={{ fontSize: '0.72rem', color: task.is_overdue ? '#ef4444' : 'var(--text-secondary)', fontWeight: task.is_overdue ? 700 : 500 }}>
                                  ⏰ {task.is_overdue ? 'Overdue: ' : 'Due: '}{deadlineStr}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNavigateToDelegationTask(task);
                                  }}
                                  style={{
                                    padding: '0.35rem 0.8rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'var(--accent-color)',
                                    color: '#ffffff',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  View Task 👉
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* TAB CONTENT: LEADS */}
                  {notifMainTab === 'leads' && (
                    <>
                      {/* Search input */}
                      <div style={{ padding: '0.65rem 0.9rem 0.45rem 0.9rem', backgroundColor: 'var(--bg-surface)' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                          <input
                            type="text"
                            value={notifSearch}
                            onChange={(e) => setNotifSearch(e.target.value)}
                            placeholder="Search name, phone, company, ID..."
                            style={{
                              width: '100%',
                              padding: '0.5rem 2rem 0.5rem 2.1rem',
                              borderRadius: '8px',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'var(--bg-primary)',
                              fontSize: '0.82rem',
                              color: 'var(--text-primary)',
                              outline: 'none'
                            }}
                          />
                          {notifSearch && (
                            <button
                              type="button"
                              onClick={() => setNotifSearch('')}
                              style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.2rem' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter Tabs Grid (Spacious 3x2 Layout with Yesterday) */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.4rem',
                        padding: '0.45rem 0.9rem 0.65rem 0.9rem',
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-surface)'
                      }}>
                        {[
                          { id: 'all', label: 'All Tasks', count: categorizedFollowUps.all.length },
                          { id: 'yesterday', label: '🔴 Yesterday', count: categorizedFollowUps.yesterday.length },
                          { id: 'today', label: '🟡 Today', count: categorizedFollowUps.today.length },
                          { id: 'tomorrow', label: '🟢 Tomorrow', count: categorizedFollowUps.tomorrow.length },
                          { id: 'overdue', label: '🔴 Overdue', count: categorizedFollowUps.overdue.length },
                          { id: 'upcoming', label: '🔵 Upcoming', count: categorizedFollowUps.upcoming.length }
                        ].map(tab => {
                          const isActive = notifFilter === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setNotifFilter(tab.id)}
                              style={{
                                padding: '0.4rem 0.5rem',
                                borderRadius: '8px',
                                border: isActive ? '1.5px solid var(--accent-color)' : '1px solid var(--border-light)',
                                backgroundColor: isActive ? 'var(--accent-color)' : 'var(--bg-primary)',
                                color: isActive ? '#ffffff' : 'var(--text-primary)',
                                fontSize: '0.73rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s',
                                boxShadow: isActive ? '0 2px 5px rgba(0,0,0,0.12)' : 'none'
                              }}
                            >
                              <span style={{ whiteSpace: 'nowrap' }}>{tab.label}</span>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.08rem 0.35rem',
                                borderRadius: '6px',
                                backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)',
                                color: isActive ? '#ffffff' : 'var(--text-secondary)'
                              }}>
                                {tab.count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* List of Notification Items (Direct Rich Cards) */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '180px' }}>
                        {filteredNotificationList.length === 0 ? (
                          <div style={{ padding: '2.5rem 1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={28} style={{ opacity: 0.4 }} />
                            <span>No follow-up tasks found for this filter</span>
                          </div>
                        ) : (
                          filteredNotificationList.map(lead => {
                            const formatted = formatFollowUpDateTime(lead.follow_up_date);
                            
                            let badgeBg = 'rgba(59, 130, 246, 0.12)';
                            let badgeColor = '#3b82f6';
                            let badgeBorder = 'rgba(59, 130, 246, 0.25)';
                            let badgeText = formatted.fullStr;

                            if (lead.followUpCategory === 'yesterday') {
                              badgeBg = 'rgba(239, 68, 68, 0.12)';
                              badgeColor = '#ef4444';
                              badgeBorder = 'rgba(239, 68, 68, 0.25)';
                              badgeText = `Yesterday: ${formatted.fullStr}`;
                            } else if (lead.followUpCategory === 'overdue') {
                              badgeBg = 'rgba(239, 68, 68, 0.12)';
                              badgeColor = '#ef4444';
                              badgeBorder = 'rgba(239, 68, 68, 0.25)';
                              badgeText = `Overdue: ${formatted.fullStr}`;
                            } else if (lead.followUpCategory === 'today') {
                              badgeBg = 'rgba(234, 179, 8, 0.15)';
                              badgeColor = '#d97706';
                              badgeBorder = 'rgba(234, 179, 8, 0.3)';
                              badgeText = `Today: ${formatted.fullStr}`;
                            } else if (lead.followUpCategory === 'tomorrow') {
                              badgeBg = 'rgba(16, 185, 129, 0.12)';
                              badgeColor = '#059669';
                              badgeBorder = 'rgba(16, 185, 129, 0.25)';
                              badgeText = `Tomorrow: ${formatted.fullStr}`;
                            }

                            const phone = lead.phone || lead.business_contact_1 || lead.business_contact_2;
                            const cleanStatus = (lead.status || '').includes('>') ? lead.status.split('>').pop() : (lead.status || 'New');

                            return (
                              <div
                                key={lead.id}
                                style={{
                                  padding: '0.65rem 0.8rem',
                                  borderRadius: '10px',
                                  border: '1px solid var(--border-light)',
                                  backgroundColor: 'var(--bg-primary)',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.35rem',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                                  e.currentTarget.style.borderColor = 'var(--accent-color)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                                  e.currentTarget.style.borderColor = 'var(--border-light)';
                                }}
                                onClick={() => handleNavigateToLead(lead)}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    {lead.lead_ref_id && (
                                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                                        #{lead.lead_ref_id}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--th-bg)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                      {cleanStatus}
                                    </span>
                                  </div>
                                  <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: badgeBg,
                                    color: badgeColor,
                                    border: `1px solid ${badgeBorder}`,
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {badgeText}
                                  </span>
                                </div>

                                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {lead.company || lead.name || 'Unnamed Client'}
                                  {lead.company && lead.name && lead.company !== lead.name && (
                                    <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
                                      ({lead.name})
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    {phone ? (
                                      <span>📞 {phone}</span>
                                    ) : (
                                      <span style={{ fontStyle: 'italic', opacity: 0.7 }}>No phone</span>
                                    )}
                                    {(lead.district_name || lead.city_name) && (
                                      <span>• 📍 {lead.district_name || lead.city_name}</span>
                                    )}
                                  </div>

                                  {phone && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                                      <a
                                        href={`tel:${phone}`}
                                        title="Call"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '4px',
                                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                          color: '#3b82f6',
                                          textDecoration: 'none',
                                          fontSize: '11px',
                                          fontWeight: 'bold'
                                        }}
                                      >
                                        📞
                                      </a>
                                      <a
                                        href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="WhatsApp"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '4px',
                                          backgroundColor: '#25D366',
                                          color: '#ffffff',
                                          textDecoration: 'none',
                                          fontSize: '10px',
                                          fontWeight: 'bold'
                                        }}
                                      >
                                        WA
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Footer */}
                      <div style={{
                        padding: '0.65rem 1rem',
                        borderTop: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.78rem'
                      }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                          Showing {filteredNotificationList.length} of {categorizedFollowUps[notifFilter]?.length || categorizedFollowUps.all.length} tasks
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('leads');
                            setShowNotifications(false);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.78rem'
                          }}
                        >
                          <span>Open Leads Table</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </>
                  )}

                  {/* TAB CONTENT: ALL (COMBINED VIEW) */}
                  {notifMainTab === 'all' && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '180px' }}>
                      {/* Section 1: Checklists Due */}
                      {userChecklistSlots.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', padding: '0 0.2rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              📋 Checklists Due ({userChecklistSlots.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => { setChecklistSubTab('my_checklists'); handleTabChange('checklist'); setShowNotifications(false); }}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Go to Checklist 👉
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {userChecklistSlots.slice(0, 3).map((slot, idx) => (
                              <div
                                key={`all_chk_${idx}`}
                                onClick={() => handleNavigateToChecklistSlot(slot)}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '8px',
                                  backgroundColor: 'var(--bg-primary)',
                                  border: '1px solid var(--border-light)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between'
                                }}
                              >
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {slot.baseTitle} ({slot.slotLabel})
                                </span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: slot.isDelayed ? '#ef4444' : '#3b82f6' }}>
                                  {slot.dueTime}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section 2: Delegated Tasks */}
                      {userDelegationTasks.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', padding: '0 0.2rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              🎯 Delegated Tasks ({userDelegationTasks.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => { setDelegationSubTab('to_me'); handleTabChange('delegation'); setShowNotifications(false); }}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                              Go to Delegation 👉
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {userDelegationTasks.slice(0, 3).map(task => (
                              <div
                                key={`all_del_${task.id}`}
                                onClick={() => handleNavigateToDelegationTask(task)}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '8px',
                                  backgroundColor: 'var(--bg-primary)',
                                  border: '1px solid var(--border-light)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between'
                                }}
                              >
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {task.title}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                    by {task.delegated_by_name}
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', backgroundColor: 'var(--th-bg)' }}>
                                  {task.priority}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section 3: Follow-up Leads */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', padding: '0 0.2rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            📞 Lead Follow-ups ({dueFollowUps.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setNotifMainTab('leads')}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            View Filter Grid 👉
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {dueFollowUps.slice(0, 5).map(lead => (
                            <div
                              key={`all_lead_${lead.id}`}
                              onClick={() => handleNavigateToLead(lead)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: 'var(--bg-primary)',
                                border: '1px solid var(--border-light)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {lead.company || lead.name}
                                </span>
                                {lead.phone && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                    {lead.phone}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                {lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString('en-IN') : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Global Offline Mode Status & Sync Center Pill */}
            <OfflineSyncCenter onSyncComplete={() => fetchLeads()} />

            {/* Live Session Inactivity Expiry Countdown & Mouse Tracker (Desktop) */}
            <div className="desktop-only">
              <SessionExpiryTracker 
                userEmail={userEmail} 
                userName={userName} 
                userRole={userRole} 
              />
            </div>

            {/* Theme Switcher Button (Desktop) */}
            <div className="desktop-only" style={{ position: 'relative' }} ref={themeMenuRef}>
              <button
                type="button"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="header-icon-btn"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: showThemeMenu ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: showThemeMenu ? 'var(--accent-color)' : 'var(--text-primary)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: 'var(--shadow-xs)'
                }}
                onMouseOver={(e) => {
                  if (!showThemeMenu) {
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                    e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
                    e.currentTarget.style.color = 'var(--accent-color)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!showThemeMenu) {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                  }
                }}
                title="Change Color Theme"
              >
                <Palette size={17} />
              </button>

              {showThemeMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '220px',
                  maxWidth: 'calc(100vw - 32px)',
                  backgroundColor: 'var(--bg-surface)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-xl)',
                  zIndex: 10000,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: '700', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.86rem', letterSpacing: '-0.01em' }}>
                    🎨 Color Theme
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '360px', overflowY: 'auto' }}>
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => {
                          setCurrentTheme(theme.id);
                          setShowThemeMenu(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65rem 1rem',
                          background: currentTheme === theme.id ? 'var(--nav-active-bg)' : 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontSize: '0.82rem',
                          color: currentTheme === theme.id ? 'var(--accent-color)' : 'var(--text-primary)',
                          fontWeight: currentTheme === theme.id ? '700' : '500',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = currentTheme === theme.id ? 'var(--nav-active-bg)' : 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{theme.icon}</span>
                          <span>{theme.name}</span>
                        </div>
                        {currentTheme === theme.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Unified User Profile Button with Photo & Dropdown */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '3px 8px 3px 4px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: showProfileMenu ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: 'var(--shadow-xs)',
                  minHeight: '36px'
                }}
                onMouseOver={(e) => {
                  if (!showProfileMenu) {
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!showProfileMenu) {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                  }
                }}
                title="User Profile"
              >
                {/* Avatar / Photo with Online Presence Indicator */}
                <div style={{ position: 'relative', width: '28px', height: '28px', flexShrink: 0 }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-color)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    {userAvatar ? (
                      <img src={userAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      userName ? userName.charAt(0).toUpperCase() : 'U'
                    )}
                  </div>
                  <span style={{
                    position: 'absolute',
                    bottom: '-1px',
                    right: '-1px',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    border: '1.5px solid var(--bg-surface)'
                  }} />
                </div>

                {/* User Details (Desktop) */}
                <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', margin: '0 0.15rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.15 }}>{userName || 'User'}</span>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 500 }}>{userRole}</span>
                </div>
                <ChevronDown size={13} className="desktop-only" style={{ color: 'var(--text-secondary)', marginLeft: '1px' }} />
              </button>
              
              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '280px',
                  maxWidth: 'calc(100vw - 20px)',
                  backgroundColor: 'var(--bg-surface)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '14px',
                  boxShadow: 'var(--shadow-xl)',
                  zIndex: 10000,
                  overflow: 'hidden'
                }}>
                  {/* Avatar Upload Card */}
                  <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ position: 'relative', width: '64px', height: '64px', marginBottom: '0.75rem' }}>
                      <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-color)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        overflow: 'hidden',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                        border: '3px solid var(--bg-surface)',
                        position: 'relative'
                      }}>
                        {userAvatar ? (
                          <img src={userAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          userName ? userName.charAt(0).toUpperCase() : 'U'
                        )}
                        {isUploadingAvatar && (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: 'rgba(0,0,0,0.55)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: '#ffffff' }} />
                          </div>
                        )}
                      </div>

                      {/* Camera Button */}
                      <button
                        type="button"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-color)',
                          color: '#ffffff',
                          border: '2px solid var(--bg-surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isUploadingAvatar ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          opacity: isUploadingAvatar ? 0.7 : 1
                        }}
                        title="Upload Photo"
                      >
                        {isUploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Camera size={13} />}
                      </button>
                      <input 
                        type="file" 
                        ref={avatarInputRef} 
                        onChange={handleAvatarUpload} 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                      />
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>{userName || 'User Profile'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{userEmail || 'employee@supujacreations.com'}</div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.6rem' }}>
                      <button
                        type="button"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--accent-color)',
                          cursor: isUploadingAvatar ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          opacity: isUploadingAvatar ? 0.7 : 1
                        }}
                      >
                        {isUploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                        {isUploadingAvatar ? 'Uploading...' : (userAvatar ? 'Change Photo' : 'Upload Photo')}
                      </button>
                      {userAvatar && (
                        <button
                          type="button"
                          disabled={isUploadingAvatar}
                          onClick={handleRemoveAvatar}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '6px',
                            padding: '0.35rem 0.6rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#ef4444',
                            cursor: isUploadingAvatar ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                          title="Remove Photo"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Role</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{userRole}</span>
                    </div>
                    {userCompany && (
                      <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Company</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{userCompany}</span>
                      </div>
                    )}

                    {/* Mobile Quick Theme Switcher */}
                    <div className="mobile-only" style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Theme</span>
                        <select
                          value={currentTheme}
                          onChange={(e) => setCurrentTheme(e.target.value)}
                          style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
                        >
                          {THEMES.map(t => (
                            <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '0.5rem', paddingTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowNotificationPreferencesModal(true);
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.65rem 1rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          textAlign: 'left',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)'}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Bell size={16} style={{ color: 'var(--accent-color)' }} /> Notification Preferences
                      </button>
                      <button 
                        onClick={handleLogout}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, textAlign: 'left', transition: 'background 0.15s' }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <LogOut size={16} /> Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div 
          className="page-content" 
          style={{ 
            padding: activeTab === 'ai' ? '0' : 'var(--content-padding, 2rem)', 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            overflow: activeTab === 'ai' ? 'hidden' : 'auto'
          }}
        >
          
        <div 
          style={{ 
            flex: 1, 
            minHeight: 0, 
            overflowY: activeTab === 'ai' ? 'hidden' : 'auto', 
            overflowX: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            height: '100%'
          }}
        >
          {(!canRead && activeTab === 'leads') ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <h2 style={{ color: 'var(--text-secondary)' }}>You do not have permission to view leads.</h2>
            </div>
          ) : !isMounted ? (
            <PremiumProgressLoader message="Loading workspace" active={!isMounted} />
          ) : !isCurrentTabAllowedOffline ? (
            <OfflineBlockScreen 
              moduleName={MODULE_DISPLAY_NAMES[activeTab] || 'This Module'} 
              onRetry={() => {
                if (typeof navigator !== 'undefined') {
                  setIsOnline(navigator.onLine);
                }
              }}
            />
          ) : (
            <>
              {/* Dashboard */}
              <KeepAliveTab 
                isActive={activeTab === 'dashboard'} 
                isVisited={isTabPermitted('dashboard', moduleAccess, userRole) && visitedTabs.has('dashboard')}
              >
                <ErrorBoundary>
                  <AnalyticsDashboard 
                    leads={leads} 
                    teamMembers={teamMembers} 
                    userEmail={userEmail}
                    userName={userName}
                    userId={userId}
                    userRole={userRole}
                    initialSubTab={dashboardSubTab}
                    onNavigateTab={(tab, subTab, stage) => {
                      if (tab === 'leads' && (stage || subTab)) {
                        const targetStage = stage || (typeof subTab === 'string' && subTab.includes('Stage') ? subTab : null);
                        if (targetStage) handleStageChange(targetStage);
                        handleTabChange('leads');
                      } else if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(tab)) {
                        const canonical = (tab === 'pipeline' || tab === 'leads-data') ? 'lead-data' : tab;
                        setActiveTab('dashboard');
                        setDashboardSubTab(canonical);
                        window.history.pushState(null, '', `/${canonical}`);
                      } else if (subTab) {
                        setActiveTab(tab);
                        window.history.pushState(null, '', `/${tab}?tab=${subTab}`);
                      } else {
                        handleTabChange(tab);
                      }
                    }}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Leads Database */}
              <KeepAliveTab 
                isActive={activeTab === 'leads'} 
                isVisited={isTabPermitted('leads', moduleAccess, userRole) && visitedTabs.has('leads')}
              >
                <ErrorBoundary>
                  {loadingLeads ? (
                    <PremiumProgressLoader message="Loading Leads Database" active={loadingLeads} />
                  ) : (
                    <LeadTable 
                      initialData={leads} 
                      canImportExport={canImportExport} 
                      canWrite={canWrite} 
                      onLeadsChange={handleLeadsChange} 
                      searchQuery={activeSearchQuery} 
                      stageFilter={leadsFilterStage} 
                      onStageChange={handleStageChange} 
                      teamMembers={teamMembers} 
                      userRole={userRole} 
                      userId={userId} 
                      userName={userName} 
                      moduleAccess={moduleAccess} 
                      globalRolePermissions={globalRolePermissions}
                      pendingLeadToOpen={pendingLeadToOpen}
                      onLeadOpened={() => setPendingLeadToOpen(null)}
                    />
                  )}
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Placeholders */}
              {activeTab === 'orders' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Order Management (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP System (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp_against' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP Against (Coming Soon)</h2><p>This module is under development.</p></div>}

              {/* Recruiter */}
              <KeepAliveTab 
                isActive={activeTab === 'recruiter'} 
                isVisited={isTabPermitted('recruiter', moduleAccess, userRole) && visitedTabs.has('recruiter')}
              >
                <ErrorBoundary>
                  <RecruiterDashboard 
                    userRole={userRole} 
                    userName={userName} 
                    selectedStage={recruiterFilterStage}
                    recruiterAccess={moduleAccess['recruiter'] || null}
                    isAdmin={userRole === 'admin' || userRole === 'Admin'}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Placeholders */}
              {activeTab === 'joining' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Joining Process (Coming Soon)</h2><p>This module is under development.</p></div>}

              {/* Smart Attendance & Regularization */}
              <KeepAliveTab 
                isActive={activeTab === 'attendance'} 
                isVisited={isTabPermitted('attendance', moduleAccess, userRole) && visitedTabs.has('attendance')}
              >
                <ErrorBoundary>
                  <AttendanceModule 
                    userRole={userRole} 
                    userId={userId} 
                    userName={userName} 
                    userEmail={userEmail} 
                    moduleAccess={moduleAccess}
                    initialSubTab={attendanceSubTab}
                    onSubTabChange={(tab) => handleAttendanceSubTabChange(tab)}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Smart Checklist Management (Daily, Weekly, 15-Day, Monthly, Quarterly, 6-Month, 1-Year) */}
              <KeepAliveTab 
                isActive={activeTab === 'checklist'} 
                isVisited={isTabPermitted('checklist', moduleAccess, userRole) && visitedTabs.has('checklist')}
              >
                <ErrorBoundary>
                  <ChecklistModule 
                    userRole={userRole} 
                    userId={userId} 
                    userName={userName} 
                    userEmail={userEmail} 
                    moduleAccess={moduleAccess}
                    initialSubTab={checklistSubTab}
                    onSubTabChange={(tab) => handleChecklistSubTabChange(tab)}
                    pendingSlotToOpen={pendingChecklistSlot}
                    onSlotOpened={() => setPendingChecklistSlot(null)}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Employee-to-Employee Task Delegation */}
              <KeepAliveTab 
                isActive={activeTab === 'delegation'} 
                isVisited={isTabPermitted('delegation', moduleAccess, userRole) && visitedTabs.has('delegation')}
              >
                <ErrorBoundary>
                  <DelegationTaskModule 
                    userRole={userRole} 
                    userId={userId} 
                    userName={userName} 
                    userEmail={userEmail} 
                    moduleAccess={moduleAccess}
                    initialSubTab={delegationSubTab}
                    onSubTabChange={(tab) => handleDelegationSubTabChange(tab)}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Client Registration */}
              <KeepAliveTab 
                isActive={activeTab === 'registration'} 
                isVisited={isTabPermitted('registration', moduleAccess, userRole) && visitedTabs.has('registration')}
              >
                <ErrorBoundary>
                  <ClientRegistration 
                    onRegistrationSuccess={() => handleTabChange('report')} 
                    canWrite={canWrite} 
                    teamMembers={teamMembers}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Client Report */}
              <KeepAliveTab 
                isActive={activeTab === 'report'} 
                isVisited={isTabPermitted('report', moduleAccess, userRole) && visitedTabs.has('report')}
              >
                <ErrorBoundary>
                  <ClientReport 
                    initialData={leads} 
                    onLeadsChange={handleLeadsChange} 
                    canImportExport={canImportExport} 
                    teamMembers={teamMembers} 
                    userName={userName} 
                    userRole={userRole}
                    moduleAccess={moduleAccess}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Assistant */}
              <KeepAliveTab 
                isActive={activeTab === 'ai'} 
                isVisited={isTabPermitted('ai', moduleAccess, userRole) && visitedTabs.has('ai')}
              >
                <ErrorBoundary>
                  <AiAssistantModule userRole={userRole} userId={userId} lastScreenCapture={lastScreenCapture} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Admin */}
              <KeepAliveTab 
                isActive={activeTab === 'aiadmin'} 
                isVisited={isTabPermitted('aiadmin', moduleAccess, userRole) && visitedTabs.has('aiadmin')}
              >
                <ErrorBoundary>
                  <AiAdminModule />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Knowledge Base */}
              <KeepAliveTab 
                isActive={activeTab === 'aiknowledgebase'} 
                isVisited={isTabPermitted('aiknowledgebase', moduleAccess, userRole) && visitedTabs.has('aiknowledgebase')}
              >
                <ErrorBoundary>
                  <AIKnowledgeBaseModule />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Call Center */}
              <KeepAliveTab 
                isActive={activeTab === 'callcenter'} 
                isVisited={isTabPermitted('callcenter', moduleAccess, userRole) && visitedTabs.has('callcenter')}
              >
                <ErrorBoundary>
                  <CallCenterModule userId={userId} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Call Admin */}
              <KeepAliveTab 
                isActive={activeTab === 'calladmin'} 
                isVisited={isTabPermitted('calladmin', moduleAccess, userRole) && visitedTabs.has('calladmin')}
              >
                <ErrorBoundary>
                  <CallAdminModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Call Center */}
              <KeepAliveTab 
                isActive={activeTab === 'aicallcenter'} 
                isVisited={isTabPermitted('aicallcenter', moduleAccess, userRole) && visitedTabs.has('aicallcenter')}
              >
                <ErrorBoundary>
                  <AiCallCenterModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Team Management */}
              <KeepAliveTab 
                isActive={activeTab === 'team'} 
                isVisited={isTabPermitted('team', moduleAccess, userRole) && visitedTabs.has('team')}
              >
                <ErrorBoundary>
                  <TeamManagement initialUsers={teamMembers} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Workplace */}
              <KeepAliveTab 
                isActive={activeTab === 'workplace'} 
                isVisited={isTabPermitted('workplace', moduleAccess, userRole) && visitedTabs.has('workplace')}
              >
                <ErrorBoundary>
                  <UniversalWorkplaceModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Party Master */}
              <KeepAliveTab 
                isActive={activeTab === 'party'} 
                isVisited={isTabPermitted('party', moduleAccess, userRole) && visitedTabs.has('party')}
              >
                <ErrorBoundary>
                  <PartyMasterModule />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Location Management */}
              <KeepAliveTab 
                isActive={activeTab === 'location_master' || activeTab === 'location_territory' || activeTab === 'location-master'} 
                isVisited={isTabPermitted('location_master', moduleAccess, userRole) && (visitedTabs.has('location_master') || visitedTabs.has('location_territory') || visitedTabs.has('location-master'))}
              >
                <ErrorBoundary>
                  <LocationManagementModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Public Users */}
              <KeepAliveTab 
                isActive={activeTab === 'public_users'} 
                isVisited={isTabPermitted('public_users', moduleAccess, userRole) && visitedTabs.has('public_users')}
              >
                <ErrorBoundary>
                  <PublicUserManagement />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* WhatsApp Official */}
              <KeepAliveTab 
                isActive={activeTab === 'whatsapp_official'} 
                isVisited={isTabPermitted('whatsapp_official', moduleAccess, userRole) && visitedTabs.has('whatsapp_official')}
              >
                <ErrorBoundary>
                  <WhatsappOfficial moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* WhatsApp Unofficial */}
              <KeepAliveTab 
                isActive={activeTab === 'whatsapp_unofficial'} 
                isVisited={isTabPermitted('whatsapp_unofficial', moduleAccess, userRole) && visitedTabs.has('whatsapp_unofficial')}
              >
                <ErrorBoundary>
                  <WhatsappUnofficialModule userRole={userRole} userId={userId} moduleAccess={moduleAccess} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Placeholders */}
              {activeTab === 'sms_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>SMS Configuration (Coming Soon)</h2><p>Gateway and API settings for standard SMS campaigns.</p></div>}
              {activeTab === 'rcs_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>RCS Configuration (Coming Soon)</h2><p>API setup and webhook configurations for RCS messaging.</p></div>}

              {/* Email Config */}
              <KeepAliveTab 
                isActive={activeTab === 'email_config'} 
                isVisited={isTabPermitted('email_config', moduleAccess, userRole) && visitedTabs.has('email_config')}
              >
                <ErrorBoundary>
                  <EmailConfigModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Admin Message Config */}
              <KeepAliveTab 
                isActive={activeTab === 'admin_message_config'} 
                isVisited={isTabPermitted('admin_message_config', moduleAccess, userRole) && visitedTabs.has('admin_message_config')}
              >
                <ErrorBoundary>
                  <AdminMessageConfig moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Offline Rule Module */}
              <KeepAliveTab 
                isActive={activeTab === 'offline_rule'} 
                isVisited={visitedTabs.has('offline_rule')}
              >
                <ErrorBoundary>
                  <OfflineRuleModule userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Settings */}
              <KeepAliveTab 
                isActive={activeTab === 'settings'} 
                isVisited={isTabPermitted('settings', moduleAccess, userRole) && visitedTabs.has('settings')}
              >
                <ErrorBoundary>
                  <SettingsContainer moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              </KeepAliveTab>
            </>
          )}
        </div>
        </div>
      </main>
      <GlobalSoftphoneWidget userId={userId} />

      {/* Intelligent Global Spotlight Command Palette */}
      <GlobalSpotlightModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        leads={leads}
        teamMembers={teamMembers}
        userRole={userRole}
        moduleAccess={moduleAccess}
        onNavigate={(tab, stage, searchQuery) => {
          handleTabChange(tab);
          if (tab === 'leads') {
            handleStageChange(stage);
            if (searchQuery) {
              setActiveSearchQuery(searchQuery);
            }
          } else if (tab === 'recruiter' && stage) {
            setRecruiterFilterStage(stage);
          }
        }}
        onAction={(actionType) => {
          if (actionType === 'theme') {
            setShowThemeMenu(true);
          } else if (actionType === 'profile') {
            setShowProfileMenu(true);
          } else if (actionType === 'logout') {
            handleLogout();
          }
        }}
      />

      {/* Dynamic Screen Popup: Corner Floating Toast Card */}
      {activeCornerToast && (
        <div style={{
          position: 'fixed',
          top: '68px',
          right: '18px',
          width: '380px',
          maxWidth: 'calc(100vw - 36px)',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '14px',
          border: '2px solid var(--accent-color)',
          boxShadow: '0 20px 30px -8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 999999,
          padding: '1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.4rem' }}>
                {activeCornerToast.type === 'checklist' ? '📋' : (activeCornerToast.type === 'delegation' ? '🎯' : '🔔')}
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--text-primary)', lineHeight: 1.25 }}>
                  {activeCornerToast.title}
                </div>
                {activeCornerToast.subtitle && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {activeCornerToast.subtitle}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveCornerToast(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.2rem', borderRadius: '4px' }}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {activeCornerToast.details && (
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-primary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              lineHeight: 1.4
            }}>
              {activeCornerToast.details}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.15rem' }}>
            {activeCornerToast.dueTime ? (
              <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                ⏰ {activeCornerToast.dueTime}
              </span>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveCornerToast(null)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeCornerToast.type === 'checklist' && activeCornerToast.rawItem) {
                    handleNavigateToChecklistSlot(activeCornerToast.rawItem);
                  } else if (activeCornerToast.type === 'delegation' && activeCornerToast.rawItem) {
                    handleNavigateToDelegationTask(activeCornerToast.rawItem);
                  } else if (activeCornerToast.type === 'lead' && activeCornerToast.rawItem) {
                    handleNavigateToLead(activeCornerToast.rawItem);
                  } else if (activeCornerToast.targetTab) {
                    handleTabChange(activeCornerToast.targetTab);
                  }
                  setActiveCornerToast(null);
                }}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-color)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                {activeCornerToast.type === 'checklist' ? 'Fill Checklist 👉' : (activeCornerToast.type === 'delegation' ? 'View Task 👉' : 'Open 👉')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Screen Popup: High-Priority Center Alert Modal */}
      {activeCenterModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '460px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '2px solid var(--accent-color)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem'
              }}>
                {activeCenterModal.type === 'checklist' ? '📋' : (activeCenterModal.type === 'delegation' ? '🎯' : '🔔')}
              </div>
              <button
                type="button"
                onClick={() => setActiveCenterModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.4rem', borderRadius: '6px' }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <div style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {activeCenterModal.title}
              </div>
              {activeCenterModal.subtitle && (
                <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {activeCenterModal.subtitle}
                </div>
              )}
            </div>

            {activeCenterModal.details && (
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                fontSize: '0.86rem',
                color: 'var(--text-primary)',
                lineHeight: 1.5
              }}>
                {activeCenterModal.details}
                {activeCenterModal.dueTime && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-color)' }}>
                    ⏰ Scheduled Time: {activeCenterModal.dueTime}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setActiveCenterModal(null)}
                style={{
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Snooze / Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeCenterModal.type === 'checklist' && activeCenterModal.rawItem) {
                    handleNavigateToChecklistSlot(activeCenterModal.rawItem);
                  } else if (activeCenterModal.type === 'delegation' && activeCenterModal.rawItem) {
                    handleNavigateToDelegationTask(activeCenterModal.rawItem);
                  } else if (activeCenterModal.type === 'lead' && activeCenterModal.rawItem) {
                    handleNavigateToLead(activeCenterModal.rawItem);
                  } else if (activeCenterModal.targetTab) {
                    handleTabChange(activeCenterModal.targetTab);
                  }
                  setActiveCenterModal(null);
                }}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent-color)',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }}
              >
                {activeCenterModal.type === 'checklist' ? 'Fill Checklist Now 👉' : (activeCenterModal.type === 'delegation' ? 'Open Delegated Task 👉' : 'View Now 👉')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Employee Notification Preferences Modal */}
      <UserNotificationPreferencesModal
        isOpen={showNotificationPreferencesModal}
        onClose={() => setShowNotificationPreferencesModal(false)}
      />
    </div>
  );
}
