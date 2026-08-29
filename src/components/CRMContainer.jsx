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
import { Database, LayoutDashboard, Users, Settings, Bell, Search, Shield, LogOut, FilePlus2, FileSpreadsheet, CheckCircle, Archive, FileText, PieChart, UserPlus, MessageCircle, ChevronDown, ChevronRight, ChevronLeft, Menu, Palette, Check, Bot, PhoneCall, Phone, BookOpen, Building2, MapPin, Globe, ShieldCheck, Camera, User, Upload, Loader2, Trash2, Calendar, Clock, AlertTriangle, AlertCircle, X, ExternalLink, CheckSquare } from 'lucide-react';
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
import { saveLeadsLocally, getLocalLeads } from '@/utils/offlineSync';

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
  impersonatedUser = null
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
  const [activeTab, setActiveTab] = useState(() => {
    let path = pathname.replace('/', '');
    if (!path) path = searchParams?.get('tab');
    
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
  const [checklistSubTab, setChecklistSubTab] = useState('my_checklists');
  const [delegationMenuExpanded, setDelegationMenuExpanded] = useState(false);
  const [delegationSubTab, setDelegationSubTab] = useState('to_me');
  const [settingsMenuExpanded, setSettingsMenuExpanded] = useState(false);
  const [currentSettingSubTab, setCurrentSettingSubTab] = useState('business');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      const param = search.get('setting');
      if (param) {
        setCurrentSettingSubTab(param);
      }
      const attTab = search.get('tab') || search.get('subtab');
      if (attTab && (pathname === '/attendance' || pathname === 'attendance')) {
        setAttendanceSubTab(attTab);
      }
      if (attTab && (pathname === '/checklist' || pathname === 'checklist')) {
        setChecklistSubTab(attTab);
      }
      if (attTab && (pathname === '/delegation' || pathname === 'delegation')) {
        setDelegationSubTab(attTab);
      }
    }
  }, [pathname]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [globalRolePermissions, setGlobalRolePermissions] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [impersonationInfo, setImpersonationInfo] = useState(null);
  const [adminRestoreToken, setAdminRestoreToken] = useState(null);

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

    // Sync latest avatar from Supabase Auth across all devices
    supabase.auth.getUser().then(({ data }) => {
      const liveAvatar = data?.user?.user_metadata?.avatar_url;
      if (liveAvatar) {
        setUserAvatar(liveAvatar);
        if (userId) localStorage.setItem(`crm_user_avatar_${userId}`, liveAvatar);
        localStorage.setItem('crm_user_avatar', liveAvatar);
      }
    }).catch(() => {});
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
    
    // Initial track
    trackSession();

    // Check validity & heartbeat every 20 seconds
    const interval = setInterval(trackSession, 20 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch user email & metadata avatar
  useEffect(() => {
    async function fetchUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
        if (user?.user_metadata?.avatar_url) {
          setUserAvatar(user.user_metadata.avatar_url);
          localStorage.setItem(`crm_user_avatar_${user.id}`, user.user_metadata.avatar_url);
          localStorage.setItem('crm_user_avatar', user.user_metadata.avatar_url);
        }
      } catch (err) {
        console.warn('Error fetching auth user in CRMContainer:', err);
      }
    }
    fetchUser();
  }, []);
  
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
      setLoadingLeads(true);
      setIsSyncing(true);
      const supabase = createClient();
      
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
          return [{ ...payload.new, lead_notes: [] }, ...current];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => current.map(item => item.id === payload.new.id ? { ...item, ...payload.new, lead_notes: item.lead_notes || [] } : item));
        setLeads((current) => current.map(item => item.id === payload.new.id ? { ...item, ...payload.new, lead_notes: item.lead_notes || [] } : item));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => current.filter(item => item.id !== payload.old.id));
        setLeads((current) => current.filter(item => item.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes' }, (payload) => {
        const incoming = payload.new;
        setRawLeads((current) => current.map(item => {
          if (item.id !== incoming.lead_id) return item;
          const existingNotes = item.lead_notes || [];
          if (existingNotes.some(n => n.id === incoming.id)) return item;
          return { ...item, lead_notes: [incoming, ...existingNotes] };
        }));
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
    const path = window.location.pathname.replace('/', '');
    const params = new URLSearchParams(window.location.search);
    let tab = path || params.get('tab');
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
      let tab = window.location.pathname.replace('/', '');
      const params = new URLSearchParams(window.location.search);
      if (!tab) tab = params.get('tab');
      
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

  // Sync browser document title for SuPuja Creations & AI Chatbot
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = activeTab === 'ai' ? 'AI Chatbot | SuPuja Creations' : 'SuPuja Creations';
    }
  }, [activeTab]);

  useEffect(() => {
    const currentDueKeys = dueFollowUps.map(lead => `${lead.id}:${lead.follow_up_date}`);

    // If sync or initial lead loading is active, update baseline keys without playing audio
    if (isSyncing || loadingLeads) {
      currentDueKeys.forEach(k => notifiedFollowUpKeysRef.current.add(k));
      prevDueCount.current = dueFollowUps.length;
      return;
    }

    // First check after sync finishes — establish baseline count and keys without playing sound
    if (!initialSyncFinishedRef.current) {
      initialSyncFinishedRef.current = true;
      currentDueKeys.forEach(k => notifiedFollowUpKeysRef.current.add(k));
      prevDueCount.current = dueFollowUps.length;
      return;
    }

    // Check for genuinely NEW due follow-up items after initial load baseline
    let hasNewNotification = false;
    for (const key of currentDueKeys) {
      if (!notifiedFollowUpKeysRef.current.has(key)) {
        notifiedFollowUpKeysRef.current.add(key);
        hasNewNotification = true;
      }
    }

    if (hasNewNotification) {
      try {
        let playedCustom = false;
        
        // Stop any currently playing notification audio instance to avoid overlapping sound
        if (notificationAudioRef.current) {
          try {
            notificationAudioRef.current.pause();
            notificationAudioRef.current.currentTime = 0;
          } catch (e) {}
        }

        // Try to load custom sound from config
        const savedConfig = localStorage.getItem('crm_config');
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          if (config.alertSound) {
            const audio = new Audio(config.alertSound);
            notificationAudioRef.current = audio;
            
            if (config.alertDuration && !isNaN(config.alertDuration)) {
              const durationMs = parseInt(config.alertDuration) * 1000;
              audio.play().then(() => {
                setTimeout(() => {
                  try {
                    audio.pause();
                    audio.currentTime = 0;
                  } catch (e) {}
                }, durationMs);
              }).catch(() => { /* Browser blocked auto-play */ });
            } else {
              audio.play().catch(() => { /* Browser blocked auto-play */ });
            }
            playedCustom = true;
          }
        }
        
        // Fallback to double-beep oscillator if no custom sound
        if (!playedCustom) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
          
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
          gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          osc.start();
          osc.stop(ctx.currentTime + 3.0);
        }
      } catch (err) {
        console.error('Audio play failed', err);
      }
    }
    prevDueCount.current = dueFollowUps.length;
  }, [dueFollowUps, isSyncing, loadingLeads]);

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
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', alignItems: 'center', position: 'relative', padding: isSidebarCollapsed ? '1rem 0.5rem' : '0.85rem 1rem' }}>
          <div 
            onClick={() => { if (isSidebarCollapsed) setIsSidebarCollapsed(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', minWidth: 0, cursor: isSidebarCollapsed ? 'pointer' : 'default', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', width: isSidebarCollapsed ? '100%' : 'auto' }}
            title={isSidebarCollapsed ? "Click to expand sidebar" : undefined}
          >
            <img 
              src="/supuja-logo.png" 
              alt="SuPuja Creations" 
              style={{ width: isSidebarCollapsed ? '38px' : '34px', height: isSidebarCollapsed ? '38px' : '34px', borderRadius: '8px', objectFit: 'contain', background: '#fff', padding: '2px', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }} 
            />
            {!isSidebarCollapsed && (
              <div className="sidebar-brand-text" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
                <span className="sidebar-title" style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent-color)', letterSpacing: '-0.01em', margin: 0 }}>SuPuja</span>
                <div className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Creations</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', opacity: 0.85, fontWeight: 500 }}>v{pkg.version || '1.0.228'}</span>
                </div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="sidebar-collapse-toggle desktop-only-icon"
            style={{
              background: isSidebarCollapsed ? 'var(--bg-surface)' : 'none',
              border: isSidebarCollapsed ? '1px solid var(--border-light)' : 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isSidebarCollapsed ? '0.25rem' : '0.25rem',
              borderRadius: isSidebarCollapsed ? '50%' : '4px',
              position: isSidebarCollapsed ? 'absolute' : 'static',
              right: isSidebarCollapsed ? '-10px' : 'auto',
              top: isSidebarCollapsed ? '50%' : 'auto',
              transform: isSidebarCollapsed ? 'translateY(-50%)' : 'none',
              boxShadow: isSidebarCollapsed ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
              zIndex: 25,
              width: isSidebarCollapsed ? '22px' : 'auto',
              height: isSidebarCollapsed ? '22px' : 'auto'
            }}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={18} />}
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
                      📊 Compliance & Audit
                    </button>
                  )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
            <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            
            {activeTab !== 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.25rem', minWidth: 0 }}>
                <h1 style={{ fontSize: '1.02rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px', margin: 0 }}>
                  {activeTab === 'dashboard' && 'Analytics Dashboard'}
                  {activeTab === 'leads' && (
                    leadsFilterStage === 'hourly_work' 
                      ? 'Hourly Work Report'
                      : (leadsFilterStage === 'lead_dashboard' || leadsFilterStage === 'dashboard' 
                        ? 'Lead Dashboard' 
                        : (leadsFilterStage ? `Lead Data - ${leadsFilterStage}` : 'Lead Data - All Leads'))
                  )}
                  {activeTab === 'orders' && 'Order Management'}
                  {activeTab === 'mrp' && 'MRP System'}
                  {activeTab === 'mrp_against' && 'MRP Against'}
                  {activeTab === 'recruiter' && (
                    recruiterFilterStage === 'dashboard' ? 'Recruiter Dashboard' :
                    recruiterFilterStage === 'all_stages' ? 'Recruiter - All Stages' :
                    recruiterFilterStage ? `Recruiter - ${recruiterFilterStage}` : 'Recruiter'
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
                
                <span style={{ 
                  fontSize: '0.65rem', 
                  padding: '0.1rem 0.35rem', 
                  borderRadius: '4px', 
                  background: (userRole === 'admin' || userRole === 'Admin') ? '#fef08a' : '#e0f2fe', 
                  color: (userRole === 'admin' || userRole === 'Admin') ? '#854d0e' : '#0369a1', 
                  textTransform: 'uppercase', 
                  fontWeight: 'bold',
                  letterSpacing: '0.02em',
                  flexShrink: 0
                }}>
                  {userRole}
                </span>
              </div>
            )}

            {activeTab !== 'ai' && (
              <div className="desktop-only" style={{ width: '1.5px', height: '18px', backgroundColor: 'var(--border-light)', margin: '0 0.25rem' }}></div>
            )}

            {/* Intelligent Global Spotlight Search Trigger */}
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="global-search-trigger-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.35rem 0.6rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                transition: 'all 0.15s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                flexShrink: 0
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-color)';
                e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
              }}
              title="Quick Spotlight Search (Ctrl + K)"
            >
              <Search size={15} style={{ color: 'var(--accent-color)' }} />
              <span className="desktop-only-text" style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                Search CRM...
              </span>
              <kbd className="desktop-only" style={{
                fontSize: '0.68rem',
                padding: '0.1rem 0.35rem',
                borderRadius: '4px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                lineHeight: 1
              }}>
                Ctrl+K
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
                padding: '0.2rem 0.6rem',
                borderRadius: '20px',
                fontWeight: '500'
              }}>
                <svg className="animate-spin" style={{ width: '12px', height: '12px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
                </svg>
                Syncing leads: {syncLoadedCount} / {syncTotalCount || '...'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', flexShrink: 0 }}>
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
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title="Toggle CRM Softphone"
            >
              <PhoneCall size={18} />
            </button>

            {/* Notifications Button (Square Button Box) */}
            <div style={{ position: 'relative' }} ref={notificationMenuRef}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="header-icon-btn"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: showNotifications ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: showNotifications ? 'var(--accent-color)' : 'var(--text-primary)',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  position: 'relative'
                }}
                title="Notifications"
              >
                <Bell size={18} />
                {dueFollowUps.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-8px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 5px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid var(--bg-surface)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    lineHeight: 1,
                    whiteSpace: 'nowrap'
                  }}>
                    {dueFollowUps.length}
                  </div>
                )}
              </button>

              {showNotifications && (
                <div style={{
                  position: 'fixed',
                  top: '60px',
                  bottom: '10px',
                  right: '12px',
                  width: '460px',
                  maxWidth: 'calc(100vw - 24px)',
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
                    padding: '0.9rem 1.1rem',
                    borderBottom: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        Follow-up Tasks Due
                      </span>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--accent-color)',
                        color: '#fff',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px'
                      }}>
                        {categorizedFollowUps.all.length} Total
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.3rem', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                      title="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>

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
                            onClick={() => {
                              const targetStage = getStageFromStatus(lead.status);
                              setActiveTab('leads');
                              handleStageChange(targetStage);
                              setActiveSearchQuery(lead.lead_ref_id || lead.name || lead.phone);
                              setShowNotifications(false);
                            }}
                          >
                            {/* Card Top: ID, Status & Date Badge */}
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

                            {/* Card Middle: Company / Client Name */}
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.company || lead.name || 'Unnamed Client'}
                              {lead.company && lead.name && lead.company !== lead.name && (
                                <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
                                  ({lead.name})
                                </span>
                              )}
                            </div>

                            {/* Card Bottom: Phone, District & Call/WA Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {phone ? (
                                  <span>📞 {phone}</span>
                                ) : (
                                  <span style={{ fontStyle: 'italic', opacity: 0.7 }}>No phone</span>
                                )}
                                {lead.district_name && <span>• {lead.district_name}</span>}
                              </div>

                              {phone && (
                                <div style={{ display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
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
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: showThemeMenu ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: showThemeMenu ? 'var(--accent-color)' : 'var(--text-primary)',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
                title="Change Color Theme"
              >
                <Palette size={18} />
              </button>

              {showThemeMenu && (
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '220px', maxWidth: 'calc(100vw - 32px)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', zIndex: 10000, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: '600', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    Select Theme
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                          padding: '0.75rem 1rem',
                          background: currentTheme === theme.id ? 'var(--nav-active-bg)' : 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontSize: '0.85rem',
                          color: currentTheme === theme.id ? 'var(--accent-color)' : 'var(--text-primary)',
                          fontWeight: currentTheme === theme.id ? '600' : '400',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = currentTheme === theme.id ? 'var(--nav-active-bg)' : 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{theme.icon}</span>
                          <span>{theme.name}</span>
                        </div>
                        {currentTheme === theme.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Unified User Profile Button with Photo & Dropdown */}
            <div style={{ position: 'relative' }} ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.6rem 0.25rem 0.25rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: showProfileMenu ? 'var(--nav-active-bg)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  minHeight: '38px'
                }}
                title="User Profile"
              >
                {/* Avatar / Photo */}
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--accent-color)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  {userAvatar ? (
                    <img src={userAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    userName ? userName.charAt(0).toUpperCase() : 'U'
                  )}
                </div>

                {/* User Details (Desktop) */}
                <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', marginRight: '0.25rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.1 }}>{userName || 'User'}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{userRole}</span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
              </button>
              
              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '280px',
                  maxWidth: 'calc(100vw - 32px)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '14px',
                  boxShadow: '0 15px 30px -5px rgba(0,0,0,0.2)',
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
        <div className="page-content" style={{ padding: activeTab === 'ai' ? '0' : 'var(--content-padding, 2rem)', display: 'flex', flexDirection: 'column', height: '100%' }}>
          




        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {(!canRead && activeTab === 'leads') ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <h2 style={{ color: 'var(--text-secondary)' }}>You do not have permission to view leads.</h2>
            </div>
          ) : !isMounted ? (
            <PremiumProgressLoader message="Loading workspace" active={!isMounted} />
          ) : (
            <>
              {/* Dashboard */}
              <KeepAliveTab 
                isActive={activeTab === 'dashboard'} 
                isVisited={isTabPermitted('dashboard', moduleAccess, userRole) && visitedTabs.has('dashboard')}
              >
                <ErrorBoundary>
                  <AnalyticsDashboard leads={leads} teamMembers={teamMembers} />
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
                    <LeadTable initialData={leads} canImportExport={canImportExport} canWrite={canWrite} onLeadsChange={handleLeadsChange} searchQuery={activeSearchQuery} stageFilter={leadsFilterStage} onStageChange={handleStageChange} teamMembers={teamMembers} userRole={userRole} userId={userId} userName={userName} moduleAccess={moduleAccess} globalRolePermissions={globalRolePermissions} />
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
                  <ClientRegistration onRegistrationSuccess={() => handleTabChange('report')} canWrite={canWrite} />
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
    </div>
  );
}
