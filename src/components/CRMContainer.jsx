'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import pkg from '../../package.json';
import LeadTable from '@/components/LeadTable';
import GlobalSoftphoneWidget from './CallCenter/GlobalSoftphoneWidget';
import { isFeatureEntitled } from '@/utils/saasEntitlements';
import SubscriptionExpiryBanner from './SaaS/SubscriptionExpiryBanner';
import SubscriptionExpiredModal from './SaaS/SubscriptionExpiredModal';
import AddonPurchaseModal from './SaaS/AddonPurchaseModal';
import { Database, LayoutDashboard, Users, Settings, Bell, Search, Shield, LogOut, FilePlus2, FileSpreadsheet, CheckCircle, Archive, FileText, PieChart, UserPlus, MessageCircle, MessageSquare, ChevronDown, ChevronRight, ChevronLeft, Menu, Palette, Check, Bot, PhoneCall, Phone, BookOpen, Building2, MapPin, ShieldCheck, Camera, User, Upload, Loader2, Trash2, Calendar, Clock, AlertTriangle, AlertCircle, X, ExternalLink, CheckSquare, WifiOff, Sparkles, Volume2, CheckCircle2, Play, Settings2, FormInput, Workflow, Monitor, Target, FileType, Compass, Layers, Network, Activity, Crown, GitMerge, Sliders, Send, Mail, Zap, Package } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getTeamMembers } from '@/app/actions/team';
import { logAuditAction } from '@/app/actions/audit';
import { uploadUserAvatar, removeUserAvatar } from '@/app/actions/userProfile';
import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceSkeleton from './WorkspaceSkeleton';
import SidebarSubmenu from './SidebarSubmenu';
import ResponsiveTableResizer from './ResponsiveTableResizer';
import GlobalSpotlightModal from './GlobalSearch/GlobalSpotlightModal';
import SessionExpiryTracker from './SessionExpiryTracker';
import OfflineSyncCenter from './OfflineSyncCenter';
import { saveLeadsLocally, getLocalLeads, getLocalLeadsPreview, saveLocalLeadsPreview, isModuleAllowedOffline, upsertLeadsLocally, deleteLeadLocally, getFastLeadsSnapshot, saveFastLeadsSnapshot, setLeadCacheScope, getLeadStagePreview, markLeadStartupTiming } from '@/utils/offlineSync';
import { getUserPendingAlerts } from '@/app/actions/userAlerts';
import UserNotificationPreferencesModal from '@/components/common/UserNotificationPreferencesModal';
import { getTransferredLeads } from '@/app/actions/partyHandoff';

import { MODULES_CONFIG } from '@/config/modulesConfig';
import { getSubItemPermissions, getModulePermissions } from '@/utils/permissionUtils';
import { sameLeadList } from '@/utils/sameLeadList';
import { getReportingTeam, getLeadAssignees, isLeadInAssignmentScope, getLeadStageKey, getLeadStageAccess } from '@/utils/reportingHierarchy';
import { isCompleteLeadCache, matchesLeadCacheContext, mergeLeadCacheForDisplay } from '@/utils/leadCachePolicy';

