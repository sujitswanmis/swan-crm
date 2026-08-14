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
import { Database, LayoutDashboard, Users, Settings, Bell, Search, Shield, LogOut, FilePlus2, FileSpreadsheet, CheckCircle, Archive, FileText, PieChart, UserPlus, MessageCircle, ChevronDown, ChevronRight, ChevronLeft, Menu, Palette, Check, Bot, PhoneCall, Phone, BookOpen, Building2, MapPin, Globe, ShieldCheck, Camera, User, Upload } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getTeamMembers } from '@/app/actions/team';
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

import { MODULES_CONFIG } from '@/config/modulesConfig';

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
  { id: 'theme-neumorphism', name: 'Neumorphic Soft', icon: '🎨' },
];

export default function CRMContainer({ initialLeads, userRole, canImportExport, canRead = true, canWrite = true, moduleAccess = {}, userId, userCompany, userName }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const supabase = createClient();
  
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
    setAiMenuExpanded(['aiadmin', 'aiknowledgebase'].includes(activeTab));
    setMessageMenuExpanded(['whatsapp_official', 'whatsapp_unofficial', 'sms_config', 'rcs_config', 'email_config'].includes(activeTab));
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
  const notificationMenuRef = useRef(null);
  const profileMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [userAvatar, setUserAvatar] = useState(null);

  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('crm-theme') || 'default';
    setCurrentTheme(savedTheme);
    const savedAvatar = localStorage.getItem('crm_user_avatar');
    if (savedAvatar) setUserAvatar(savedAvatar);
  }, []);

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

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Please select an image smaller than 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setUserAvatar(base64);
        localStorage.setItem('crm_user_avatar', base64);
        try {
          if (userId) {
            await supabase.from('user_roles').update({ avatar_url: base64 }).eq('user_id', userId);
          }
        } catch (err) {
          console.warn('Could not sync avatar to DB:', err);
        }
      }
    };
    reader.readAsDataURL(file);
  };
  
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
  
  const prevLeadsSigRef = useRef('');
  const initialSyncFinishedRef = useRef(false);

  const updateLeadsIfChanged = (newList) => {
    const sig = (newList || []).map(l => `${l.id}-${l.status}-${l.assigned_to}-${l.follow_up_date || ''}-${l.lead_notes?.length || 0}`).join('|');
    if (prevLeadsSigRef.current !== sig) {
      prevLeadsSigRef.current = sig;
      setLeads(newList);
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
          setRawLeads(unique.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        }

        // 3. Fetch recent notes in one fast targeted query (top 5,000 recent notes) to populate computed summary fields
        try {
          const { data: recentNotes, error: notesError } = await supabase
            .from('lead_notes')
            .select('id, lead_id, created_at, note_text, created_by')
            .order('created_at', { ascending: false })
            .limit(5000);
          
          if (!notesError && recentNotes) {
            const notesMap = {};
            for (const note of recentNotes) {
              if (!notesMap[note.lead_id]) {
                notesMap[note.lead_id] = [];
              }
              notesMap[note.lead_id].push(note);
            }

            setRawLeads(prev => {
              return prev.map(lead => ({
                ...lead,
                lead_notes: notesMap[lead.id] || lead.lead_notes || []
              })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            });
          }
        } catch (notesErr) {
          console.error("Failed to fetch lead notes:", notesErr);
        }

      } catch (err) {
        console.error("Lead sync failed:", err);
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
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        setRawLeads((current) => current.filter(item => item.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_notes' }, (payload) => {
        const incoming = payload.new;
        setRawLeads((current) => current.map(item => {
          if (item.id !== incoming.lead_id) return item;
          const existingNotes = item.lead_notes || [];
          if (existingNotes.some(n => n.id === incoming.id)) return item;
          return { ...item, lead_notes: [...existingNotes, incoming] };
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
      updateLeadsIfChanged(filteredLeads);
    } else {
      // If view is true but no steps assigned, they see nothing
      updateLeadsIfChanged([]);
    }
  }, [rawLeads, loadingLeads, moduleAccess, userRole, adminCompanyFilter, userCompany, userId, globalRolePermissions]);

  // Handle local updates from child components so background fetches don't overwrite them
  const handleLeadsChange = (updatedFilteredLeads) => {
    updateLeadsIfChanged(updatedFilteredLeads);
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

  const [currentTime, setCurrentTime] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastScreenCapture, setLastScreenCapture] = useState(null);
  const [leadsFilterStage, setLeadsFilterStage] = useState(null);

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
    if (!lead.follow_up_date) return false;

    // Filter out finished leads
    const statusLower = (lead.status || '').toLowerCase();
    if (['converted', 'closed', 'order received', 'won', 'lost'].some(keyword => statusLower.includes(keyword))) {
      return false;
    }
    
    // Compare exact timestamps to trigger exactly on time
    if (!currentTime) return false;
    const followUpTime = new Date(lead.follow_up_date).getTime();
    if (followUpTime > currentTime) return false;

    // Filter out if there is a note/interaction created on or after the follow-up date
    const notes = lead.lead_notes || [];
    const hasBeenWorkedOn = notes.some(note => new Date(note.created_at).getTime() >= followUpTime);
    
    return !hasBeenWorkedOn;
  });

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
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
            <img 
              src="/supuja-logo.png" 
              alt="SuPuja Creations" 
              style={{ width: '30px', height: '30px', borderRadius: '7px', objectFit: 'contain', background: '#fff', padding: '2px', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} 
            />
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span className="sidebar-title" style={{ fontWeight: 700, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>SuPuja Creations</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', opacity: 0.7, letterSpacing: '0.03em' }}>v{pkg.version || '1.0.157'}</span>
            </div>
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
                  </div>
                </div>
              </div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                <h1 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', margin: 0 }}>
                  {activeTab === 'dashboard' && 'Analytics Dashboard'}
                  {activeTab === 'leads' && (leadsFilterStage ? `Lead Data - ${leadsFilterStage}` : 'Lead Data - All Leads')}
                  {activeTab === 'orders' && 'Order Management'}
                  {activeTab === 'mrp' && 'MRP System'}
                  {activeTab === 'mrp_against' && 'MRP Against'}
                  {activeTab === 'recruiter' && (
                    recruiterFilterStage === 'dashboard' ? 'Recruiter Dashboard' :
                    recruiterFilterStage === 'all_stages' ? 'Recruiter - All Stages' :
                    recruiterFilterStage ? `Recruiter - ${recruiterFilterStage}` : 'Recruiter'
                  )}
                  {activeTab === 'joining' && 'Joining Process'}
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
                  letterSpacing: '0.02em'
                }}>
                  {userRole}
                </span>
              </div>
            )}

            {activeTab !== 'ai' && (
              <div style={{ width: '1.5px', height: '18px', backgroundColor: 'var(--border-light)', margin: '0 0.25rem' }}></div>
            )}

            {hasLeadsAccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                <Search size={18} />
                <span style={{ fontSize: '0.85rem' }} className="desktop-only-text">Search leads (Cmd+K)</span>
              </div>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
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
              className="header-icon-btn"
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
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '320px', maxWidth: 'calc(100vw - 32px)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', zIndex: 10000, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', fontWeight: '600', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    Follow-up Tasks Due
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {dueFollowUps.length === 0 ? (
                      <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.85rem' }}>No pending tasks</div>
                    ) : (
                      dueFollowUps.map(lead => (
                        <div 
                          key={lead.id} 
                          style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--nav-active-bg)'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          onClick={() => {
                            setActiveSearchQuery(lead.lead_ref_id || lead.name);
                            setActiveTab('leads');
                            setShowNotifications(false);
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-primary)' }}>{lead.name} {lead.lead_ref_id && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>({lead.lead_ref_id})</span>}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{lead.company || lead.phone}</div>
                          <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: '0.25rem' }}>
                            Due: {new Date(lead.follow_up_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Switcher Button (Square Button Box) */}
            <div style={{ position: 'relative' }} ref={themeMenuRef}>
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
                        border: '3px solid var(--bg-surface)'
                      }}>
                        {userAvatar ? (
                          <img src={userAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          userName ? userName.charAt(0).toUpperCase() : 'U'
                        )}
                      </div>

                      {/* Camera Button */}
                      <button
                        type="button"
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
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        title="Upload Photo"
                      >
                        <Camera size={13} />
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
                    
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      style={{
                        marginTop: '0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        padding: '0.3rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--accent-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Upload size={12} /> {userAvatar ? 'Change Photo' : 'Upload Photo'}
                    </button>
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
              {(userRole === 'admin' || userRole === 'Admin' || moduleAccess['analytics']?.view) && activeTab === 'dashboard' && (
                <ErrorBoundary>
                  <AnalyticsDashboard leads={leads} teamMembers={teamMembers} />
                </ErrorBoundary>
              )}
              {activeTab === 'leads' && (
                <ErrorBoundary>
                  {loadingLeads ? (
                    <PremiumProgressLoader message="Loading Leads Database" active={loadingLeads} />
                  ) : (
                    <LeadTable initialData={leads} canImportExport={canImportExport} canWrite={canWrite} onLeadsChange={handleLeadsChange} searchQuery={activeSearchQuery} stageFilter={leadsFilterStage} teamMembers={teamMembers} userRole={userRole} userId={userId} userName={userName} moduleAccess={moduleAccess} globalRolePermissions={globalRolePermissions} />
                  )}
                </ErrorBoundary>
              )}
              {activeTab === 'orders' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Order Management (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP System (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'mrp_against' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>MRP Against (Coming Soon)</h2><p>This module is under development.</p></div>}
              {activeTab === 'recruiter' && (
                <ErrorBoundary>
                  <RecruiterDashboard 
                    userRole={userRole} 
                    userName={userName} 
                    selectedStage={recruiterFilterStage}
                    recruiterAccess={moduleAccess['recruiter'] || null}
                    isAdmin={userRole === 'admin' || userRole === 'Admin'}
                  />
                </ErrorBoundary>
              )}
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
                  <CallAdminModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'aicallcenter' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['aicallcenter']?.view) && (
                <ErrorBoundary>
                  <AiCallCenterModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'team' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['team']?.view) && (
                <ErrorBoundary>
                  <TeamManagement />
                </ErrorBoundary>
              )}
              {activeTab === 'workplace' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['workplace']?.view || moduleAccess['team']?.view) && (
                <ErrorBoundary>
                  <UniversalWorkplaceModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'party' && ((userRole === 'admin' || userRole === 'Admin') || moduleAccess['party']?.view || moduleAccess['team']?.view) && (
                <ErrorBoundary>
                  <PartyMasterModule />
                </ErrorBoundary>
              )}
              {(activeTab === 'location_master' || activeTab === 'location_territory' || activeTab === 'location-master') && (
                <ErrorBoundary>
                  <LocationManagementModule moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'public_users' && (userRole === 'admin' || userRole === 'Admin' || moduleAccess['public_users']?.view) && (
                <ErrorBoundary>
                  <PublicUserManagement />
                </ErrorBoundary>
              )}
              {activeTab === 'whatsapp_official' && (
                <ErrorBoundary>
                  <WhatsappOfficial moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'whatsapp_unofficial' && (
                <ErrorBoundary>
                  <WhatsappUnofficialModule userRole={userRole} userId={userId} moduleAccess={moduleAccess} />
                </ErrorBoundary>
              )}
              {activeTab === 'sms_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>SMS Configuration (Coming Soon)</h2><p>Gateway and API settings for standard SMS campaigns.</p></div>}
              {activeTab === 'rcs_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>RCS Configuration (Coming Soon)</h2><p>API setup and webhook configurations for RCS messaging.</p></div>}
              {activeTab === 'email_config' && <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}><h2>Email Configuration (Coming Soon)</h2><p>SMTP server and API key configuration for email campaigns.</p></div>}
              {activeTab === 'admin_message_config' && (
                <ErrorBoundary>
                  <AdminMessageConfig moduleAccess={moduleAccess} userRole={userRole} />
                </ErrorBoundary>
              )}
              {activeTab === 'settings' && (
                <ErrorBoundary>
                  <SettingsContainer moduleAccess={moduleAccess} userRole={userRole} />
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
