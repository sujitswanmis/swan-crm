'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { Database, LayoutDashboard, Users, Settings, Bell, Search, Shield, LogOut, FilePlus2, FileSpreadsheet, CheckCircle, Archive, FileText, PieChart, UserPlus, MessageCircle, ChevronDown, ChevronRight, ChevronLeft, Menu, Palette, Check, Bot, PhoneCall, Phone, BookOpen } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getTeamMembers } from '@/app/actions/team';
import html2canvas from 'html2canvas';
import SettingsContainer from './Settings/SettingsContainer';
import ErrorBoundary from '@/components/ErrorBoundary';

const MODULES_CONFIG = [
  { id: 'registration', label: 'New Client Registration', category: 'Sales', icon: <UserPlus size={20} /> },
  { id: 'report', label: 'Client Registered Report', category: 'Sales', icon: <FileText size={20} /> },
  { id: 'leads', label: 'Lead Data', category: 'Sales', icon: <Users size={20} /> },
  { id: 'orders', label: 'Order', category: 'Sales', icon: <CheckCircle size={20} /> },
  { id: 'mrp', label: 'MRP', category: 'Purchase', icon: <Archive size={20} /> },
  { id: 'mrp_against', label: 'MRP Against', category: 'Purchase', icon: <FileText size={20} /> },
  { id: 'recruiter', label: 'Recruiter', category: 'Human Resource', icon: <Users size={20} /> },
  { id: 'joining', label: 'Joining Process', category: 'Human Resource', icon: <CheckCircle size={20} /> },
  { id: 'ai', label: 'New Swan AI', category: 'System', icon: <Bot size={20} /> },
];