const OfflineBlockScreen = dynamic(() => import('./Offline/OfflineBlockScreen'));
const AnalyticsDashboard = dynamic(() => import('@/components/AnalyticsDashboard'), { loading: () => <WorkspaceSkeleton variant="analytics" /> });
const ClientRegistration = dynamic(() => import('@/components/ClientRegistration'), { loading: () => <WorkspaceSkeleton variant="form" /> });
const CallCenterModule = dynamic(() => import('./CallCenter/CallCenterModule'), { loading: () => <WorkspaceSkeleton variant="callcenter" /> });
const PartyMasterModule = dynamic(() => import('./Party/PartyMasterModule'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const ChannelOperationsModule = dynamic(() => import('./Party/ChannelOperationsModule'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const LocationManagementModule = dynamic(() => import('./Location/LocationManagementModule'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const AttendanceModule = dynamic(() => import('./Attendance/AttendanceModule'), { loading: () => <WorkspaceSkeleton variant="attendance" /> });
const TeamManagement = dynamic(() => import('@/components/TeamManagement'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const UserManagementContainer = dynamic(() => import('@/components/UserManagement/UserManagementContainer'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const PublicUserManagement = dynamic(() => import('@/components/PublicUserManagement'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const ClientReport = dynamic(() => import('@/components/ClientReport'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const WhatsappOfficial = dynamic(() => import('@/components/WhatsappOfficial'), { loading: () => <WorkspaceSkeleton variant="chat" /> });
const WhatsappUnofficialModule = dynamic(() => import('./WhatsappUnofficial/WhatsappUnofficialModule'), { loading: () => <WorkspaceSkeleton variant="chat" /> });
const AiAssistantModule = dynamic(() => import('./AiAssistant/AiAssistantModule'), { loading: () => <WorkspaceSkeleton variant="chat" /> });
const CallAdminModule = dynamic(() => import('./CallCenter/CallAdminModule'), { loading: () => <WorkspaceSkeleton variant="analytics" /> });
const AiCallCenterModule = dynamic(() => import('./AiCallCenter/AiCallCenterModule'), { loading: () => <WorkspaceSkeleton variant="callcenter" /> });
const AiAdminModule = dynamic(() => import('./AiAdmin/AiAdminModule'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const AIKnowledgeBaseModule = dynamic(() => import('./AiAdmin/AIKnowledgeBaseModule'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const SettingsContainer = dynamic(() => import('./Settings/SettingsContainer'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const RecruiterDashboard = dynamic(() => import('./Recruiter/RecruiterDashboard'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const UniversalWorkplaceModule = dynamic(() => import('./Workplace/UniversalWorkplaceModule'), { loading: () => <WorkspaceSkeleton variant="table" /> });
const AdminMessageConfig = dynamic(() => import('./AdminMessageConfig/AdminMessageConfig'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const EmailConfigModule = dynamic(() => import('./EmailConfig/EmailConfigModule'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const ChecklistModule = dynamic(() => import('./Checklist/ChecklistModule'), { loading: () => <WorkspaceSkeleton variant="checklist" /> });
const DelegationTaskModule = dynamic(() => import('./Delegation/DelegationTaskModule'), { loading: () => <WorkspaceSkeleton variant="checklist" /> });
const OfflineRuleModule = dynamic(() => import('./Offline/OfflineRuleModule'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const SuperAdminSaasPanel = dynamic(() => import('./SaaS/SuperAdminSaasPanel'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const ConfigMasterPanel = dynamic(() => import('./MasterAdmin/ConfigMasterPanel'), { loading: () => <WorkspaceSkeleton variant="settings" /> });
const BroadcastNotificationReceiver = dynamic(() => import('./common/BroadcastNotificationReceiver'), { ssr: false });

markLeadStartupTiming('crm-module-ready');

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

const SETTINGS_MODULE_ITEMS = [
  { id: 'business', label: 'Business Profile & Branches', icon: Building2 },
  { id: 'products', label: 'Product List', icon: Package },
  { id: 'crm', label: 'CRM & Lead Config', icon: Settings2 },
  { id: 'fields', label: 'Custom Fields', icon: FormInput },
  { id: 'templates', label: 'Message & WhatsApp Templates', icon: MessageSquare },
  { id: 'notifications', label: 'Notifications & Alerts', icon: Bell },
  { id: 'departments', label: 'Manage Departments', icon: Layers },
  { id: 'targets', label: 'Targets & Performance', icon: Target },
  { id: 'sessions', label: 'Session & Break Rules', icon: Monitor },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'media', label: 'File & Media Settings', icon: FileType }
];

// Helper to map DB status to Team Management Stage format
export const getStageFromStatus = (status) => {
  return getLeadStageKey(status);
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

// High-performance zero-allocation date comparator for 45k+ leads (prevents browser/PC freeze)
const sortLeadsByDateDesc = (a, b) => {
  const tA = (a && a.created_at) || '';
  const tB = (b && b.created_at) || '';
  if (tB > tA) return 1;
  if (tB < tA) return -1;
  return 0;
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

export function isTabPermitted(tabId, moduleAccess = {}, userRole = '', tenantEntitlements = null, tenantId = null, userEmail = '') {
  const activeEntitlements = tenantEntitlements || moduleAccess?._tenantEntitlements || null;
  const activeTenantId = tenantId || moduleAccess?._tenantId || null;

  // 1. SaaS Tenant Subscription Entitlement Gate
  if (activeEntitlements && !isFeatureEntitled(tabId, activeEntitlements, activeTenantId)) {
    return false;
  }

  // 2. SaaS Studio, Workflow Builder & Admin Message Gate: STRICTLY restricted to Master Admin (supujacreations@gmail.com)
  if (tabId === 'saas_studio' || tabId === 'saas_master' || tabId === 'config_master' || tabId === 'workplace' || tabId === 'workflow' || tabId === 'admin_message_config') {
    const emailLower = (userEmail || moduleAccess?._userEmail || '').toLowerCase().trim();
    const isMaster = emailLower === 'supujacreations@gmail.com' ||
                     (typeof userRole === 'string' && userRole.toLowerCase() === 'masteradmin') ||
                     moduleAccess?.is_master_admin === true;
    return isMaster;
  }

  const isAdmin = typeof userRole === 'string' && (userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'superadmin' || userRole.toLowerCase() === 'masteradmin');
  if (isAdmin) return true;
  if (!moduleAccess) return false;

  if (tabId === 'dashboard') return moduleAccess['analytics']?.view === true;
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
  if (tabId === 'user_management_new') return moduleAccess['user_management_new']?.view === true || moduleAccess['team']?.view === true || isAdmin;
  if (tabId === 'party' || (typeof tabId === 'string' && (tabId.startsWith('party/') || tabId.startsWith('party_')))) return moduleAccess['party']?.view === true || moduleAccess['team']?.view === true;
  if (tabId === 'channel_ops' || tabId === 'channel-operations' || (typeof tabId === 'string' && (tabId.startsWith('channel_ops') || tabId.startsWith('channel-operations')))) return moduleAccess['channel_ops']?.view === true || moduleAccess['party']?.view === true || moduleAccess['team']?.view === true;
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

export const PARTY_SUBTAB_TITLES = {
  dashboard: 'Party Master Dashboard',
  all_party_stage: 'All Party Stage',
  s00: 'S00 Transfered to Party Master',
  s01: 'S01 Party Master Creation',
  s02: 'S02 Distributor Registration',
  s03: 'S03 Dealer Registration',
  s04: 'S04 Sub-Dealer Registration',
  s05: 'S05 Commercial Security Details',
  s06: 'S06 Product Auth & Territory',
  s07: 'S07 Sales Team Assignment',
  s08: 'S08 Partner Activation',
  report: 'Party Master Report',
  r03: 'Party Master Report',
  hierarchy_tree: 'Channel Hierarchy Tree'
};

export const CHANNEL_OPS_SUBTAB_TITLES = {
  frequency_rules: 'Order Frequency Master',
  order_followup: 'Order Desk Calling',
  order_pipeline: 'Order to Delivery Pipeline',
  order_feedback: 'Post-Order Feedback',
  monthly_feedback: 'Monthly Health Checks',
  complaints: 'Complaint Management'
};

export const MODULE_DISPLAY_NAMES = {
  dashboard: 'Analytics Dashboard',
  leads: 'Leads & Sales Database',
  channel_ops: 'Daily Order Follow-up',
  registration: 'New Lead Registration',
  report: 'Lead Registered Report',
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
  workplace: 'Workflow Builder',
  public_users: 'Public User Management',
  settings: 'System Settings',
  system_offline_rules: 'Offline Rule Settings'
};

const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];

function sameAlertItems(current, incoming) {
  return current.length === incoming.length && current.every((item, index) => {
    const next = incoming[index];
    const keys = Object.keys(item);
    return keys.length === Object.keys(next).length && keys.every(key => item[key] === next[key]);
  });
}

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
  initialSearchParams = null,
  initialTheme = 'default',
  tenantId = null,
  tenantEntitlements = null,
  tenantSubscription = null
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
  const emailLower = (userEmail || '').toLowerCase().trim();
  const isMasterAdmin = !isImpersonating && (
    emailLower === 'supujacreations@gmail.com' ||
    (typeof userRole === 'string' && userRole.toLowerCase() === 'masteradmin') ||
    moduleAccess?.is_master_admin === true
  );
  const isSwanWorkspace = useMemo(() => {
    return !userCompany || SWAN_COMPANIES.includes(String(userCompany).toLowerCase().trim()) || (userEmail && userEmail.toLowerCase().endsWith('@newswangroup.com'));
  }, [userCompany, userEmail]);
  const effectiveTenantEntitlements = tenantEntitlements || moduleAccess?._tenantEntitlements || null;
  const effectiveTenantId = tenantId || moduleAccess?._tenantId || null;
  const isCallingEntitled = isFeatureEntitled('callcenter', effectiveTenantEntitlements, effectiveTenantId);

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
    if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(path) || (path && path.startsWith('dashboard/')) || path === 'dashboard') {
      const isAdmin = userRole === 'admin' || userRole === 'Admin' || (typeof userRole === 'string' && userRole.toLowerCase() === 'masteradmin');
      const hasAnalyticsAccess = isAdmin || moduleAccess?.['analytics']?.view === true;
      if (hasAnalyticsAccess) {
        return 'dashboard';
      }
      // If user does not have analytics access, redirect to first allowed module
      if (moduleAccess?.['callcenter']?.view === true) return 'callcenter';
      if (moduleAccess?.['leads']?.view === true) return 'leads';
      if (moduleAccess?.['attendance']?.view !== false) return 'attendance';
      if (moduleAccess?.['checklist']?.view !== false) return 'checklist';
      if (moduleAccess?.['delegation']?.view !== false) return 'delegation';
      const firstAllowed = Object.keys(moduleAccess || {}).find(k => moduleAccess[k]?.view === true);
      return firstAllowed || 'leads';
    }
    if (['sessions', 'shift-monitoring', 'shift-analytics', 'breakdown'].includes(path) || path === 'settings' || (path && path.startsWith('settings/'))) {
      return 'settings';
    }
    if (path === 'location-master' || path === 'location_territory') {
      return 'location_master';
    }
    if (path === 'aiadmin' || path.startsWith('aiadmin/')) {
      return 'aiadmin';
    }
    if (path === 'calladmin' || path === 'call-admin' || (path && (path.startsWith('calladmin/') || path.startsWith('call-admin/')))) {
      return 'calladmin';
    }
    if (path === 'party' || (path && path.startsWith('party/'))) {
      return 'party';
    }
    if (path === 'channel_ops' || path === 'channel-operations' || (path && (path.startsWith('channel-operations/') || path.startsWith('channel_ops/')))) {
      return 'channel_ops';
    }
    if (['email', 'email-config', 'email_config', 'email-campaigns', 'email_campaigns'].includes(path) || (path && (path.startsWith('email-config') || path.startsWith('email_config') || path.startsWith('email/')))) {
      return 'email_config';
    }
    if (['saas-master', 'saas_master', 'saasmaster', 'saas-studio', 'saas_studio', 'saasstudio'].includes(path) || (path && (path.startsWith('saas-master') || path.startsWith('saas_master') || path.startsWith('saas-studio') || path.startsWith('saas_studio')))) {
      return isMasterAdmin ? 'saas_master' : 'dashboard';
    }
    if (['config-master', 'config_master', 'configmaster', 'admin-message-config', 'admin_message_config'].includes(path) || (path && (path.startsWith('config-master') || path.startsWith('config_master')))) {
      return isMasterAdmin ? 'config_master' : 'dashboard';
    }
    if (isMasterAdmin && (path === 'offline_rule' || path === 'offline-rule' || path === 'public_users' || path === 'public-users')) {
      return 'config_master';
    }

    if (!path) {
      const isAdmin = userRole === 'admin' || userRole === 'Admin' || (typeof userRole === 'string' && userRole.toLowerCase() === 'masteradmin');
      if (isAdmin || moduleAccess?.['analytics']?.view === true) path = 'dashboard';
      else if (moduleAccess?.['callcenter']?.view === true) path = 'callcenter';
      else if (moduleAccess?.['leads']?.view === true) path = 'leads';
      else if (moduleAccess?.['attendance']?.view !== false) path = 'attendance';
      else if (moduleAccess?.['checklist']?.view !== false) path = 'checklist';
      else if (moduleAccess?.['delegation']?.view !== false) path = 'delegation';
      else if (moduleAccess?.['new_swan_ai']?.view === true) path = 'ai';
      else if (moduleAccess?.['aiadmin']?.view === true) path = 'aiadmin';
      else if (moduleAccess?.['aiknowledgebase']?.view === true) path = 'aiknowledgebase';
      else if (moduleAccess?.['calladmin']?.view === true) path = 'calladmin';
      else if (moduleAccess?.['aicallcenter']?.view === true) path = 'aicallcenter';
      else {
        // Fallback to first available module access
        const firstAllowed = Object.keys(moduleAccess || {}).find(k => moduleAccess[k]?.view);
        if (firstAllowed) path = firstAllowed;
        else path = 'leads';
      }
    }
    return path;
  });
  const [isMounted, setIsMounted] = useState(false);
  const [initialLeadStage] = useState(() => {
    const stageParam = typeof initialSearchParams !== 'undefined' ? initialSearchParams?.stage : null;
    if (stageParam === 'all') return null;
    if (stageParam) return stageParam;
    try {
      return typeof window !== 'undefined' ? localStorage.getItem('crmActiveStage') || null : null;
    } catch (_e) { return null; }
  });
  const stagePreviewStateRef = useRef(null);
  const [leads, setLeads] = useState(() => {
    if (typeof window !== 'undefined') {
      const fast = getFastLeadsSnapshot(userId, { userCompany, userRole, stageKey: initialLeadStage });
      if (Array.isArray(fast) && fast.length > 0) return fast;
    }
    return [];
  });
  const [rawLeads, setRawLeads] = useState(() => {
    if (typeof window !== 'undefined') {
      const fast = getFastLeadsSnapshot(userId, { userCompany, userRole, stageKey: initialLeadStage });
      if (Array.isArray(fast) && fast.length > 0) return fast;
    }
    return [];
  });
  const rawLeadsRef = useRef([]);
  const [loadingLeads, setLoadingLeads] = useState(() => {
    if (typeof window !== 'undefined') {
      const fast = getFastLeadsSnapshot(userId, { userCompany, userRole, stageKey: initialLeadStage });
      if (Array.isArray(fast) && fast.length > 0) return false;
    }
    return true;
  });

  // Publish the hydration gate in the layout commit so cached rows do not
  // wait for passive/background startup work.
  React.useLayoutEffect(() => {
    let active = true;
    setIsMounted(true);
    markLeadStartupTiming('app-mounted', { pathname: window.location.pathname });
    setLeadCacheScope(userId);
    let effectiveStage = initialLeadStage;
    const hasExplicitStage = typeof initialSearchParams !== 'undefined' && Boolean(initialSearchParams?.stage);
    if (!hasExplicitStage && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('crmActiveStage');
        if (saved && saved !== 'all') {
          effectiveStage = saved;
          if (typeof setLeadsFilterStage === 'function') setLeadsFilterStage(saved);
        }
      } catch (_e) {}
    }
    const fast = getFastLeadsSnapshot(userId, { userCompany, userRole, stageKey: effectiveStage });
    if (Array.isArray(fast) && fast.length > 0) {
      setRawLeads(fast);
      setLeads(fast);
      rawLeadsRef.current = fast;
      setLoadingLeads(false);
      markLeadStartupTiming('preview-restored', { source: 'web-storage', count: fast.length });
    } else {
      getLocalLeadsPreview(userCompany, userRole, effectiveStage).then(preview => {
        if (!active || rawLeadsRef.current?.length > 0 || preview.length === 0) return;
        setRawLeads(preview);
        setLeads(preview);
        rawLeadsRef.current = preview;
        setLoadingLeads(false);
        saveFastLeadsSnapshot(preview, userId, { userCompany, userRole, stageKey: effectiveStage });
        markLeadStartupTiming('preview-restored', { source: 'indexeddb', count: preview.length });
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [userId, userCompany, userRole, initialLeadStage]);
  const [teamMembers, setTeamMembers] = useState([]);
  const reportingLeadTeam = useMemo(() => getReportingTeam(teamMembers, {
    user_id: userId, email: userEmail, emp_name: userName
  }), [teamMembers, userId, userEmail, userName]);
  const reportingLeadAssignees = useMemo(() => getLeadAssignees(reportingLeadTeam, {
    user_id: userId, emp_name: userName
  }), [reportingLeadTeam, userId, userName]);
  const leadAssigneeScopeKey = JSON.stringify(reportingLeadAssignees);
  const leadAssigneeScope = useMemo(() => new Set(JSON.parse(leadAssigneeScopeKey)), [leadAssigneeScopeKey]);
  const [adminCompanyFilter, setAdminCompanyFilter] = useState(() => {
    const compLower = String(userCompany || '').toLowerCase().trim();
    if (userCompany && !SWAN_COMPANIES.includes(compLower)) {
      return userCompany;
    }
    return 'All';
  });

  useEffect(() => {
    const compLower = String(userCompany || '').toLowerCase().trim();
    if (userCompany && !SWAN_COMPANIES.includes(compLower) && adminCompanyFilter !== userCompany) {
      setAdminCompanyFilter(userCompany);
    }
  }, [userCompany, adminCompanyFilter]);
  const [messageMenuExpanded, setMessageMenuExpanded] = useState(false);
  const [aiMenuExpanded, setAiMenuExpanded] = useState(false);
  const [attendanceMenuExpanded, setAttendanceMenuExpanded] = useState(false);
  const [attendanceSubTab, setAttendanceSubTab] = useState('my_attendance');
  const [checklistMenuExpanded, setChecklistMenuExpanded] = useState(false);
  const [checklistSubTab, setChecklistSubTab] = useState('dashboard');
  const [delegationMenuExpanded, setDelegationMenuExpanded] = useState(false);
  const [delegationSubTab, setDelegationSubTab] = useState('dashboard');
  const [workflowMenuExpanded, setWorkflowMenuExpanded] = useState(false);
  const [workflowSubTab, setWorkflowSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath && (cleanPath.startsWith('workflow/') || cleanPath.startsWith('workplace/'))) {
      const sub = cleanPath.split('/')[1];
      if (['active', 'tracker', 'trash'].includes(sub)) return sub;
    }
    if (queryTab && ['active', 'tracker', 'trash'].includes(queryTab)) {
      return queryTab;
    }
    return 'active';
  });
  const [callAdminMenuExpanded, setCallAdminMenuExpanded] = useState(false);
  const [callCenterMenuExpanded, setCallCenterMenuExpanded] = useState(false);
  const [callAdminSubTab, setCallAdminSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath && (cleanPath.startsWith('calladmin/') || cleanPath.startsWith('call-admin/'))) {
      const sub = cleanPath.split('/')[1];
      if (sub) return sub;
    }
    if (queryTab && ['agents', 'endpoints', 'telephony', 'calllogs', 'monitor', 'settings'].includes(queryTab)) {
      return queryTab;
    }
    return 'agents';
  });
  const [partyMenuExpanded, setPartyMenuExpanded] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanPath === 'party' || (cleanPath && cleanPath.startsWith('party/'));
  });
  const [partyPendingCount, setPartyPendingCount] = useState(0);
  const [partySubTab, setPartySubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || searchParams?.get('step') || initialSearchParams?.tab || initialSearchParams?.subtab || initialSearchParams?.step || '').toLowerCase();
    if (cleanPath && cleanPath.startsWith('party/')) {
      let sub = cleanPath.split('/')[1];
      if (sub === 'r03' || sub === 'party-master-report') sub = 'report';
      if (sub) return sub;
    }
    if (queryTab === 'r03' || queryTab === 'party-master-report') queryTab = 'report';
    if (queryTab) return queryTab;
    return 'dashboard';
  });
  const [channelOpsMenuExpanded, setChannelOpsMenuExpanded] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanPath === 'channel-operations' || cleanPath === 'channel_ops' || (cleanPath && (cleanPath.startsWith('channel-operations/') || cleanPath.startsWith('channel_ops/')));
  });
  const [channelOpsSubTab, setChannelOpsSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || searchParams?.get('step') || initialSearchParams?.tab || initialSearchParams?.subtab || initialSearchParams?.step || '').toLowerCase();
    if (cleanPath && (cleanPath.startsWith('channel-operations/') || cleanPath.startsWith('channel_ops/'))) {
      let sub = cleanPath.split('/')[1];
      if (sub) return sub;
    }
    if (queryTab && ['frequency_rules', 'order_followup', 'order_pipeline', 'order_feedback', 'monthly_feedback', 'complaints'].includes(queryTab)) return queryTab;
    return 'frequency_rules';
  });
  const [saasMenuExpanded, setSaasMenuExpanded] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanPath.startsWith('saas-master') || cleanPath.startsWith('saas_master') || cleanPath.startsWith('saas-studio') || cleanPath.startsWith('saas_studio');
  });
  const [saasSubTab, setSaasSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath && (cleanPath.startsWith('saas-master/') || cleanPath.startsWith('saas_master/') || cleanPath.startsWith('saas-studio/') || cleanPath.startsWith('saas_studio/'))) {
      const sub = cleanPath.split('/')[1];
      if (sub === 'workspaces' || sub === 'clients') return 'tenants';
      if (sub === 'invoices' || sub === 'ledger') return 'billing';
      if (['pricing', 'tenants', 'billing'].includes(sub)) return sub;
    }
    if (queryTab && ['pricing', 'tenants', 'workspaces', 'billing', 'invoices'].includes(queryTab)) {
      if (queryTab === 'workspaces') return 'tenants';
      if (queryTab === 'invoices') return 'billing';
      return queryTab;
    }
    return 'pricing';
  });
  const [configMasterMenuExpanded, setConfigMasterMenuExpanded] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    return cleanPath.startsWith('config-master') || cleanPath.startsWith('config_master') || cleanPath === 'admin_message_config' || cleanPath === 'admin-message-config' || (isMasterAdmin && (cleanPath === 'offline_rule' || cleanPath === 'offline-rule' || cleanPath === 'public_users' || cleanPath === 'public-users'));
  });
  const [configMasterSubTab, setConfigMasterSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath === 'admin_message_config' || cleanPath === 'admin-message-config') {
      return 'messages';
    }
    if (cleanPath === 'offline_rule' || cleanPath === 'offline-rule') {
      return 'offline_rule';
    }
    if (cleanPath === 'public_users' || cleanPath === 'public-users') {
      return 'public_users';
    }
    if (cleanPath && (cleanPath.startsWith('config-master/') || cleanPath.startsWith('config_master/'))) {
      const sub = cleanPath.split('/')[1];
      if (sub === 'admin_messages' || sub === 'admin-messages' || sub === 'otps') return 'messages';
      if (sub === 'health' || sub === 'logs') return 'status';
      if (sub === 'offline-rule') return 'offline_rule';
      if (sub === 'public-users') return 'public_users';
      if (['messages', 'status', 'automation', 'navigation', 'offline_rule', 'public_users', 'notifications'].includes(sub)) return sub;
    }
    if (queryTab && ['messages', 'admin_messages', 'status', 'health', 'automation', 'navigation', 'offline_rule', 'offline-rule', 'public_users', 'public-users', 'notifications'].includes(queryTab)) {
      if (queryTab === 'admin_messages' || queryTab === 'admin-messages') return 'messages';
      if (queryTab === 'health') return 'status';
      if (queryTab === 'offline-rule') return 'offline_rule';
      if (queryTab === 'public-users') return 'public_users';
      return queryTab;
    }
    return 'messages';
  });
  const [settingsMenuExpanded, setSettingsMenuExpanded] = useState(false);
  const [currentSettingSubTab, setCurrentSettingSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('setting') || searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.setting || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath && cleanPath.startsWith('settings/')) {
      const sub = cleanPath.split('/')[1];
      if (['products', 'product-list', 'products-list'].includes(sub)) return 'products';
      if (['crm-config', 'crm_config'].includes(sub)) return 'crm';
      if (['custom-fields', 'custom_fields'].includes(sub)) return 'fields';
      if (['business-profile', 'branches'].includes(sub)) return 'business';
      if (['message-templates', 'whatsapp-templates'].includes(sub)) return 'templates';
      if (['alerts', 'notification'].includes(sub)) return 'notifications';
      if (['manage-departments', 'dept'].includes(sub)) return 'departments';
      if (['performance', 'target'].includes(sub)) return 'targets';
      if (['data-management'].includes(sub)) return 'data';
      if (['file-media', 'files'].includes(sub)) return 'media';
      if (['business', 'products', 'crm', 'fields', 'templates', 'notifications', 'departments', 'targets', 'data', 'media'].includes(sub)) {
        return sub;
      }
    }
    if (queryTab) {
      if (['products', 'product-list', 'products-list'].includes(queryTab)) return 'products';
      if (['crm-config', 'crm_config'].includes(queryTab)) return 'crm';
      if (['custom-fields', 'custom_fields'].includes(queryTab)) return 'fields';
      if (['business-profile', 'branches'].includes(queryTab)) return 'business';
      if (['message-templates', 'whatsapp-templates'].includes(queryTab)) return 'templates';
      if (['alerts', 'notification'].includes(queryTab)) return 'notifications';
      if (['manage-departments', 'dept'].includes(queryTab)) return 'departments';
      if (['performance', 'target'].includes(queryTab)) return 'targets';
      if (['data-management'].includes(queryTab)) return 'data';
      if (['file-media', 'files'].includes(queryTab)) return 'media';
      if (['business', 'products', 'crm', 'fields', 'templates', 'notifications', 'departments', 'targets', 'data', 'media'].includes(queryTab)) {
        return queryTab;
      }
    }
    return 'business';
  });
  const [emailSubTab, setEmailSubTab] = useState(() => {
    const raw = (initialRoute || pathname || '');
    let cleanPath = (typeof raw === 'string' ? raw : '').replace(/^\/+|\/+$/g, '').toLowerCase();
    let queryTab = (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase();
    if (cleanPath && (cleanPath.startsWith('email-config/') || cleanPath.startsWith('email_config/') || cleanPath.startsWith('email/'))) {
      const sub = cleanPath.split('/')[1];
      if (['smtp', 'templates', 'automations', 'test', 'logs'].includes(sub)) return sub;
    }
    if (queryTab && ['smtp', 'templates', 'automations', 'test', 'logs'].includes(queryTab)) {
      return queryTab;
    }
    return 'smtp';
  });

  // Load and listen for pending Stage 07 transferred leads count
  useEffect(() => {
    let active = true;
    const fetchPendingTransfers = async () => {
      try {
        const list = await getTransferredLeads();
        if (active && Array.isArray(list)) {
          const pending = list.filter(l => l.transfer_status === 'PENDING_CONFIRMATION' || l.handoff_status === 'PENDING_CONFIRMATION').length;
          setPartyPendingCount(pending);
        }
      } catch (_) {}
    };
    fetchPendingTransfers();
    window.addEventListener('party_transferred_updated', fetchPendingTransfers);

    let supabaseChannel = null;
    try {
      const supabase = createClient();
      supabaseChannel = supabase
        .channel('realtime_crm_pending_transfers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_party_handoffs' }, () => {
          fetchPendingTransfers();
        })
        .subscribe();
    } catch (_) {}

    const intervalTimer = setInterval(fetchPendingTransfers, 30000);

    return () => {
      active = false;
      window.removeEventListener('party_transferred_updated', fetchPendingTransfers);
      clearInterval(intervalTimer);
      if (supabaseChannel) {
        try {
          const supabase = createClient();
          supabase.removeChannel(supabaseChannel);
        } catch (_) {}
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      const search = new URLSearchParams(window.location.search);
      const param = search.get('setting') || search.get('subtab') || search.get('tab');
      if (path === 'settings' || (path && path.startsWith('settings/'))) {
        let sub = '';
        if (path.startsWith('settings/')) {
          sub = path.split('/')[1];
        } else if (param) {
          sub = param;
        }
        let cleanSub = (sub || 'business').toLowerCase();
        if (cleanSub === 'products' || cleanSub === 'product-list' || cleanSub === 'products-list') cleanSub = 'products';
        if (cleanSub === 'crm-config' || cleanSub === 'crm_config') cleanSub = 'crm';
        if (cleanSub === 'custom-fields' || cleanSub === 'custom_fields') cleanSub = 'fields';
        if (cleanSub === 'business-profile' || cleanSub === 'branches') cleanSub = 'business';
        if (cleanSub) setCurrentSettingSubTab(cleanSub);
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
      if (attTab && (path === 'calladmin' || path === 'call-admin' || (path && (path.startsWith('calladmin/') || path.startsWith('call-admin/'))))) {
        setCallAdminSubTab(attTab);
      }
      if (path && (path.startsWith('calladmin/') || path.startsWith('call-admin/'))) {
        const sub = path.split('/')[1];
        if (sub) setCallAdminSubTab(sub);
      }
      const partyTab = search.get('tab') || search.get('subtab') || search.get('step');
      if (path === 'party' || (path && path.startsWith('party/'))) {
        let sub = '';
        if (path.startsWith('party/')) {
          sub = path.split('/')[1];
        } else if (partyTab) {
          sub = partyTab;
        } else {
          sub = 'dashboard';
        }
        if (sub) {
          let cleanSub = sub.toLowerCase();
          if (cleanSub === 'r03' || cleanSub === 'party-master-report') {
            cleanSub = 'report';
            if (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/party/r03') {
              window.history.replaceState(null, '', '/party/report');
            }
          }
          setPartySubTab(cleanSub);
        }
        setPartyMenuExpanded(true);
      }
      const channelOpsTab = search.get('tab') || search.get('subtab') || search.get('step');
      if (path === 'channel_ops' || path === 'channel-operations' || (path && (path.startsWith('channel-operations/') || path.startsWith('channel_ops/')))) {
        let sub = '';
        if (path.includes('/')) {
          sub = path.split('/')[1];
        } else if (channelOpsTab) {
          sub = channelOpsTab;
        } else {
          sub = 'frequency_rules';
        }
        if (sub) {
          setChannelOpsSubTab(sub.toLowerCase());
        }
        setChannelOpsMenuExpanded(true);
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
      { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
      { name: '08 - Transfer to Party', substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] }
    ];

    const saved = localStorage.getItem('crm_config');
    let config = saved ? JSON.parse(saved) : {};
    
    // If stages are completely missing, initialize with defaultStages
    if (!config.stages || !Array.isArray(config.stages) || config.stages.length === 0) {
      config.stages = defaultStages;
      localStorage.setItem('crm_config', JSON.stringify(config));
      window.dispatchEvent(new Event('crm_config_updated'));
    } else {
      const s08Index = config.stages.findIndex(s => s.name?.includes('08 - Transfer to Party'));
      if (s08Index === -1) {
        config.stages.push({ name: '08 - Transfer to Party', substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] });
        localStorage.setItem('crm_config', JSON.stringify(config));
        window.dispatchEvent(new Event('crm_config_updated'));
      } else if (!config.stages[s08Index].substages?.includes('Pending Confirmation')) {
        config.stages[s08Index].substages = ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'];
        localStorage.setItem('crm_config', JSON.stringify(config));
        window.dispatchEvent(new Event('crm_config_updated'));
      }
    }

    // Sync CRM & Lead Configurations from Supabase Database
    fetch('/api/settings/crm-config')
      .then(res => res.json())
      .then(data => {
        if (data?.config) {
          const currentLocal = localStorage.getItem('crm_config');
          let merged = { ...data.config };
          if (!merged.stages || !Array.isArray(merged.stages)) {
            merged.stages = defaultStages;
          } else {
            const hasS08 = merged.stages.some(s => s.name?.includes('08 - Transfer to Party') || s.name?.startsWith('08'));
            if (!hasS08) {
              merged.stages.push({
                name: '08 - Transfer to Party',
                enabled: true,
                is_closing: false,
                substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred']
              });
            }
          }
          if (currentLocal) {
            try {
              const localParsed = JSON.parse(currentLocal);
              if (localParsed.alertSound && !merged.alertSound) merged.alertSound = localParsed.alertSound;
              if (localParsed.alertDuration && !merged.alertDuration) merged.alertDuration = localParsed.alertDuration;
              if (localParsed.browserPushEnabled !== undefined && merged.browserPushEnabled === undefined) {
                merged.browserPushEnabled = localParsed.browserPushEnabled;
              }
            } catch (err) {}
          }
          localStorage.setItem('crm_config', JSON.stringify(merged));
          window.dispatchEvent(new CustomEvent('crm_config_updated', { detail: merged }));
        }
      })
      .catch(err => console.warn('Failed to sync CRM config from Supabase:', err));

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

  const DEFAULT_PIPELINE_STAGES = [
    '01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', 
    '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', 
    '07 - Final Stage', '08 - Transfer to Party'
  ];

  const [activePipelineStages, setActivePipelineStages] = useState(DEFAULT_PIPELINE_STAGES);

  useEffect(() => {
    // Read customized stages on client mount strictly after hydration
    try {
      const saved = localStorage.getItem('crm_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stages && Array.isArray(parsed.stages)) {
          let stgNames = parsed.stages.filter(s => s.enabled !== false).map(s => s.name);
          if (!stgNames.some(n => n.includes('08 - Transfer to Party') || n.startsWith('08'))) {
            stgNames.push('08 - Transfer to Party');
          }
          setActivePipelineStages(stgNames);
        }
      }
    } catch (e) {}

    const handleConfigStagesUpdated = (e) => {
      try {
        const cfg = e?.detail || JSON.parse(localStorage.getItem('crm_config') || '{}');
        if (cfg?.stages && Array.isArray(cfg.stages)) {
          let stgNames = cfg.stages.filter(s => s.enabled !== false).map(s => s.name);
          if (!stgNames.some(n => n.includes('08 - Transfer to Party') || n.startsWith('08'))) {
            stgNames.push('08 - Transfer to Party');
          }
          setActivePipelineStages(stgNames);
        }
      } catch (err) {}
    };
    window.addEventListener('crm_config_updated', handleConfigStagesUpdated);
    return () => window.removeEventListener('crm_config_updated', handleConfigStagesUpdated);
  }, []);

  const getCategoryForTab = (tab) => {
    if (!tab) return null;
    const cleanTab = String(tab).toLowerCase().trim();
    const salesTabs = ['registration', 'report', 'leads', 'orders', 'party', 'location_master', 'location_territory'];
    const purchaseTabs = ['mrp', 'mrp_against'];
    const hrTabs = ['recruiter', 'joining'];
    const communicationTabs = ['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'];
    const systemTabs = ['team', 'public_users', 'aiadmin', 'aiknowledgebase', 'calladmin', 'aicallcenter', 'admin_message_config', 'offline_rule'];
    const settingsTabs = ['settings'];

    if (salesTabs.includes(cleanTab) || cleanTab.startsWith('party/') || cleanTab.startsWith('location')) return 'Sales';
    if (purchaseTabs.includes(cleanTab)) return 'Purchase';
    if (hrTabs.includes(cleanTab)) return 'Human Resource';
    if (cleanTab === 'user_management_new' || cleanTab.startsWith('user_management')) return 'User Management';
    if (cleanTab === 'workplace' || cleanTab === 'workflow' || cleanTab.startsWith('workflow/')) return 'Workflow Builder';
    if (communicationTabs.includes(cleanTab) || cleanTab.startsWith('email-config') || cleanTab.startsWith('email_config')) return 'Communication Center';
    if (systemTabs.includes(cleanTab) || cleanTab.startsWith('calladmin') || cleanTab.startsWith('aiadmin')) return 'System';
    if (settingsTabs.includes(cleanTab) || cleanTab.startsWith('settings/') || cleanTab === 'sessions') return 'Settings';
    return null;
  };

  const [leadDataExpanded, setLeadDataExpanded] = useState(false);
  const [recruiterMenuExpanded, setRecruiterMenuExpanded] = useState(false);
  const [recruiterFilterStage, setRecruiterFilterStage] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(() => {
    const defaults = {
      'Sales': false,
      'Purchase': false,
      'Human Resource': false,
      'User Management': false,
      'Workflow Builder': false,
      'Communication Center': false,
      'System': false,
      'Settings': false
    };
    const targetCat = getCategoryForTab(initialRoute || pathname);
    if (targetCat) {
      defaults[targetCat] = true;
    }
    return defaults;
  });

  const sidebarMountedRef = useRef(false);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem('crm-sidebar-collapsed');
      if (savedCollapsed === 'true') {
        setIsSidebarCollapsed(true);
      }
      const savedCats = localStorage.getItem('crm-expanded-categories');
      if (savedCats) {
        const parsed = JSON.parse(savedCats);
        if (parsed && typeof parsed === 'object') {
          const targetCat = getCategoryForTab(activeTab || initialRoute || pathname);
          setExpandedCategories(prev => ({
            ...prev,
            ...parsed,
            ...(targetCat ? { [targetCat]: true } : {})
          }));
        }
      }
    } catch (_e) {}
    sidebarMountedRef.current = true;
  }, []);

  const [userManagementSubTab, setUserManagementSubTab] = useState(() => {
    const route = (initialRoute || pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    const requested = route === 'user_management_new'
      ? (searchParams?.get('tab') || searchParams?.get('subtab') || initialSearchParams?.tab || initialSearchParams?.subtab || '').toLowerCase()
      : '';
    return ['user_manage', 'roles', 'hierarchy', 'sessions', 'audit'].includes(requested) ? requested : 'user_manage';
  });

  const handleUserManagementSubTabChange = (subTabId) => {
    const nextSubTab = ['user_manage', 'roles', 'hierarchy', 'sessions', 'audit'].includes(subTabId) ? subTabId : 'user_manage';
    setUserManagementSubTab(nextSubTab);
    React.startTransition(() => {
      setActiveTab('user_management_new');
    });
    window.history.pushState(null, '', `/user_management_new?tab=${nextSubTab}`);
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    if (!sidebarMountedRef.current) return;
    try {
      localStorage.setItem('crm-sidebar-collapsed', isSidebarCollapsed ? 'true' : 'false');
    } catch (_e) {}
  }, [isSidebarCollapsed]);

  // Auto-expand categories and submenus when activeTab changes
  useEffect(() => {
    const categoryToExpand = getCategoryForTab(activeTab);

    if (categoryToExpand) {
      setExpandedCategories(prev => {
        if (prev[categoryToExpand]) return prev;
        const next = {
          ...prev,
          [categoryToExpand]: true
        };
        try {
          localStorage.setItem('crm-expanded-categories', JSON.stringify(next));
        } catch (_e) {}
        return next;
      });
    }

    // Auto-expand submenus
    const cleanTab = String(activeTab || '').toLowerCase();
    if (cleanTab === 'leads') setLeadDataExpanded(true);
    if (cleanTab === 'recruiter') setRecruiterMenuExpanded(true);
    if (cleanTab === 'attendance' || cleanTab.startsWith('attendance/')) setAttendanceMenuExpanded(true);
    if (cleanTab === 'checklist' || cleanTab.startsWith('checklist/')) setChecklistMenuExpanded(true);
    if (cleanTab === 'delegation' || cleanTab.startsWith('delegation/')) setDelegationMenuExpanded(true);
    if (cleanTab === 'party' || cleanTab.startsWith('party/')) setPartyMenuExpanded(true);
    if (['ai', 'aiadmin', 'aiknowledgebase'].includes(cleanTab) || cleanTab.startsWith('aiadmin/')) setAiMenuExpanded(true);
    if (['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(cleanTab) || cleanTab.startsWith('email-config') || cleanTab.startsWith('email_config')) setMessageMenuExpanded(true);
    if (['callcenter', 'calladmin', 'aicallcenter'].includes(cleanTab) || cleanTab.startsWith('calladmin/')) setCallCenterMenuExpanded(true);
    if (cleanTab === 'workplace' || cleanTab === 'workflow' || cleanTab.startsWith('workflow/')) setWorkflowMenuExpanded(true);
    if (cleanTab === 'settings' || cleanTab.startsWith('settings/') || cleanTab === 'sessions') setSettingsMenuExpanded(true);
    if (['saas_master', 'saas_studio'].includes(cleanTab) || cleanTab.startsWith('saas-master/')) setSaasMenuExpanded(true);
    if (cleanTab === 'config_master' || cleanTab.startsWith('config-master/')) setConfigMasterMenuExpanded(true);
  }, [activeTab]);

  useEffect(() => {
    const handleSubTabChange = (e) => {
      if (e.detail) {
        setCurrentSettingSubTab(e.detail);
      }
    };
    const handleOpenBilling = () => {
      setActiveTab('settings');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('setting_subtab_change', { detail: 'saas_master' }));
      }, 50);
    };
    window.addEventListener('setting_subtab_change', handleSubTabChange);
    window.addEventListener('open-saas-billing', handleOpenBilling);
    return () => {
      window.removeEventListener('setting_subtab_change', handleSubTabChange);
      window.removeEventListener('open-saas-billing', handleOpenBilling);
    };
  }, []);

  const toggleCategory = (categoryName) => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
    setExpandedCategories(prev => {
      const next = {
        ...prev,
        [categoryName]: !prev[categoryName]
      };
      try {
        localStorage.setItem('crm-expanded-categories', JSON.stringify(next));
      } catch (_e) {}
      return next;
    });
  };
  
  const [currentTheme, setCurrentTheme] = useState(initialTheme || 'default');

  const applyTheme = (themeId) => {
    setCurrentTheme(themeId);
    if (typeof window !== 'undefined') {
      try {
        const classList = document.documentElement.classList;
        const themeClasses = Array.from(classList).filter(c => c.startsWith('theme-'));
        themeClasses.forEach(c => classList.remove(c));
        if (themeId && themeId !== 'default') {
          classList.add(themeId);
        }
        localStorage.setItem('crm-theme', themeId);
        document.cookie = `crm-theme=${themeId}; path=/; max-age=31536000; SameSite=Lax`;
      } catch (e) {}
    }
  };

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const profileMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [userAvatar, setUserAvatar] = useState(initialAvatar || null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Load and apply theme & avatar
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('crm-theme') || initialTheme || 'default';
      if (savedTheme !== currentTheme) {
        setCurrentTheme(savedTheme);
      }
    } catch (e) {}
    
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
    if (typeof window === 'undefined') return;
    try {
      const classList = document.documentElement.classList;
      const themeClasses = Array.from(classList).filter(c => c.startsWith('theme-'));
      themeClasses.forEach(c => classList.remove(c));
      if (currentTheme && currentTheme !== 'default') {
        classList.add(currentTheme);
      }
      localStorage.setItem('crm-theme', currentTheme);
      document.cookie = `crm-theme=${currentTheme}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}
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
    let active = true;
    let refreshTimer;
    async function loadTeam() {
      try {
        const response = await getTeamMembers(userCompany, effectiveTenantId);
        if (!active) return;
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
    const client = createClient();
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(loadTeam, 500);
    };
    const channel = client.channel(`crm_reporting_hierarchy_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, scheduleRefresh)
      .subscribe();
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      client.removeChannel(channel);
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [userId, userCompany, effectiveTenantId]);
  
  const loadLeadsRef = useRef(null);
  const leadSyncInFlightRef = useRef(false);
  const pendingLeadSyncRef = useRef(null);
  const realtimeNeedsCatchupRef = useRef(false);
  const prevLeadsSigRef = useRef('');
  const initialSyncFinishedRef = useRef(false);
  const saveLeadsTimeoutRef = useRef(null);
  const recentLocalUpdatesRef = useRef(new Map());
  const isLocalLeadsUpdateRef = useRef(false);
  const handleLeadsChangeRef = useRef(null);

  const debouncedSaveLeadsLocally = (updatedLeads) => {
    if (saveLeadsTimeoutRef.current) {
      clearTimeout(saveLeadsTimeoutRef.current);
    }
    saveLeadsTimeoutRef.current = setTimeout(() => {
      saveLeadsLocally(updatedLeads);
    }, 800);
  };

  useEffect(() => {
    rawLeadsRef.current = rawLeads;
  }, [rawLeads]);

  const updateLeadsIfChanged = (newList) => {
    const listToProcess = Array.isArray(newList) ? newList : (newList ? [newList] : []);
    if (sameLeadList(leads, listToProcess)) return;
    prevLeadsSigRef.current = '';
    setLeads(listToProcess);
    markLeadStartupTiming('filtered-leads-published', { count: listToProcess.length });
  };

  // Client-side fetch of all leads (Progressive Loading with sync tracking)
  useEffect(() => {
    if (!hasLeadsAccess) {
      setLoadingLeads(false);
      setIsSyncing(false);
      return;
    }
    let effectActive = true;
    const supabase = createClient();
    const removedDuringSync = new Set();
    const changedDuringSync = new Set();
    const refreshStagePreview = generation => {
      const preview = stagePreviewStateRef.current;
      if (!preview?.stageKey || !preview.leads.length || preview.userId !== userId ||
        preview.userCompany !== userCompany || preview.userRole !== userRole) return;
      saveFastLeadsSnapshot(preview.leads, userId, { userCompany, userRole, stageKey: preview.stageKey });
      saveLocalLeadsPreview(preview.leads, generation, userCompany, userRole, preview.stageKey).catch(() => {});
    };

    async function loadLeads(forceFull = false) {
      if (!effectActive) return;
      loadLeadsRef.current = loadLeads;
      if (leadSyncInFlightRef.current) {
        pendingLeadSyncRef.current = Boolean(forceFull || pendingLeadSyncRef.current);
        return;
      }
      leadSyncInFlightRef.current = true;
      removedDuringSync.clear();
      changedDuringSync.clear();
      setLeadCacheScope(userId);
      setIsSyncing(true);
      markLeadStartupTiming('sync-start', { forceFull });
      const syncStartedAt = new Date().toISOString();
      const syncStartedMs = Date.parse(syncStartedAt);
      const protectedIds = () => new Set([...changedDuringSync, ...[...recentLocalUpdatesRef.current]
        .filter(([, updatedAt]) => updatedAt >= syncStartedMs).map(([id]) => id)]);
      const supabase = createClient();
      const cacheMetaKey = `crm_leads_complete_cache_v1_${userId}`;
      let cacheMeta = null;
      let networkPublished = false;
      try {
        try {
          cacheMeta = JSON.parse(localStorage.getItem(cacheMetaKey) || 'null');
        } catch (e) {}

        // Restore the full local cache before choosing delta/full sync. A slow
        // read is not an empty database; the reader has its own bounded fallback.
        let localCachedLeads = [];
        if (!forceFull) {
          try {
            const cacheContext = { userId, userCompany, userRole };
            const canRestoreCache = matchesLeadCacheContext(cacheMeta, cacheContext);
            localCachedLeads = await getLocalLeads({
              onPreview: preview => {
                if (!effectActive || !canRestoreCache || networkPublished || rawLeadsRef.current?.length > 0 || preview.length === 0) return;
                const firstLeads = preview.sort(sortLeadsByDateDesc);
                rawLeadsRef.current = firstLeads;
                setRawLeads(firstLeads);
                setSyncLoadedCount(firstLeads.length);
                setLoadingLeads(false);
                saveFastLeadsSnapshot(firstLeads, userId, { userCompany, userRole });
              }
            });
            if (!effectActive) return;
            if (!canRestoreCache) localCachedLeads = [];
            if (localCachedLeads.length > 0) {
              const restored = mergeLeadCacheForDisplay(localCachedLeads, rawLeadsRef.current, {
                protectedIds: protectedIds(), removedIds: removedDuringSync
              }).sort(sortLeadsByDateDesc);
              setRawLeads(restored);
              rawLeadsRef.current = restored;
              setSyncLoadedCount(restored.length);
              setLoadingLeads(false);
              markLeadStartupTiming('full-cache-restored', { count: restored.length });
              saveFastLeadsSnapshot(restored, userId, { userCompany, userRole });
              saveLocalLeadsPreview(restored, cacheMeta?.generation, userCompany, userRole).catch(() => {});
            } else {
              // Keep current view if fast cache already populated in memory
              setLoadingLeads(rawLeadsRef.current && rawLeadsRef.current.length > 0 ? false : true);
            }
          } catch (cacheErr) {
            console.warn("Local leads cache read error:", cacheErr);
            setLoadingLeads(rawLeadsRef.current && rawLeadsRef.current.length > 0 ? false : true);
          }
        } else {
          setLoadingLeads(rawLeadsRef.current?.length > 0 ? false : true);
        }

        // ⚡ PERF FIX & MULTI-TENANT ISOLATION:
        // Client tenants (e.g. SuPuja Creations) only download their own workspace leads.
        // New Swan Group admins download New Swan entities; agents download assigned + open leads.
        const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
        const _isSwanWorkspace = !userCompany || SWAN_COMPANIES.includes(String(userCompany).toLowerCase().trim()) || (userEmail && userEmail.toLowerCase().endsWith('@newswangroup.com'));

        const _isAdminUser = userRole === 'admin' || userRole === 'Admin';
        const _isPrivilegedUser = _isAdminUser || Boolean(moduleAccess?.leads?.is_manager) || Boolean(globalRolePermissions?.viewAll);
        const _agentCompanyFilter = (!_isAdminUser && userCompany && userCompany.trim() !== '')
          ? userCompany.trim()
          : null;
        const _agentAssignees = (!_isPrivilegedUser && (userId || userName))
          ? JSON.parse(leadAssigneeScopeKey)
          : null;

        const applyLeadScope = (query) => {
          let q = query;
          if (!_isSwanWorkspace && userCompany && userCompany.trim() !== '') {
            // Strict client workspace isolation (e.g. SuPuja Creations, Testing New Swan Group)
            q = q.eq('our_company', userCompany.trim());
          } else if (_agentCompanyFilter) {
            if (_agentCompanyFilter === 'NSTL' || _agentCompanyFilter === 'NSTLP') {
              q = q.in('our_company', ['NSTL', 'NSTLP']);
            } else {
              q = q.eq('our_company', _agentCompanyFilter);
            }
          } else if (_isAdminUser && _isSwanWorkspace) {
            // New Swan Group admins strictly download New Swan Group branches/records
            q = q.in('our_company', ['NSMLR', 'NSTLP', 'NSTL', '']);
          }
          if (_agentAssignees && _agentAssignees.length > 0) {
            const orParts = ['assigned_to.is.null'];
            for (const a of _agentAssignees) {
              const clean = String(a).replace(/"/g, '').trim();
              if (clean) orParts.push(`assigned_to.eq."${clean}"`);
            }
            q = q.or(orParts.join(','));
          }
          return q;
        };

        const fetchLeadCount = async () => {
          try {
            let countQuery = supabase
              .from('leads')
              .select('*', { count: 'exact', head: true });
            countQuery = applyLeadScope(countQuery);
            const { count, error: countError } = await countQuery;
            if (countError) throw countError;
            if (Number.isSafeInteger(count)) setSyncTotalCount(count);
            return Number.isSafeInteger(count) ? count : 0;
          } catch (e) {
            console.warn("Failed to fetch leads count:", e);
            return 0;
          }
        };

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

        let loadedLeads = [];

        // Helper function to fetch a single page of leads with retry logic
        const fetchLeadsPageWithRetry = async (p, retries = 3) => {
          for (let attempt = 1; attempt <= retries; attempt++) {
            try {
              let query = supabase
                .from('leads')
                .select('*')
                .order('created_at', { ascending: false })
                .order('id');
              query = applyLeadScope(query);
              query = query.range(p * queryPageSize, (p + 1) * queryPageSize - 1);

              const { data, error } = await query;

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

        const fetchAssignedLeads = async () => {
          // Privileged users without a company filter already fetched every assignment.
          if (!userId || (!_agentCompanyFilter && _isPrivilegedUser)) return [];
          const assignees = JSON.parse(leadAssigneeScopeKey);
          if (!_agentCompanyFilter && assignees.length <= new Set([userId, userName].filter(Boolean)).size) return [];
          const assigned = [];
          for (let page = 0; page < 100; page++) {
            const { data, error } = await supabase
              .from('leads')
              .select('*')
              .in('assigned_to', assignees)
              .order('created_at', { ascending: false })
              .order('id')
              .range(page * 1000, (page + 1) * 1000 - 1);
            if (error) throw error;
            assigned.push(...(data || []));
            if (!data || data.length < 1000) break;
            if (page === 99) throw new Error('Assigned leads exceeded 100 pages');
          }
          return assigned;
        };

        if (!effectActive) return;
        // A fast snapshot contains at most 300 rows. A partial IndexedDB write
        // must never switch the first load into delta-only mode.
        const hasValidLocalCache = !forceFull && isCompleteLeadCache(cacheMeta, localCachedLeads, {
          userId, userCompany, userRole
        });

        if (hasValidLocalCache) {
          // =========================================================================
          // HIGH-EFFICIENCY DELTA SYNC (Conserves 99% Supabase Egress & Eliminates Lag)
          // =========================================================================
          const baseLeads = rawLeadsRef.current || localCachedLeads;

          const lastSyncTime = cacheMeta?.syncedAt;

          const lookbackMs = 15 * 60 * 1000;
          const deltaSince = (lastSyncTime && Number.isFinite(Date.parse(lastSyncTime)))
            ? new Date(Math.max(0, new Date(lastSyncTime).getTime() - lookbackMs)).toISOString()
            : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

          // Page 0 also tells us which lead columns exist without a failing schema probe.
          const fetchPage0Promise = fetchLeadsPageWithRetry(0);

          const fetchDeltaNotesPromise = (async () => {
            const allNotes = [];
            for (let page = 0; page < 100; page++) {
              const { data: chunk, error: dNoteErr } = await supabase
                .from('lead_notes')
                .select('id, lead_id, created_at, note_text, created_by')
                .gt('created_at', deltaSince)
                .order('created_at', { ascending: false })
                .order('id')
                .range(page * 1000, (page + 1) * 1000 - 1);

              if (dNoteErr) throw dNoteErr;
              allNotes.push(...(chunk || []));
              if (!chunk || chunk.length < 1000) return allNotes;
            }
            throw new Error('Delta notes exceeded 100 pages; retry without advancing sync time');
          })();

          const fetchDeltaLeadsPromise = fetchPage0Promise.then(async (page0Data) => {
            const allChangedLeads = [];
            let changeColumn = page0Data.length > 0 && Object.prototype.hasOwnProperty.call(page0Data[0], 'updated_at')
              ? 'updated_at'
              : 'created_at';
            for (let page = 0; page < 100; page++) {
              const fetchChangedPage = async (column) => {
                let deltaQuery = supabase
                  .from('leads')
                  .select('*')
                  .gt(column, deltaSince)
                  .order(column, { ascending: false })
                  .order('id');
                deltaQuery = applyLeadScope(deltaQuery);
                return deltaQuery.range(page * 1000, (page + 1) * 1000 - 1);
              };
              let { data: chunk, error: dLeadErr } = await fetchChangedPage(changeColumn);
              if (changeColumn === 'updated_at' && dLeadErr?.code === '42703') {
                changeColumn = 'created_at';
                ({ data: chunk, error: dLeadErr } = await fetchChangedPage(changeColumn));
              }
              if (dLeadErr) throw dLeadErr;
              allChangedLeads.push(...(chunk || []));
              if (!chunk || chunk.length < 1000) return allChangedLeads;
            }
            throw new Error('Delta leads exceeded 100 pages; retry without advancing sync time');
          });

          const fetchAssignedLeadsPromise = (async () => {
            try {
              return await fetchAssignedLeads();
            } catch (e) {
              console.warn("Assigned leads delta fetch error:", e);
              throw e;
            }
          })();

          const [page0Data, newNotes, newLeads, myAssignedLeads] = await Promise.all([
            fetchPage0Promise,
            fetchDeltaNotesPromise,
            fetchDeltaLeadsPromise,
            fetchAssignedLeadsPromise
          ]);

          // 5. Fetch updated leads from touched notes (in parallel batches)
          let touchedLeads = [];
          if (newNotes.length > 0) {
            const knownIds = new Set([
              ...page0Data.map(l => l.id),
              ...newLeads.map(l => l.id),
              ...myAssignedLeads.map(l => l.id)
            ]);
            const touchedIds = Array.from(new Set(newNotes.map(n => n.lead_id).filter(id => id && !knownIds.has(id))));
            if (touchedIds.length > 0) {
              const chunkPromises = [];
              for (let i = 0; i < touchedIds.length; i += 100) {
                const chunk = touchedIds.slice(i, i + 100);
                chunkPromises.push(supabase.from('leads').select('*').in('id', chunk));
              }
              try {
                const chunkResults = await Promise.all(chunkPromises);
                for (const r of chunkResults) {
                  if (Array.isArray(r.data)) {
                    touchedLeads.push(...r.data);
                  }
                }
              } catch (e) {
                console.warn("Touched leads fetch error:", e);
              }
            }
          }

          // 6. Merge cleanly: Check if any updates actually arrived from delta sync
          const hasNewLeads = newLeads.length > 0;
          const hasNewNotes = newNotes.length > 0;
          const hasTouchedLeads = touchedLeads.length > 0;
          const baseLeadMap = new Map();
          for (let i = 0; i < baseLeads.length; i++) {
            baseLeadMap.set(baseLeads[i].id, baseLeads[i]);
          }
          const hasAssignedChanges = myAssignedLeads.some(al => {
            const cur = baseLeadMap.get(al.id);
            return !cur || cur.status !== al.status || cur.assigned_to !== al.assigned_to || cur.updated_at !== al.updated_at;
          });
          const hasPage0Changes = page0Data.some(rl => {
            const cur = baseLeadMap.get(rl.id);
            return !cur || cur.status !== rl.status || cur.updated_at !== rl.updated_at;
          });

          const hasRealChanges = hasNewLeads || hasNewNotes || hasTouchedLeads || hasAssignedChanges || hasPage0Changes;

          if (!hasRealChanges) {
            // Absolutely zero changes on server: Preserve exact object references and avoid triggering full table re-render!
            networkPublished = true;
            try {
              localStorage.setItem(cacheMetaKey, JSON.stringify({
                userId, userCompany: userCompany || '', userRole, count: baseLeads.length,
                syncedAt: syncStartedAt, fullSyncedAt: cacheMeta?.fullSyncedAt || syncStartedAt,
                generation: cacheMeta?.generation || syncStartedAt
              }));
              localStorage.setItem('crm_last_lead_sync_timestamp', syncStartedAt);
              refreshStagePreview(cacheMeta.generation);
            } catch (e) {}
            return;
          }

          const leadsMap = new Map();
          for (const l of baseLeads) {
            // Retain original object references for untouched leads (avoid cloning all 45,000 rows)
            leadsMap.set(l.id, l);
          }

          // Merge recent page 0 leads (preserves existing notes)
          for (const rl of page0Data) {
            const existing = leadsMap.get(rl.id);
            if (existing) {
              leadsMap.set(rl.id, { ...existing, ...rl, lead_notes: existing.lead_notes || [] });
            } else {
              leadsMap.set(rl.id, { ...rl, lead_notes: [] });
            }
          }

          // Add brand new or updated delta leads
          for (const nl of newLeads) {
            const existing = leadsMap.get(nl.id);
            if (existing) {
              leadsMap.set(nl.id, { ...existing, ...nl, lead_notes: existing.lead_notes });
            } else {
              leadsMap.set(nl.id, { ...nl, lead_notes: [] });
            }
          }

          // Add / update assigned leads for this user
          for (const al of myAssignedLeads) {
            const existing = leadsMap.get(al.id);
            if (existing) {
              leadsMap.set(al.id, { ...existing, ...al, lead_notes: existing.lead_notes });
            } else {
              leadsMap.set(al.id, { ...al, lead_notes: [] });
            }
          }

          // Add / update touched leads from notes
          for (const tl of touchedLeads) {
            const existing = leadsMap.get(tl.id);
            if (existing) {
              leadsMap.set(tl.id, { ...existing, ...tl, lead_notes: existing.lead_notes });
            } else {
              leadsMap.set(tl.id, { ...tl, lead_notes: [] });
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

          if (!effectActive) return;
          const finalMerged = mergeLeadCacheForDisplay(Array.from(leadsMap.values()), rawLeadsRef.current, {
            protectedIds: protectedIds(), removedIds: removedDuringSync, keepMissing: false
          }).sort(sortLeadsByDateDesc);
          networkPublished = true;
          setRawLeads(finalMerged);
          rawLeadsRef.current = finalMerged;
          setSyncLoadedCount(finalMerged.length);

          saveFastLeadsSnapshot(finalMerged, userId, { userCompany, userRole });

          // Fast selective persistence: Only upsert changed leads (takes ~50ms instead of 10s for 45k leads)
          try {
            const changedLeads = [
              ...page0Data,
              ...newLeads,
              ...myAssignedLeads,
              ...touchedLeads
            ].map(l => leadsMap.get(l.id)).filter(Boolean);

            if (changedLeads.length > 0 && !await upsertLeadsLocally(changedLeads)) {
              throw new Error('IndexedDB delta write did not complete');
            }
            localStorage.setItem(cacheMetaKey, JSON.stringify({
              userId, userCompany: userCompany || '', userRole, count: finalMerged.length,
              syncedAt: syncStartedAt, fullSyncedAt: cacheMeta.fullSyncedAt,
              generation: cacheMeta.generation
            }));
            localStorage.setItem('crm_last_lead_sync_timestamp', syncStartedAt);
            refreshStagePreview(cacheMeta.generation);
            saveLocalLeadsPreview(finalMerged, cacheMeta.generation, userCompany, userRole).catch(() => {});
          } catch (e) {
            console.warn("Failed to upsert delta leads locally:", e);
          }
        } else {
          // =========================================================================
          // FULL INITIAL SYNC (Only for cold start / first time browser / empty cache)
          // =========================================================================
          // 1. Fetch Page 0 of leads first for instant UI response (top 1000 in ~250ms)
          const countPromise = fetchLeadCount();
          const page0Data = await fetchLeadsPageWithRetry(0);
          if (!effectActive) return;
          loadedLeads = [...page0Data];
          
          // Render first chunk immediately so table and dashboard display immediately
          const initialChunk = loadedLeads.map(l => ({ ...l, lead_notes: [] }));
          networkPublished = true;
          // Keep a complete (including aged) cache on screen until the full
          // replacement is available. Never shrink it to the first server page.
          if (rawLeadsRef.current.length <= initialChunk.length) {
            const firstPage = mergeLeadCacheForDisplay(initialChunk, rawLeadsRef.current, {
              protectedIds: protectedIds(), removedIds: removedDuringSync
            }).sort(sortLeadsByDateDesc);
            setRawLeads(firstPage);
            rawLeadsRef.current = firstPage;
          }
          setSyncLoadedCount(rawLeadsRef.current.length);
          setLoadingLeads(false);
          saveFastLeadsSnapshot(rawLeadsRef.current, userId, { userCompany, userRole });
          // Publish the new cache generation only after the complete write.

          // 2. Fetch remaining pages of leads in parallel batches of 5 (High Concurrency Background Sync)
          const total = await countPromise;
          const numPages = total > 0 ? Math.ceil(total / queryPageSize) : 1;
          const remainingPages = Array.from({ length: numPages - 1 }, (_, i) => i + 1);
          const leadsBatchSize = 5;
          
          for (let i = 0; i < remainingPages.length; i += leadsBatchSize) {
            const batch = remainingPages.slice(i, i + leadsBatchSize);
            const batchResults = await Promise.all(batch.map(p => fetchLeadsPageWithRetry(p)));
            for (const data of batchResults) {
              if (Array.isArray(data)) {
                loadedLeads = loadedLeads.concat(data);
              }
            }
            setSyncLoadedCount(loadedLeads.length);
            // CRITICAL: Do NOT call setRawLeads here in the loop!
            // Updating rawLeads in every batch causes 10+ expensive full-table rerenders and Recharts recalculations!
          }

          // A failed count request must not turn a 1,000-row first page into a
          // supposedly complete cache.
          if (total === 0 && page0Data.length === queryPageSize) {
            for (let page = 1; page < 100; page++) {
              const data = await fetchLeadsPageWithRetry(page);
              loadedLeads = loadedLeads.concat(data);
              setSyncLoadedCount(loadedLeads.length);
              if (data.length < queryPageSize) break;
              if (page === 99) throw new Error('Lead pagination exceeded 100 pages');
            }
          }

          // Include leads assigned across company boundaries, including legacy
          // assignments stored by employee name instead of user ID.
          loadedLeads = loadedLeads.concat(await fetchAssignedLeads());

          // Deduplicate all leads once after pagination finishes
          const uniqueMap = new Map();
          for (const lead of loadedLeads) {
            if (lead && lead.id && !uniqueMap.has(lead.id)) {
              uniqueMap.set(lead.id, { ...lead, lead_notes: [] });
            }
          }
          if (!effectActive) return;
          const finalLeads = mergeLeadCacheForDisplay(Array.from(uniqueMap.values()), rawLeadsRef.current, {
            protectedIds: protectedIds(), removedIds: removedDuringSync, keepMissing: false
          }).sort(sortLeadsByDateDesc);
          setRawLeads(finalLeads);
          rawLeadsRef.current = finalLeads;
          setSyncLoadedCount(finalLeads.length);

          // Persist all fetched leads immediately to IndexedDB so cache is 100% valid on next reload!
          if (finalLeads.length > 0) {
            if (await saveLeadsLocally(finalLeads, syncStartedAt)) {
              try {
                localStorage.setItem(cacheMetaKey, JSON.stringify({
                  userId, userCompany: userCompany || '', userRole, count: finalLeads.length,
                  syncedAt: syncStartedAt, fullSyncedAt: syncStartedAt,
                  generation: syncStartedAt
                }));
                localStorage.setItem('crm_last_lead_sync_timestamp', syncStartedAt);
                refreshStagePreview(syncStartedAt);
                saveFastLeadsSnapshot(finalLeads, userId, { userCompany, userRole });
                saveLocalLeadsPreview(finalLeads, syncStartedAt, userCompany, userRole).catch(() => {});
              } catch (e) {}
            } else {
              console.warn('Full lead cache write did not complete; next load will retry full sync');
            }
          }

          // 3. Background Recent Notes Hydration (Non-blocking: fetch latest 1,000 notes in ~200ms)
          try {
            const { data: recentNotes } = await supabase
              .from('lead_notes')
              .select('id, lead_id, created_at, note_text, created_by')
              .order('created_at', { ascending: false })
              .range(0, 999);

            if (Array.isArray(recentNotes) && recentNotes.length > 0) {
              const notesMap = new Map();
              for (const note of recentNotes) {
                if (!notesMap.has(note.lead_id)) notesMap.set(note.lead_id, []);
                notesMap.get(note.lead_id).push(note);
              }

              const touchedLeads = [];
              for (const lead of rawLeadsRef.current) {
                const notes = notesMap.get(lead.id);
                if (notes) touchedLeads.push({ ...lead, lead_notes: notes });
              }
              setRawLeads(prev => {
                const withNotes = prev.map(lead => {
                  const n = notesMap.get(lead.id);
                  if (n) {
                    const updated = { ...lead, lead_notes: n };
                    return updated;
                  }
                  return lead;
                });
                rawLeadsRef.current = withNotes;
                return withNotes;
              });

              if (touchedLeads.length > 0) {
                upsertLeadsLocally(touchedLeads).catch(() => {});
              }
            }
          } catch (notesErr) {
            console.warn("Recent notes non-blocking fetch error:", notesErr);
          }
        }

      } catch (err) {
        console.warn("Lead sync failed; using local IndexedDB storage:", {
          message: err?.message || String(err),
          code: err?.code,
          details: err?.details
        });
        try {
          const localCache = await getLocalLeads();
          if (effectActive && matchesLeadCacheContext(cacheMeta, { userId, userCompany, userRole }) && localCache.length > 0) {
            const restored = mergeLeadCacheForDisplay(localCache, rawLeadsRef.current, {
              protectedIds: protectedIds(), removedIds: removedDuringSync
            }).sort(sortLeadsByDateDesc);
            rawLeadsRef.current = restored;
            setRawLeads(restored);
          }
        } catch (e) {}
      } finally {
        markLeadStartupTiming('sync-complete');
        if (effectActive) {
          setLoadingLeads(false);
          setIsSyncing(false);
        }
        leadSyncInFlightRef.current = false;
        if (pendingLeadSyncRef.current !== null) {
          const nextForceFull = pendingLeadSyncRef.current;
          pendingLeadSyncRef.current = null;
          queueMicrotask(() => loadLeadsRef.current?.(nextForceFull));
        }
      }
    }
    loadLeads();

    // Setup Realtime Subscription for CRMContainer
    const channel = supabase
      .channel('crm_container_leads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const newRow = payload.new;
        if (!newRow || !newRow.id) return;
        if (leadSyncInFlightRef.current) changedDuringSync.add(newRow.id);
        upsertLeadsLocally([{ ...newRow, lead_notes: [] }]);
        setRawLeads((current) => {
          if (current.some(item => item.id === newRow.id)) return current;
          return [{ ...newRow, lead_notes: [] }, ...current];
        });
        // Publish through the company/stage/team filter below.
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const updatedRow = payload.new;
        if (!updatedRow || !updatedRow.id) return;
        if (leadSyncInFlightRef.current) changedDuringSync.add(updatedRow.id);
        // Skip echo if lead was recently updated by this client locally (< 8 seconds ago)
        const lastLocalLeadUpdate = recentLocalUpdatesRef.current.get(updatedRow.id);
        if (lastLocalLeadUpdate && (Date.now() - lastLocalLeadUpdate < 8000)) {
          return;
        }
        setRawLeads((current) => {
          const existing = current.find(item => item.id === updatedRow.id);
          // If row in memory already has matching status, updated_at and assigned_to, skip redundant update
          if (existing && existing.status === updatedRow.status && existing.updated_at === updatedRow.updated_at && existing.assigned_to === updatedRow.assigned_to) {
            return current;
          }
          let target = null;
          let updated;
          if (existing) {
            updated = current.map(item => {
              if (item.id === updatedRow.id) {
                target = { ...item, ...updatedRow, lead_notes: item.lead_notes || [] };
                return target;
              }
              return item;
            });
          } else {
            target = { ...updatedRow, lead_notes: [] };
            updated = [target, ...current];
          }
          if (target) {
            upsertLeadsLocally([target]);
          }
          return updated;
        });
        // Assignment changes must pass the current visibility filter as well.
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        const deletedId = payload?.old?.id;
        if (deletedId) {
          if (leadSyncInFlightRef.current) removedDuringSync.add(deletedId);
          deleteLeadLocally(deletedId);
          setRawLeads((current) => current.filter(item => item.id !== deletedId));
          setLeads((current) => current.filter(item => item.id !== deletedId));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes' }, (payload) => {
        const incoming = payload.new;
        if (!incoming || !incoming.lead_id) return;
        // Skip echo if this lead was recently updated by this client locally (< 8 seconds ago)
        const lastLocalNoteUpdate = recentLocalUpdatesRef.current.get(incoming.lead_id);
        if (lastLocalNoteUpdate && (Date.now() - lastLocalNoteUpdate < 8000)) {
          return;
        }
        setRawLeads((current) => {
          const targetLead = current.find(item => item.id === incoming.lead_id);
          if (targetLead) {
            const existingNotes = targetLead.lead_notes || [];
            if (existingNotes.some(n => n.id === incoming.id || (n.note_text === incoming.note_text && Math.abs(new Date(n.created_at || 0) - new Date(incoming.created_at || 0)) < 3000))) {
              return current;
            }
          }
          let updatedTarget = null;
          const updated = current.map(item => {
            if (item.id !== incoming.lead_id) return item;
            const existingNotes = item.lead_notes || [];
            if (existingNotes.some(n => n.id === incoming.id)) return item;
            updatedTarget = { ...item, lead_notes: [incoming, ...existingNotes] };
            return updatedTarget;
          });
          if (updatedTarget) {
            upsertLeadsLocally([updatedTarget]);
          }
          return updated;
        });
        setLeads((current) => {
          const targetLead = current.find(item => item.id === incoming.lead_id);
          if (targetLead) {
            const existingNotes = targetLead.lead_notes || [];
            if (existingNotes.some(n => n.id === incoming.id || (n.note_text === incoming.note_text && Math.abs(new Date(n.created_at || 0) - new Date(incoming.created_at || 0)) < 3000))) {
              return current;
            }
          }
          return current.map(item => {
            if (item.id !== incoming.lead_id) return item;
            const existingNotes = item.lead_notes || [];
            if (existingNotes.some(n => n.id === incoming.id)) return item;
            return { ...item, lead_notes: [incoming, ...existingNotes] };
          });
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && realtimeNeedsCatchupRef.current) {
          realtimeNeedsCatchupRef.current = false;
          loadLeadsRef.current?.(false);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeNeedsCatchupRef.current = true;
          console.warn('Lead Realtime disconnected; delta sync will catch up on reconnect:', status);
        }
      });

    // Reactive listener for local offline actions (instant 0ms front-end table update)
    const handleOfflineQueueChanged = async () => {
      const cached = await getLocalLeads();
      if (cached && cached.length > 0) {
        setRawLeads(cached.sort(sortLeadsByDateDesc));
      }
    };

    const handleLeadsImported = (e) => {
      if (e.detail) {
        handleLeadsChangeRef.current?.(e.detail);
      }
    };

    const handleForceFullSync = async () => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`crm_leads_complete_cache_v1_${userId}`, 'null');
        } catch (e) {}
      }
      if (loadLeadsRef.current) {
        loadLeadsRef.current(true);
      }
    };

    const handleTriggerDeltaSync = () => {
      if (loadLeadsRef.current) {
        loadLeadsRef.current(false);
      }
    };

    // Background Periodic Delta Sync: every 3 minutes, silently pull delta updates into Local DB
    const deltaSyncInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (loadLeadsRef.current) {
        loadLeadsRef.current(false);
      }
    }, 3 * 60 * 1000);

    window.addEventListener('crm_trigger_delta_sync', handleTriggerDeltaSync);
    window.addEventListener('supuja_offline_queue_changed', handleOfflineQueueChanged);
    window.addEventListener('crm_leads_imported', handleLeadsImported);
    window.addEventListener('crm_force_full_sync', handleForceFullSync);

    return () => {
      effectActive = false;
      pendingLeadSyncRef.current = null;
      if (loadLeadsRef.current === loadLeads) loadLeadsRef.current = null;
      clearInterval(deltaSyncInterval);
      if (saveLeadsTimeoutRef.current) clearTimeout(saveLeadsTimeoutRef.current);
      supabase.removeChannel(channel);
      window.removeEventListener('crm_trigger_delta_sync', handleTriggerDeltaSync);
      window.removeEventListener('supuja_offline_queue_changed', handleOfflineQueueChanged);
      window.removeEventListener('crm_leads_imported', handleLeadsImported);
      window.removeEventListener('crm_force_full_sync', handleForceFullSync);
    };
  }, [hasLeadsAccess, userId, userCompany, userName, userRole, leadAssigneeScopeKey, moduleAccess?.leads?.is_manager, globalRolePermissions?.viewAll]);

  const handleOfflineSyncComplete = React.useCallback(() => {
    if (loadLeadsRef.current) {
      loadLeadsRef.current(false);
    }
  }, []);

  // Filter leads based on company and step assignments
  useEffect(() => {
    if (loadingLeads && (!rawLeads || rawLeads.length === 0)) return;

    if (isLocalLeadsUpdateRef.current) {
      isLocalLeadsUpdateRef.current = false;
      return; // setLeads was already updated in handleLeadsChange! Avoid 45k-row diff & bounce
    }
    
    let preFilteredLeads = rawLeads;
    
    // 1. Apply Company Filter & Multi-Tenant Workspace Boundary
    if (!isSwanWorkspace && userCompany && userCompany.trim() !== '') {
      // Client Workspace (e.g. SuPuja Creations, Testing New Swan Group): strictly own company
      preFilteredLeads = rawLeads.filter(l => String(l.our_company || '').trim().toLowerCase() === String(userCompany).trim().toLowerCase());
    } else if (userRole === 'admin' || userRole === 'Admin') {
      if (adminCompanyFilter !== 'All') {
        preFilteredLeads = rawLeads.filter(l => {
          if (adminCompanyFilter === 'NSTL' || adminCompanyFilter === 'NSTLP') {
            return l.our_company === 'NSTL' || l.our_company === 'NSTLP';
          }
          return l.our_company === adminCompanyFilter;
        });
      } else {
        preFilteredLeads = rawLeads.filter(l => ['NSMLR', 'NSTLP', 'NSTL', ''].includes(l.our_company || ''));
      }
    } else {
      // Regular Agents only see their assigned company's leads OR leads assigned directly to them
      if (userCompany) {
         preFilteredLeads = rawLeads.filter(l => {
           const matchComp = (userCompany === 'NSTL' || userCompany === 'NSTLP')
             ? (l.our_company === 'NSTL' || l.our_company === 'NSTLP')
             : l.our_company === userCompany;
            return matchComp || leadAssigneeScope.has(l.assigned_to);
         });
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
      const permittedStages = new Set(assignedSteps.map(step =>
        /^(?:S)?0?[1-8](?:\s*[-;:]|$)/i.test(String(step).trim()) ? getLeadStageKey(step) : step));
      const filteredLeads = preFilteredLeads.filter(lead => {
        const leadStage = getStageFromStatus(lead.status);
        return permittedStages.has(leadStage) &&
                isLeadInAssignmentScope(lead, leadAssigneeScope);
      });
      updateLeadsIfChanged(filteredLeads);
    } else {
      // If view is true but no steps assigned, they see nothing
      updateLeadsIfChanged([]);
    }
  }, [rawLeads, loadingLeads, moduleAccess, userRole, adminCompanyFilter, userCompany, userId, userName, globalRolePermissions, leadAssigneeScope, isSwanWorkspace]);

  // Handle local updates from child components so background fetches don't overwrite them
  const handleLeadsChange = useCallback((updatedFilteredLeads) => {
    const leadsArray = Array.isArray(updatedFilteredLeads) ? updatedFilteredLeads : (updatedFilteredLeads ? [updatedFilteredLeads] : []);
    if (leadsArray.length === 0) return;

    // Track recently updated leads so subsequent Realtime broadcast doesn't re-trigger
    const now = Date.now();
    for (const l of leadsArray) {
      if (l && l.id) {
        recentLocalUpdatesRef.current.set(l.id, now);
      }
    }
    isLocalLeadsUpdateRef.current = true;

    // Invalidate probe signature so next filter run never drops this update
    prevLeadsSigRef.current = '';

    setRawLeads(prevRaw => {
      const updatedMap = new Map(leadsArray.map(l => [l.id, l]));
      const existingIds = new Set(prevRaw.map(l => l.id));
      const brandNew = leadsArray.filter(l => l && l.id && !existingIds.has(l.id));
      const updatedExisting = prevRaw.map(l => {
        if (updatedMap.has(l.id)) {
          return { ...l, ...updatedMap.get(l.id) };
        }
        return l;
      });
      const next = brandNew.length > 0 ? [...brandNew, ...updatedExisting] : updatedExisting;
      // Synchronize in-memory changes to IndexedDB so page reload preserves recent updates
      upsertLeadsLocally(leadsArray);
      return next;
    });

    setLeads(prevLeads => {
      const isVisibleUpdate = lead => {
        const admin = userRole === 'admin' || userRole === 'Admin';
        if (!isSwanWorkspace && userCompany) {
          return String(lead.our_company || '').trim().toLowerCase() === String(userCompany).trim().toLowerCase();
        }
        if (admin) {
          if (adminCompanyFilter !== 'All') {
            return (adminCompanyFilter === 'NSTL' || adminCompanyFilter === 'NSTLP')
              ? ['NSTL', 'NSTLP'].includes(lead.our_company) : lead.our_company === adminCompanyFilter;
          }
          return ['NSMLR', 'NSTLP', 'NSTL', ''].includes(lead.our_company || '');
        }
        const companyMatches = !userCompany || (['NSTL', 'NSTLP'].includes(userCompany)
          ? ['NSTL', 'NSTLP'].includes(lead.our_company) : lead.our_company === userCompany);
        if (!companyMatches && !leadAssigneeScope.has(lead.assigned_to)) return false;
        if (moduleAccess?.leads?.is_manager || globalRolePermissions?.viewAll) return true;
        return isLeadInAssignmentScope(lead, leadAssigneeScope) &&
          getLeadStageAccess({ role: userRole, module_access: moduleAccess }, lead.status).view;
      };
      const updatedMap = new Map(leadsArray.map(l => [l.id, l]));
      const existingIds = new Set(prevLeads.map(l => l.id));
      const brandNew = leadsArray.filter(l => l && l.id && !existingIds.has(l.id) && isVisibleUpdate(l));
      const updatedExisting = [];
      for (const l of prevLeads) {
        if (updatedMap.has(l.id)) {
          const updated = { ...l, ...updatedMap.get(l.id) };
          if (isVisibleUpdate(updated)) updatedExisting.push(updated);
        } else {
          updatedExisting.push(l);
        }
      }
      return brandNew.length > 0 ? [...brandNew, ...updatedExisting] : updatedExisting;
    });
  }, [userRole, adminCompanyFilter, userCompany, moduleAccess, globalRolePermissions, leadAssigneeScope, isSwanWorkspace]);

  const [currentTime] = useState(() => Date.now());
  React.useLayoutEffect(() => {
    handleLeadsChangeRef.current = handleLeadsChange;
  }, [handleLeadsChange]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'yesterday' | 'today' | 'tomorrow' | 'overdue' | 'upcoming'
  const [notifSearch, setNotifSearch] = useState('');
  const [collapsedDates, setCollapsedDates] = useState(new Set());
  const [notifMainTab, setNotifMainTab] = useState('all'); // 'all' | 'checklist' | 'delegation' | 'leads'
  const [userDelegationTasks, setUserDelegationTasks] = useState([]);
  const [userChecklistSlots, setUserChecklistSlots] = useState([]);
  const userChecklistSlotsRef = useRef(userChecklistSlots);
  useEffect(() => {
    userChecklistSlotsRef.current = userChecklistSlots;
  }, [userChecklistSlots]);
  const [pendingLeadToOpen, setPendingLeadToOpen] = useState(null);
  const [pendingChecklistSlot, setPendingChecklistSlot] = useState(null);
  const [activeCornerToast, setActiveCornerToast] = useState(null);
  const [activeCenterModal, setActiveCenterModal] = useState(null);
  const [showNotificationPreferencesModal, setShowNotificationPreferencesModal] = useState(false);
  const [isDesktopPromptDismissed, setIsDesktopPromptDismissed] = useState(false);
  const [browserPermission, setBrowserPermission] = useState('default');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScreenCapture, setLastScreenCapture] = useState(null);
  const screenCaptureRequestRef = useRef(0);
  const [leadsFilterStage, setLeadsFilterStage] = useState(() => {
    return initialLeadStage;
  });
  useEffect(() => {
    if (activeTab !== 'leads' || !leadsFilterStage || leads.length === 0) return;
    const preview = getLeadStagePreview(leads, leadsFilterStage);
    stagePreviewStateRef.current = { stageKey: leadsFilterStage, leads: preview, userId, userCompany, userRole };
    if (preview.length === 0) return;
    saveFastLeadsSnapshot(preview, userId, { userCompany, userRole, stageKey: leadsFilterStage });
    saveLocalLeadsPreview(preview, undefined, userCompany, userRole, leadsFilterStage).catch(() => {});
  }, [leads, leadsFilterStage, activeTab, userId, userCompany, userRole]);
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
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        setBrowserPermission(Notification.permission);
      }
      setIsDesktopPromptDismissed(localStorage.getItem('crm_desktop_notif_dismissed') === 'true');
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
    } else if (tab === 'settings' || (tab && tab.startsWith('settings/'))) {
      let sub = '';
      if (tab.startsWith('settings/')) {
        sub = tab.split('/')[1];
      } else {
        sub = params.get('setting') || (params.get('sessionTab') ? 'sessions' : null) || 'business';
      }
      let cleanSub = (sub || 'business').toLowerCase();
      if (cleanSub === 'products' || cleanSub === 'product-list' || cleanSub === 'products-list') cleanSub = 'products';
      if (cleanSub === 'crm-config' || cleanSub === 'crm_config') cleanSub = 'crm';
      if (cleanSub === 'custom-fields' || cleanSub === 'custom_fields') cleanSub = 'fields';
      if (cleanSub === 'business-profile' || cleanSub === 'branches') cleanSub = 'business';
      tab = 'settings';
      setCurrentSettingSubTab(cleanSub);
    } else if (tab === 'location-master' || tab === 'location_territory') {
      tab = 'location_master';
    } else if (tab === 'aiadmin' || (tab && tab.startsWith('aiadmin/'))) {
      tab = 'aiadmin';
    } else if (tab === 'party' || (tab && tab.startsWith('party/'))) {
      let sub = '';
      if (tab.startsWith('party/')) {
        sub = tab.split('/')[1];
      } else {
        sub = params.get('tab') || params.get('subtab') || params.get('step');
      }
      if (sub) {
        let cleanSub = sub.toLowerCase();
        if (cleanSub === 'r03' || cleanSub === 'party-master-report') {
          cleanSub = 'report';
          if (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/party/r03') {
            window.history.replaceState(null, '', '/party/report');
          }
        }
        setPartySubTab(cleanSub);
      }
      tab = 'party';
      setPartyMenuExpanded(true);
    } else if (tab === 'calladmin' || tab === 'call-admin' || (tab && (tab.startsWith('calladmin/') || tab.startsWith('call-admin/')))) {
      let sub = '';
      if (tab.includes('/')) {
        sub = tab.split('/')[1];
      } else {
        sub = params.get('tab') || params.get('subtab');
      }
      if (sub) {
        setCallAdminSubTab(sub.toLowerCase());
      }
      tab = 'calladmin';
      setCallAdminMenuExpanded(true);
    } else if (tab === 'attendance' || (tab && tab.startsWith('attendance/'))) {
      let sub = tab.startsWith('attendance/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
      if (sub) {
        setAttendanceSubTab(sub.toLowerCase());
      }
      tab = 'attendance';
      setAttendanceMenuExpanded(true);
    } else if (tab === 'checklist' || (tab && tab.startsWith('checklist/'))) {
      let sub = tab.startsWith('checklist/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
      if (sub) {
        setChecklistSubTab(sub.toLowerCase());
      }
      tab = 'checklist';
      setChecklistMenuExpanded(true);
    } else if (tab === 'delegation' || (tab && tab.startsWith('delegation/'))) {
      let sub = tab.startsWith('delegation/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
      if (sub) {
        setDelegationSubTab(sub.toLowerCase());
      }
      tab = 'delegation';
      setDelegationMenuExpanded(true);
    } else if (tab === 'workflow' || tab === 'workplace' || (tab && (tab.startsWith('workflow/') || tab.startsWith('workplace/')))) {
      let sub = tab.startsWith('workflow/') ? tab.split('/')[1] : tab.startsWith('workplace/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
      if (sub && ['active', 'tracker', 'trash'].includes(sub.toLowerCase())) {
        setWorkflowSubTab(sub.toLowerCase());
      }
      tab = 'workplace';
      setWorkflowMenuExpanded(true);
    }
    if (tab) {
      setActiveTab(tab);
      const cat = getCategoryForTab(tab);
      if (cat) {
        setExpandedCategories(prev => {
          if (prev[cat]) return prev;
          const next = { ...prev, [cat]: true };
          try { localStorage.setItem('crm-expanded-categories', JSON.stringify(next)); } catch (_e) {}
          return next;
        });
      }
      let stage = params.get('stage');
      if (stage === 'all') stage = null;
      if (stage) {
        setLeadsFilterStage(stage);
      } else if (!params.has('stage')) {
        const savedStage = localStorage.getItem('crmActiveStage');
        if (savedStage) setLeadsFilterStage(savedStage);
      }
    } else if (!params.has('stage')) {
      const savedStage = localStorage.getItem('crmActiveStage');
      if (savedStage) setLeadsFilterStage(savedStage);
    }

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
      } else if (tab === 'user_management_new') {
        const sub = (params.get('tab') || params.get('subtab') || '').toLowerCase();
        setUserManagementSubTab(['user_manage', 'roles', 'hierarchy', 'sessions', 'audit'].includes(sub) ? sub : 'user_manage');
      } else if (tab === 'sessions' || tab === 'shift-monitoring' || tab === 'shift-analytics' || tab === 'breakdown') {
        tab = 'settings';
        setCurrentSettingSubTab('sessions');
      } else if (tab === 'settings' || (tab && tab.startsWith('settings/'))) {
        let sub = '';
        if (tab.startsWith('settings/')) {
          sub = tab.split('/')[1];
        } else {
          sub = params.get('setting') || (params.get('sessionTab') ? 'sessions' : null) || 'business';
        }
        let cleanSub = (sub || 'business').toLowerCase();
        if (cleanSub === 'products' || cleanSub === 'product-list' || cleanSub === 'products-list') cleanSub = 'products';
        if (cleanSub === 'crm-config' || cleanSub === 'crm_config') cleanSub = 'crm';
        if (cleanSub === 'custom-fields' || cleanSub === 'custom_fields') cleanSub = 'fields';
        if (cleanSub === 'business-profile' || cleanSub === 'branches') cleanSub = 'business';
        tab = 'settings';
        setCurrentSettingSubTab(cleanSub);
      } else if (tab === 'location-master' || tab === 'location_territory') {
        tab = 'location_master';
      } else if (tab === 'aiadmin' || (tab && tab.startsWith('aiadmin/'))) {
        tab = 'aiadmin';
      } else if (tab === 'party' || (tab && tab.startsWith('party/'))) {
        let sub = '';
        if (tab.startsWith('party/')) {
          sub = tab.split('/')[1];
        } else {
          sub = params.get('tab') || params.get('subtab') || params.get('step');
        }
        if (sub) {
          let cleanSub = sub.toLowerCase();
          if (cleanSub === 'r03' || cleanSub === 'party-master-report') {
            cleanSub = 'report';
            if (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/party/r03') {
              window.history.replaceState(null, '', '/party/report');
            }
          }
          setPartySubTab(cleanSub);
        }
        tab = 'party';
        setPartyMenuExpanded(true);
      } else if (tab === 'channel_ops' || tab === 'channel-operations' || (tab && (tab.startsWith('channel-operations/') || tab.startsWith('channel_ops/')))) {
        const channelOpsTab = params.get('tab') || params.get('subtab') || params.get('step');
        let sub = '';
        if (tab.includes('/')) {
          sub = tab.split('/')[1];
        } else if (channelOpsTab) {
          sub = channelOpsTab;
        } else {
          sub = 'frequency_rules';
        }
        if (sub) {
          setChannelOpsSubTab(sub.toLowerCase());
        }
        tab = 'channel_ops';
        setChannelOpsMenuExpanded(true);
      } else if (tab === 'calladmin' || tab === 'call-admin' || (tab && (tab.startsWith('calladmin/') || tab.startsWith('call-admin/')))) {
        let sub = '';
        if (tab.includes('/')) {
          sub = tab.split('/')[1];
        } else {
          sub = params.get('tab') || params.get('subtab');
        }
        if (sub) {
          setCallAdminSubTab(sub.toLowerCase());
        }
        tab = 'calladmin';
        setCallAdminMenuExpanded(true);
      } else if (tab === 'attendance' || (tab && tab.startsWith('attendance/'))) {
        let sub = tab.startsWith('attendance/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
        if (sub) {
          setAttendanceSubTab(sub.toLowerCase());
        }
        tab = 'attendance';
        setAttendanceMenuExpanded(true);
      } else if (tab === 'checklist' || (tab && tab.startsWith('checklist/'))) {
        let sub = tab.startsWith('checklist/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
        if (sub) {
          setChecklistSubTab(sub.toLowerCase());
        }
        tab = 'checklist';
        setChecklistMenuExpanded(true);
      } else if (tab === 'delegation' || (tab && tab.startsWith('delegation/'))) {
        let sub = tab.startsWith('delegation/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
        if (sub) {
          setDelegationSubTab(sub.toLowerCase());
        }
        tab = 'delegation';
        setDelegationMenuExpanded(true);
      } else if (tab === 'workflow' || tab === 'workplace' || (tab && (tab.startsWith('workflow/') || tab.startsWith('workplace/')))) {
        let sub = tab.startsWith('workflow/') ? tab.split('/')[1] : tab.startsWith('workplace/') ? tab.split('/')[1] : (params.get('tab') || params.get('subtab'));
        if (sub && ['active', 'tracker', 'trash'].includes(sub.toLowerCase())) {
          setWorkflowSubTab(sub.toLowerCase());
        }
        tab = 'workplace';
        setWorkflowMenuExpanded(true);
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
      const cat = getCategoryForTab(tab);
      if (cat) {
        setExpandedCategories(prev => {
          if (prev[cat]) return prev;
          const next = { ...prev, [cat]: true };
          try { localStorage.setItem('crm-expanded-categories', JSON.stringify(next)); } catch (_e) {}
          return next;
        });
      }
      
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

  // Live Active Tab Access Guard: If current active tab is revoked or unauthorized (e.g. non-master trying to access saas_studio/config_master), immediately switch to allowed tab
  useEffect(() => {
    if ((activeTab === 'saas_studio' || activeTab === 'saas_master' || activeTab === 'config_master') && !isMasterAdmin) {
      handleTabChange('dashboard');
      return;
    }
    if (isAdmin) return;
    if (!isTabPermitted(activeTab, moduleAccess, userRole, effectiveTenantEntitlements, effectiveTenantId, userEmail)) {
      const allPossibleTabs = [
        'dashboard', 'leads', 'registration', 'report', 'orders', 'mrp', 'mrp_against',
        'recruiter', 'joining', 'party', 'workplace', 'callcenter', 'whatsapp_official',
        'whatsapp_unofficial', 'calladmin', 'aicallcenter', 'email_config', 'admin_message_config', 'settings'
      ];
      const nextAllowedTab = allPossibleTabs.find(t => isTabPermitted(t, moduleAccess, userRole, effectiveTenantEntitlements, effectiveTenantId, userEmail));
      if (nextAllowedTab) {
        handleTabChange(nextAllowedTab);
      }
    }
  }, [moduleAccess, userRole, activeTab, isAdmin, isMasterAdmin, effectiveTenantEntitlements, effectiveTenantId, userEmail]);

  const handleTabChange = (tabId) => {
    if (tabId === 'ai' && activeTab !== 'ai') {
      const requestId = ++screenCaptureRequestRef.current;
      setLastScreenCapture(null);
      const captureWhenIdle = () => {
        if (screenCaptureRequestRef.current !== requestId) return;
        import('html2canvas')
          .then(({ default: html2canvas }) => html2canvas(document.body, {
            scale: Math.min(window.devicePixelRatio || 1, 1.5)
          }))
          .then(canvas => {
            if (screenCaptureRequestRef.current === requestId) {
              setLastScreenCapture(canvas.toDataURL('image/jpeg', 0.4));
            }
          })
          .catch(err => console.warn('Screenshot capture failed:', err));
      };
      window.requestAnimationFrame(() => {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(captureWhenIdle, { timeout: 2500 });
        } else {
          window.setTimeout(captureWhenIdle, 0);
        }
      });
    } else if (tabId !== 'ai') {
      screenCaptureRequestRef.current += 1;
      setLastScreenCapture(null);
    }

    if (tabId === 'dashboard') {
      if (!isTabPermitted('dashboard', moduleAccess, userRole)) return;
      setActiveTab('dashboard');
      window.history.pushState(null, '', '/dashboard');
      if (window.innerWidth <= 768) setIsSidebarOpen(false);
      return;
    }

    if (['scorecard', 'overview', 'pipeline', 'lead-data', 'leads-data'].includes(tabId)) {
      if (!isTabPermitted('dashboard', moduleAccess, userRole)) return;
      const canonical = (tabId === 'pipeline' || tabId === 'leads-data') ? 'lead-data' : tabId;
      setActiveTab('dashboard');
      setDashboardSubTab(canonical);
      window.history.pushState(null, '', `/${canonical}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'user_management_new') {
      setActiveTab(tabId);
      window.history.pushState(null, '', `/user_management_new?tab=${userManagementSubTab}`);
      if (window.innerWidth <= 768) setIsSidebarOpen(false);
      return;
    }

    if (tabId === 'aiadmin') {
      setActiveTab('aiadmin');
      window.history.pushState(null, '', '/aiadmin/models');
      if (window.innerWidth <= 768) setIsSidebarOpen(false);
      return;
    }

    if (tabId === 'calladmin') {
      setActiveTab('calladmin');
      const targetSub = callAdminSubTab || 'agents';
      window.history.pushState(null, '', `/calladmin?tab=${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'party') {
      setActiveTab('party');
      const targetSub = partySubTab || 's00';
      const cleanTarget = (targetSub === 'r03' || targetSub === 'party-master-report') ? 'report' : targetSub;
      window.history.pushState(null, '', `/party/${cleanTarget}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'saas_master' || tabId === 'saas_studio') {
      if (!isMasterAdmin) return;
      setActiveTab('saas_master');
      const targetSub = saasSubTab || 'pricing';
      window.history.pushState(null, '', `/saas-master/${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'config_master') {
      if (!isMasterAdmin) return;
      setActiveTab('config_master');
      const targetSub = configMasterSubTab || 'messages';
      window.history.pushState(null, '', `/config-master/${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'admin_message_config') {
      if (!isMasterAdmin) return;
      handleConfigMasterSubTabChange('messages');
      return;
    }

    if (tabId === 'offline_rule' && isMasterAdmin) {
      handleConfigMasterSubTabChange('offline_rule');
      return;
    }

    if (tabId === 'public_users' && isMasterAdmin) {
      handleConfigMasterSubTabChange('public_users');
      return;
    }

    if (tabId === 'workplace' || tabId === 'workflow') {
      if (!isMasterAdmin) return;
      setActiveTab('workplace');
      const targetSub = workflowSubTab || 'active';
      window.history.pushState(null, '', `/workflow?tab=${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'email_config' || tabId === 'email' || tabId === 'email-config') {
      setActiveTab('email_config');
      const targetSub = emailSubTab || 'smtp';
      window.history.pushState(null, '', `/email-config?tab=${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    if (tabId === 'settings') {
      setActiveTab('settings');
      const targetSub = currentSettingSubTab || 'business';
      window.history.pushState(null, '', `/settings/${targetSub}`);
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
      return;
    }

    setActiveTab(tabId);
    
    const newPath = `/${tabId}`;
    
    // Update URL instantly using native History API with a clean slate
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSettingSubTabChange = (subTabId) => {
    let cleanSub = subTabId;
    if (cleanSub === 'products' || cleanSub === 'product-list' || cleanSub === 'products-list') cleanSub = 'products';
    if (cleanSub === 'crm-config' || cleanSub === 'crm_config') cleanSub = 'crm';
    if (cleanSub === 'custom-fields' || cleanSub === 'custom_fields') cleanSub = 'fields';
    if (cleanSub === 'business-profile' || cleanSub === 'branches') cleanSub = 'business';
    if (cleanSub === 'sessions' || cleanSub === 'active-sessions' || cleanSub === 'breaks' || cleanSub === 'work-session') cleanSub = 'sessions';

    setCurrentSettingSubTab(cleanSub);
    if (activeTab !== 'settings') {
      setActiveTab('settings');
    }
    const newPath = `/settings/${cleanSub}`;
    window.history.pushState(null, '', newPath);
    window.dispatchEvent(new CustomEvent('setting_subtab_change', { detail: cleanSub }));
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleAttendanceSubTabChange = (subTabId) => {
    setAttendanceSubTab(subTabId);
    if (activeTab !== 'attendance') {
      setActiveTab('attendance');
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
      setActiveTab('checklist');
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
      setActiveTab('delegation');
    }
    const newPath = `/delegation?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleWorkflowSubTabChange = (subTabId) => {
    setWorkflowSubTab(subTabId);
    if (activeTab !== 'workplace') {
      setActiveTab('workplace');
    }
    const newPath = `/workflow?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleCallAdminSubTabChange = (subTabId) => {
    setCallAdminSubTab(subTabId);
    if (activeTab !== 'calladmin') {
      setActiveTab('calladmin');
    }
    const newPath = `/calladmin?tab=${subTabId}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handlePartySubTabChange = (subTabId) => {
    let cleanSub = (subTabId || 'dashboard').toLowerCase();
    if (cleanSub === 'r03' || cleanSub === 'party-master-report') cleanSub = 'report';
    if (['frequency_rules', 'order_followup', 'order_pipeline', 'order_feedback', 'monthly_feedback', 'complaints'].includes(cleanSub)) {
      handleChannelOpsSubTabChange(cleanSub);
      return;
    }
    setPartySubTab(cleanSub);
    if (activeTab !== 'party') {
      setActiveTab('party');
    }
    const newPath = `/party/${cleanSub}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleChannelOpsSubTabChange = (subTabId) => {
    let cleanSub = (subTabId || 'frequency_rules').toLowerCase();
    setChannelOpsSubTab(cleanSub);
    if (activeTab !== 'channel_ops' && activeTab !== 'channel-operations') {
      setActiveTab('channel_ops');
    }
    const newPath = `/channel-operations/${cleanSub}`;
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleSaasSubTabChange = (subTabId) => {
    let canonical = (subTabId === 'workspaces' || subTabId === 'clients') ? 'tenants' : (subTabId || 'pricing');
    if (canonical === 'invoices' || canonical === 'ledger') canonical = 'billing';
    setSaasSubTab(canonical);
    if (activeTab !== 'saas_master' && activeTab !== 'saas_studio') {
      setActiveTab('saas_master');
    }
    const newPath = `/saas-master/${canonical}`;
    window.history.pushState(null, '', newPath);
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleConfigMasterSubTabChange = (subTabId) => {
    let canonical = (subTabId === 'admin_messages' || subTabId === 'admin-messages' || subTabId === 'otps') ? 'messages' : (subTabId || 'messages');
    if (canonical === 'health' || canonical === 'logs') canonical = 'status';
    if (canonical === 'routes') canonical = 'navigation';
    if (canonical === 'offline-rule') canonical = 'offline_rule';
    if (canonical === 'public-users') canonical = 'public_users';
    setConfigMasterSubTab(canonical);
    if (activeTab !== 'config_master') {
      setActiveTab('config_master');
    }
    const newPath = `/config-master/${canonical}`;
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

      setUserDelegationTasks(current => sameAlertItems(current, tasks) ? current : tasks);
      setUserChecklistSlots(current => sameAlertItems(current, slots) ? current : slots);

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

  // Periodic check for checklist slot times (runs purely in-memory against local state, ZERO network calls & ZERO rerenders)
  useEffect(() => {
    const checkChecklistSlots = () => {
      const slots = userChecklistSlotsRef.current;
      if (!slots || slots.length === 0) return;
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
    };

    checkChecklistSlots();
    const checklistTimer = setInterval(checkChecklistSlots, 10000);
    return () => clearInterval(checklistTimer);
  }, []);

  useEffect(() => {
    markLeadStartupTiming('content-gate', { isMounted, activeTab, loadingLeads,
      count: leads.length, offlineAllowed: isCurrentTabAllowedOffline,
      leadsVisited: visitedTabs.has('leads') });
  }, [isMounted, activeTab, loadingLeads, leads.length, isCurrentTabAllowedOffline, visitedTabs]);

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
      <ResponsiveTableResizer />
      <SubscriptionExpiryBanner subscription={tenantSubscription} />
      <SubscriptionExpiredModal subscription={tenantSubscription} />
      <AddonPurchaseModal
        tenantId={tenantId}
        subscription={tenantSubscription}
        entitlements={tenantEntitlements}
      />
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
                  <span
                    suppressHydrationWarning
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      color: 'var(--accent-color)',
                      background: 'var(--nav-active-bg)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '9999px',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      letterSpacing: '0.02em'
                    }}
                  >
                    v{pkg.version || '1.0.584'}
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
          {/* Master Admin: 1. SaaS Master */}
          {isMasterAdmin && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setSaasMenuExpanded(true);
                  } else {
                    setSaasMenuExpanded(!saasMenuExpanded);
                  }
                  handleTabChange('saas_master');
                }}
                className="nav-item" 
                data-active={activeTab === 'saas_master' || activeTab === 'saas_studio'}
                title={isSidebarCollapsed ? "SaaS Master" : undefined}
                style={{ 
                  background: (activeTab === 'saas_master' || activeTab === 'saas_studio') 
                    ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.16) 0%, rgba(124, 58, 237, 0.16) 100%)' 
                    : 'none', 
                  borderLeft: (activeTab === 'saas_master' || activeTab === 'saas_studio') ? '3px solid #7c3aed' : 'none',
                  width: '100%', 
                  textAlign: 'left', 
                  cursor: 'pointer', 
                  fontFamily: 'inherit', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem' 
                }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {saasMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Crown size={20} style={{ flexShrink: 0, color: '#f59e0b' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: (activeTab === 'saas_master' || activeTab === 'saas_studio') ? 600 : 500 }}>SaaS Master</span>
                  <span style={{ 
                    fontSize: '0.62rem', 
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', 
                    color: '#92400e', 
                    padding: '1px 6px', 
                    borderRadius: '999px', 
                    fontWeight: 800, 
                    letterSpacing: '0.04em',
                    border: '1px solid #fcd34d' 
                  }}>
                    SAAS
                  </span>
                </div>
              </button>
              
              <div className={`submenu-list ${saasMenuExpanded ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleSaasSubTabChange('pricing')}
                    className="submenu-item"
                    data-active={(activeTab === 'saas_master' || activeTab === 'saas_studio') && (saasSubTab === 'pricing' || !saasSubTab)}
                  >
                    💵 Pricing Catalog
                  </button>
                  <button
                    onClick={() => handleSaasSubTabChange('tenants')}
                    className="submenu-item"
                    data-active={(activeTab === 'saas_master' || activeTab === 'saas_studio') && (saasSubTab === 'tenants' || saasSubTab === 'workspaces')}
                  >
                    🏢 Client Workspaces
                  </button>
                  <button
                    onClick={() => handleSaasSubTabChange('billing')}
                    className="submenu-item"
                    data-active={(activeTab === 'saas_master' || activeTab === 'saas_studio') && (saasSubTab === 'billing' || saasSubTab === 'invoices')}
                  >
                    🧾 Master Invoices
                  </button>
                </div>
              </div>
            </SidebarSubmenu>
          )}

          {/* Master Admin: 2. Config Master */}
          {isMasterAdmin && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setConfigMasterMenuExpanded(true);
                  } else {
                    setConfigMasterMenuExpanded(!configMasterMenuExpanded);
                  }
                  handleTabChange('config_master');
                }}
                className="nav-item" 
                data-active={activeTab === 'config_master'}
                title={isSidebarCollapsed ? "Config Master" : undefined}
                style={{ 
                  background: activeTab === 'config_master' 
                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(99, 102, 241, 0.16) 100%)' 
                    : 'none', 
                  borderLeft: activeTab === 'config_master' ? '3px solid #3b82f6' : 'none',
                  width: '100%', 
                  textAlign: 'left', 
                  cursor: 'pointer', 
                  fontFamily: 'inherit', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem' 
                }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {configMasterMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Sliders size={20} style={{ flexShrink: 0, color: '#6366f1' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontWeight: activeTab === 'config_master' ? 600 : 500 }}>Config Master</span>
                  <span style={{ 
                    fontSize: '0.62rem', 
                    background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', 
                    color: '#3730a3', 
                    padding: '1px 6px', 
                    borderRadius: '999px', 
                    fontWeight: 800, 
                    letterSpacing: '0.04em',
                    border: '1px solid #a5b4fc' 
                  }}>
                    CONFIG
                  </span>
                </div>
              </button>
              
              <div className={`submenu-list ${configMasterMenuExpanded ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleConfigMasterSubTabChange('notifications')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'notifications'}
                  >
                    🔔 User Notifications
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('messages')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && (configMasterSubTab === 'messages' || !configMasterSubTab)}
                  >
                    🛡️ Platform Messaging & OTPs
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('status')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'status'}
                  >
                    🩺 System Health & Logs
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('automation')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'automation'}
                  >
                    ⚡ Automation & Webhook API
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('navigation')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'navigation'}
                  >
                    🧭 Page Navigation Rules
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('offline_rule')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'offline_rule'}
                  >
                    📴 Offline Rules & Sync Policy
                  </button>
                  <button
                    onClick={() => handleConfigMasterSubTabChange('public_users')}
                    className="submenu-item"
                    data-active={activeTab === 'config_master' && configMasterSubTab === 'public_users'}
                  >
                    👥 Public User Management
                  </button>
                </div>
              </div>
            </SidebarSubmenu>
          )}

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

          {/* AI Chatbot & AI Suite */}
          {(isTabPermitted('ai', moduleAccess, userRole, tenantEntitlements, tenantId, userEmail) || userRole === 'admin' || userRole === 'Admin' || moduleAccess['ai']?.view || moduleAccess['new_swan_ai']?.view) && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setAiMenuExpanded(true);
                  } else {
                    setAiMenuExpanded(!aiMenuExpanded);
                  }
                  handleTabChange('ai');
                }}
                className="nav-item" 
                data-active={['ai', 'aiadmin', 'aiknowledgebase'].includes(activeTab)}
                title={isSidebarCollapsed ? "AI Chatbot" : undefined}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {aiMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Bot size={20} style={{ flexShrink: 0 }} />
                <span>AI Chatbot</span>
              </button>
              
              <div className={`submenu-list ${aiMenuExpanded ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleTabChange('ai')}
                    className="submenu-item"
                    data-active={activeTab === 'ai'}
                  >
                    💬 AI Assistant Chat
                  </button>
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aiadmin']?.view) && (
                    <button
                      onClick={() => handleTabChange('aiadmin')}
                      className="submenu-item"
                      data-active={activeTab === 'aiadmin'}
                    >
                      ⚙️ AI Admin & Models
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aiknowledgebase']?.view) && (
                    <button
                      onClick={() => handleTabChange('aiknowledgebase')}
                      className="submenu-item"
                      data-active={activeTab === 'aiknowledgebase'}
                    >
                      📚 Knowledge Base (RAG)
                    </button>
                  )}
                </div>
              </div>
            </SidebarSubmenu>
          )}

          {/* Call Center */}
          {(isTabPermitted('callcenter', moduleAccess, userRole, tenantEntitlements, tenantId, userEmail) || userRole === 'admin' || userRole === 'Admin' || moduleAccess['callcenter']?.view) && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
              <button 
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setCallCenterMenuExpanded(true);
                  } else {
                    setCallCenterMenuExpanded(!callCenterMenuExpanded);
                  }
                  handleTabChange('callcenter');
                }}
                className="nav-item" 
                data-active={['callcenter', 'calladmin', 'aicallcenter'].includes(activeTab)}
                title={isSidebarCollapsed ? "Call Center" : undefined}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
              >
                <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                  {callCenterMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <PhoneCall size={20} style={{ flexShrink: 0 }} />
                <span>Call Center</span>
              </button>
              
              <div className={`submenu-list ${callCenterMenuExpanded ? 'expanded' : ''}`}>
                <div className="submenu-inner">
                  <button
                    onClick={() => handleTabChange('callcenter')}
                    className="submenu-item"
                    data-active={activeTab === 'callcenter'}
                  >
                    📞 Telecalling Desk
                  </button>
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['calladmin']?.view) && (
                    <button
                      onClick={() => handleTabChange('calladmin')}
                      className="submenu-item"
                      data-active={activeTab === 'calladmin'}
                    >
                      ⚙️ Call Admin & SIP
                    </button>
                  )}
                  {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aicallcenter']?.view) && (
                    <button
                      onClick={() => handleTabChange('aicallcenter')}
                      className="submenu-item"
                      data-active={activeTab === 'aicallcenter'}
                    >
                      🤖 AI Voice Call Center
                    </button>
                  )}
                </div>
              </div>
            </SidebarSubmenu>
          )}

          {/* Smart Attendance (Positioned Above Sales) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['attendance']?.view) && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
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
              
              <div className={`submenu-list ${attendanceMenuExpanded ? 'expanded' : ''}`}>
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
                  <button
                    onClick={() => handleAttendanceSubTabChange('shift_rules')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'shift_rules'}
                  >
                    📖 Shift Rules
                  </button>
                  <button
                    onClick={() => handleAttendanceSubTabChange('leave_policy')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'leave_policy'}
                  >
                    🌴 Company Leave Policy
                  </button>
                  <button
                    onClick={() => handleAttendanceSubTabChange('geofencing')}
                    className="submenu-item"
                    data-active={activeTab === 'attendance' && attendanceSubTab === 'geofencing'}
                  >
                    📍 Office Geofencing Policy
                  </button>
                </div>
              </div>
            </SidebarSubmenu>
          )}

          {/* Smart Checklist (Daily, Weekly, 15-Day, Monthly, Quarterly, 6-Month, 1-Year) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['checklist']?.view !== false) && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
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
              
              <div className={`submenu-list ${checklistMenuExpanded ? 'expanded' : ''}`}>
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
            </SidebarSubmenu>
          )}

          {/* Delegation Tasks (Emp-to-Emp Task Management) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['delegation']?.view !== false) && (
            <SidebarSubmenu collapsed={isSidebarCollapsed}>
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
              
              <div className={`submenu-list ${delegationMenuExpanded ? 'expanded' : ''}`}>
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
            </SidebarSubmenu>
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
                  suppressHydrationWarning
                >
                  {expandedCategories[category] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{category}</span>
                </button>
                
                <div 
                  className={`category-modules-list ${(isSidebarCollapsed || expandedCategories[category]) ? 'expanded' : ''}`}
                  suppressHydrationWarning
                >
                  <div className="category-modules-inner">
                    {visibleModules.map(module => (
                      <SidebarSubmenu key={module.id} collapsed={isSidebarCollapsed}>
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
                            } else if (module.id === 'party') {
                              if (isSidebarCollapsed) {
                                setIsSidebarCollapsed(false);
                                setPartyMenuExpanded(true);
                              } else {
                                setPartyMenuExpanded(!partyMenuExpanded);
                              }
                              handleTabChange('party');
                            } else if (module.id === 'channel_ops' || module.id === 'channel-operations') {
                              if (isSidebarCollapsed) {
                                setIsSidebarCollapsed(false);
                                setChannelOpsMenuExpanded(true);
                              } else {
                                setChannelOpsMenuExpanded(!channelOpsMenuExpanded);
                              }
                              handleTabChange('channel_ops');
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
                          {module.id === 'party' && (
                            <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                              {partyMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          )}
                          {(module.id === 'channel_ops' || module.id === 'channel-operations') && (
                            <span className="nav-chevron" style={{ marginRight: '-0.25rem' }}>
                              {channelOpsMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </span>
                          )}
                          {React.cloneElement(module.icon, { style: { flexShrink: 0 } })}
                          <span>{module.label}</span>
                          {module.id === 'party' && partyPendingCount > 0 && (
                            <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '10px', lineHeight: '1' }}>
                              {partyPendingCount}
                            </span>
                          )}
                        </button>
                        
                        {module.id === 'recruiter' && (
                          <div className={`submenu-list ${recruiterMenuExpanded ? 'expanded' : ''}`}>
                            <div className="submenu-inner">
                              {/* Determine allowed stages for this user */}
                              {(() => {
                                const isAdmin = userRole === 'admin' || userRole === 'Admin';
                                const recruiterAccess = moduleAccess['recruiter'];
                                const isFullAccess = isAdmin || recruiterAccess?.is_manager;
                                const allowedSteps = recruiterAccess?.assigned_steps || [];

                                const canSeeStage = (stageId) => isFullAccess || allowedSteps.includes(stageId) || recruiterAccess?.sub_items?.[stageId]?.view === true;

                                return (
                                  <>
                                    {/* Dashboard & All Stages - for admins/managers or assigned */}
                                    {(isFullAccess || canSeeStage('dashboard') || canSeeStage('all_stages')) && (
                                      <>
                                        {(isFullAccess || canSeeStage('dashboard')) && (
                                          <button
                                            onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('dashboard'); }}
                                            className="submenu-item"
                                            data-active={activeTab === 'recruiter' && recruiterFilterStage === 'dashboard'}
                                            style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}
                                          >
                                            📊 Recruiter Dashboard
                                          </button>
                                        )}
                                        {(isFullAccess || canSeeStage('all_stages')) && (
                                          <button
                                            onClick={() => { handleTabChange('recruiter'); setRecruiterFilterStage('all_stages'); }}
                                            className="submenu-item"
                                            data-active={activeTab === 'recruiter' && recruiterFilterStage === 'all_stages'}
                                            style={{ fontWeight: 'bold' }}
                                          >
                                            🔍 Recruiter All Stage
                                          </button>
                                        )}
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
                          <div className={`submenu-list ${leadDataExpanded ? 'expanded' : ''}`}>
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

                              {(() => {
                                const leadsAccess = moduleAccess?.['leads'];
                                const canSeeAllLeads = isAdmin || leadsAccess?.is_manager || leadsAccess?.sub_items?.all_leads?.view !== false;
                                if (!canSeeAllLeads) return null;
                                return (
                                  <button
                                    onClick={() => { handleTabChange('leads'); handleStageChange(null); }}
                                    className="submenu-item"
                                    data-active={activeTab === 'leads' && leadsFilterStage === null}
                                  >
                                    All Leads
                                  </button>
                                );
                              })()}

                              {(activePipelineStages && activePipelineStages.length > 0 
                                ? activePipelineStages 
                                : ['01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage', '08 - Transfer to Party']
                              ).map(stage => {
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

                        {module.id === 'party' && (
                          <div className={`submenu-list ${partyMenuExpanded ? 'expanded' : ''}`}>
                            <div className="submenu-inner">
                              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted, #94a3b8)', padding: '0.35rem 0.75rem 0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Channel Partner Pipeline
                              </div>

                              {(() => {
                                const canSeePartySub = (subId) => (userRole === 'admin' || userRole === 'Admin') || isMasterAdmin || !moduleAccess?.party?.sub_items || moduleAccess.party.sub_items[subId]?.view !== false;
                                return (
                                  <>
                                    {canSeePartySub('dashboard') && (
                                      <button
                                        onClick={() => handlePartySubTabChange('dashboard')}
                                        className="submenu-item"
                                        data-active={activeTab === 'party' && partySubTab === 'dashboard'}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: (activeTab === 'party' && partySubTab === 'dashboard') ? 700 : 600, color: (activeTab === 'party' && partySubTab === 'dashboard') ? 'var(--accent-color)' : undefined }}
                                      >
                                        <span>📊 Party Master Dashboard</span>
                                      </button>
                                    )}

                                    {canSeePartySub('all_party_stage') && (
                                      <button
                                        onClick={() => handlePartySubTabChange('all_party_stage')}
                                        className="submenu-item"
                                        data-active={activeTab === 'party' && partySubTab === 'all_party_stage'}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: (activeTab === 'party' && partySubTab === 'all_party_stage') ? 700 : 600, color: (activeTab === 'party' && partySubTab === 'all_party_stage') ? 'var(--accent-color)' : undefined }}
                                      >
                                        <span>📋 All Party Stage</span>
                                      </button>
                                    )}
                                  </>
                                );
                              })()}

                              <button
                                onClick={() => handlePartySubTabChange('s00')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's00'}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                              >
                                <span>S00 Transfered to Party</span>
                                {partyPendingCount > 0 && (
                                  <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                                    {partyPendingCount}
                                  </span>
                                )}
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s01')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's01'}
                              >
                                S01 Party Master Creation
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s02')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's02'}
                              >
                                S02 Distributor Registration
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s03')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's03'}
                              >
                                S03 Dealer Registration
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s04')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's04'}
                              >
                                S04 Sub-Dealer Registration
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s05')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's05'}
                              >
                                S05 Commercial Security Details
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s06')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's06'}
                              >
                                S06 Product Auth & Territory
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s07')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's07'}
                              >
                                S07 Sales Team Assignment
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('s08')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 's08'}
                              >
                                S08 Partner Activation
                              </button>

                              <div style={{ height: '1px', backgroundColor: 'var(--border-light, rgba(255,255,255,0.08))', margin: '0.4rem 0.75rem' }} />

                              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted, #94a3b8)', padding: '0.2rem 0.75rem 0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Master Directory &amp; Hierarchy
                              </div>

                              <button
                                onClick={() => handlePartySubTabChange('report')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && (partySubTab === 'report' || partySubTab === 'r03')}
                              >
                                📑 Party Master Report
                              </button>

                              <button
                                onClick={() => handlePartySubTabChange('hierarchy_tree')}
                                className="submenu-item"
                                data-active={activeTab === 'party' && partySubTab === 'hierarchy_tree'}
                              >
                                🌳 Channel Hierarchy Tree
                              </button>
                            </div>
                          </div>
                        )}

                        {(module.id === 'channel_ops' || module.id === 'channel-operations') && (
                          <div className={`submenu-list ${channelOpsMenuExpanded ? 'expanded' : ''}`}>
                            <div className="submenu-inner">
                              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted, #94a3b8)', padding: '0.35rem 0.75rem 0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Daily Order Follow-up
                              </div>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('frequency_rules')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'frequency_rules'}
                              >
                                ⚙️ Order Frequency Master
                              </button>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('order_followup')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'order_followup'}
                              >
                                📞 Order Desk Calling
                              </button>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('order_pipeline')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'order_pipeline'}
                              >
                                🚚 Order to Delivery Pipeline
                              </button>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('order_feedback')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'order_feedback'}
                              >
                                ⭐ Post-Order Feedback
                              </button>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('monthly_feedback')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'monthly_feedback'}
                              >
                                📅 Monthly Health Checks
                              </button>

                              <button
                                onClick={() => handleChannelOpsSubTabChange('complaints')}
                                className="submenu-item"
                                data-active={activeTab === 'channel_ops' && channelOpsSubTab === 'complaints'}
                              >
                                ⚠️ Complaint Management
                              </button>
                            </div>
                          </div>
                        )}
                      </SidebarSubmenu>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* USER MANAGEMENT CATEGORY (Strictly positioned between Human Resource and System) */}
          {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['team']?.view || moduleAccess['user_management_new']?.view) && (
            <div>
              <button
                onClick={() => {
                  toggleCategory('User Management');
                  if (activeTab !== 'user_management_new') {
                    handleTabChange('user_management_new');
                  }
                }}
                className="category-header"
                data-active={activeTab === 'user_management_new'}
                suppressHydrationWarning
              >
                {expandedCategories['User Management'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>User Management</span>
              </button>

              <div 
                className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['User Management']) ? 'expanded' : ''}`}
                suppressHydrationWarning
              >
                <div className="category-modules-inner">
                  {[
                    { id: 'user_manage', label: 'User Manage', icon: Users },
                    { id: 'roles', label: 'Roles & Permissions', icon: Shield },
                    { id: 'hierarchy', label: 'Org Hierarchy', icon: Network },
                    { id: 'sessions', label: 'Active Sessions', icon: Monitor },
                    { id: 'audit', label: 'Audit Logs', icon: Clock }
                  ].map(sub => {
                    const SubIcon = sub.icon;
                    const isSubActive = activeTab === 'user_management_new' && userManagementSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => handleUserManagementSubTabChange(sub.id)}
                        className="nav-item"
                        data-active={isSubActive}
                        title={isSidebarCollapsed ? sub.label : undefined}
                        style={{
                          background: isSubActive ? 'var(--primary-light, rgba(37, 99, 235, 0.12))' : 'none',
                          border: 'none',
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          paddingLeft: '1.25rem'
                        }}
                      >
                        <SubIcon size={16} style={{ flexShrink: 0, color: isSubActive ? 'var(--primary-color, #2563eb)' : 'inherit' }} />
                        <span style={{ fontWeight: isSubActive ? 700 : 500 }}>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* WORKFLOW BUILDER CATEGORY (Strictly positioned between User Management and System - MASTER ADMIN ONLY) */}
          {isMasterAdmin && (
            <div>
              <button
                onClick={() => {
                  toggleCategory('Workflow Builder');
                  if (activeTab !== 'workplace') {
                    handleTabChange('workplace');
                  }
                }}
                className="category-header"
                data-active={activeTab === 'workplace'}
                suppressHydrationWarning
              >
                {expandedCategories['Workflow Builder'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Workflow Builder</span>
              </button>

              <div 
                className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['Workflow Builder']) ? 'expanded' : ''}`}
                suppressHydrationWarning
              >
                <div className="category-modules-inner">
                  {[
                    { id: 'active', label: 'Active Workflows', icon: GitMerge },
                    { id: 'tracker', label: 'Live Working Tracker', icon: Clock },
                    { id: 'trash', label: 'Trash Bin', icon: Trash2 }
                  ].map(sub => {
                    const SubIcon = sub.icon;
                    const isSubActive = activeTab === 'workplace' && (workflowSubTab === sub.id || (!workflowSubTab && sub.id === 'active'));
                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          if (activeTab !== 'workplace') {
                            handleTabChange('workplace');
                          }
                          handleWorkflowSubTabChange(sub.id);
                        }}
                        className="nav-item"
                        data-active={isSubActive}
                        title={isSidebarCollapsed ? sub.label : undefined}
                        style={{
                          background: isSubActive ? 'var(--primary-light, rgba(37, 99, 235, 0.12))' : 'none',
                          border: 'none',
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          paddingLeft: '1.25rem'
                        }}
                      >
                        <SubIcon size={16} style={{ flexShrink: 0, color: isSubActive ? 'var(--primary-color, #2563eb)' : 'inherit' }} />
                        <span style={{ fontWeight: isSubActive ? 700 : 500 }}>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* COMMUNICATION CENTER CATEGORY ACCORDION (Between User Management/Workflow Builder and System) */}
          {((userRole === 'admin' || userRole === 'Admin') || 
            moduleAccess['whatsapp_official']?.view || 
            moduleAccess['whatsapp_unofficial']?.view || 
            moduleAccess['sms_config']?.view || 
            moduleAccess['rcs_config']?.view || 
            moduleAccess['email_config']?.view) && (
              <div>
                <button
                  onClick={() => toggleCategory('Communication Center')}
                  className="category-header"
                  data-active={['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(activeTab)}
                  suppressHydrationWarning
                >
                  {expandedCategories['Communication Center'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>Communication Center</span>
                </button>

                <div 
                  className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['Communication Center']) ? 'expanded' : ''}`}
                  suppressHydrationWarning
                >
                  <div className="category-modules-inner">
                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['whatsapp_official']?.view) && (
                      <button 
                        onClick={() => handleTabChange('whatsapp_official')}
                        className="nav-item" 
                        data-active={activeTab === 'whatsapp_official'}
                        title={isSidebarCollapsed ? "WhatsApp Official" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <MessageSquare size={20} style={{ flexShrink: 0 }} />
                        <span>WhatsApp Official</span>
                      </button>
                    )}

                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['whatsapp_unofficial']?.view) && (
                      <button 
                        onClick={() => handleTabChange('whatsapp_unofficial')}
                        className="nav-item" 
                        data-active={activeTab === 'whatsapp_unofficial'}
                        title={isSidebarCollapsed ? "WhatsApp UnOfficial" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <MessageCircle size={20} style={{ flexShrink: 0 }} />
                        <span>WhatsApp UnOfficial</span>
                      </button>
                    )}

                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['sms_config']?.view) && (
                      <button 
                        onClick={() => handleTabChange('sms_config')}
                        className="nav-item" 
                        data-active={activeTab === 'sms_config'}
                        title={isSidebarCollapsed ? "SMS" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Send size={20} style={{ flexShrink: 0 }} />
                        <span>SMS</span>
                      </button>
                    )}

                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['rcs_config']?.view) && (
                      <button 
                        onClick={() => handleTabChange('rcs_config')}
                        className="nav-item" 
                        data-active={activeTab === 'rcs_config'}
                        title={isSidebarCollapsed ? "RCS" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Zap size={20} style={{ flexShrink: 0 }} />
                        <span>RCS</span>
                      </button>
                    )}

                    {((userRole === 'admin' || userRole === 'Admin') || moduleAccess['email_config']?.view) && (
                      <button 
                        onClick={() => handleTabChange('email_config')}
                        className="nav-item" 
                        data-active={activeTab === 'email_config'}
                        title={isSidebarCollapsed ? "Email" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Mail size={20} style={{ flexShrink: 0 }} />
                        <span>Email</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* SYSTEM CATEGORY ACCORDION */}
          {((userRole === 'admin' || userRole === 'Admin') || 
            moduleAccess['team']?.view) && (
              <div>
                <button
                  onClick={() => toggleCategory('System')}
                  className="category-header"
                  suppressHydrationWarning
                >
                  {expandedCategories['System'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>System</span>
                </button>

                <div 
                  className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['System']) ? 'expanded' : ''}`}
                  suppressHydrationWarning
                >
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
                  </div>
                </div>
              </div>
          )}

          {/* Settings Category (Exact same structure & styling as System category) */}
          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['settings']?.view || globalRolePermissions?.editSettings) && (
            <div>
              <button
                onClick={() => toggleCategory('Settings')}
                className="category-header"
                suppressHydrationWarning
              >
                {expandedCategories['Settings'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Settings</span>
              </button>

              <div 
                className={`category-modules-list ${(isSidebarCollapsed || expandedCategories['Settings']) ? 'expanded' : ''}`}
                suppressHydrationWarning
              >
                <div className="category-modules-inner">
                  {SETTINGS_MODULE_ITEMS.filter(item => {
                    if (userRole === 'admin' || userRole === 'Admin') return true;
                    return getSubItemPermissions(moduleAccess, userRole, 'settings', item.id)?.view !== false;
                  }).map(item => {
                    const IconComponent = item.icon;
                    const isItemActive = activeTab === 'settings' && currentSettingSubTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSettingSubTabChange(item.id)}
                        className="nav-item"
                        data-active={isItemActive}
                        title={isSidebarCollapsed ? item.label : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <IconComponent size={20} style={{ flexShrink: 0 }} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: '0 1 auto', overflow: 'hidden' }}>
                <h1 suppressHydrationWarning style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, minWidth: 0, flex: '0 1 auto', letterSpacing: '-0.015em' }}>
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
                  {activeTab === 'registration' && 'Lead Registration'}
                  {activeTab === 'report' && 'Lead Registered Report'}
                  {activeTab === 'aiadmin' && 'AI Admin'}
                  {activeTab === 'aiknowledgebase' && 'AI Knowledge Base'}
                  {activeTab === 'callcenter' && 'Telecalling'}
                  {activeTab === 'calladmin' && 'Call Admin'}
                  {activeTab === 'aicallcenter' && 'AI Call Center'}
                  {activeTab === 'team' && 'Team Management'}
                  {activeTab === 'user_management_new' && 'User Management'}
                  {activeTab === 'client_registration' && 'Client Registration'}
                  {activeTab === 'client_report' && 'Client Report'}
                  {activeTab === 'workplace' && (
                    workflowSubTab === 'tracker'
                      ? 'Workflow Builder • Live Working Tracker'
                      : workflowSubTab === 'trash'
                        ? 'Workflow Builder • Trash Bin'
                        : 'Workflow Builder • Active Workflows'
                  )}
                  {activeTab === 'public_users' && 'Public Applicants'}
                  {activeTab === 'party' && (PARTY_SUBTAB_TITLES[partySubTab] ? `Party Master • ${PARTY_SUBTAB_TITLES[partySubTab]}` : 'Fully Managed Party Master')}
                  {(activeTab === 'channel_ops' || activeTab === 'channel-operations') && (CHANNEL_OPS_SUBTAB_TITLES[channelOpsSubTab] ? `Daily Order Follow-up • ${CHANNEL_OPS_SUBTAB_TITLES[channelOpsSubTab]}` : 'Daily Order Follow-up')}
                  {activeTab === 'location_territory' && 'Universal Location & Territory Master'}
                  {activeTab === 'location_master' && 'Central Location Master'}
                  {activeTab === 'whatsapp_official' && 'WhatsApp Official'}
                  {activeTab === 'whatsapp_unofficial' && 'WhatsApp UnOfficial'}
                  {activeTab === 'sms_config' && 'SMS Config'}
                  {activeTab === 'rcs_config' && 'RCS Config'}
                  {activeTab === 'email_config' && 'Email Config'}
                  {activeTab === 'admin_message_config' && 'Admin Messaging Config'}
                  {activeTab === 'settings' && 'Enterprise Settings'}
                  {(activeTab === 'saas_master' || activeTab === 'saas_studio') && (
                    saasSubTab === 'pricing' ? '👑 SaaS Master — Dynamic Pricing & Catalog' :
                    saasSubTab === 'billing' ? '👑 SaaS Master — Master Invoices & Billing Ledger' :
                    '👑 SaaS Master — Client Workspaces & Subscriptions'
                  )}
                  {activeTab === 'config_master' && (
                    configMasterSubTab === 'notifications' ? '⚙️ Config Master — User Notifications' :
                    configMasterSubTab === 'messages' ? '⚙️ Config Master — Platform Messaging & OTPs' :
                    configMasterSubTab === 'status' ? '⚙️ Config Master — System Health & Server Logs' :
                    configMasterSubTab === 'automation' ? '⚙️ Config Master — Automation & Webhook API' :
                    configMasterSubTab === 'navigation' ? '⚙️ Config Master — Page Navigation Rules' :
                    configMasterSubTab === 'offline_rule' ? '⚙️ Config Master — Offline Rules & Sync Policy' :
                    '⚙️ Config Master — Public User Management'
                  )}
                  {!['dashboard', 'leads', 'orders', 'mrp', 'mrp_against', 'recruiter', 'joining', 'attendance', 'checklist', 'delegation', 'registration', 'report', 'aiadmin', 'aiknowledgebase', 'callcenter', 'calladmin', 'aicallcenter', 'team', 'user_management_new', 'client_registration', 'client_report', 'workplace', 'public_users', 'party', 'channel_ops', 'channel-operations', 'location_territory', 'location_master', 'whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config', 'admin_message_config', 'settings', 'saas_master', 'saas_studio', 'config_master'].includes(activeTab) && (
                    activeTab ? activeTab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Dashboard'
                  )}
                </h1>
              </div>
            )}

            {activeTab !== 'ai' && (
              <div className="desktop-only" style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-light)', margin: '0 0.4rem', flexShrink: 0 }}></div>
            )}

            {/* Desktop Intelligent Global Spotlight Search Trigger */}
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="global-search-trigger-btn desktop-only"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '0.36rem 0.65rem',
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
              <Search size={14} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
              <span className="desktop-only-text" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Search CRM...
              </span>
              <kbd className="desktop-only" style={{
                fontSize: '0.68rem',
                padding: '0.12rem 0.38rem',
                borderRadius: '6px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)',
                fontWeight: 700,
                lineHeight: 1,
                boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
                flexShrink: 0
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
              <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', marginRight: '0.25rem', flexShrink: 0 }}>
                <select 
                  value={adminCompanyFilter} 
                  onChange={(e) => setAdminCompanyFilter(e.target.value)}
                  title="Filter by Company: NSMLR & NSTLP"
                  style={{ padding: '0.38rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600, outline: 'none', cursor: 'pointer', flexShrink: 0 }}
                >
                  {(() => {
                    if (!isSwanWorkspace && userCompany) {
                      return <option value={userCompany}>{userCompany}</option>;
                    }
                    return (
                      <>
                        <option value="All">🏢 All Companies</option>
                        <option value="NSMLR">NSMLR</option>
                        <option value="NSTLP">NSTLP</option>
                      </>
                    );
                  })()}
                </select>
              </div>
            )}

            {/* Softphone Launcher Button (Square Button Box) */}
            {isCallingEntitled && (
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
            )}

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
            <OfflineSyncCenter onSyncComplete={handleOfflineSyncComplete} />

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
                          applyTheme(theme.id);
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
                  <span style={{ fontSize: '0.66rem', color: isMasterAdmin ? '#d97706' : 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: isMasterAdmin ? 700 : 500 }}>
                    {isMasterAdmin ? '👑 Master Admin' : userRole}
                  </span>
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
                      <span style={{ fontWeight: 700, color: isMasterAdmin ? '#854d0e' : 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {isMasterAdmin ? '👑 Master Admin' : userRole}
                      </span>
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
                          onChange={(e) => applyTheme(e.target.value)}
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
            padding: activeTab === 'ai' ? '0' : 'var(--content-padding, 0.5rem)', 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            overflow: (activeTab === 'ai' || activeTab === 'leads') ? 'hidden' : 'auto'
          }}
        >
          
        <div 
          style={{ 
            flex: 1, 
            minHeight: 0, 
            overflowY: (activeTab === 'ai' || activeTab === 'leads') ? 'hidden' : 'auto', 
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
            <WorkspaceSkeleton variant={activeTab === 'leads' ? 'table' : 'default'} />
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
            <React.Suspense fallback={<WorkspaceSkeleton variant={activeTab === 'leads' ? 'table' : 'default'} />}>
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
                    moduleAccess={moduleAccess}
                    isSyncing={isSyncing}
                    syncLoadedCount={syncLoadedCount}
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
                  {loadingLeads && (!leads || leads.length === 0) ? (
                    <WorkspaceSkeleton variant="table" />
                  ) : (
                    <React.Profiler id="lead-table" onRender={(_id, phase, duration) => {
                      markLeadStartupTiming('table-render', { renderPhase: phase, durationMs: Math.round(duration), sourceCount: leads.length });
                    }}>
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
                    </React.Profiler>
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
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
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
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
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
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
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
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
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
                    onRegistrationSuccess={(newLeads) => {
                      if (newLeads) {
                        handleLeadsChange(newLeads);
                      }
                      handleTabChange('report');
                    }} 
                    canWrite={canWrite} 
                    teamMembers={teamMembers}
                    userCompany={userCompany}
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
                  <AiAssistantModule 
                    userRole={userRole} 
                    userId={userId} 
                    lastScreenCapture={lastScreenCapture}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Admin */}
              <KeepAliveTab 
                isActive={activeTab === 'aiadmin'} 
                isVisited={isTabPermitted('aiadmin', moduleAccess, userRole) && visitedTabs.has('aiadmin')}
              >
                <ErrorBoundary>
                  <AiAdminModule 
                    userRole={userRole}
                    userId={userId}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* AI Knowledge Base */}
              <KeepAliveTab 
                isActive={activeTab === 'aiknowledgebase'} 
                isVisited={isTabPermitted('aiknowledgebase', moduleAccess, userRole) && visitedTabs.has('aiknowledgebase')}
              >
                <ErrorBoundary>
                  <AIKnowledgeBaseModule 
                    userRole={userRole}
                    userId={userId}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Call Center */}
              <KeepAliveTab 
                isActive={activeTab === 'callcenter'} 
                isVisited={isTabPermitted('callcenter', moduleAccess, userRole) && visitedTabs.has('callcenter')}
              >
                <ErrorBoundary>
                  <CallCenterModule userId={userId} userCompany={userCompany} tenantId={effectiveTenantId} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Call Admin */}
              <KeepAliveTab 
                isActive={activeTab === 'calladmin'} 
                isVisited={isTabPermitted('calladmin', moduleAccess, userRole) && (visitedTabs.has('calladmin') || activeTab === 'calladmin')}
              >
                <ErrorBoundary>
                  <CallAdminModule 
                    moduleAccess={moduleAccess} 
                    userRole={userRole} 
                    activeSubTab={callAdminSubTab}
                    onSubTabChange={handleCallAdminSubTabChange}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    isMasterAdmin={isMasterAdmin}
                  />
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
                  <TeamManagement initialUsers={teamMembers} currentUserCompany={userCompany} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* User Management (New Preview) */}
              <KeepAliveTab 
                isActive={activeTab === 'user_management_new'} 
                isVisited={isTabPermitted('user_management_new', moduleAccess, userRole) && (visitedTabs.has('user_management_new') || activeTab === 'user_management_new')}
              >
                <ErrorBoundary>
                  <UserManagementContainer 
                    initialUsers={teamMembers} 
                    activeSubTab={userManagementSubTab} 
                    onTabChange={handleUserManagementSubTabChange} 
                    tenantId={effectiveTenantId}
                    tenantEntitlements={effectiveTenantEntitlements}
                    isAdmin={isAdmin || isMasterAdmin}
                    isMasterAdmin={isMasterAdmin}
                    userId={userId}
                    userEmail={userEmail}
                    currentUserCompany={(() => {
                      const compLower = String(userCompany || '').toLowerCase().trim();
                      if (userCompany && !SWAN_COMPANIES.includes(compLower)) {
                        return userCompany;
                      }
                      if (adminCompanyFilter && adminCompanyFilter !== 'All') {
                        return adminCompanyFilter;
                      }
                      return userCompany || 'New Swan Group';
                    })()}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Workplace (Master Admin Only) */}
              <KeepAliveTab 
                isActive={activeTab === 'workplace'} 
                isVisited={isMasterAdmin && (visitedTabs.has('workplace') || activeTab === 'workplace')}
              >
                <ErrorBoundary>
                  {isMasterAdmin ? (
                    <UniversalWorkplaceModule 
                      moduleAccess={moduleAccess} 
                      userRole={userRole} 
                      initialSubTab={workflowSubTab} 
                      onSubTabChange={handleWorkflowSubTabChange} 
                    />
                  ) : null}
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Party Master */}
              <KeepAliveTab 
                isActive={activeTab === 'party'} 
                isVisited={isTabPermitted('party', moduleAccess, userRole) && (visitedTabs.has('party') || activeTab === 'party')}
              >
                <ErrorBoundary>
                  <PartyMasterModule 
                    initialSubTab={partySubTab}
                    activeSubTab={partySubTab}
                    onSubTabChange={(tab) => handlePartySubTabChange(tab)}
                    onNavigateToChannelOps={(tab) => handleChannelOpsSubTabChange(tab)}
                    userRole={userRole}
                    moduleAccess={moduleAccess}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    userName={userName}
                    userEmail={userEmail}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Channel Operations */}
              <KeepAliveTab 
                isActive={activeTab === 'channel_ops' || activeTab === 'channel-operations'} 
                isVisited={isTabPermitted('channel_ops', moduleAccess, userRole) && (visitedTabs.has('channel_ops') || visitedTabs.has('channel-operations') || activeTab === 'channel_ops' || activeTab === 'channel-operations')}
              >
                <ErrorBoundary>
                  <ChannelOperationsModule 
                    initialSubTab={channelOpsSubTab}
                    activeSubTab={channelOpsSubTab}
                    onSubTabChange={(tab) => handleChannelOpsSubTabChange(tab)}
                    userRole={userRole}
                    moduleAccess={moduleAccess}
                    userCompany={userCompany}
                    tenantId={effectiveTenantId}
                    userName={userName}
                    userId={userId}
                  />
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
                  <WhatsappOfficial moduleAccess={moduleAccess} userRole={userRole} userCompany={userCompany} isMasterAdmin={isMasterAdmin} />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* WhatsApp Unofficial */}
              <KeepAliveTab 
                isActive={activeTab === 'whatsapp_unofficial'} 
                isVisited={isTabPermitted('whatsapp_unofficial', moduleAccess, userRole) && visitedTabs.has('whatsapp_unofficial')}
              >
                <ErrorBoundary>
                  <WhatsappUnofficialModule 
                    userRole={userRole} 
                    userId={userId} 
                    moduleAccess={moduleAccess} 
                    isMasterAdmin={isMasterAdmin} 
                    tenantId={effectiveTenantId} 
                  />
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
                  <EmailConfigModule 
                    moduleAccess={moduleAccess} 
                    userRole={userRole} 
                    userCompany={userCompany} 
                    isMasterAdmin={isMasterAdmin} 
                    initialTab={emailSubTab}
                    onSubTabChange={(sub) => {
                      setEmailSubTab(sub);
                      window.history.pushState(null, '', `/email-config?tab=${sub}`);
                    }}
                  />
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
                  <SettingsContainer 
                    moduleAccess={moduleAccess} 
                    userRole={userRole} 
                    userCompany={(() => {
                      const compLower = String(userCompany || '').toLowerCase().trim();
                      if (userCompany && !SWAN_COMPANIES.includes(compLower)) {
                        return userCompany;
                      }
                      if (adminCompanyFilter && adminCompanyFilter !== 'All') {
                        return adminCompanyFilter;
                      }
                      return userCompany || 'New Swan Group';
                    })()} 
                    isMasterAdmin={isMasterAdmin}
                    currentSubTab={currentSettingSubTab}
                    onSubTabChange={handleSettingSubTabChange}
                  />
                </ErrorBoundary>
              </KeepAliveTab>

              {/* SaaS Master (Multi-Tenant & Master Billing - Strictly Master Admin) */}
              <KeepAliveTab 
                isActive={activeTab === 'saas_master' || activeTab === 'saas_studio'} 
                isVisited={isMasterAdmin && (visitedTabs.has('saas_master') || visitedTabs.has('saas_studio') || activeTab === 'saas_master' || activeTab === 'saas_studio')}
              >
                <ErrorBoundary>
                  {isMasterAdmin ? (
                    <SuperAdminSaasPanel 
                      initialTab={saasSubTab}
                      activeSubTab={saasSubTab}
                      onSubTabChange={handleSaasSubTabChange}
                    />
                  ) : null}
                </ErrorBoundary>
              </KeepAliveTab>

              {/* Config Master (Platform Technical Configuration - Strictly Master Admin) */}
              <KeepAliveTab 
                isActive={activeTab === 'config_master'} 
                isVisited={isMasterAdmin && (visitedTabs.has('config_master') || activeTab === 'config_master')}
              >
                <ErrorBoundary>
                  {isMasterAdmin ? (
                    <ConfigMasterPanel 
                      initialTab={configMasterSubTab}
                      activeSubTab={configMasterSubTab}
                      onSubTabChange={handleConfigMasterSubTabChange}
                      userRole={userRole || 'admin'}
                      moduleAccess={moduleAccess}
                    />
                  ) : null}
                </ErrorBoundary>
              </KeepAliveTab>
            </React.Suspense>
          )}
        </div>
        </div>
      </main>
      {isCallingEntitled && <GlobalSoftphoneWidget userId={userId} />}
      {userId && <ErrorBoundary key={`broadcast-${userId}`} fallback={null}><BroadcastNotificationReceiver key={userId} userId={userId} /></ErrorBoundary>}

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