const THEMES = [
  { id: 'default', name: 'Default', icon: '🔵' },
  { id: 'theme-light', name: 'Light', icon: '⚪' },
  { id: 'theme-dark', name: 'Dark', icon: '⚫' },
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

export default function CRMContainer({ initialLeads, userRole, canImportExport, canRead = true, canWrite = true, moduleAccess = {}, userId, userCompany, userName }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const supabase = createClient();
  
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [globalRolePermissions, setGlobalRolePermissions] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLoadedCount, setSyncLoadedCount] = useState(0);
  const [syncTotalCount, setSyncTotalCount] = useState(0);

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
  }, []);

  const [userEmail, setUserEmail] = useState('');
  const [leadDataExpanded, setLeadDataExpanded] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crm-sidebar-collapsed') === 'true';
    }
    return false;
  });
  const [expandedCategories, setExpandedCategories] = useState({
    'Sales': true,
    'Purchase': true,
    'Human Resource': true,
    'System': true
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
      setExpandedCategories(prev => {
        if (!prev[categoryToExpand]) {
          return { ...prev, [categoryToExpand]: true };
        }
        return prev;
      });
    }

    // Auto-expand submenus
    if (activeTab === 'leads') {
      setLeadDataExpanded(true);
    }
    if (['aiadmin', 'aiknowledgebase'].includes(activeTab)) {
      setAiMenuExpanded(true);
    }
    if (['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(activeTab)) {
      setMessageMenuExpanded(true);
    }
  }, [activeTab]);

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

  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('crm-theme') || 'default';
    setCurrentTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.className = '';
    if (currentTheme !== 'default') {
      document.documentElement.classList.add(currentTheme);
    }
    localStorage.setItem('crm-theme', currentTheme);
  }, [currentTheme]);

  // Click outside for theme menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setShowThemeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // Auto-track session for already logged-in users
  useEffect(() => {
    async function trackSession() {
      try {
        const { logUserSession } = await import('@/app/actions/audit');
        const device = navigator.userAgent;
        const res = await logUserSession(device); console.log('Auto session tracking result:', res);
      } catch (e) {
        console.error('Auto session tracking failed:', e);
      }
    }
    
    // Check if we've already tracked this session in this browser tab
    if (true) {
      trackSession();
      sessionStorage.setItem('session_tracked', 'true');
    }
  }, []);
  
  // Fetch user email
  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
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
  
  // Client-side fetch of all leads (Progressive Loading with sync tracking)
  useEffect(() => {
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

      let page = 0;
      const pageSize = 500; // Smaller chunk for faster initial render
      let hasMore = true;
      let loaded = 0;

      while (hasMore) {
        const { data, error } = await supabase
          .from('leads')
          .select(`*, lead_notes(id, created_at, note_text, created_by)`)
          .order('created_at', { ascending: false })
          .order('id')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) break;
        
        if (data && data.length > 0) {
          loaded += data.length;
          setSyncLoadedCount(loaded);
          if (loaded > total) {
            setSyncTotalCount(loaded);
          }
          // Append new chunk to existing leads
          setRawLeads(prev => {
            // Prevent duplicates just in case
            const existingIds = new Set(prev.map(l => l.id));
            const newUnique = data.filter(l => !existingIds.has(l.id));
            return [...prev, ...newUnique];
          });
        }
        
        // Turn off loading spinner as soon as the first chunk arrives
        if (page === 0) {
          setLoadingLeads(false);
        }

        if (!data || data.length < pageSize) {
          hasMore = false;
        }
        page++;
      }
      // Ensure loading is turned off even if there's no data
      setLoadingLeads(false);
      setIsSyncing(false);
    }
    loadLeads();

    // Setup Realtime Subscription for CRMContainer
    const channel = supabase
      .channel('crm_container_leads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => {
          if (current.some(item => item.id === payload.new.id)) return current;
          return [payload.new, ...current];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => current.map(item => item.id === payload.new.id ? { ...item, ...payload.new } : item));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => current.filter(item => item.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      setLeads(preFilteredLeads);
      return;
    }
    
    const leadsAccess = moduleAccess?.leads || {};
    
    // 3. If manager access or viewAll permission, see everything (within their company)
    if (leadsAccess.is_manager || globalRolePermissions?.viewAll) {
      setLeads(preFilteredLeads);
      return;
    }
    
    // Helper to map DB status to Team Management Stage format
    const getStageFromStatus = (status) => {
      if (!status) return '01 - New Stage';
      if (status.startsWith('1;')) return '01 - New Stage';
      if (status.startsWith('2;')) return '02 - Contact Stage';
      if (status.startsWith('3;')) return '03 - Qualification Stage';
      if (status.startsWith('4;')) return '04 - Follow Up Stage';
      if (status.startsWith('5;')) return '05 - Sales Process Stage';
      if (status.startsWith('6;')) return '06 - Conversion Stage';
      if (status.startsWith('7;')) return '07 - Final Stage';
      if (['New', 'Pending'].includes(status)) return '01 - New Stage';
      if (['Converted', 'Order Received', 'Closed'].includes(status)) return '07 - Final Stage';
      return '01 - New Stage';
    };

    // 4. If agent access, only see leads in assigned steps AND that are either open (null) or assigned to them
    const assignedSteps = leadsAccess.assigned_steps || [];
    if (assignedSteps.length > 0) {
      const filteredLeads = preFilteredLeads.filter(lead => {
        const leadStage = getStageFromStatus(lead.status);
        return assignedSteps.includes(leadStage) && 
               (lead.assigned_to === null || lead.assigned_to === undefined || lead.assigned_to === userId);
      });
      setLeads(filteredLeads);
    } else {
      // If view is true but no steps assigned, they see nothing
      setLeads([]);
    }
  }, [rawLeads, loadingLeads, moduleAccess, userRole, adminCompanyFilter, userCompany, userId]);

  // Handle local updates from child components so background fetches don't overwrite them
  const handleLeadsChange = (updatedFilteredLeads) => {
    setLeads(updatedFilteredLeads);
    setRawLeads(prevRaw => {
      const updatedMap = new Map(updatedFilteredLeads.map(l => [l.id, l]));
      return prevRaw.map(l => {
        if (updatedMap.has(l.id)) {
          // Merge the updated fields back into the raw lead
          return { ...l, ...updatedMap.get(l.id) };
        }
        return l;
      });
    });
  };

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScreenCapture, setLastScreenCapture] = useState(null);
  const [leadsFilterStage, setLeadsFilterStage] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlStage = new URLSearchParams(window.location.search).get('stage');
      if (urlStage) return urlStage === 'all' ? null : urlStage;
      return localStorage.getItem('crmActiveStage') || null;
    }
    return null;
  });

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
    
    // Sync initial route path and parameters on mount
    const path = window.location.pathname.replace('/', '');
    const params = new URLSearchParams(window.location.search);
    let tab = path || params.get('tab');
    if (tab) {
      setActiveTab(tab);
      let stage = params.get('stage');
      if (stage === 'all') stage = null;
      if (stage) setLeadsFilterStage(stage);
    }

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

    setActiveTab(tabId);
    
    const newPath = `/${tabId}`;

    // Reset stage filter if navigating away from leads
    if (tabId !== 'leads') {
      localStorage.setItem('crmActiveStage', '');
      setLeadsFilterStage(null);
    }
    
    // Update URL instantly using native History API with a clean slate
    window.history.pushState(null, '', newPath);
    
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleStageChange = (stage) => {
    setLeadsFilterStage(stage);
    
    const params = new URLSearchParams(window.location.search);
    if (stage) {
      params.set('stage', stage);
      localStorage.setItem('crmActiveStage', stage);
    } else {
      params.set('stage', 'all');
      localStorage.removeItem('crmActiveStage');
    }
    
    // Update URL instantly
    const queryString = params.toString() ? `?${params.toString()}` : '';
    window.history.pushState(null, '', `${window.location.pathname}${queryString}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Calculate upcoming or overdue follow-ups
  const dueFollowUps = leads.filter(lead => {
    if (!lead.follow_up_date || ['Converted', 'Closed', 'Order Received'].includes(lead.status)) return false;
    
    // Compare exact timestamps to trigger exactly on time
    const followUpTime = new Date(lead.follow_up_date).getTime();
    return followUpTime <= currentTime;
  });

  const prevDueCount = useRef(dueFollowUps.length);

  useEffect(() => {
    // If the number of due follow-ups increases, play notification sound
    if (dueFollowUps.length > prevDueCount.current) {
      try {
        let playedCustom = false;
        
        // Try to load custom sound from config
        const savedConfig = localStorage.getItem('crm_config');
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          if (config.alertSound) {
            const audio = new Audio(config.alertSound);
            
            // Handle custom duration logic if specified
            if (config.alertDuration && !isNaN(config.alertDuration)) {
              const durationMs = parseInt(config.alertDuration) * 1000;
              audio.play().then(() => {
                setTimeout(() => {
                  audio.pause();
                  audio.currentTime = 0;
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
  }, [dueFollowUps.length]);

  if (userRole === 'customer') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'linear-gradient(135deg, #020617 0%, #0b1329 50%, #030712 100%)' }}>
        <header style={{ height: '64px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.4rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={20} />
            </div>
            <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>Swan Customer Assistant</span>
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
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
            <Database size={24} style={{ flexShrink: 0 }} />
            <span className="sidebar-title" style={{ fontWeight: 700, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>CRM Enterprise</span>
          </div>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="sidebar-collapse-toggle desktop-only-icon"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.25rem', borderRadius: '4px' }}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
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

          {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['new_swan_ai']?.view) && (
            <button 
              onClick={() => handleTabChange('ai')}
              className="nav-item" 
              data-active={activeTab === 'ai'}
              title={isSidebarCollapsed ? "New Swan AI" : undefined}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <Bot size={20} style={{ flexShrink: 0 }} />
              <span>New Swan AI</span>
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
                  <span>{category}</span>
                  {expandedCategories[category] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {(isSidebarCollapsed || expandedCategories[category]) && (
                  visibleModules.map(module => (
                    <div key={module.id} style={{ display: 'contents' }}>
                      <button 
                        onClick={() => { 
                          if (module.id === 'leads') {
                            if (isSidebarCollapsed) {
                              setIsSidebarCollapsed(false);
                              setLeadDataExpanded(true);
                            } else {
                              setLeadDataExpanded(!leadDataExpanded);
                            }
                          } else {
                            handleTabChange(module.id); 
                          }
                        }}
                        className="nav-item" 
                        data-active={activeTab === module.id}
                        title={isSidebarCollapsed ? module.label : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {React.cloneElement(module.icon, { style: { flexShrink: 0 } })}
                          <span>{module.label}</span>
                        </div>
                        {module.id === 'leads' && (
                          <span className="nav-chevron">
                            {leadDataExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                        )}
                      </button>
                      
                      {module.id === 'leads' && (
                        <div className="submenu-list" style={{ display: leadDataExpanded ? 'flex' : 'none' }}>
                          <button
                            onClick={() => { handleTabChange('leads'); handleStageChange(null); }}
                            className="submenu-item"
                            data-active={activeTab === 'leads' && leadsFilterStage === null}
                          >
                            All Leads
                          </button>

                          {['01 - New Stage', '02 - Contact Stage', '03 - Qualification Stage', '04 - Follow Up Stage', '05 - Sales Process Stage', '06 - Conversion Stage', '07 - Final Stage'].map(stage => {
                            const leadsAccess = moduleAccess?.leads || {};
                            const isAdmin = userRole === 'admin' || userRole === 'Admin';
                            const isManager = leadsAccess.is_manager;
                            const isAssigned = (leadsAccess.assigned_steps || []).includes(stage);
                            
                            if (!isAdmin && !isManager && !isAssigned) {
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
                      )}
                    </div>
                  ))
                )}
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
                  <span>System</span>
                  {expandedCategories['System'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {(isSidebarCollapsed || expandedCategories['System']) && (
                  <>
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
                      <div style={{ display: 'contents' }}>
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
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Bot size={20} style={{ flexShrink: 0 }} />
                            <span>AI Admin</span>
                          </div>
                          <span className="nav-chevron">
                            {aiMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                        </button>
                        
                        <div className="submenu-list" style={{ display: aiMenuExpanded ? 'flex' : 'none' }}>
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
                      <div style={{ display: 'contents' }}>
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
                          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <MessageCircle size={20} style={{ flexShrink: 0 }} />
                            <span>Message Config</span>
                          </div>
                          <span className="nav-chevron">
                            {messageMenuExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                        </button>
                        
                        <div className="submenu-list" style={{ display: messageMenuExpanded ? 'flex' : 'none' }}>
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
                    )}

                    {/* Settings */}
                    {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['settings']?.view || globalRolePermissions?.editSettings) && (
                      <button 
                        onClick={() => handleTabChange('settings')}
                        className="nav-item" 
                        data-active={activeTab === 'settings'}
                        title={isSidebarCollapsed ? "Settings" : undefined}
                        style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                      >
                        <Settings size={20} style={{ flexShrink: 0 }} />
                        <span>Settings</span>
                      </button>
                    )}
                  </>
                )}
              </div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header" style={{ position: 'relative' }}>
          {isSyncing && (
            <div 
              className="sync-progress-bar" 
              style={{ 
                width: `${syncTotalCount > 0 ? (syncLoadedCount / syncTotalCount) * 100 : 0}%` 
              }} 
              title={`Syncing Leads: ${syncLoadedCount}/${syncTotalCount}`}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)' }}>
            <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <Search size={20} className="desktop-only-icon" />
            <span style={{ fontSize: '0.9rem' }} className="desktop-only-text">Search leads (Cmd+K)</span>
            {isSyncing && (
              <span style={{ 
                fontSize: '0.75rem', 
                color: 'var(--accent-color)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4rem',
                backgroundColor: 'var(--nav-active-bg)',
                padding: '0.2rem 0.6rem',
                borderRadius: '20px',
                fontWeight: '500'
              }} className="skeleton-glow">
                <svg className="animate-spin" style={{ width: '12px', height: '12px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
                </svg>
                Syncing leads: {syncLoadedCount} / {syncTotalCount || '...'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative' }}>
            {/* Admin Company Filter */}
            {(userRole === 'admin' || userRole === 'Admin') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Company:</span>
                <select 
                  value={adminCompanyFilter} 
                  onChange={(e) => setAdminCompanyFilter(e.target.value)}
                  style={{ padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', outline: 'none' }}
                >
                  <option value="All">All Companies</option>
                  <option value="NSMLR">NSMLR</option>
                  <option value="NSTLP">NSTLP</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>
                {userName ? userName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{userName || 'User'}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{userRole}</span>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <Bell 
                size={20} 
                style={{ color: 'var(--text-secondary)', cursor: 'pointer' }} 
                onClick={() => setShowNotifications(!showNotifications)}
              />
              {dueFollowUps.length > 0 && (
                <div style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: '#ef4444', color: 'white', fontSize: '0.65rem', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {dueFollowUps.length}
                </div>
              )}
              {showNotifications && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', width: '320px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: '600', backgroundColor: 'var(--bg-primary)' }}>
                    Follow-up Tasks Due
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {dueFollowUps.length === 0 ? (
                      <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem' }}>No pending tasks</div>
                    ) : (
                      dueFollowUps.map(lead => (
                        <div 
                          key={lead.id} 
                          style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                          onClick={() => {
                            setActiveSearchQuery(lead.lead_ref_id || lead.name);
                            setActiveTab('leads');
                            setShowNotifications(false);
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{lead.name} {lead.lead_ref_id && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>({lead.lead_ref_id})</span>}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{lead.company || lead.phone}</div>
                          <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.25rem' }}>
                            Due: {new Date(lead.follow_up_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Switcher */}
            <div style={{ position: 'relative' }} ref={themeMenuRef}>
              <Palette 
                size={20} 
                style={{ color: 'var(--text-secondary)', cursor: 'pointer' }} 
                onClick={() => setShowThemeMenu(!showThemeMenu)}
              />
              {showThemeMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', width: '200px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: '600', backgroundColor: 'var(--bg-primary)' }}>
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
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{theme.icon}</span>
                          {theme.name}
                        </div>
                        {currentTheme === theme.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <div 
                style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--accent-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => setShowProfileMenu(!showProfileMenu)}
              >
                {(userRole === 'admin' || userRole === 'Admin') ? 'AD' : 'AG'}
              </div>
              
              {showProfileMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', width: '250px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>User Profile</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{userEmail || 'Loading email...'}</div>
                  </div>
                  <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Role</span>
                      <span style={{ fontWeight: '500', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{userRole}</span>
                    </div>
                    {userCompany && (
                      <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Company</span>
                        <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{userCompany}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
                      <button 
                        onClick={handleLogout}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.85rem', fontWeight: '500', textAlign: 'left' }}
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
          
          {/* Header Title based on Active Tab */}
          {activeTab !== 'ai' && (
            <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {activeTab === 'dashboard' && 'Analytics Dashboard'}
              {activeTab === 'leads' && 'Leads Database'}
              {activeTab === 'orders' && 'Order Management'}
              {activeTab === 'mrp' && 'MRP System'}
              {activeTab === 'mrp_against' && 'MRP Against'}
              {activeTab === 'recruiter' && 'Recruiter'}
              {activeTab === 'joining' && 'Joining Process'}
              {activeTab === 'registration' && 'Client Registration'}
              {activeTab === 'report' && 'Client Registered Report'}
              {activeTab === 'ai' && 'New Swan AI'}
              {activeTab === 'aiadmin' && <span style={{display:'flex', alignItems:'center', gap:'0.5rem', background: 'rgba(255,165,0,0.2)', padding:'0.25rem 0.5rem', borderRadius:'6px', color:'#d97706', fontSize:'0.75rem', fontWeight:'bold'}}>ADMIN</span>}
              {activeTab === 'callcenter' && 'Telecalling Dashboard'}
              {activeTab === 'calladmin' && 'Call Center Administration'}
              {activeTab === 'team' && 'Team Management'}
              {activeTab === 'whatsapp_official' && 'WhatsApp Official Configuration'}
              {activeTab === 'whatsapp_unofficial' && 'WhatsApp UnOfficial Configuration'}
              {activeTab === 'sms_config' && 'SMS Configuration'}
              {activeTab === 'rcs_config' && 'RCS Configuration'}
              {activeTab === 'email_config' && 'Email Configuration'}
              {activeTab === 'settings' && 'Enterprise Settings'}
              <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: (userRole === 'admin' || userRole === 'Admin') ? '#fef08a' : '#e0f2fe', color: (userRole === 'admin' || userRole === 'Admin') ? '#854d0e' : '#0369a1', textTransform: 'uppercase', marginLeft: '0.5rem' }}>
                {userRole}
              </span>
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {activeTab === 'dashboard' && 'Overview of your sales pipeline and metrics'}
              {activeTab === 'leads' && 'Manage and track your leads'}
              {activeTab === 'registration' && 'Register a new comprehensive client profile'}
              {activeTab === 'report' && 'View and export customized client data reports'}
              {activeTab === 'ai' && 'Leverage AI for lead insights and communication'}
              {activeTab === 'callcenter' && 'Make and receive calls directly from your browser'}
              {activeTab === 'calladmin' && 'Manage call center agents and SIP endpoints'}
              {activeTab === 'aicallcenter' && 'Manage AI agents for incoming and outgoing campaigns'}
              {activeTab === 'team' && 'Manage user roles and permissions'}
              {activeTab === 'whatsapp_official' && 'Configure Cloud API setup for Official WhatsApp'}
              {activeTab === 'whatsapp_unofficial' && 'Configure Web session setup for UnOfficial WhatsApp'}
              {activeTab === 'sms_config' && 'Configure gateway settings and templates for SMS delivery'}
              {activeTab === 'rcs_config' && 'Configure Rich Communication Services API credentials'}
              {activeTab === 'email_config' && 'Configure SMTP, API keys, and templates for Email delivery'}
            </p>
          </div>
          )}



        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {(!canRead && activeTab === 'leads') ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <h2 style={{ color: 'var(--text-secondary)' }}>You do not have permission to view leads.</h2>
            </div>
          ) : !isMounted ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'var(--text-secondary)' }}>
              Loading workspace...
            </div>
          ) : (
            <>
              {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['analytics']?.view) && activeTab === 'dashboard' && (
                <ErrorBoundary>
                  <AnalyticsDashboard leads={leads} teamMembers={teamMembers} />
                </ErrorBoundary>
              )}
              {activeTab === 'leads' && (
                <ErrorBoundary>
                  <LeadTable initialData={leads} canImportExport={canImportExport} canWrite={canWrite} onLeadsChange={handleLeadsChange} searchQuery={activeSearchQuery} stageFilter={leadsFilterStage} teamMembers={teamMembers} userRole={userRole} userId={userId} userName={userName} moduleAccess={moduleAccess} globalRolePermissions={globalRolePermissions} />
                </ErrorBoundary>
              )}
              {activeTab === 'orders' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Order Management (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP System (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp_against' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP Against (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'recruiter' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Recruiter Dashboard (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'joining' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Joining Process (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'registration' && (
                <ErrorBoundary>
                  <ClientRegistration onRegistrationSuccess={() => handleTabChange('report')} canWrite={canWrite} />
                </ErrorBoundary>
              )}
              {activeTab === 'report' && (
                <ErrorBoundary>
                  <ClientReport initialData={leads} onLeadsChange={handleLeadsChange} canImportExport={canImportExport} teamMembers={teamMembers} userName={userName} />
                </ErrorBoundary>
              )}
              {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['new_swan_ai']?.view) && activeTab === 'ai' && (
                <ErrorBoundary>
                  <AiAssistantModule userRole={userRole} userId={userId} lastScreenCapture={lastScreenCapture} />
                </ErrorBoundary>
              )}
              {activeTab === 'aiadmin' && (
                <ErrorBoundary>
                  <AiAdminModule />
                </ErrorBoundary>
              )}
              {activeTab === 'aiknowledgebase' && (
                <ErrorBoundary>
                  <AIKnowledgeBaseModule />
                </ErrorBoundary>
              )}
              {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['callcenter']?.view) && activeTab === 'callcenter' && (
                <ErrorBoundary>
                  <CallCenterModule userId={userId} />
                </ErrorBoundary>
              )}
              {activeTab === 'calladmin' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['calladmin']?.view) && (
                <ErrorBoundary>
                  <CallAdminModule />
                </ErrorBoundary>
              )}
              {activeTab === 'aicallcenter' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aicallcenter']?.view) && (
                <ErrorBoundary>
                  <AiCallCenterModule />
                </ErrorBoundary>
              )}
              {activeTab === 'team' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['team']?.view) && (
                <ErrorBoundary>
                  <TeamManagement />
                </ErrorBoundary>
              )}
              {activeTab === 'public_users' && (userRole === 'admin' || userRole === 'Admin') && (
                <ErrorBoundary>
                  <PublicUserManagement />
                </ErrorBoundary>
              )}
              {activeTab === 'whatsapp_official' && (
                <ErrorBoundary>
                  <WhatsappOfficial />
                </ErrorBoundary>
              )}
              {activeTab === 'whatsapp_unofficial' && (
                <ErrorBoundary>
                  <WhatsappUnofficialModule userRole={userRole} userId={userId} />
                </ErrorBoundary>
              )}
              {activeTab === 'sms_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>SMS Configuration (Coming Soon)</h2><p>Gateway and API settings for standard SMS campaigns.</p></div>}
              {activeTab === 'rcs_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>RCS Configuration (Coming Soon)</h2><p>API setup and webhook configurations for RCS messaging.</p></div>}
              {activeTab === 'email_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Email Configuration (Coming Soon)</h2><p>SMTP server and API key configuration for email campaigns.</p></div>}
              {activeTab === 'settings' && (
                <ErrorBoundary>
                  <SettingsContainer />
                </ErrorBoundary>
              )}
            </>
          )}
        </div>
        </div>
      </main>
      <GlobalSoftphoneWidget userId={userId} />
    </div>
  );
}
