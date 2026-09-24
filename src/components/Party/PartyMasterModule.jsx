'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Building2, Users, Plus, Eye, RefreshCw, X, MapPin, Phone, Mail,
  CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, ArrowRightLeft,
  DollarSign, Calendar, ChevronLeft, ChevronRight, Search, Filter, Clock, Star,
  MessageSquare, Truck, Package, Shield, ExternalLink, ThumbsUp,
  AlertCircle, FileText, Check, Lock, ChevronDown, CheckSquare, Sparkles,
  UserCheck, Layers, GitFork, UserPlus, Tag, Download, RotateCcw, Trash2
} from 'lucide-react';
import {
  getPartyList,
  createPartyMaster,
  updatePartyStep,
  saveProductAuthorizations,
  saveTerritoryAllocation,
  saveTeamAssignments,
  activatePartner,
  getParty360Details,
  getOrderFollowups,
  saveOrderFollowup,
  getOrderFeedbackList,
  saveOrderFeedback,
  getMonthlyFeedbackList,
  saveMonthlyFeedback,
  getComplaintsList,
  createComplaintTicket,
  verifyAndCloseComplaint,
  deletePartyMaster
} from '@/app/actions/partyMaster';
import { getEmployeesMaster } from '@/app/actions/employee';
import { getStatesCentral, getDistrictsCentral } from '@/app/actions/centralLocationMaster';
import { getTransferredLeads, confirmLeadTransfer } from '@/app/actions/partyHandoff';
import { INDIAN_STATE_DISTRICTS, ALL_INDIAN_STATES } from '@/config/indianStateDistricts';
import StageDataTable from './StageDataTable';
import StageConfigModal from './StageConfigModal';
import PartyMasterDashboard from './PartyMasterDashboard';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
const INDIAN_STATES = ALL_INDIAN_STATES;

const ALL_CLIENT_TEAM_ROLES = [
  { id: 'NSM', label: 'NSM (National Sales Manager)' },
  { id: 'RSM', label: 'RSM (Regional Sales Manager)' },
  { id: 'ASM', label: 'ASM (Area Sales Manager)' },
  { id: 'Sales Executive', label: 'Sales Executive (TSE / Field Rep)' },
  { id: 'Telecaller', label: 'Telecaller (Order Taking & Followup)' },
  { id: 'Sales Coordinator', label: 'Sales Coordinator (Backend Desk)' },
  { id: 'CRM', label: 'CRM (Relationship Manager)' }
];

/**
 * Reusable Chip / Tag Input Component
 * Type and press Enter to create chip, or select from filtered suggestions
 */
function ChipInput({ chips = [], onChange, placeholder = 'Type and press Enter...', suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = inputVal.trim();
      if (val && !chips.includes(val)) {
        onChange([...chips, val]);
        setInputVal('');
        setShowDropdown(false);
      }
    }
  };

  const addChip = (item) => {
    if (!chips.includes(item)) {
      onChange([...chips, item]);
      setInputVal('');
      setShowDropdown(false);
    }
  };

  const removeChip = (idxToRemove) => {
    onChange(chips.filter((_, i) => i !== idxToRemove));
  };

  const filtered = suggestions.filter(s =>
    typeof s === 'string' && s.toLowerCase().includes(inputVal.toLowerCase()) && !chips.includes(s)
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        padding: '0.45rem 0.6rem',
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '8px',
        minHeight: '42px',
        alignItems: 'center'
      }}>
        {chips.map((chip, idx) => (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.22rem 0.6rem',
              background: 'rgba(59,130,246,0.25)',
              color: '#93c5fd',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: '1px solid rgba(59,130,246,0.35)'
            }}
          >
            {chip}
            <button
              type="button"
              onClick={() => removeChip(idx)}
              style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 220)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : 'Type more + Enter...'}
          style={{
            flex: 1,
            minWidth: '130px',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            outline: 'none',
            fontSize: '0.84rem'
          }}
        />
      </div>

      {showDropdown && inputVal.trim() && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '8px',
          marginTop: '0.25rem',
          maxHeight: '180px',
          overflowY: 'auto',
          zIndex: 60,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
        }}>
          {filtered.map((s, i) => (
            <div
              key={i}
              onMouseDown={() => addChip(s)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.83rem',
                color: '#e2e8f0',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              + {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartyMasterModule({
  initialSubTab = 'dashboard',
  activeSubTab = null,
  onSubTabChange = null,
  userRole = '',
  moduleAccess = {}
}) {
  const [activeTab, setActiveTab] = useState(activeSubTab || initialSubTab || 'dashboard');
  // Stage Configuration Modal State (S01 to S08 popup on table action)
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);

  useEffect(() => {
    if (activeSubTab && activeSubTab !== activeTab) {
      setActiveTab(activeSubTab);
      setIsStageModalOpen(false);
      if (['order_followup', 'order_feedback', 'monthly_feedback', 'complaints'].includes(activeSubTab)) {
        loadOperationsData(activeSubTab);
      }
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (['order_followup', 'order_feedback', 'monthly_feedback', 'complaints'].includes(activeTab)) {
      loadOperationsData(activeTab);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isStageModalOpen) {
        setIsStageModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStageModalOpen]);
  const [parties, setParties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search for R03 Report
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'Distributor' | 'Dealer' | 'Sub-Dealer'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Active' | 'Draft' | 'S00' | 'EVERYTHING'
  const [billingFilter, setBillingFilter] = useState('ALL'); // 'ALL' | 'DIRECT_COMPANY_BILLING' | 'DISTRIBUTOR_BILLED' | 'DEALER_BILLED'
  const [companyFilter, setCompanyFilter] = useState('ALL'); // 'ALL' | 'NSMLR' | 'NSTLP'
  const [stateFilter, setStateFilter] = useState('ALL');
  const [stageFilter, setStageFilter] = useState('ALL');

  // Wizard States (S00 to S07)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState('S00'); // 'S00' | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07'
  const [activePartyId, setActivePartyId] = useState(null);
  const [wizardParty, setWizardParty] = useState(null);
  const [s00ContactTab, setS00ContactTab] = useState('biz'); // 'biz' | 'person1' | 'person2' | 'person3'

  // S00 Form State (With All Specific Contact Fields)
  const [s00Form, setS00Form] = useState({
    our_company: 'NSMLR',
    party_type: 'Dealer',
    firm_name: '',
    legal_name: '',
    constitution_type: 'PROPRIETORSHIP',
    gstin: '',
    pan: '',
    address: '',
    state_name: 'Punjab',
    district_name: 'Amritsar',
    tehsil: '',
    block_name: '',
    city_village: '',
    pincode: '',
    order_category: 'Rotavator',
    
    // Official Business Contacts
    biz_contact_no_1: '',
    biz_contact_no_2: '',
    biz_alt_no_1: '',
    biz_alt_no_2: '',
    biz_email_1: '',
    biz_email_2: '',
    biz_alt_email_1: '',
    biz_alt_email_2: '',

    // Contact Person 1
    contact_person_name_1: '',
    contact_mobile_1_1: '',
    contact_mobile_1_2: '',
    contact_alt_mobile_1_1: '',
    contact_alt_mobile_1_2: '',
    contact_email_1_2: '',
    contact_alt_email_1_1: '',

    // Contact Person 2
    contact_person_name_2: '',
    contact_mobile_2_1: '',
    contact_mobile_2_2: '',
    contact_alt_mobile_2_1: '',
    contact_alt_mobile_2_2: '',
    contact_email_2_2: '',
    contact_alt_email_2_1: '',

    // Contact Person 3
    contact_person_name_3: '',
    contact_mobile_3_1: '',
    contact_mobile_3_2: '',
    contact_alt_mobile_3_1: '',
    contact_alt_mobile_3_2: '',
    contact_email_3_1: '',
    contact_email_3_2: '',
    contact_alt_email_3_1: ''
  });

  // Step Data States (Territory Coverage exclusively moved to S05)
  const [s01DistForm, setS01DistForm] = useState({
    zone: 'North Zone',
    state: 'Punjab',
    district: '',
    districts: []
  });

  const [s02DealerForm, setS02DealerForm] = useState({
    parent_distributor_id: '',
    showroom_area_sqft: 2500,
    dealership_type: 'EXCLUSIVE_SWAN'
  });

  const [s03SubDealerForm, setS03SubDealerForm] = useState({
    parent_dealer_id: ''
  });

  const [s04CommForm, setS04CommForm] = useState({
    credit_limit: 500000,
    credit_days: 30,
    security_deposit_amount: 100000,
    security_deposit_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
    security_mode: 'Cheque',
    receipt_no: '',
    billing_route_type: 'DIRECT_COMPANY_BILLING',
    distributor_commission_percent: 2.5,
    billing_first_date: '',
    billing_first_amount: '',
    billing_first_status: 'Pending'
  });

  // Combined S05 Product Authorization & Territory Allocation
  const [s05SelectedProducts, setS05SelectedProducts] = useState(['ROTAVATOR', 'SPARE_PARTS']);
  const [s06ProductCategory, setS06ProductCategory] = useState('Both'); // 'Implement' | 'Spare Part' | 'Both'
  const [s05TerritoryForm, setS05TerritoryForm] = useState({
    zone: 'North Zone',
    state: 'Punjab',
    district: 'Ludhiana',
    tehsil_area: 'Khanna',
    market_coverage_chips: ['Khanna Mandi', 'Samrala Road', 'Doraha Bypass'],
    territory_type: 'Exclusive'
  });

  // S06 Team Assignments (All 7 Roles Supported with Multi-Employee Chips)
  const [s06TeamMap, setS06TeamMap] = useState({
    NSM: [],
    RSM: [],
    ASM: [],
    'Sales Executive': [],
    Telecaller: [],
    'Sales Coordinator': [],
    CRM: []
  });

  const [activationErrors, setActivationErrors] = useState([]);

  // 360 View Modal
  const [view360Party, setView360Party] = useState(null);
  const [party360Data, setParty360Data] = useState(null);

  // Operations Data States
  const [orderFollowups, setOrderFollowups] = useState([]);
  const [orderFeedbacks, setOrderFeedbacks] = useState([]);
  const [monthlyFeedbacks, setMonthlyFeedbacks] = useState([]);
  const [complaints, setComplaints] = useState([]);

  // Operations Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedPartyForOrder, setSelectedPartyForOrder] = useState(null);
  const [orderForm, setOrderForm] = useState({
    product: 'Rotavator 7ft Champion',
    qty: 2,
    notes: '',
    dispatch_date: '',
    call_status: 'ORDER_PLACED',
    no_order_reason: '',
    next_followup_date: '',
    transport_details: ''
  });

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedPartyForFeedback, setSelectedPartyForFeedback] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({
    order_id: `SO-${Date.now().toString().slice(-4)}`,
    rating_delivery_time: 5,
    rating_packaging_finish: 5,
    has_transit_damage_shortage: false,
    damage_details: '',
    rating_billing_accuracy: 5,
    rating_driver_behavior: 5,
    overall_satisfaction: 5,
    dealer_comments: ''
  });

  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [selectedPartyForMonthly, setSelectedPartyForMonthly] = useState(null);
  const [monthlyForm, setMonthlyForm] = useState({
    party_id: '',
    evaluation_period: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()),
    days_inactive: 14,
    is_dormant_risk: false,
    market_sentiment: 'STEADY',
    competitor_schemes: '',
    tse_support_rating: 5,
    service_support_rating: 5,
    next_month_demand_plan: '',
    dealer_suggestions: ''
  });

  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintForm, setComplaintForm] = useState({
    party_id: '',
    category: 'MANUFACTURING_DEFECT',
    priority: 'HIGH',
    issue_description: '',
    assigned_department: 'QUALITY_ASSURANCE'
  });

  // Location Master States & Districts
  const [locationStates, setLocationStates] = useState([]);
  const [s00Districts, setS00Districts] = useState(INDIAN_STATE_DISTRICTS['Punjab'] || []);
  const [s05Districts, setS05Districts] = useState(INDIAN_STATE_DISTRICTS['Punjab'] || []);

  // Transferred Leads from Stage 07 & S08 Activation states
  const [transferredLeads, setTransferredLeads] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [s08ActivationStatus, setS08ActivationStatus] = useState('Active');
  const [s08Remarks, setS08Remarks] = useState('');
  const [stageConfirmedMap, setStageConfirmedMap] = useState({});

  // Centered Alert/Success Modal state (replaces browser native window.alert)
  const [centerAlert, setCenterAlert] = useState({
    isOpen: false,
    title: '',
    message: '',
    partnerName: '',
    partnerCode: '',
    status: 'Active',
    type: 'success', // 'success' | 'warning' | 'error'
    confirmText: 'OK',
    onConfirm: null
  });

  // Party Deletion confirmation state
  const [deleteConfirmParty, setDeleteConfirmParty] = useState(null);
  const [isDeletingParty, setIsDeletingParty] = useState(false);

  // S00 Search, Filters and Pagination states
  const [s00SearchTerm, setS00SearchTerm] = useState('');
  const [s00StatusFilter, setS00StatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'CONFIRMED'
  const [s00PageSize, setS00PageSize] = useState(15);
  const [s00CurrentPage, setS00CurrentPage] = useState(1);

  // R03 Report Row Selection, Column Visibility and Pagination states
  const [reportPageSize, setReportPageSize] = useState(15);
  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [selectedPartyIds, setSelectedPartyIds] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    codeTier: true,
    firmContact: true,
    hierarchy: true,
    locationProducts: true,
    billingSecurity: true,
    stageStatus: true,
    actions: true
  });

  // Engine 1 Follow-ups Filters and History Modal
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderCallStatusFilter, setOrderCallStatusFilter] = useState('ALL'); // 'ALL' | 'ORDER_PLACED' | 'CONNECTED' | 'PAYMENT_PENDING' | 'RESCHEDULED' | 'NOT_REACHABLE'
  const [orderTierFilter, setOrderTierFilter] = useState('ALL');
  const [orderStateFilter, setOrderStateFilter] = useState('ALL');
  const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
  const [orderHistoryParty, setOrderHistoryParty] = useState(null);

  // Engine 2 Feedback Filters
  const [feedbackSearchTerm, setFeedbackSearchTerm] = useState('');
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState('ALL'); // 'ALL' | '5' | '4' | '3' | 'POOR'
  const [feedbackDamageFilter, setFeedbackDamageFilter] = useState('ALL'); // 'ALL' | 'DAMAGE' | 'CLEAN'

  // Engine 3 Monthly Health Check Period and Filters
  const currentPeriodStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
  }, []);
  const [monthlyPeriodFilter, setMonthlyPeriodFilter] = useState(currentPeriodStr);
  const [monthlySearchTerm, setMonthlySearchTerm] = useState('');
  const [monthlyRiskFilter, setMonthlyRiskFilter] = useState('ALL'); // 'ALL' | 'HEALTHY' | 'AT_RISK' | 'DORMANT'

  const refreshTransferredLeads = useCallback(async () => {
    try {
      const transRes = await getTransferredLeads();
      setTransferredLeads(transRes || []);
    } catch (err) {
      console.warn('Could not refresh transferred leads:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  // When activeTab changes to s00, immediately refresh transferred leads
  useEffect(() => {
    if (activeTab === 's00') {
      refreshTransferredLeads();
    }
  }, [activeTab, refreshTransferredLeads]);

  // Realtime subscription and window event listener for instant S00 updates
  useEffect(() => {
    const handleLocalUpdate = () => {
      refreshTransferredLeads();
    };
    window.addEventListener('party_transferred_updated', handleLocalUpdate);

    let supabaseChannel = null;
    try {
      const supabase = createClient();
      supabaseChannel = supabase
        .channel('realtime_party_s00_transfers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_party_handoffs' }, () => {
          refreshTransferredLeads();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'party_master' }, () => {
          refreshTransferredLeads();
        })
        .subscribe();
    } catch (realtimeErr) {
      console.warn('Realtime handoffs subscription error:', realtimeErr);
    }

    // Interval polling when viewing s00 (every 10s fallback)
    const pollTimer = setInterval(() => {
      if (activeTab === 's00') {
        refreshTransferredLeads();
      }
    }, 10000);

    return () => {
      window.removeEventListener('party_transferred_updated', handleLocalUpdate);
      clearInterval(pollTimer);
      if (supabaseChannel) {
        try {
          const supabase = createClient();
          supabase.removeChannel(supabaseChannel);
        } catch (_) {}
      }
    };
  }, [refreshTransferredLeads, activeTab]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [partyRes, empRes, dbStates, transRes] = await Promise.all([
        getPartyList(),
        getEmployeesMaster(),
        getStatesCentral().catch(() => []),
        getTransferredLeads().catch(() => [])
      ]);
      setParties(partyRes || []);
      setEmployees(empRes || []);
      setTransferredLeads(transRes || []);

      if (dbStates && dbStates.length > 0) {
        setLocationStates(dbStates);
        const punjabState = dbStates.find(s => (s.state_name || s.name || '').toLowerCase() === 'punjab');
        const punjabDists = await getDistrictsCentral(punjabState?.id || null, 'Punjab').catch(() => []);
        if (punjabDists && punjabDists.length > 0) {
          const names = punjabDists.map(d => d.district_name || d.name);
          setS00Districts(names);
          setS05Districts(names);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleS00StateChange = async (newState) => {
    const fallbackDists = INDIAN_STATE_DISTRICTS[newState] || [];
    setS00Form(prev => ({
      ...prev,
      state_name: newState,
      district_name: fallbackDists.length > 0 ? fallbackDists[0] : ''
    }));
    setS00Districts(fallbackDists);

    try {
      const stObj = locationStates.find(s => (s.state_name || s.name || '').toLowerCase() === newState.toLowerCase());
      const dbDists = await getDistrictsCentral(stObj?.id || null, newState);
      if (dbDists && dbDists.length > 0) {
        const names = dbDists.map(d => d.district_name || d.name);
        setS00Districts(names);
        setS00Form(prev => ({
          ...prev,
          district_name: names.includes(prev.district_name) ? prev.district_name : (names[0] || '')
        }));
      }
    } catch (err) {
      console.warn('Could not fetch districts from Location Master for S00:', err);
    }
  };

  const handleS05StateChange = async (newState) => {
    const fallbackDists = INDIAN_STATE_DISTRICTS[newState] || [];
    setS05TerritoryForm(prev => ({
      ...prev,
      state: newState,
      district: fallbackDists.length > 0 ? fallbackDists[0] : ''
    }));
    setS05Districts(fallbackDists);

    try {
      const stObj = locationStates.find(s => (s.state_name || s.name || '').toLowerCase() === newState.toLowerCase());
      const dbDists = await getDistrictsCentral(stObj?.id || null, newState);
      if (dbDists && dbDists.length > 0) {
        const names = dbDists.map(d => d.district_name || d.name);
        setS05Districts(names);
        setS05TerritoryForm(prev => ({
          ...prev,
          district: names.includes(prev.district) ? prev.district : (names[0] || '')
        }));
      }
    } catch (err) {
      console.warn('Could not fetch districts from Location Master for S05:', err);
    }
  };

  const loadOperationsData = async (tab) => {
    if (tab === 'order_followup') {
      const data = await getOrderFollowups();
      setOrderFollowups(data);
    } else if (tab === 'order_feedback') {
      const data = await getOrderFeedbackList();
      setOrderFeedbacks(data);
    } else if (tab === 'monthly_feedback') {
      const data = await getMonthlyFeedbackList();
      setMonthlyFeedbacks(data);
    } else if (tab === 'complaints') {
      const data = await getComplaintsList();
      setComplaints(data);
    }
  };

  const switchTab = (newTab, keepModal = false) => {
    setActiveTab(newTab);
    if (!keepModal) {
      setIsStageModalOpen(false);
    }
    if (onSubTabChange) {
      onSubTabChange(newTab);
    }
    if (newTab !== 'report' && newTab !== 'r03' && newTab !== 'hierarchy_tree') {
      loadOperationsData(newTab);
    }
  };

  const handleTabChange = (newTab) => {
    switchTab(newTab);
  };

  // Filtered Distributors & Dealers for Dropdowns
  const activeDistributors = useMemo(() => {
    return parties.filter(p => p.party_type === 'Distributor');
  }, [parties]);

  const activeDealers = useMemo(() => {
    return parties.filter(p => p.party_type === 'Dealer');
  }, [parties]);

  // Employee Names List for Chip Suggestions
  const employeeNames = useMemo(() => {
    return employees.map(e => e.emp_name);
  }, [employees]);

  // Filtered R03 Report List
  const filteredParties = useMemo(() => {
    return parties.filter(p => {
      const term = searchTerm.trim().toLowerCase();
      const isUnconfirmedHandoff = p.party_status === 'Draft_From_Lead' || p.onboarding_stage === 'S00_Party_Entry';

      const matchesSearch = !term || (
        (p.firm_name && p.firm_name.toLowerCase().includes(term)) ||
        (p.legal_name && p.legal_name.toLowerCase().includes(term)) ||
        (p.party_universal_code && p.party_universal_code.toLowerCase().includes(term)) ||
        (p.distributor_code && p.distributor_code.toLowerCase().includes(term)) ||
        (p.dealer_code && p.dealer_code.toLowerCase().includes(term)) ||
        (p.sub_dealer_code && p.sub_dealer_code.toLowerCase().includes(term)) ||
        (p.primary_mobile && p.primary_mobile.includes(term)) ||
        (p.biz_contact_no_1 && p.biz_contact_no_1.includes(term)) ||
        (p.contact_mobile_1_1 && p.contact_mobile_1_1.includes(term)) ||
        (p.owner_name && p.owner_name.toLowerCase().includes(term)) ||
        (p.contact_person_name_1 && p.contact_person_name_1.toLowerCase().includes(term)) ||
        (p.gstin && p.gstin.toLowerCase().includes(term)) ||
        (p.pan && p.pan.toLowerCase().includes(term)) ||
        (p.state_name && p.state_name.toLowerCase().includes(term)) ||
        (p.district_name && p.district_name.toLowerCase().includes(term)) ||
        (p.parent_distributor_name && p.parent_distributor_name.toLowerCase().includes(term)) ||
        (p.parent_dealer_name && p.parent_dealer_name.toLowerCase().includes(term))
      );

      const matchesType = typeFilter === 'ALL' || p.party_type === typeFilter;
      const matchesBilling = billingFilter === 'ALL' || p.billing_route_type === billingFilter;
      const matchesCompany = companyFilter === 'ALL' || 
        (companyFilter === 'NSTL' 
          ? (p.our_company === 'NSTL' || p.our_company === 'NSTLP')
          : (p.our_company || 'NSMLR') === companyFilter);
      
      const matchesState = stateFilter === 'ALL' || (p.state_name || '').toLowerCase() === stateFilter.toLowerCase();
      const matchesStage = stageFilter === 'ALL' || (p.onboarding_stage || '').toLowerCase().includes(stageFilter.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'ALL') {
        // By default show all official channel partners (exclude raw unconfirmed S00 handoffs)
        matchesStatus = !isUnconfirmedHandoff;
      } else if (statusFilter === 'Active') {
        matchesStatus = (p.final_status === 'Active' || p.party_status === 'Active') && !isUnconfirmedHandoff;
      } else if (statusFilter === 'Draft') {
        matchesStatus = (p.final_status !== 'Active' && p.party_status !== 'Active') && !isUnconfirmedHandoff;
      } else if (statusFilter === 'S00') {
        matchesStatus = isUnconfirmedHandoff;
      } else if (statusFilter === 'EVERYTHING') {
        matchesStatus = true;
      }

      return matchesSearch && matchesType && matchesStatus && matchesBilling && matchesCompany && matchesState && matchesStage;
    });
  }, [parties, searchTerm, typeFilter, statusFilter, billingFilter, companyFilter, stateFilter, stageFilter]);

  // S00 Filtered & Paginated Leads
  const filteredS00Leads = useMemo(() => {
    return transferredLeads.filter(lead => {
      const isConfirmed = lead.transfer_status === 'CONFIRMED';
      if (s00StatusFilter === 'PENDING' && isConfirmed) return false;
      if (s00StatusFilter === 'CONFIRMED' && !isConfirmed) return false;

      if (!s00SearchTerm) return true;
      const term = s00SearchTerm.trim().toLowerCase();
      const code = (lead.lead_universal_id || '').toLowerCase();
      const firm = (lead.firm_name || lead.lead_name || '').toLowerCase();
      const contact = (lead.contact_person || lead.lead_name || '').toLowerCase();
      const phone = (lead.primary_mobile || '').toLowerCase();
      const state = (lead.state_name || '').toLowerCase();
      const dist = (lead.district_name || '').toLowerCase();
      const comp = (lead.our_company || '').toLowerCase();
      const cat = (lead.order_category || '').toLowerCase();

      return code.includes(term) || firm.includes(term) || contact.includes(term) ||
        phone.includes(term) || state.includes(term) || dist.includes(term) || comp.includes(term) || cat.includes(term);
    });
  }, [transferredLeads, s00StatusFilter, s00SearchTerm]);

  const totalS00Records = filteredS00Leads.length;
  const effectiveS00PageSize = s00PageSize === 'All' ? totalS00Records : Number(s00PageSize);
  const totalS00Pages = effectiveS00PageSize > 0 ? Math.ceil(totalS00Records / effectiveS00PageSize) : 1;
  const validS00CurrentPage = Math.min(Math.max(1, s00CurrentPage), Math.max(1, totalS00Pages));

  const paginatedS00Leads = useMemo(() => {
    if (s00PageSize === 'All') return filteredS00Leads;
    const start = (validS00CurrentPage - 1) * effectiveS00PageSize;
    return filteredS00Leads.slice(start, start + effectiveS00PageSize);
  }, [filteredS00Leads, validS00CurrentPage, effectiveS00PageSize, s00PageSize]);

  // Report Pagination Calculations
  const totalReportRecords = filteredParties.length;
  const effectiveReportPageSize = reportPageSize === 'All' ? totalReportRecords : Number(reportPageSize);
  const totalReportPages = effectiveReportPageSize > 0 ? Math.ceil(totalReportRecords / effectiveReportPageSize) : 1;
  const validReportCurrentPage = Math.min(Math.max(1, reportCurrentPage), Math.max(1, totalReportPages));

  const paginatedReportParties = useMemo(() => {
    if (reportPageSize === 'All') return filteredParties;
    const start = (validReportCurrentPage - 1) * effectiveReportPageSize;
    return filteredParties.slice(start, start + effectiveReportPageSize);
  }, [filteredParties, validReportCurrentPage, effectiveReportPageSize, reportPageSize]);

  // Report Row Selection Handlers
  const isAllReportSelected = useMemo(() => {
    if (paginatedReportParties.length === 0) return false;
    return paginatedReportParties.every(p => selectedPartyIds.includes(p.id));
  }, [paginatedReportParties, selectedPartyIds]);

  const handleToggleSelectAllReport = () => {
    if (isAllReportSelected) {
      const pageIds = new Set(paginatedReportParties.map(p => p.id));
      setSelectedPartyIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const pageIds = paginatedReportParties.map(p => p.id);
      setSelectedPartyIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelectParty = (partyId) => {
    setSelectedPartyIds(prev => {
      if (prev.includes(partyId)) {
        return prev.filter(id => id !== partyId);
      } else {
        return [...prev, partyId];
      }
    });
  };

  // Export Filtered Party Master Report to CSV / Excel
  const exportPartyReportCSV = (onlySelected = false) => {
    const listToExport = onlySelected
      ? filteredParties.filter(p => selectedPartyIds.includes(p.id))
      : filteredParties;

    if (!listToExport || listToExport.length === 0) {
      alert(onlySelected ? 'No selected party records to export.' : 'No party records available to export.');
      return;
    }

    const headers = [
      'Party Universal Code',
      'Channel Code',
      'Party Tier',
      'Our Company',
      'Firm Name',
      'Legal Name',
      'GSTIN',
      'PAN',
      'Owner / Contact Person',
      'Primary Mobile',
      'Alt Contact No',
      'Email',
      'State',
      'District / Headquarters',
      'Assigned Territories',
      'Parent Distributor Firm',
      'Parent Dealer Firm',
      'Billing Route Type',
      'Security Deposit (INR)',
      'Security Mode',
      'Receipt No',
      '1st Billing Date',
      '1st Billing Amount (INR)',
      '1st Billing Status',
      'Current Onboarding Stage',
      'Verification Status',
      'Created Date (IST)'
    ];

    const rows = listToExport.map(p => {
      const parentDist = p.parent_distributor?.firm_name || p.parent_distributor_name || (p.parent_distributor_id ? 'Assigned Distributor' : 'Direct Swan');
      const parentDlr = p.parent_dealer?.firm_name || p.parent_dealer_name || '-';
      const assignedDists = Array.isArray(p.assigned_districts) ? p.assigned_districts.join('; ') : (p.district_name || '');
      const createdDateIST = p.created_at ? new Date(p.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';

      return [
        `"${p.party_universal_code || ''}"`,
        `"${p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code || ''}"`,
        `"${p.party_type || ''}"`,
        `"${p.our_company || 'NSMLR'}"`,
        `"${(p.firm_name || '').replace(/"/g, '""')}"`,
        `"${(p.legal_name || '').replace(/"/g, '""')}"`,
        `"${p.gstin || ''}"`,
        `"${p.pan || ''}"`,
        `"${(p.contact_person_name_1 || p.owner_name || '').replace(/"/g, '""')}"`,
        `"${p.contact_mobile_1_1 || p.primary_mobile || p.biz_contact_no_1 || ''}"`,
        `"${p.biz_contact_no_2 || p.contact_mobile_1_2 || ''}"`,
        `"${p.biz_email_1 || p.official_email || ''}"`,
        `"${p.state_name || ''}"`,
        `"${p.district_name || ''}"`,
        `"${assignedDists.replace(/"/g, '""')}"`,
        `"${parentDist.replace(/"/g, '""')}"`,
        `"${parentDlr.replace(/"/g, '""')}"`,
        `"${p.billing_route_type || ''}"`,
        `"${p.security_deposit_amount || (p.party_commercial_terms?.[0]?.security_deposit_amount) || 0}"`,
        `"${p.security_mode || 'Cheque'}"`,
        `"${p.receipt_no || ''}"`,
        `"${p.billing_first_date || ''}"`,
        `"${p.billing_first_amount || ''}"`,
        `"${p.billing_first_status || ''}"`,
        `"${p.onboarding_stage || 'S01_Registration'}"`,
        `"${p.final_status || p.party_status || 'Draft'}"`,
        `"${createdDateIST}"`
      ].join(',');
    });

    const csvData = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    link.href = url;
    link.setAttribute('download', `Swan_Party_Master_Report_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset all R03 Report Search & Filter criteria
  const handleResetFilters = () => {
    setSearchTerm('');
    setCompanyFilter('ALL');
    setTypeFilter('ALL');
    setBillingFilter('ALL');
    setStatusFilter('ALL');
    setStateFilter('ALL');
    setStageFilter('ALL');
    setReportCurrentPage(1);
  };

  const activeReportFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (companyFilter !== 'ALL') count++;
    if (typeFilter !== 'ALL') count++;
    if (billingFilter !== 'ALL') count++;
    if (statusFilter !== 'ALL') count++;
    if (stateFilter !== 'ALL') count++;
    if (stageFilter !== 'ALL') count++;
    return count;
  }, [searchTerm, companyFilter, typeFilter, billingFilter, statusFilter, stateFilter, stageFilter]);

  // Unique States list for filter dropdown (Combines DB records + Standard Indian States)
  const availableReportStates = useMemo(() => {
    const fromParties = parties.map(p => p.state_name).filter(Boolean);
    const combined = Array.from(new Set([...fromParties, ...ALL_INDIAN_STATES])).sort();
    return combined;
  }, [parties]);

  // Stage Verification and Gate Status Inspector
  const getStageApprovalStatus = useCallback((party) => {
    if (!party) return { s00: false, s01: false, s02: false, s03: false, s04: false, tier: false, s05: false, s06: false, s07: false, s08: false };
    const pId = party.id;
    const local = stageConfirmedMap[pId] || {};
    const metaStages = party.meta_stages || party.meta?.stages || {};

    const isDist = party.party_type === 'Distributor';
    const isDealer = party.party_type === 'Dealer';
    const isSubDealer = party.party_type === 'Sub-Dealer';

    // If partner is already Active in DB or final_status is Active, all stages are verified
    const isPartyActive = party.party_status === 'Active' || party.final_status === 'Active';

    // Check stage hierarchy in onboarding_stage
    const STAGE_ORDER = [
      'S00_Party_Entry',
      'S01_Registration',
      'S02_Party_Classification',
      'S03_Dealer_Distributor_Mapping',
      'S04_KYC_Commercial_Verification',
      'S05_Product_Authorization',
      'S06_Territory_Allocation',
      'S07_Employee_Assignment',
      'S08_Party_Activation'
    ];
    const currentStageIdx = STAGE_ORDER.indexOf(party.onboarding_stage);

    // 1. S00 Approval: Lead handoff confirmed into Party Master (not stuck in S00 queue)
    const isUnconfirmedLeadInS00 = Boolean(
      party.source_lead_id && (
        party.party_status === 'Draft_From_Lead' || 
        party.party_status === 'Pending Confirmation' ||
        party.onboarding_stage === 'S00_Party_Entry' ||
        party.workflow_status === 'S00_TRANSFERRED'
      ) && !local.s00 && !metaStages.s00
    );

    const s00Approved = !isUnconfirmedLeadInS00 && Boolean(
      isPartyActive ||
      local.s00 ||
      metaStages.s00 ||
      currentStageIdx >= 1 ||
      (party.workflow_status && !party.workflow_status.includes('S00')) ||
      !party.source_lead_id
    );

    // 2. S01 Approval: Party Master Creation verified (legal details, GST, PAN, primary contacts)
    const s01Approved = s00Approved && Boolean(
      isPartyActive ||
      local.s01 ||
      metaStages.s01 ||
      currentStageIdx >= 2 ||
      party.workflow_status === 'S01_Approved' ||
      party.workflow_status?.includes('S02') ||
      party.workflow_status?.includes('S03') ||
      party.workflow_status?.includes('S04') ||
      party.workflow_status?.includes('S05') ||
      party.workflow_status?.includes('S06') ||
      party.workflow_status?.includes('S07') ||
      (['S02_Party_Classification', 'S03_Dealer_Distributor_Mapping', 'S04_KYC_Commercial_Verification', 'S05_Product_Authorization', 'S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage))
    );

    // 3. Tier Approvals (S02 for Dist, S03 for Dealer, S04 for Sub-Dealer)
    const s02Approved = s01Approved && (isDist ? Boolean(
      isPartyActive ||
      local.s02 ||
      metaStages.s02 ||
      currentStageIdx >= 4 ||
      party.workflow_status?.includes('S02_Completed') ||
      party.workflow_status?.includes('S04') ||
      party.workflow_status?.includes('S05') ||
      party.workflow_status?.includes('S06') ||
      party.workflow_status?.includes('S07') ||
      (['S04_KYC_Commercial_Verification', 'S05_Product_Authorization', 'S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      (party.zone && (party.state_name || party.state))
    ) : true);

    const s03Approved = s01Approved && (isDealer ? Boolean(
      isPartyActive ||
      local.s03 ||
      metaStages.s03 ||
      currentStageIdx >= 4 ||
      party.workflow_status?.includes('S03_Completed') ||
      party.workflow_status?.includes('S04') ||
      party.workflow_status?.includes('S05') ||
      party.workflow_status?.includes('S06') ||
      party.workflow_status?.includes('S07') ||
      (['S04_KYC_Commercial_Verification', 'S05_Product_Authorization', 'S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      Boolean(party.parent_distributor_id)
    ) : true);

    const s04Approved = s01Approved && (isSubDealer ? Boolean(
      isPartyActive ||
      local.s04 ||
      metaStages.s04 ||
      currentStageIdx >= 4 ||
      party.workflow_status?.includes('S04_Completed') ||
      party.workflow_status?.includes('S05') ||
      party.workflow_status?.includes('S06') ||
      party.workflow_status?.includes('S07') ||
      (['S04_KYC_Commercial_Verification', 'S05_Product_Authorization', 'S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      Boolean(party.parent_dealer_id)
    ) : true);

    const tierApproved = s01Approved && (isDist ? s02Approved : (isDealer ? s03Approved : s04Approved));

    // 4. S05 Approval: Commercial Security Details & Billing Route
    const s05Approved = tierApproved && Boolean(
      isPartyActive ||
      local.s05 ||
      metaStages.s05 ||
      currentStageIdx >= 5 ||
      party.commercial_status === 'Completed' ||
      party.workflow_status?.includes('S05_Completed') ||
      party.workflow_status?.includes('S06') ||
      party.workflow_status?.includes('S07') ||
      (['S05_Product_Authorization', 'S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      (party.party_commercial_terms && party.party_commercial_terms.length > 0 && party.billing_route_type)
    );

    // 5. S06 Approval: Product Authorization & Territory Allocation
    const s06Approved = s05Approved && Boolean(
      isPartyActive ||
      local.s06 ||
      metaStages.s06 ||
      currentStageIdx >= 7 ||
      party.workflow_status?.includes('S06_Completed') ||
      party.workflow_status?.includes('S07') ||
      (['S06_Territory_Allocation', 'S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      ((party.product_authorizations && party.product_authorizations.length > 0) && (party.territory_allocations && party.territory_allocations.length > 0))
    );

    // 6. S07 Approval: Sales Team Assignment
    const s07Approved = s06Approved && Boolean(
      isPartyActive ||
      local.s07 ||
      metaStages.s07 ||
      currentStageIdx >= 8 ||
      party.workflow_status?.includes('S07_Completed') ||
      (['S07_Employee_Assignment', 'S08_Party_Activation'].includes(party.onboarding_stage)) ||
      (party.team_assignments && party.team_assignments.length > 0)
    );

    // 7. S08 Approval: Partner Activation
    const s08Approved = s07Approved && Boolean(
      isPartyActive ||
      local.s08 ||
      metaStages.s08 ||
      ['Active', 'Inactive', 'Hold', 'Payment Issues'].includes(party.party_status) ||
      ['Active', 'Inactive', 'Hold', 'Payment Issues'].includes(party.final_status)
    );

    return {
      s00: s00Approved,
      s01: s01Approved,
      s02: s02Approved,
      s03: s03Approved,
      s04: s04Approved,
      tier: tierApproved,
      s05: s05Approved,
      s06: s06Approved,
      s07: s07Approved,
      s08: s08Approved
    };
  }, [stageConfirmedMap]);

  // Determine next pending stage requiring attention
  const getNextPendingStage = useCallback((party) => {
    if (!party) return 's01';
    const app = getStageApprovalStatus(party);
    if (!app.s01) return 's01';
    if (party.party_type === 'Distributor' && !app.s02) return 's02';
    if (party.party_type === 'Dealer' && !app.s03) return 's03';
    if (party.party_type === 'Sub-Dealer' && !app.s04) return 's04';
    if (!app.s05) return 's05';
    if (!app.s06) return 's06';
    if (!app.s07) return 's07';
    if (!app.s08) return 's08';
    return 's08';
  }, [getStageApprovalStatus]);

  // Stage Badge Configuration for Table Rows
  const getStageBadgeInfo = useCallback((party) => {
    if (!party) return { label: 'S01 Registration', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' };
    const app = getStageApprovalStatus(party);
    if (app.s08 || party.final_status === 'Active' || party.party_status === 'Active') {
      return { label: 'S08 Verified Active', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
    }
    if (!app.s01) return { label: 'S01 Profile Pending', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' };
    if (party.party_type === 'Distributor' && !app.s02) return { label: 'S02 Hub Config Pending', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' };
    if (party.party_type === 'Dealer' && !app.s03) return { label: 'S03 Parent DIS Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    if (party.party_type === 'Sub-Dealer' && !app.s04) return { label: 'S04 Parent DLR Pending', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    if (!app.s05) return { label: 'S05 Commercial Terms', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
    if (!app.s06) return { label: 'S06 Territory & Products', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' };
    if (!app.s07) return { label: 'S07 Team Mapping', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' };
    return { label: 'S08 Activation Desk', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
  }, [getStageApprovalStatus]);

  // Aggregate KPI Metrics for Summary Ribbon
  const reportMetrics = useMemo(() => {
    const total = filteredParties.length;
    let distCount = 0;
    let dealerCount = 0;
    let subDealerCount = 0;
    let activeCount = 0;
    let totalSecurityDeposit = 0;

    filteredParties.forEach(p => {
      if (p.party_type === 'Distributor') distCount++;
      else if (p.party_type === 'Dealer') dealerCount++;
      else if (p.party_type === 'Sub-Dealer') subDealerCount++;

      if (p.final_status === 'Active' || p.party_status === 'Active') {
        activeCount++;
      }

      const secDep = Number(p.security_deposit_amount || p.party_commercial_terms?.[0]?.security_deposit_amount || 0);
      if (!isNaN(secDep) && secDep > 0) totalSecurityDeposit += secDep;
    });

    return {
      total,
      distCount,
      dealerCount,
      subDealerCount,
      activeCount,
      pendingCount: total - activeCount,
      totalSecurityDeposit
    };
  }, [filteredParties]);

  // Wizard Launch Handler
  const startNewPartyWizard = () => {
    setActivePartyId(null);
    setWizardParty(null);
    setWizardStep('S00');
    setS00ContactTab('biz');
    setS00Form({
      our_company: 'NSMLR',
      party_type: 'Dealer',
      firm_name: '',
      legal_name: '',
      constitution_type: 'PROPRIETORSHIP',
      gstin: '',
      pan: '',
      address: '',
      state_name: 'Punjab',
      district_name: 'Amritsar',
      tehsil: '',
      block_name: '',
      city_village: '',
      pincode: '',
      order_category: 'Rotavator',
      biz_contact_no_1: '',
      biz_contact_no_2: '',
      biz_alt_no_1: '',
      biz_alt_no_2: '',
      biz_email_1: '',
      biz_email_2: '',
      biz_alt_email_1: '',
      biz_alt_email_2: '',
      contact_person_name_1: '',
      contact_mobile_1_1: '',
      contact_mobile_1_2: '',
      contact_alt_mobile_1_1: '',
      contact_alt_mobile_1_2: '',
      contact_email_1_2: '',
      contact_alt_email_1_1: '',
      contact_person_name_2: '',
      contact_mobile_2_1: '',
      contact_mobile_2_2: '',
      contact_alt_mobile_2_1: '',
      contact_alt_mobile_2_2: '',
      contact_email_2_2: '',
      contact_alt_email_2_1: '',
      contact_person_name_3: '',
      contact_mobile_3_1: '',
      contact_mobile_3_2: '',
      contact_alt_mobile_3_1: '',
      contact_alt_mobile_3_2: '',
      contact_email_3_1: '',
      contact_email_3_2: '',
      contact_alt_email_3_1: ''
    });
    setS06ProductCategory('Both');
    setS05SelectedProducts(['ROTAVATOR', 'SPARE_PARTS']);
    switchTab('s01', true);
    setIsStageModalOpen(true);
    setShowWizard(false);
  };

  const resumeWizard = (party, targetTab = null) => {
    if (!party) return;
    setActivePartyId(party.id);
    setWizardParty(party);
    const step = party.next_step?.split('_')[0] || 'S00';

    if (party.party_type === 'Dealer' && party.parent_distributor_id) {
      setS02DealerForm(prev => ({
        ...prev,
        parent_distributor_id: party.parent_distributor_id,
        showroom_area_sqft: party.showroom_area_sqft || 2500,
        dealership_type: party.dealership_type || 'EXCLUSIVE_SWAN'
      }));
    }

    if (party.party_type === 'Sub-Dealer' && party.parent_dealer_id) {
      setS03SubDealerForm(prev => ({
        ...prev,
        parent_dealer_id: party.parent_dealer_id
      }));
    }

    const lead = party.lead || {};
    const st = party.state_name || party.state || lead.state_name || lead.state;
    const dist = party.district_name || party.district || lead.district_name || lead.district;

    setS00Form(prev => ({
      ...prev,
      our_company: party.our_company || party.meta?.our_company || lead.our_company || 'NSMLR',
      party_type: party.party_type || (lead.business_type?.toLowerCase().includes('distributor') ? 'Distributor' : lead.business_type?.toLowerCase().includes('sub') ? 'Sub-Dealer' : 'Dealer'),
      firm_name: party.firm_name || lead.company || lead.name || '',
      legal_name: party.legal_name || lead.company || lead.name || '',
      constitution_type: party.constitution_type || 'PROPRIETORSHIP',
      gstin: party.gstin || lead.business_gst || lead.gstin || '',
      pan: party.pan || lead.pan || '',
      address: party.address || lead.address || '',
      state_name: st || 'Punjab',
      district_name: dist || 'Amritsar',
      tehsil: party.tehsil || lead.tehsil_name || lead.tehsil || '',
      block_name: party.block_name || lead.block_name || '',
      city_village: party.city_village || lead.city_name || lead.city || '',
      pincode: party.pincode || lead.pin_code || lead.pincode || '',
      order_category: party.order_category || lead.requirement || 'Rotavator',
      biz_contact_no_1: party.biz_contact_no_1 || party.meta?.biz_contact_no_1 || party.primary_mobile || lead.business_contact_1 || lead.phone || '',
      biz_contact_no_2: party.biz_contact_no_2 || party.meta?.biz_contact_no_2 || lead.business_contact_2 || '',
      biz_alt_no_1: party.biz_alt_no_1 || party.meta?.biz_alt_no_1 || lead.business_alt_1 || '',
      biz_alt_no_2: party.biz_alt_no_2 || party.meta?.biz_alt_no_2 || lead.business_alt_2 || '',
      biz_email_1: party.biz_email_1 || party.meta?.biz_email_1 || party.official_email || lead.business_email_1 || lead.email || '',
      biz_email_2: party.biz_email_2 || party.meta?.biz_email_2 || lead.business_email_2 || '',
      biz_alt_email_1: party.biz_alt_email_1 || party.meta?.biz_alt_email_1 || lead.business_alt_email_1 || '',
      biz_alt_email_2: party.biz_alt_email_2 || party.meta?.biz_alt_email_2 || lead.business_alt_email_2 || '',
      contact_person_name_1: party.contact_person_name_1 || party.meta?.contact_person_name_1 || party.contact_person || party.owner_name || lead.name || lead.cp1_name || '',
      contact_mobile_1_1: party.contact_mobile_1_1 || party.meta?.contact_mobile_1_1 || party.primary_mobile || lead.phone || lead.cp1_mobile_1 || '',
      contact_mobile_1_2: party.contact_mobile_1_2 || party.meta?.contact_mobile_1_2 || lead.cp1_mobile_2 || '',
      contact_alt_mobile_1_1: party.contact_alt_mobile_1_1 || party.meta?.contact_alt_mobile_1_1 || lead.cp1_alt_1 || '',
      contact_alt_mobile_1_2: party.contact_alt_mobile_1_2 || party.meta?.contact_alt_mobile_1_2 || lead.cp1_alt_2 || '',
      contact_email_1_2: party.contact_email_1_2 || party.meta?.contact_email_1_2 || party.official_email || lead.email || lead.cp1_email_2 || '',
      contact_alt_email_1_1: party.contact_alt_email_1_1 || party.meta?.contact_alt_email_1_1 || lead.cp1_alt_1 || '',
      contact_person_name_2: party.contact_person_name_2 || party.meta?.contact_person_name_2 || lead.cp2_name || '',
      contact_mobile_2_1: party.contact_mobile_2_1 || party.meta?.contact_mobile_2_1 || lead.cp2_mobile_1 || '',
      contact_mobile_2_2: party.contact_mobile_2_2 || party.meta?.contact_mobile_2_2 || lead.cp2_mobile_2 || '',
      contact_alt_mobile_2_1: party.contact_alt_mobile_2_1 || party.meta?.contact_alt_mobile_2_1 || lead.cp2_alt_1 || '',
      contact_alt_mobile_2_2: party.contact_alt_mobile_2_2 || party.meta?.contact_alt_mobile_2_2 || lead.cp2_alt_2 || '',
      contact_email_2_2: party.contact_email_2_2 || party.meta?.contact_email_2_2 || lead.cp2_email_2 || '',
      contact_alt_email_2_1: party.contact_alt_email_2_1 || party.meta?.contact_alt_email_2_1 || lead.cp2_email_1 || '',
      contact_person_name_3: party.contact_person_name_3 || party.meta?.contact_person_name_3 || lead.cp3_name || '',
      contact_mobile_3_1: party.contact_mobile_3_1 || party.meta?.contact_mobile_3_1 || lead.cp3_mobile_1 || '',
      contact_mobile_3_2: party.contact_mobile_3_2 || party.meta?.contact_mobile_3_2 || lead.cp3_mobile_2 || '',
      contact_alt_mobile_3_1: party.contact_alt_mobile_3_1 || party.meta?.contact_alt_mobile_3_1 || lead.cp3_alt_1 || '',
      contact_alt_mobile_3_2: party.contact_alt_mobile_3_2 || party.meta?.contact_alt_mobile_3_2 || lead.cp3_alt_2 || '',
      contact_email_3_1: party.contact_email_3_1 || party.meta?.contact_email_3_1 || lead.cp3_email_1 || '',
      contact_email_3_2: party.contact_email_3_2 || party.meta?.contact_email_3_2 || lead.cp3_email_2 || '',
      contact_alt_email_3_1: party.contact_alt_email_3_1 || party.meta?.contact_alt_email_3_1 || lead.cp3_email_2 || ''
    }));

    const commTerms = (party.party_commercial_terms && party.party_commercial_terms[0]) || {};
    setS04CommForm(prev => ({
      ...prev,
      billing_route_type: party.billing_route_type || prev.billing_route_type || 'DIRECT_COMPANY_BILLING',
      security_deposit_amount: party.security_deposit_amount ?? commTerms.security_deposit_amount ?? prev.security_deposit_amount,
      credit_limit: party.credit_limit ?? commTerms.credit_limit ?? prev.credit_limit,
      credit_days: party.credit_days ?? commTerms.credit_days ?? prev.credit_days,
      security_deposit_date: party.security_deposit_date || party.meta?.security_deposit_date || prev.security_deposit_date,
      security_mode: party.security_mode || party.meta?.security_mode || prev.security_mode,
      receipt_no: party.receipt_no || party.meta?.receipt_no || prev.receipt_no,
      distributor_commission_percent: party.distributor_commission_percent ?? party.meta?.distributor_commission_percent ?? prev.distributor_commission_percent,
      billing_first_date: party.billing_first_date || party.meta?.billing_first_date || '',
      billing_first_amount: party.billing_first_amount ?? party.meta?.billing_first_amount ?? '',
      billing_first_status: party.billing_first_status || party.meta?.billing_first_status || 'Pending'
    }));

    const rawDistricts = party.assigned_districts || party.headquarter_districts || party.meta?.assigned_districts || party.meta?.headquarter_districts || party.district_name || '';
    const parsedDistricts = Array.isArray(rawDistricts)
      ? rawDistricts
      : (typeof rawDistricts === 'string' && rawDistricts ? rawDistricts.split(',').map(s => s.trim()).filter(Boolean) : []);

    setS01DistForm(prev => ({
      ...prev,
      zone: party.zone || prev.zone || 'North Zone',
      state: party.state_name || prev.state || 'Punjab',
      district: Array.isArray(rawDistricts) ? rawDistricts.join(', ') : (rawDistricts || prev.district || ''),
      districts: parsedDistricts.length > 0 ? parsedDistricts : (prev.districts || [])
    }));
    if (party.party_status || party.final_status) {
      setS08ActivationStatus(party.party_status || party.final_status || 'Active');
    }
    if (party.remarks) {
      setS08Remarks(party.remarks);
    }
    if (party.product_authorizations && party.product_authorizations.length > 0) {
      const pNames = party.product_authorizations.map(p => p.product_name || p.order_category);
      setS05SelectedProducts(pNames);
      const savedCat = party.product_category || party.product_authorizations[0]?.product_category;
      if (savedCat && ['Implement', 'Spare Part', 'Both'].includes(savedCat)) {
        setS06ProductCategory(savedCat);
      } else {
        const hasSpares = pNames.includes('SPARE_PARTS');
        const hasImplements = pNames.some(x => x !== 'SPARE_PARTS');
        if (hasSpares && hasImplements) setS06ProductCategory('Both');
        else if (hasSpares) setS06ProductCategory('Spare Part');
        else setS06ProductCategory('Implement');
      }
    } else {
      setS06ProductCategory(party.product_category || 'Both');
    }
    if (party.team_assignments && party.team_assignments.length > 0) {
      const newTeamMap = {
        NSM: [], RSM: [], ASM: [],
        ORDER_BOOKING: [], POST_ORDER: [],
        MONTHLY_RELATIONSHIP: [], COMPLAINT_OFFICER: []
      };
      party.team_assignments.forEach(a => {
        if (newTeamMap[a.role_in_party]) {
          newTeamMap[a.role_in_party].push(a.employee_name);
        }
      });
      setS06TeamMap(prev => ({ ...prev, ...newTeamMap }));
    }

    if (party.territory_allocations && party.territory_allocations.length > 0) {
      const terr = party.territory_allocations[0];
      setS05TerritoryForm(prev => ({
        ...prev,
        zone: terr.zone || party.zone || prev.zone,
        state: terr.state || party.state_name || prev.state,
        district: terr.district || party.district_name || prev.district,
        tehsil_area: terr.tehsil_area || prev.tehsil_area,
        market_coverage_chips: Array.isArray(terr.market_coverage_area) ? terr.market_coverage_area : (typeof terr.market_coverage_area === 'string' && terr.market_coverage_area ? terr.market_coverage_area.split(',').map(s => s.trim()) : prev.market_coverage_chips),
        territory_type: terr.territory_type || prev.territory_type
      }));
    } else if (party.state_name) {
      setS05TerritoryForm(prev => ({
        ...prev,
        zone: party.zone || prev.zone,
        state: party.state_name,
        district: party.district_name || '',
        tehsil_area: party.tehsil || prev.tehsil_area
      }));
    }

    if (st) {
      (async () => {
        try {
          const stObj = locationStates.find(s => (s.state_name || s.name || '').toLowerCase() === st.toLowerCase());
          const dbDists = await getDistrictsCentral(stObj?.id || null, st);
          if (dbDists && dbDists.length > 0) {
            const names = dbDists.map(d => d.district_name || d.name);
            setS00Districts(names);
            setS05Districts(names);
          }
        } catch (_) {}
      })();
    }
    const targetSubmenu = targetTab || getNextPendingStage(party);
    switchTab(targetSubmenu, true);
    setShowWizard(false);
    setIsStageModalOpen(true);
  };

  const stageFormRef = useRef(null);

  const handleSelectStageParty = (party) => {
    resumeWizard(party, activeTab);
    setIsStageModalOpen(true);
  };

  const handleDeleteParty = (party) => {
    if (!party) return;
    setDeleteConfirmParty(party);
  };

  const executeDeleteParty = async (party) => {
    if (!party?.id) return;
    setIsDeletingParty(true);
    try {
      const res = await deletePartyMaster(party.id);
      if (!res.success) {
        setCenterAlert({
          isOpen: true,
          type: 'error',
          title: 'Deletion Blocked',
          message: res.error || 'Failed to delete party',
          subMessage: 'Please resolve linked child partners and try again.',
          confirmText: 'Dismiss'
        });
        return;
      }

      // Close confirmation dialog
      setDeleteConfirmParty(null);

      // Reset modal and active states if active party was deleted
      if (activePartyId === party.id || wizardParty?.id === party.id) {
        setActivePartyId(null);
        setWizardParty(null);
        setIsStageModalOpen(false);
      }

      await loadInitialData();
      await refreshTransferredLeads();

      setCenterAlert({
        isOpen: true,
        type: 'success',
        title: 'Party Deleted',
        message: res.message || `Party "${party.firm_name}" was successfully removed.`,
        partnerName: party.firm_name,
        partnerCode: party.party_universal_code || party.id,
        subMessage: party.source_lead_id ? 'The source lead in S08 has been safely reset to Pending Confirmation.' : '',
        confirmText: 'Done'
      });
    } catch (err) {
      console.error('Error deleting party:', err);
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'Unexpected Error',
        message: err.message || 'An error occurred while deleting the party',
        confirmText: 'Dismiss'
      });
    } finally {
      setIsDeletingParty(false);
    }
  };

  // Wizard & Submenu Save Handlers
  const handleS00Submit = async (e) => {
    e.preventDefault();
    try {
      const primaryPhone = s00Form.biz_contact_no_1 || s00Form.contact_mobile_1_1 || '0000000000';
      const owner = s00Form.contact_person_name_1 || s00Form.firm_name;

      const payload = {
        ...s00Form,
        primary_mobile: primaryPhone,
        owner_name: owner,
        contact_person: s00Form.contact_person_name_1,
        workflow_status: 'S01_Approved'
      };

      let partyId = activePartyId;
      let partyObj = null;

      if (partyId) {
        partyObj = await updatePartyStep(partyId, 'S00_Party_Master', payload);
      } else {
        partyObj = await createPartyMaster(payload);
        partyId = partyObj.id;
        setActivePartyId(partyId);
      }
      setWizardParty(partyObj);
      await loadInitialData();

      setStageConfirmedMap(prev => ({
        ...prev,
        [partyId]: { ...(prev[partyId] || {}), s01: true }
      }));

      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S01 Registration Error',
        message: err.message
      });
    }
  };

  const handleS01DistSubmit = async (e) => {
    e.preventDefault();
    try {
      const distChips = Array.isArray(s01DistForm.districts) && s01DistForm.districts.length > 0
        ? s01DistForm.districts
        : (s01DistForm.district ? (typeof s01DistForm.district === 'string' ? s01DistForm.district.split(',').map(s => s.trim()).filter(Boolean) : []) : []);
      const distString = distChips.join(', ');

      await updatePartyStep(activePartyId, 'S01_Distributor_Registration', {
        zone: s01DistForm.zone,
        state: s01DistForm.state,
        district: distString,
        district_name: distString,
        assigned_districts: distChips,
        headquarter_districts: distChips,
        workflow_status: 'S02_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s02: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S02 Distributor Error',
        message: err.message
      });
    }
  };

  const handleS02DealerSubmit = async (e) => {
    e.preventDefault();
    if (!s02DealerForm.parent_distributor_id) {
      setCenterAlert({
        isOpen: true,
        type: 'warning',
        title: 'Parent Distributor Required',
        message: 'CRITICAL RULE: Dealer must belong to an Active Parent Distributor!'
      });
      return;
    }
    try {
      await updatePartyStep(activePartyId, 'S02_Dealer_Registration', {
        parent_distributor_id: s02DealerForm.parent_distributor_id,
        dealership_type: s02DealerForm.dealership_type,
        showroom_area_sqft: s02DealerForm.showroom_area_sqft,
        workflow_status: 'S03_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s03: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S03 Dealer Error',
        message: err.message
      });
    }
  };

  const handleS03SubDealerSubmit = async (e) => {
    e.preventDefault();
    if (!s03SubDealerForm.parent_dealer_id) {
      setCenterAlert({
        isOpen: true,
        type: 'warning',
        title: 'Parent Dealer Required',
        message: 'CRITICAL RULE: Sub-Dealer must belong to an Active Parent Dealer!'
      });
      return;
    }
    const selectedDealer = parties.find(p => p.id === s03SubDealerForm.parent_dealer_id);
    const derivedDistId = selectedDealer?.parent_distributor_id;

    try {
      await updatePartyStep(activePartyId, 'S03_Sub_Dealer_Registration', {
        parent_dealer_id: s03SubDealerForm.parent_dealer_id,
        parent_distributor_id: derivedDistId,
        workflow_status: 'S04_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s04: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S04 Sub-Dealer Error',
        message: err.message
      });
    }
  };

  const handleS04CommercialSubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePartyStep(activePartyId, 'S04_Commercial', {
        ...s04CommForm,
        commercial_status: 'Completed',
        workflow_status: 'S05_Completed',
        next_step: 'S05_Product_Authorization'
      });
      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s05: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S05 Commercial Error',
        message: err.message
      });
    }
  };

  // Combined S06 Product Authorization & Territory Allocation Submit
  const handleS05CombinedSubmit = async (e) => {
    e.preventDefault();
    if (s05SelectedProducts.length === 0) {
      setCenterAlert({
        isOpen: true,
        type: 'warning',
        title: 'Product Required',
        message: 'At least one Product must be authorized for this party!'
      });
      return;
    }
    try {
      // 1. Save products
      const items = s05SelectedProducts.map(p => ({
        product_name: p,
        product_category: s06ProductCategory,
        order_category: s06ProductCategory === 'Spare Part' ? 'Spare Parts' : p,
        opening_stock_required: 1
      }));
      await saveProductAuthorizations(activePartyId, items);

      // 2. Save territory
      await saveTerritoryAllocation(activePartyId, {
        zone: s05TerritoryForm.zone,
        state: s05TerritoryForm.state,
        district: s05TerritoryForm.district,
        tehsil_area: s05TerritoryForm.tehsil_area,
        market_coverage_area: s05TerritoryForm.market_coverage_chips,
        territory_type: s05TerritoryForm.territory_type
      });

      await updatePartyStep(activePartyId, 'S05_Product_Authorization_Territory', {
        state_name: s05TerritoryForm.state,
        district_name: s05TerritoryForm.district,
        product_category: s06ProductCategory,
        workflow_status: 'S06_Completed',
        next_step: 'S06_Team_Assignment'
      });

      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s06: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S06 Product & Territory Error',
        message: err.message
      });
    }
  };

  const handleS06TeamSubmit = async (e) => {
    e.preventDefault();
    try {
      const flatAssignments = [];
      Object.entries(s06TeamMap).forEach(([role, names]) => {
        names.forEach(empName => {
          const emp = employees.find(e => e.emp_name === empName);
          flatAssignments.push({
            role_in_party: role,
            employee_id: emp?.id || null,
            employee_name: empName,
            assignment_type: 'Primary'
          });
        });
      });

      await saveTeamAssignments(activePartyId, flatAssignments);
      await updatePartyStep(activePartyId, 'S06_Team_Assignment', {
        workflow_status: 'S07_Completed',
        next_step: 'S07_Activation'
      });
      await loadInitialData();
      setStageConfirmedMap(prev => ({
        ...prev,
        [activePartyId]: { ...(prev[activePartyId] || {}), s07: true }
      }));
      setIsStageModalOpen(false);
      setActivePartyId(null);
      setWizardParty(null);
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'S07 Sales Team Error',
        message: err.message
      });
    }
  };

  const handleS07Activation = async () => {
    setActivationErrors([]);
    try {
      const res = await activatePartner(activePartyId, s08ActivationStatus, s08Remarks);
      if (!res.success) {
        setActivationErrors(res.errors || []);
        setCenterAlert({
          isOpen: true,
          type: 'warning',
          title: 'Activation Notice',
          message: (res.errors || []).join('\n'),
          partnerName: '',
          partnerCode: '',
          status: s08ActivationStatus,
          confirmText: 'Dismiss',
          onConfirm: null
        });
      } else {
        const currentP = parties.find(p => p.id === activePartyId) || wizardParty;
        setShowWizard(false);
        setIsStageModalOpen(false);
        setStageConfirmedMap(prev => ({
          ...prev,
          [activePartyId]: { ...(prev[activePartyId] || {}), s08: true }
        }));
        await loadInitialData();

        setCenterAlert({
          isOpen: true,
          type: 'success',
          title: 'Channel Partner Activated',
          message: `🎉 Channel Partner status set to "${s08ActivationStatus}" successfully!`,
          partnerName: currentP?.firm_name || '',
          partnerCode: currentP?.party_universal_code || currentP?.party_type || '',
          status: s08ActivationStatus,
          confirmText: 'Go to Party Master Report ➔',
          onConfirm: () => {
            switchTab('report');
          }
        });
      }
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'Activation Error',
        message: err.message,
        partnerName: '',
        partnerCode: '',
        status: '',
        confirmText: 'Dismiss',
        onConfirm: null
      });
    }
  };

  const open360Modal = async (party) => {
    setView360Party(party);
    try {
      const details = await getParty360Details(party.id);
      setParty360Data(details);
      if (details?.party) {
        setView360Party(prev => ({ ...(prev || {}), ...details.party }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmHandoffLead = async (leadItem) => {
    try {
      setLoadingTransfers(true);
      const res = await confirmLeadTransfer(leadItem.handoff_id, leadItem.party_id, 'Admin');
      if (res && res.success) {
        setCenterAlert({
          isOpen: true,
          type: 'success',
          title: 'Lead Transfer Confirmed',
          message: `Lead "${leadItem.firm_name || leadItem.lead_name}" confirmed successfully!`,
          subMessage: 'Party Master record initialized. Moving to Stage S01 Registration.',
          confirmText: 'Continue to S01 ➔',
          onConfirm: null
        });
        const [freshParties, freshTrans] = await Promise.all([
          getPartyList(),
          getTransferredLeads()
        ]);
        setParties(freshParties);
        setTransferredLeads(freshTrans);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('party_transferred_updated'));
        }
        const targetParty = freshParties.find(p => p.id === leadItem.party_id) || res.party;
        if (targetParty) {
          resumeWizard(targetParty);
        } else {
          setActivePartyId(leadItem.party_id);
          setS00Form(prev => ({
            ...prev,
            our_company: leadItem.our_company || leadItem.lead?.our_company || 'NSMLR'
          }));
        }
        setStageConfirmedMap(prev => ({
          ...prev,
          [leadItem.party_id]: { ...(prev[leadItem.party_id] || {}), s00: true }
        }));
        switchTab('s01', true);
        setIsStageModalOpen(true);
      }
    } catch (err) {
      setCenterAlert({
        isOpen: true,
        type: 'error',
        title: 'Transfer Confirmation Error',
        message: err.message
      });
    } finally {
      setLoadingTransfers(false);
    }
  };
  // Note: getStageApprovalStatus moved above resumeWizard for consistent stage routing

  return (
    <div style={{ padding: '1.5rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* ========================================================= */}
      {/* SUBMENU TAB DASHBOARD: PARTY MASTER DASHBOARD */}
      {/* ========================================================= */}
      {activeTab === 'dashboard' && (
        <PartyMasterDashboard
          parties={parties}
          transferredLeads={transferredLeads}
          loadingTransfers={loadingTransfers}
          onSwitchTab={switchTab}
          onNewParty={startNewPartyWizard}
          getStageApprovalStatus={getStageApprovalStatus}
          onConfirmHandoffLead={handleConfirmHandoffLead}
          resumeWizard={resumeWizard}
          setIsStageModalOpen={setIsStageModalOpen}
          refreshData={loadInitialData}
          refreshTransferredLeads={refreshTransferredLeads}
          orderFollowups={orderFollowups}
          orderFeedbacks={orderFeedbacks}
          monthlyFeedbacks={monthlyFeedbacks}
          complaints={complaints}
        />
      )}

      {/* Top Header & Quick KPI Bar for non-dashboard tabs */}
      {activeTab !== 'dashboard' && (
        <>
          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Building2 className="text-emerald-500" size={30} />
                Client Management &amp; Channel Partner Portal
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.3rem 0 0 0' }}>
                Strict 3-Tier Hierarchy (Distributor ➔ Dealer ➔ Sub-Dealer), Direct vs Distributor Billing &amp; 4 Operational Follow-up Engines
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => switchTab('dashboard')}
                style={{
                  padding: '0.6rem 1.1rem',
                  background: 'var(--bg-surface)',
                  border: '1.5px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--accent-color)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}
              >
                📊 Dashboard
              </button>
              <button onClick={loadInitialData} className="btn-action-secondary" style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={startNewPartyWizard}
                style={{
                  padding: '0.65rem 1.4rem',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
                }}
              >
                <Plus size={18} /> + Onboard New Channel Partner (S01)
              </button>
            </div>
          </div>

          {/* KPI Stats Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            <div
              onClick={() => switchTab('dashboard')}
              style={{
                background: 'var(--bg-surface)',
                border: '1.5px solid var(--accent-color)',
                borderRadius: '12px',
                padding: '0.9rem 1rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--accent-color)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>📊 Dashboard</span>
                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'var(--nav-active-bg)', fontWeight: 800 }}>Hub</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                Executive View ➔
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Channel Partners</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {parties.filter(p => p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry').length}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#60a5fa', fontWeight: 700 }}>👑 Level 1: Distributors</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.15rem' }}>
                {parties.filter(p => p.party_type === 'Distributor' && p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry').length}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>🏪 Level 2: Dealers</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', marginTop: '0.15rem' }}>
                {parties.filter(p => p.party_type === 'Dealer' && p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry').length}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700 }}>🛒 Level 3: Sub-Dealers</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.15rem' }}>
                {parties.filter(p => p.party_type === 'Sub-Dealer' && p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry').length}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>⚡ Direct Billing</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '0.15rem' }}>
                {parties.filter(p => p.billing_route_type === 'DIRECT_COMPANY_BILLING' && p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry').length}
              </div>
            </div>
            <div
              onClick={() => switchTab('s00')}
              style={{
                background: 'var(--bg-surface)',
                border: '1.5px solid rgba(239,68,68,0.35)',
                borderRadius: '12px',
                padding: '0.9rem 1rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'}
            >
              <div style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>🚀 Stage 07 Transfers</span>
                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontWeight: 800 }}>S00</span>
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ef4444', marginTop: '0.15rem' }}>
                {transferredLeads.filter(l => l.transfer_status === 'PENDING_CONFIRMATION').length} <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Pending</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* SUBMENU TAB S00: TRANSFERED TO PARTY MASTER (FROM STAGE 07) */}
      {/* ========================================================= */}
      {activeTab === 's00' && (
        <div>
          <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>STAGE S00</span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Transferred to Party Master (Leads from Stage 08)</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: '0.35rem 0 0 0' }}>
                Converted leads transferred from <strong>Lead Data &gt; 08 - Transfer to Party</strong>. Review, confirm and advance directly to <strong>S01 Party Master Creation</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={refreshTransferredLeads}
                title="Refresh transferred leads from Lead Data"
                style={{
                  padding: '0.6rem 1rem',
                  background: 'var(--bg-surface)',
                  border: '1.5px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <RefreshCw size={15} /> Refresh S00
              </button>
              <button
                onClick={startNewPartyWizard}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Plus size={16} /> + Onboard Direct Partner (Without Lead Handoff)
              </button>
            </div>
          </div>

          {/* S00 Search & Status Filter Controls Bar */}
          <div style={{
            background: 'var(--bg-surface)',
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            marginBottom: '1rem',
            border: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 300px', maxWidth: '500px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={s00SearchTerm}
                  onChange={e => { setS00SearchTerm(e.target.value); setS00CurrentPage(1); }}
                  placeholder="Search Lead ID, Firm, Contact, Mobile, City, State..."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <select
                value={s00StatusFilter}
                onChange={e => { setS00StatusFilter(e.target.value); setS00CurrentPage(1); }}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              >
                <option value="ALL">All Status ({transferredLeads.length})</option>
                <option value="PENDING">⏳ Pending Confirmation ({transferredLeads.filter(l => l.transfer_status !== 'CONFIRMED').length})</option>
                <option value="CONFIRMED">✓ Confirmed in S01 ({transferredLeads.filter(l => l.transfer_status === 'CONFIRMED').length})</option>
              </select>

              {(s00SearchTerm || s00StatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => { setS00SearchTerm(''); setS00StatusFilter('ALL'); setS00CurrentPage(1); }}
                  style={{
                    padding: '0.45rem 0.75rem',
                    background: 'transparent',
                    border: '1px solid var(--border-light)',
                    borderRadius: '7px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Lead Universal ID</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Our Company</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Lead &amp; Firm Name</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Contact Person &amp; Phone</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Location (State / District)</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Transferred At (IST)</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingTransfers ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                      Loading transferred leads...
                    </td>
                  </tr>
                ) : paginatedS00Leads.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                        {s00SearchTerm || s00StatusFilter !== 'ALL' ? 'No transferred leads match your search criteria.' : 'No leads transferred from Stage 08 yet.'}
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '520px', margin: '0 auto 1.25rem auto' }}>
                        {s00SearchTerm || s00StatusFilter !== 'ALL'
                          ? 'Try adjusting your search query or reset status filter to view all records.'
                          : 'When an executive marks a deal as won in Lead Data > 08 - Transfer to Party (or Stage 07), click the "Transfer to Party Master (S00)" button to send it here.'}
                      </p>
                      {s00SearchTerm || s00StatusFilter !== 'ALL' ? (
                        <button
                          onClick={() => { setS00SearchTerm(''); setS00StatusFilter('ALL'); setS00CurrentPage(1); }}
                          style={{ padding: '0.5rem 1.1rem', background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', borderRadius: '8px', color: '#60a5fa', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Clear S00 Filters
                        </button>
                      ) : (
                        <button onClick={startNewPartyWizard} style={{ padding: '0.6rem 1.2rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                          + Create Party Master Directly
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedS00Leads.map(lead => {
                    const isConfirmed = lead.transfer_status === 'CONFIRMED';
                    return (
                      <tr key={lead.handoff_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#38bdf8' }}>
                          {lead.lead_universal_id || 'LEAD'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '5px',
                            background: (lead.our_company === 'NSTL' || lead.our_company === 'NSTLP') ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                            color: (lead.our_company === 'NSTL' || lead.our_company === 'NSTLP') ? '#ec4899' : '#f59e0b',
                            border: `1px solid ${(lead.our_company === 'NSTL' || lead.our_company === 'NSTLP') ? 'rgba(236,72,153,0.35)' : 'rgba(245,158,11,0.35)'}`
                          }}>
                            {lead.our_company === 'NSTLP' ? 'NSTL' : (lead.our_company || 'NSMLR')}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lead.firm_name || lead.lead_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Category: {lead.order_category || 'Agro Implements'}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600 }}>{lead.contact_person || lead.lead_name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#34d399' }}>{lead.primary_mobile}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                          <div>{lead.state_name || 'Punjab'}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>{lead.district_name || 'Amritsar'}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {lead.handoff_at ? new Date(lead.handoff_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: isConfirmed ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                            color: isConfirmed ? '#34d399' : '#fbbf24'
                          }}>
                            {isConfirmed ? '✓ Confirmed (In S01)' : '⏳ Pending Confirmation'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {!isConfirmed ? (
                            <button
                              onClick={() => handleConfirmHandoffLead(lead)}
                              style={{
                                padding: '0.45rem 0.95rem',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                              }}
                            >
                              <CheckCircle2 size={14} /> Confirm &amp; Move to S01 ➔
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const targetP = parties.find(p => p.id === lead.party_id) || lead;
                                resumeWizard(targetP, 's01');
                                setIsStageModalOpen(true);
                              }}
                              style={{
                                padding: '0.45rem 0.95rem',
                                background: 'rgba(59,130,246,0.15)',
                                border: '1px solid #3b82f6',
                                borderRadius: '6px',
                                color: '#60a5fa',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}
                            >
                              Open in S01 ➔
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* S00 Pagination Bar Matching Lead Data */}
            <div style={{
              padding: '0.75rem 1.25rem',
              borderTop: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.85rem' }}>
                <span>
                  {totalS00Records === 0
                    ? 'Showing 0 to 0 of 0 leads'
                    : `Showing ${(validS00CurrentPage - 1) * (s00PageSize === 'All' ? totalS00Records : Number(s00PageSize)) + 1} to ${Math.min(validS00CurrentPage * (s00PageSize === 'All' ? totalS00Records : Number(s00PageSize)), totalS00Records)} of ${totalS00Records} leads`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem' }}>Rows per page:</span>
                  <select
                    value={s00PageSize}
                    onChange={e => {
                      setS00PageSize(e.target.value === 'All' ? 'All' : Number(e.target.value));
                      setS00CurrentPage(1);
                    }}
                    style={{
                      padding: '0.3rem 0.55rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    {[10, 15, 20, 50, 100].map(s => (
                      <option key={s} value={s}>Show {s}</option>
                    ))}
                    <option value="All">All</option>
                  </select>
                </div>
              </div>

              {s00PageSize !== 'All' && totalS00Pages > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setS00CurrentPage(1)}
                    disabled={validS00CurrentPage <= 1}
                    title="First Page"
                    style={{
                      padding: '0.3rem 0.6rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validS00CurrentPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: validS00CurrentPage <= 1 ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => setS00CurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={validS00CurrentPage <= 1}
                    title="Previous Page"
                    style={{
                      padding: '0.3rem 0.65rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validS00CurrentPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: validS00CurrentPage <= 1 ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    ‹ Prev
                  </button>

                  {/* Page Numbers */}
                  {(() => {
                    const pages = [];
                    let start = Math.max(1, validS00CurrentPage - 2);
                    let end = Math.min(totalS00Pages, validS00CurrentPage + 2);
                    if (validS00CurrentPage <= 3) end = Math.min(5, totalS00Pages);
                    if (validS00CurrentPage >= totalS00Pages - 2) start = Math.max(1, totalS00Pages - 4);

                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          type="button"
                          onClick={() => setS00CurrentPage(i)}
                          style={{
                            minWidth: '30px',
                            height: '30px',
                            padding: '0 0.4rem',
                            border: '1px solid var(--border-light)',
                            borderRadius: '5px',
                            background: validS00CurrentPage === i ? '#ef4444' : 'var(--bg-surface)',
                            color: validS00CurrentPage === i ? '#ffffff' : 'var(--text-primary)',
                            fontWeight: validS00CurrentPage === i ? 700 : 500,
                            cursor: 'pointer',
                            fontSize: '0.78rem'
                          }}
                        >
                          {i}
                        </button>
                      );
                    }
                    return pages;
                  })()}

                  <button
                    type="button"
                    onClick={() => setS00CurrentPage(prev => Math.min(totalS00Pages, prev + 1))}
                    disabled={validS00CurrentPage >= totalS00Pages}
                    title="Next Page"
                    style={{
                      padding: '0.3rem 0.65rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validS00CurrentPage >= totalS00Pages ? 'not-allowed' : 'pointer',
                      opacity: validS00CurrentPage >= totalS00Pages ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setS00CurrentPage(totalS00Pages)}
                    disabled={validS00CurrentPage >= totalS00Pages}
                    title="Last Page"
                    style={{
                      padding: '0.3rem 0.6rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validS00CurrentPage >= totalS00Pages ? 'not-allowed' : 'pointer',
                      opacity: validS00CurrentPage >= totalS00Pages ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    Last »
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUBMENU TABS S01 TO S08: STAGE DATA TABLES */}
      {/* ========================================================= */}
      {activeTab === 's01' && (
        <StageDataTable
          stageId="s01"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's02' && (
        <StageDataTable
          stageId="s02"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's03' && (
        <StageDataTable
          stageId="s03"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's04' && (
        <StageDataTable
          stageId="s04"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's05' && (
        <StageDataTable
          stageId="s05"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's06' && (
        <StageDataTable
          stageId="s06"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's07' && (
        <StageDataTable
          stageId="s07"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {activeTab === 's08' && (
        <StageDataTable
          stageId="s08"
          parties={parties}
          activePartyId={activePartyId}
          onSelectParty={handleSelectStageParty}
          getStageApprovalStatus={getStageApprovalStatus}
          onNewParty={startNewPartyWizard}
          onDeleteParty={handleDeleteParty}
        />
      )}

      {/* ========================================================= */}
      {/* POPUP ACTION MODAL FOR STAGES S01 TO S08 */}
      {/* ========================================================= */}
      <StageConfigModal
        isOpen={isStageModalOpen}
        activeTab={activeTab}
        onClose={() => {
          setIsStageModalOpen(false);
          setActivePartyId(null);
          setWizardParty(null);
        }}
        onSwitchTab={(tab) => {
          switchTab(tab, true);
          setIsStageModalOpen(true);
        }}
        modalParty={wizardParty || parties.find(p => p.id === activePartyId)}
        onDeleteParty={handleDeleteParty}
        approvals={getStageApprovalStatus(wizardParty || parties.find(p => p.id === activePartyId))}
        // S01
        s00Form={s00Form}
        setS00Form={setS00Form}
        s00ContactTab={s00ContactTab}
        setS00ContactTab={setS00ContactTab}
        s00Districts={s00Districts}
        locationStates={locationStates}
        handleS00StateChange={handleS00StateChange}
        handleS00Submit={handleS00Submit}
        // S02
        s01DistForm={s01DistForm}
        setS01DistForm={setS01DistForm}
        handleS01DistSubmit={handleS01DistSubmit}
        // S03
        s02DealerForm={s02DealerForm}
        setS02DealerForm={setS02DealerForm}
        activeDistributors={activeDistributors}
        handleS02DealerSubmit={handleS02DealerSubmit}
        // S04
        s03SubDealerForm={s03SubDealerForm}
        setS03SubDealerForm={setS03SubDealerForm}
        activeDealers={activeDealers}
        parties={parties}
        handleS03SubDealerSubmit={handleS03SubDealerSubmit}
        // S05
        s04CommForm={s04CommForm}
        setS04CommForm={setS04CommForm}
        handleS04CommercialSubmit={handleS04CommercialSubmit}
        // S06
        s05TerritoryForm={s05TerritoryForm}
        setS05TerritoryForm={setS05TerritoryForm}
        s05Districts={s05Districts}
        s06ProductCategory={s06ProductCategory}
        setS06ProductCategory={setS06ProductCategory}
        s05SelectedProducts={s05SelectedProducts}
        setS05SelectedProducts={setS05SelectedProducts}
        handleS05StateChange={handleS05StateChange}
        handleS05CombinedSubmit={handleS05CombinedSubmit}
        // S07
        s06TeamMap={s06TeamMap}
        setS06TeamMap={setS06TeamMap}
        employeeNames={employeeNames}
        handleS06TeamSubmit={handleS06TeamSubmit}
        // S08
        s08ActivationStatus={s08ActivationStatus}
        setS08ActivationStatus={setS08ActivationStatus}
        s08Remarks={s08Remarks}
        setS08Remarks={setS08Remarks}
        handleS07Activation={handleS07Activation}
        activationErrors={activationErrors}
      />

      {/* ========================================================= */}
      {/* TAB 1: PARTY MASTER REPORT & HIERARCHY TABLE */}
      {/* ========================================================= */}
      {(activeTab === 'report' || activeTab === 'r03') && (
        <div>
          {/* ========================================================= */}
          {/* KPI SUMMARY METRICS RIBBON */}
          {/* ========================================================= */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            {/* Card 1: Total Partners */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                <Building2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Filtered</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{reportMetrics.total}</div>
              </div>
            </div>

            {/* Card 2: Distributors */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                👑
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Distributors</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8' }}>{reportMetrics.distCount}</div>
              </div>
            </div>

            {/* Card 3: Dealers */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                🏪
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dealers</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>{reportMetrics.dealerCount}</div>
              </div>
            </div>

            {/* Card 4: Sub-Dealers */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                🛒
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sub-Dealers</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24' }}>{reportMetrics.subDealerCount}</div>
              </div>
            </div>

            {/* Card 5: Active Verified */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Verified</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>
                  {reportMetrics.activeCount}
                  {reportMetrics.pendingCount > 0 && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '0.35rem' }}>
                      ({reportMetrics.pendingCount} draft)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 6: Total Security Deposit */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Sec. Deposit</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                  ₹{reportMetrics.totalSecurityDeposit >= 10000000
                    ? `${(reportMetrics.totalSecurityDeposit / 10000000).toFixed(2)} Cr`
                    : reportMetrics.totalSecurityDeposit >= 100000
                    ? `${(reportMetrics.totalSecurityDeposit / 100000).toFixed(1)} L`
                    : Number(reportMetrics.totalSecurityDeposit).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* CONTROLS BAR: SEARCH, EXPORT, FILTERS */}
          {/* ========================================================= */}
          <div style={{
            background: 'var(--bg-surface)',
            padding: '1rem',
            borderRadius: '12px',
            marginBottom: '1rem',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}>
            {/* Top Row: Search and Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: '460px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setReportCurrentPage(1); }}
                  placeholder="Search Firm, Code, Mobile, GSTIN, PAN, State, District..."
                  style={{ width: '100%', padding: '0.55rem 0.65rem 0.55rem 2.2rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Column Visibility Selector Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowColumnSelector(prev => !prev)}
                    title="Toggle Visible Columns"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.55rem 0.85rem',
                      background: showColumnSelector ? 'rgba(59,130,246,0.18)' : 'var(--bg-primary)',
                      color: showColumnSelector ? '#60a5fa' : 'var(--text-primary)',
                      border: `1px solid ${showColumnSelector ? '#3b82f6' : 'var(--border-light)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.84rem'
                    }}
                  >
                    <Filter size={14} /> Columns <ChevronDown size={14} />
                  </button>

                  {showColumnSelector && (
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 6px)',
                      background: '#0f172a',
                      border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: '10px',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.65)',
                      padding: '0.65rem 0.85rem',
                      minWidth: '220px',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.2rem', letterSpacing: '0.5px' }}>
                        Visible Columns
                      </div>
                      {[
                        { key: 'codeTier', label: 'Party Code & Tier' },
                        { key: 'firmContact', label: 'Firm & Contact Details' },
                        { key: 'hierarchy', label: 'Channel Hierarchy' },
                        { key: 'locationProducts', label: 'State, District & Products' },
                        { key: 'billingSecurity', label: 'Billing Route & Security' },
                        { key: 'stageStatus', label: 'Onboarding Stage & Status' },
                        { key: 'actions', label: 'Action Column' }
                      ].map(col => (
                        <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#e2e8f0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key] !== false}
                            onChange={e => setVisibleColumns(prev => ({ ...prev, [col.key]: e.target.checked }))}
                            style={{ cursor: 'pointer' }}
                          />
                          {col.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Export CSV */}
                <button
                  onClick={() => exportPartyReportCSV(false)}
                  title="Download filtered report as CSV / Excel"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.55rem 0.95rem',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
                  }}
                >
                  <Download size={15} /> Export CSV
                </button>

                {/* Clear Filters Button */}
                <button
                  onClick={handleResetFilters}
                  title="Clear all active filters"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.55rem 0.85rem',
                    background: activeReportFilterCount > 0 ? 'rgba(239,68,68,0.15)' : 'transparent',
                    color: activeReportFilterCount > 0 ? '#f87171' : 'var(--text-secondary)',
                    border: `1px solid ${activeReportFilterCount > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border-light)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.84rem'
                  }}
                >
                  <RotateCcw size={14} /> Clear Filters {activeReportFilterCount > 0 ? `(${activeReportFilterCount})` : ''}
                </button>
              </div>
            </div>

            {/* Bottom Row: Filters Grid */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Company Filter */}
              <select
                value={companyFilter}
                onChange={e => { setCompanyFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All Companies</option>
                <option value="NSMLR">NSMLR</option>
                <option value="NSTL">NSTL</option>
              </select>

              {/* Tier Filter */}
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All Party Tiers</option>
                <option value="Distributor">Level 1: Distributor</option>
                <option value="Dealer">Level 2: Dealer</option>
                <option value="Sub-Dealer">Level 3: Sub-Dealer</option>
              </select>

              {/* State Filter */}
              <select
                value={stateFilter}
                onChange={e => { setStateFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All States ({availableReportStates.length})</option>
                {availableReportStates.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>

              {/* Billing Filter */}
              <select
                value={billingFilter}
                onChange={e => { setBillingFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All Billing Routes</option>
                <option value="DIRECT_COMPANY_BILLING">Direct Company Billing</option>
                <option value="DISTRIBUTOR_BILLED">Distributor Billed</option>
                <option value="DEALER_BILLED">Dealer Billed</option>
              </select>

              {/* Stage Filter */}
              <select
                value={stageFilter}
                onChange={e => { setStageFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All Stages (S01 - S08)</option>
                <option value="S01">Stage S01: Profile / Creation</option>
                <option value="S02">Stage S02: Distributor Hub</option>
                <option value="S03">Stage S03: Dealer Parent Link</option>
                <option value="S04">Stage S04: Sub-Dealer Parent Link</option>
                <option value="S05">Stage S05: Commercial &amp; Billing</option>
                <option value="S06">Stage S06: Products &amp; Territory</option>
                <option value="S07">Stage S07: Team Mapping</option>
                <option value="S08">Stage S08: Final Activation</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setReportCurrentPage(1); }}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              >
                <option value="ALL">All Onboarded Partners (Excludes Raw S00 Leads)</option>
                <option value="Active">Active Partners Only</option>
                <option value="Draft">Incomplete / In-Progress (S01-S07)</option>
                <option value="S00">S00 Transferred Leads Only</option>
                <option value="EVERYTHING">All Records (Including S00 Leads)</option>
              </select>
            </div>
          </div>

          {/* ========================================================= */}
          {/* R03 REPORT & HIERARCHY TABLE */}
          {/* ========================================================= */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  {/* Selection Column Header */}
                  <th style={{ padding: '0.85rem 0.75rem', width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllReportSelected}
                      onChange={handleToggleSelectAllReport}
                      title="Select all partners on this page"
                      style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                  </th>
                  {visibleColumns.codeTier !== false && <th style={{ padding: '0.85rem 1rem' }}>Party Code &amp; Tier</th>}
                  {visibleColumns.firmContact !== false && <th style={{ padding: '0.85rem 1rem' }}>Firm &amp; Contact Details</th>}
                  {visibleColumns.hierarchy !== false && <th style={{ padding: '0.85rem 1rem' }}>Channel Hierarchy (Who Under Whom)</th>}
                  {visibleColumns.locationProducts !== false && <th style={{ padding: '0.85rem 1rem' }}>State, District &amp; Products</th>}
                  {visibleColumns.billingSecurity !== false && <th style={{ padding: '0.85rem 1rem' }}>Billing Route &amp; Security</th>}
                  {visibleColumns.stageStatus !== false && <th style={{ padding: '0.85rem 1rem' }}>Onboarding Stage &amp; Status</th>}
                  {visibleColumns.actions !== false && <th style={{ padding: '0.85rem 0.6rem', textAlign: 'center', width: '110px' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedReportParties.length === 0 ? (
                  <tr>
                    <td colSpan={1 + Object.values(visibleColumns).filter(Boolean).length} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                        No Channel Partners match the selected filters
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Try adjusting your search query, state, tier, or stage filters.
                      </div>
                      <button
                        onClick={handleResetFilters}
                        style={{
                          padding: '0.45rem 1rem',
                          background: 'rgba(56,189,248,0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56,189,248,0.3)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 600
                        }}
                      >
                        Reset All Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  paginatedReportParties.map(p => {
                    const isDist = p.party_type === 'Distributor';
                    const isDealer = p.party_type === 'Dealer';
                    const isSubDealer = p.party_type === 'Sub-Dealer';
                    const badgeInfo = getStageBadgeInfo(p);
                    const isActive = p.final_status === 'Active' || p.party_status === 'Active';
                    const isSelected = selectedPartyIds.includes(p.id);

                    // Safe parent resolution
                    const parentDistName = p.parent_distributor?.firm_name || p.parent_distributor_name;
                    const parentDlrName = p.parent_dealer?.firm_name || p.parent_dealer_name;

                    // Commercial & Security Terms
                    const commTerms = (p.party_commercial_terms && p.party_commercial_terms[0]) || {};
                    const secDepositVal = p.security_deposit_amount ?? commTerms.security_deposit_amount;
                    const secModeVal = p.security_mode || commTerms.security_mode || 'Cheque';

                    // Assigned districts chips for distributors
                    const rawDistricts = p.assigned_districts || p.headquarter_districts || p.meta?.assigned_districts;
                    const parsedDistricts = Array.isArray(rawDistricts)
                      ? rawDistricts
                      : (typeof rawDistricts === 'string' && rawDistricts ? rawDistricts.split(',').map(s => s.trim()).filter(Boolean) : []);

                    // Authorized Product / Category
                    const productCategoryVal = p.product_category || p.product_authorizations?.[0]?.product_category || p.order_category;

                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent',
                          transition: 'background 0.15s'
                        }}
                      >
                        {/* Row Selection Checkbox */}
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectParty(p.id)}
                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                          />
                        </td>

                        {/* 1. Party Code & Tier */}
                        {visibleColumns.codeTier !== false && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24', fontSize: '0.92rem' }}>
                              {p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code || 'UNASSIGNED'}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                background: isDist ? 'rgba(56,189,248,0.2)' : isDealer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                                color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24'
                              }}>
                                {isDist ? '👑 Level 1: Distributor' : isDealer ? '🏪 Level 2: Dealer' : '🛒 Level 3: Sub-Dealer'}
                              </span>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '0.12rem 0.45rem',
                                borderRadius: '4px',
                                background: (p.our_company === 'NSTL' || p.our_company === 'NSTLP') ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                                color: (p.our_company === 'NSTL' || p.our_company === 'NSTLP') ? '#ec4899' : '#f59e0b',
                                border: `1px solid ${(p.our_company === 'NSTL' || p.our_company === 'NSTLP') ? 'rgba(236,72,153,0.35)' : 'rgba(245,158,11,0.35)'}`
                              }} title={`Our Company: ${p.our_company === 'NSTLP' ? 'NSTL' : (p.our_company || 'NSMLR')}`}>
                                {p.our_company === 'NSTLP' ? 'NSTL' : (p.our_company || 'NSMLR')}
                              </span>
                            </div>

                            {/* GSTIN / PAN */}
                            {p.gstin && (
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                                GST: <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{p.gstin}</span>
                              </div>
                            )}
                            {p.pan && (!p.gstin || !p.gstin.includes(p.pan)) && (
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem', fontFamily: 'monospace' }}>
                                PAN: <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{p.pan}</span>
                              </div>
                            )}
                          </td>
                        )}

                        {/* 2. Firm & Contact Details */}
                        {visibleColumns.firmContact !== false && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.94rem' }}>{p.firm_name}</div>
                            {p.legal_name && p.legal_name !== p.firm_name && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({p.legal_name})</div>
                            )}
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              {p.contact_person_name_1 || p.owner_name || 'Principal'} • {p.contact_mobile_1_1 || p.primary_mobile || p.biz_contact_no_1 || '-'}
                            </div>
                            {(p.biz_email_1 || p.official_email) && (
                              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{p.biz_email_1 || p.official_email}</div>
                            )}
                          </td>
                        )}

                        {/* 3. Strict Channel Hierarchy Breadcrumb */}
                        {visibleColumns.hierarchy !== false && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {isDist && (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontWeight: 700 }}>
                                  👑 {p.firm_name}
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                  Top-Level Master Regional Hub
                                </div>
                              </div>
                            )}

                            {isDealer && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <span style={{ color: '#60a5fa', fontWeight: 600 }} title="Parent Distributor">
                                  👑 {parentDistName || (p.parent_distributor_id ? 'Assigned Distributor' : 'Direct Swan / Open Territory')}
                                </span>
                                <ArrowRight size={12} style={{ color: 'var(--text-secondary)' }} />
                                <span style={{ color: '#34d399', fontWeight: 700 }}>🏪 {p.firm_name}</span>
                              </div>
                            )}

                            {isSubDealer && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {parentDistName && (
                                  <>
                                    <span style={{ color: '#60a5fa', fontWeight: 600 }} title="Derived Master Distributor">
                                      👑 {parentDistName}
                                    </span>
                                    <ArrowRight size={12} style={{ color: 'var(--text-secondary)' }} />
                                  </>
                                )}
                                <span style={{ color: '#34d399', fontWeight: 600 }} title="Parent Dealer">
                                  🏪 {parentDlrName || (p.parent_dealer_id ? 'Assigned Dealer' : 'Parent Dealer')}
                                </span>
                                <ArrowRight size={12} style={{ color: 'var(--text-secondary)' }} />
                                <span style={{ color: '#fbbf24', fontWeight: 700 }}>🛒 {p.firm_name}</span>
                              </div>
                            )}
                          </td>
                        )}

                        {/* 4. State / Territory & Products */}
                        {visibleColumns.locationProducts !== false && (
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.state_name || 'Punjab'}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{p.district_name || p.city_village || 'District'}</div>

                            {/* Assigned districts chips for distributors */}
                            {parsedDistricts.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                                {parsedDistricts.slice(0, 2).map((d, i) => (
                                  <span key={i} style={{ fontSize: '0.68rem', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.3)' }}>
                                    {d}
                                  </span>
                                ))}
                                {parsedDistricts.length > 2 && (
                                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', alignSelf: 'center' }}>
                                    +{parsedDistricts.length - 2} more
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Authorized Product Category Badge */}
                            {productCategoryVal && (
                              <div style={{ marginTop: '0.3rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  background: 'rgba(167,139,250,0.15)',
                                  color: '#c084fc',
                                  border: '1px solid rgba(167,139,250,0.3)'
                                }}>
                                  📦 {productCategoryVal}
                                </span>
                              </div>
                            )}
                          </td>
                        )}

                        {/* 5. Billing Route & Security */}
                        {visibleColumns.billingSecurity !== false && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '4px',
                              background: p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? 'rgba(16,185,129,0.15)'
                                : p.billing_route_type === 'DEALER_BILLED'
                                ? 'rgba(245,158,11,0.15)'
                                : 'rgba(59,130,246,0.15)',
                              color: p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? '#34d399'
                                : p.billing_route_type === 'DEALER_BILLED'
                                ? '#f59e0b'
                                : '#60a5fa'
                            }}>
                              {p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? '🏢 Direct Company'
                                : p.billing_route_type === 'DEALER_BILLED'
                                ? '🏬 Dealer Billed'
                                : '👑 Distributor Billed'}
                            </span>

                            {/* Security Deposit */}
                            {secDepositVal !== undefined && secDepositVal !== null && secDepositVal !== '' && (
                              <div style={{ fontSize: '0.73rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                                Sec. Dep: <strong style={{ color: '#34d399' }}>₹{Number(secDepositVal).toLocaleString('en-IN')}</strong> ({secModeVal})
                              </div>
                            )}

                            {/* 1st Billing Milestone */}
                            {p.billing_first_amount ? (
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                1st: <strong style={{ color: '#38bdf8' }}>₹{Number(p.billing_first_amount).toLocaleString('en-IN')}</strong>
                                {p.billing_first_status ? ` • ${p.billing_first_status}` : ''}
                                {p.billing_first_date ? ` (${p.billing_first_date})` : ''}
                              </div>
                            ) : null}
                          </td>
                        )}

                        {/* 6. Onboarding Stage & Status */}
                        {visibleColumns.stageStatus !== false && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {/* Stage Progress Badge */}
                            <div>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '6px',
                                background: badgeInfo.bg,
                                color: badgeInfo.color,
                                border: `1px solid ${badgeInfo.color}40`,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                              }}>
                                {badgeInfo.label}
                              </span>
                            </div>

                            {/* Active / Draft Status Badge */}
                            <div style={{ marginTop: '0.35rem' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.12rem 0.45rem',
                                borderRadius: '4px',
                                background: isActive ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                                color: isActive ? '#34d399' : '#fbbf24'
                              }}>
                                {isActive ? '● Verified Active' : '○ Draft In-Progress'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 7. Compact Icon Actions */}
                        {visibleColumns.actions !== false && (
                          <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', width: '110px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => open360Modal(p)}
                                title={`Full 360° Profile: ${p.firm_name}`}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '7px',
                                  background: '#2563eb',
                                  border: 'none',
                                  color: '#fff',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                              >
                                <Eye size={15} />
                              </button>

                              {!isActive ? (
                                <button
                                  type="button"
                                  onClick={() => resumeWizard(p)}
                                  title={`Resume Onboarding: ${p.firm_name}`}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '7px',
                                    background: '#10b981',
                                    border: 'none',
                                    color: '#fff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <Sparkles size={15} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setSelectedPartyForOrder(p); setShowOrderModal(true); }}
                                  title={`Log Daily Order: ${p.firm_name}`}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '7px',
                                    background: '#059669',
                                    border: 'none',
                                    color: '#fff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  <Phone size={15} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteParty(p)}
                                title={`Delete ${p.firm_name}`}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '7px',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.35)',
                                  color: '#ef4444',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#ef4444';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                                  e.currentTarget.style.color = '#ef4444';
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Sticky Floating Selection Action Bar */}
            {selectedPartyIds.length > 0 && (
              <div style={{
                position: 'sticky',
                bottom: '1rem',
                zIndex: 40,
                margin: '0.75rem auto',
                maxWidth: '620px',
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(8px)',
                border: '1.5px solid #3b82f6',
                borderRadius: '12px',
                padding: '0.65rem 1.25rem',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                color: '#fff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.88rem' }}>
                  <span style={{ padding: '0.2rem 0.55rem', background: '#3b82f6', borderRadius: '6px', fontSize: '0.82rem' }}>
                    {selectedPartyIds.length}
                  </span>
                  <span>Channel Partners Selected</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => exportPartyReportCSV(true)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      background: '#10b981',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Download size={13} /> Export Selected ({selectedPartyIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPartyIds([])}
                    style={{
                      padding: '0.45rem 0.75rem',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {/* Pagination Bar Matching Lead Data */}
            <div style={{
              padding: '0.75rem 1.25rem',
              borderTop: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.85rem' }}>
                <span>
                  {totalReportRecords === 0
                    ? 'Showing 0 to 0 of 0 channel partners'
                    : `Showing ${(validReportCurrentPage - 1) * (reportPageSize === 'All' ? totalReportRecords : Number(reportPageSize)) + 1} to ${Math.min(validReportCurrentPage * (reportPageSize === 'All' ? totalReportRecords : Number(reportPageSize)), totalReportRecords)} of ${totalReportRecords} channel partners`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem' }}>Rows per page:</span>
                  <select
                    value={reportPageSize}
                    onChange={e => {
                      setReportPageSize(e.target.value === 'All' ? 'All' : Number(e.target.value));
                      setReportCurrentPage(1);
                    }}
                    style={{
                      padding: '0.3rem 0.55rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    {[10, 15, 20, 50, 100].map(s => (
                      <option key={s} value={s}>Show {s}</option>
                    ))}
                    <option value="All">All</option>
                  </select>
                </div>
              </div>

              {reportPageSize !== 'All' && totalReportPages > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setReportCurrentPage(1)}
                    disabled={validReportCurrentPage <= 1}
                    title="First Page"
                    style={{
                      padding: '0.3rem 0.6rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validReportCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: validReportCurrentPage <= 1 ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={validReportCurrentPage <= 1}
                    title="Previous Page"
                    style={{
                      padding: '0.3rem 0.65rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validReportCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: validReportCurrentPage <= 1 ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    ‹ Prev
                  </button>

                  {/* Page Numbers */}
                  {(() => {
                    const pages = [];
                    let start = Math.max(1, validReportCurrentPage - 2);
                    let end = Math.min(totalReportPages, validReportCurrentPage + 2);
                    if (validReportCurrentPage <= 3) end = Math.min(5, totalReportPages);
                    if (validReportCurrentPage >= totalReportPages - 2) start = Math.max(1, totalReportPages - 4);

                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          type="button"
                          onClick={() => setReportCurrentPage(i)}
                          style={{
                            minWidth: '30px',
                            height: '30px',
                            padding: '0 0.4rem',
                            border: '1px solid var(--border-light)',
                            borderRadius: '5px',
                            background: validReportCurrentPage === i ? '#2563eb' : 'var(--bg-surface)',
                            color: validReportCurrentPage === i ? '#ffffff' : 'var(--text-primary)',
                            fontWeight: validReportCurrentPage === i ? 700 : 500,
                            cursor: 'pointer',
                            fontSize: '0.78rem'
                          }}
                        >
                          {i}
                        </button>
                      );
                    }
                    return pages;
                  })()}

                  <button
                    type="button"
                    onClick={() => setReportCurrentPage(prev => Math.min(totalReportPages, prev + 1))}
                    disabled={validReportCurrentPage >= totalReportPages}
                    title="Next Page"
                    style={{
                      padding: '0.3rem 0.65rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validReportCurrentPage >= totalReportPages ? 'not-allowed' : 'pointer',
                      opacity: validReportCurrentPage >= totalReportPages ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportCurrentPage(totalReportPages)}
                    disabled={validReportCurrentPage >= totalReportPages}
                    title="Last Page"
                    style={{
                      padding: '0.3rem 0.6rem',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      borderRadius: '5px',
                      cursor: validReportCurrentPage >= totalReportPages ? 'not-allowed' : 'pointer',
                      opacity: validReportCurrentPage >= totalReportPages ? 0.45 : 1,
                      fontSize: '0.78rem'
                    }}
                  >
                    Last »
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: CHANNEL HIERARCHY TREE (WHO IS UNDER WHOM VISUALIZER) */}
      {/* ========================================================= */}
      {activeTab === 'hierarchy_tree' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Channel Partner Hierarchy Visualizer</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0.2rem 0 0 0' }}>
              Full visibility into which Distributors have which Dealers, and which Sub-Dealers belong to which Dealers.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {activeDistributors.length === 0 ? (
              <div style={{ background: 'var(--bg-surface)', padding: '2rem', textAlign: 'center', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                No Distributors registered yet. Onboard a Distributor first via S00 ➔ S01.
              </div>
            ) : (
              activeDistributors.map(dist => {
                // Find all dealers under this distributor
                const dealersUnderDist = parties.filter(p => p.party_type === 'Dealer' && p.parent_distributor_id === dist.id);

                return (
                  <div key={dist.id} style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(56,189,248,0.4)', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                    {/* Distributor Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.3rem' }}>👑</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.2)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                              {dist.distributor_code || dist.party_universal_code}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#ffffff' }}>{dist.firm_name}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                            Owner: {dist.owner_name} • Phone: {dist.primary_mobile} • State: {dist.state_name || 'Punjab'}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399', background: 'rgba(16,185,129,0.2)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                          {dealersUnderDist.length} Mapped Dealers
                        </span>
                      </div>
                    </div>

                    {/* Mapped Dealers and their Sub-Dealers */}
                    <div style={{ marginTop: '1rem', paddingLeft: '1.5rem', borderLeft: '2px dashed rgba(56,189,248,0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {dealersUnderDist.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                          No dealers currently mapped under this distributor.
                        </div>
                      ) : (
                        dealersUnderDist.map(dlr => {
                          // Find all sub-dealers under this dealer
                          const subDealersUnderDlr = parties.filter(p => p.party_type === 'Sub-Dealer' && p.parent_dealer_id === dlr.id);

                          return (
                            <div key={dlr.id} style={{ background: 'var(--bg-primary)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                  <span style={{ fontSize: '1.1rem' }}>🏪</span>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#34d399', background: 'rgba(16,185,129,0.2)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                        {dlr.dealer_code || dlr.party_universal_code}
                                      </span>
                                      <span style={{ fontWeight: 700, fontSize: '0.96rem', color: '#ffffff' }}>{dlr.firm_name}</span>
                                      <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '4px',
                                        background: dlr.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                          ? 'rgba(59,130,246,0.2)'
                                          : dlr.billing_route_type === 'DEALER_BILLED'
                                          ? 'rgba(245,158,11,0.2)'
                                          : 'rgba(16,185,129,0.2)',
                                        color: dlr.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                          ? '#60a5fa'
                                          : dlr.billing_route_type === 'DEALER_BILLED'
                                          ? '#fbbf24'
                                          : '#34d399'
                                      }}>
                                        {dlr.billing_route_type === 'DIRECT_COMPANY_BILLING' ? 'Direct Swan' : (dlr.billing_route_type === 'DEALER_BILLED' ? 'Dealer Billed' : 'Distributor Billed')}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                      {dlr.owner_name} • {dlr.primary_mobile} • Territory: {dlr.district_name || 'Territory'}
                                    </div>
                                  </div>
                                </div>

                                <span style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 600 }}>
                                  {subDealersUnderDlr.length} Sub-Dealers
                                </span>
                              </div>

                              {/* Nested Sub-Dealers */}
                              {subDealersUnderDlr.length > 0 && (
                                <div style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', borderLeft: '2px dotted rgba(245,158,11,0.4)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {subDealersUnderDlr.map(sdl => (
                                    <div key={sdl.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: '#e2e8f0', background: 'rgba(245,158,11,0.08)', padding: '0.4rem 0.65rem', borderRadius: '6px' }}>
                                      <span>🛒</span>
                                      <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.75rem' }}>{sdl.sub_dealer_code || sdl.party_universal_code}</span>
                                      <strong style={{ color: '#fff' }}>{sdl.firm_name}</strong>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>({sdl.owner_name} • {sdl.primary_mobile})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ========================================================= */}
      {/* TAB 2: ENGINE 1 - DAILY ORDER FOLLOWUP COCKPIT */}
      {/* ========================================================= */}
      {activeTab === 'order_followup' && (() => {
        // Build live calling queue matching active partners with followups
        const activePartners = parties.filter(p => p.final_status === 'Active' || p.party_status === 'Active');
        
        // Latest followup map by party_id
        const latestFollowupMap = new Map();
        orderFollowups.forEach(f => {
          if (!latestFollowupMap.has(f.party_id)) {
            latestFollowupMap.set(f.party_id, f);
          }
        });

        // Metrics calculations
        const totalInQueue = activePartners.length;
        const totalFollowupsLogged = orderFollowups.length;
        const totalOrdersPlaced = orderFollowups.filter(f => f.is_order_placed).length;
        const totalRescheduled = orderFollowups.filter(f => f.call_status === 'RESCHEDULED').length;

        // Filtered queue
        const filteredQueue = activePartners.filter(party => {
          const latest = latestFollowupMap.get(party.id);

          // Status filter
          if (orderCallStatusFilter !== 'ALL') {
            if (orderCallStatusFilter === 'PENDING_CALL' && latest) return false;
            if (orderCallStatusFilter !== 'PENDING_CALL') {
              if (!latest) return false;
              if (orderCallStatusFilter === 'ORDER_PLACED' && !latest.is_order_placed) return false;
              if (orderCallStatusFilter !== 'ORDER_PLACED' && latest.call_status !== orderCallStatusFilter) return false;
            }
          }

          // Tier filter
          if (orderTierFilter !== 'ALL' && party.party_type !== orderTierFilter) return false;

          // State filter
          if (orderStateFilter !== 'ALL' && (party.state_name || '').toLowerCase() !== orderStateFilter.toLowerCase()) return false;

          // Search term
          if (!orderSearchTerm) return true;
          const term = orderSearchTerm.trim().toLowerCase();
          const code = (party.distributor_code || party.dealer_code || party.sub_dealer_code || party.party_universal_code || '').toLowerCase();
          const firm = (party.firm_name || '').toLowerCase();
          const person = (party.contact_person_name_1 || party.owner_name || '').toLowerCase();
          const mobile = (party.contact_mobile_1_1 || party.primary_mobile || party.biz_contact_no_1 || '').toLowerCase();
          const dist = (party.district_name || '').toLowerCase();
          const state = (party.state_name || '').toLowerCase();

          return code.includes(term) || firm.includes(term) || person.includes(term) || mobile.includes(term) || dist.includes(term) || state.includes(term);
        });

        return (
          <div>
            {/* KPI Ribbon */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Phone size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Calling Queue</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalInQueue}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Calls Recorded</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{totalFollowupsLogged}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                  📦
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, textTransform: 'uppercase' }}>Orders Booked</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>{totalOrdersPlaced}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>Rescheduled / Callback</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{totalRescheduled}</div>
                </div>
              </div>
            </div>

            {/* Filter and Action Bar */}
            <div style={{
              background: 'var(--bg-surface)',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              border: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '420px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    value={orderSearchTerm}
                    onChange={e => setOrderSearchTerm(e.target.value)}
                    placeholder="Search Partner, Code, Mobile, District..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* Status Filter */}
                <select
                  value={orderCallStatusFilter}
                  onChange={e => setOrderCallStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Call Status</option>
                  <option value="PENDING_CALL">⏳ Pending Call Today</option>
                  <option value="ORDER_PLACED">📦 Order Booked</option>
                  <option value="CONNECTED">📞 Connected (No Order)</option>
                  <option value="RESCHEDULED">⏰ Rescheduled / Callback</option>
                  <option value="PAYMENT_PENDING">💳 Payment Pending</option>
                  <option value="NOT_REACHABLE">📵 Not Reachable / Busy</option>
                </select>

                {/* Tier Filter */}
                <select
                  value={orderTierFilter}
                  onChange={e => setOrderTierFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Tiers</option>
                  <option value="Distributor">Distributors</option>
                  <option value="Dealer">Dealers</option>
                  <option value="Sub-Dealer">Sub-Dealers</option>
                </select>

                {/* State Filter */}
                <select
                  value={orderStateFilter}
                  onChange={e => setOrderStateFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All States</option>
                  {availableReportStates.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (activePartners.length > 0) {
                      setSelectedPartyForOrder(activePartners[0]);
                      setShowOrderModal(true);
                    }
                  }}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
                  }}
                >
                  <Plus size={15} /> + Punch Sales Order
                </button>
              </div>
            </div>

            {/* Queue Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Partner Code &amp; Tier</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Firm Name &amp; Contact</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Location</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Billing Mode</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Latest Follow-up Status</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Dial &amp; Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No active channel partners match the current follow-up filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map(party => {
                      const latest = latestFollowupMap.get(party.id);
                      const isDist = party.party_type === 'Distributor';
                      const isDealer = party.party_type === 'Dealer';
                      const phone = party.contact_mobile_1_1 || party.primary_mobile || party.biz_contact_no_1;
                      const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

                      return (
                        <tr key={party.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          {/* Code & Tier */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24', fontSize: '0.9rem' }}>
                              {party.distributor_code || party.dealer_code || party.sub_dealer_code || party.party_universal_code}
                            </div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.12rem 0.45rem',
                              borderRadius: '4px',
                              marginTop: '0.2rem',
                              background: isDist ? 'rgba(56,189,248,0.2)' : isDealer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                              color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24'
                            }}>
                              {party.party_type}
                            </span>
                          </td>

                          {/* Firm & Contact */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{party.firm_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              {party.contact_person_name_1 || party.owner_name || 'Principal'} • {phone || '-'}
                            </div>
                          </td>

                          {/* Location */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600 }}>{party.district_name || 'District'}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{party.state_name || 'Punjab'}</div>
                          </td>

                          {/* Billing Mode */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              padding: '0.18rem 0.55rem',
                              borderRadius: '4px',
                              background: party.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? 'rgba(16,185,129,0.15)'
                                : party.billing_route_type === 'DEALER_BILLED'
                                ? 'rgba(245,158,11,0.15)'
                                : 'rgba(59,130,246,0.15)',
                              color: party.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? '#34d399'
                                : party.billing_route_type === 'DEALER_BILLED'
                                ? '#f59e0b'
                                : '#60a5fa'
                            }}>
                              {party.billing_route_type === 'DIRECT_COMPANY_BILLING'
                                ? '🏢 Direct Company'
                                : party.billing_route_type === 'DEALER_BILLED'
                                ? '🏬 Dealer Billed'
                                : '👑 Distributor Billed'}
                            </span>
                          </td>

                          {/* Latest Follow-up Status */}
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {latest ? (
                              <div>
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  padding: '0.18rem 0.55rem',
                                  borderRadius: '5px',
                                  background: latest.is_order_placed
                                    ? 'rgba(16,185,129,0.2)'
                                    : latest.call_status === 'RESCHEDULED'
                                    ? 'rgba(245,158,11,0.2)'
                                    : latest.call_status === 'PAYMENT_PENDING'
                                    ? 'rgba(239,68,68,0.2)'
                                    : 'rgba(59,130,246,0.2)',
                                  color: latest.is_order_placed
                                    ? '#34d399'
                                    : latest.call_status === 'RESCHEDULED'
                                    ? '#fbbf24'
                                    : latest.call_status === 'PAYMENT_PENDING'
                                    ? '#f87171'
                                    : '#60a5fa'
                                }}>
                                  {latest.is_order_placed ? '✓ Order Booked' : latest.call_status}
                                </span>
                                {latest.notes && (
                                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.2rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {latest.notes}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                                ⏳ Pending Call Today
                              </span>
                            )}
                          </td>

                          {/* Dial & Action Buttons */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                              {phone && (
                                <a
                                  href={`tel:${phone}`}
                                  title={`Click to Dial ${phone}`}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '7px',
                                    background: 'rgba(16,185,129,0.15)',
                                    border: '1px solid rgba(16,185,129,0.35)',
                                    color: '#10b981',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textDecoration: 'none'
                                  }}
                                >
                                  <Phone size={14} />
                                </a>
                              )}
                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/91${cleanPhone.slice(-10)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="WhatsApp Message"
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '7px',
                                    background: 'rgba(34,197,94,0.15)',
                                    border: '1px solid rgba(34,197,94,0.35)',
                                    color: '#22c55e',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textDecoration: 'none'
                                  }}
                                >
                                  <MessageSquare size={14} />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => { setSelectedPartyForOrder(party); setShowOrderModal(true); }}
                                style={{
                                  padding: '0.4rem 0.8rem',
                                  background: '#2563eb',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                Log Follow-up
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 3: ENGINE 2 - POST-ORDER FEEDBACK CALLING */}
      {/* ========================================================= */}
      {activeTab === 'order_feedback' && (() => {
        // Filter feedbacks
        const filteredFeedbacks = orderFeedbacks.filter(f => {
          // Rating filter
          if (feedbackRatingFilter !== 'ALL') {
            if (feedbackRatingFilter === 'POOR') {
              if (f.overall_satisfaction > 2) return false;
            } else if (Number(feedbackRatingFilter) !== f.overall_satisfaction) {
              return false;
            }
          }

          // Damage filter
          if (feedbackDamageFilter === 'DAMAGE' && !f.has_transit_damage_shortage) return false;
          if (feedbackDamageFilter === 'CLEAN' && f.has_transit_damage_shortage) return false;

          // Search term
          if (!feedbackSearchTerm) return true;
          const term = feedbackSearchTerm.trim().toLowerCase();
          const orderId = (f.order_id || '').toLowerCase();
          const firm = (f.party?.firm_name || '').toLowerCase();
          const mobile = (f.party?.primary_mobile || '').toLowerCase();

          return orderId.includes(term) || firm.includes(term) || mobile.includes(term);
        });

        // Summary calculations
        const avgScore = orderFeedbacks.length > 0
          ? (orderFeedbacks.reduce((acc, cur) => acc + (cur.overall_satisfaction || 5), 0) / orderFeedbacks.length).toFixed(1)
          : '5.0';
        const cleanCount = orderFeedbacks.filter(f => !f.has_transit_damage_shortage && f.overall_satisfaction >= 4).length;
        const damageCount = orderFeedbacks.filter(f => f.has_transit_damage_shortage || f.overall_satisfaction <= 2).length;

        return (
          <div>
            {/* KPI Ribbon */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(234,179,8,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
                  <Star size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Average Delivery CSAT</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#eab308' }}>{avgScore} / 5 ⭐</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Phone size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Delivery Calls Made</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{orderFeedbacks.length}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Clean Deliveries</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{cleanCount}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>Damage / Complaints</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f87171' }}>{damageCount}</div>
                </div>
              </div>
            </div>

            {/* Filter and Action Bar */}
            <div style={{
              background: 'var(--bg-surface)',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              border: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '420px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    value={feedbackSearchTerm}
                    onChange={e => setFeedbackSearchTerm(e.target.value)}
                    placeholder="Search Order Ref, Partner Name, Mobile..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <select
                  value={feedbackRatingFilter}
                  onChange={e => setFeedbackRatingFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All CSAT Ratings</option>
                  <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
                  <option value="4">⭐⭐⭐⭐ 4 Stars</option>
                  <option value="3">⭐⭐⭐ 3 Stars</option>
                  <option value="POOR">🚨 1-2 Stars (Escalated)</option>
                </select>

                <select
                  value={feedbackDamageFilter}
                  onChange={e => setFeedbackDamageFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Transit Cases</option>
                  <option value="CLEAN">✓ Clean Deliveries</option>
                  <option value="DAMAGE">⚠️ Transit Damage / Shortage Reported</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (parties.length > 0) {
                      setSelectedPartyForFeedback(parties[0]);
                      setShowFeedbackModal(true);
                    }
                  }}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
                  }}
                >
                  <Plus size={15} /> + Log Delivery Feedback
                </button>
              </div>
            </div>

            {/* Feedback Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Order Ref &amp; Date</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Channel Partner</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Delivery Timing</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Packaging &amp; Finish</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Transit Shortage/Damage</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Overall CSAT</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Status &amp; SLA Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedbacks.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No delivery feedback calls match the selected criteria. Click &quot;+ Log Delivery Feedback&quot; to record post-order satisfaction.
                      </td>
                    </tr>
                  ) : (
                    filteredFeedbacks.map(f => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 800, color: '#38bdf8' }}>{f.order_id}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            {f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{f.party?.firm_name || 'Party'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {f.party?.party_universal_code || ''} • {f.party?.primary_mobile || '-'}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700 }}>⭐ {f.rating_delivery_time || 5}</span> / 5
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ color: '#fbbf24', fontWeight: 700 }}>⭐ {f.rating_packaging_finish || 5}</span> / 5
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {f.has_transit_damage_shortage ? (
                            <div>
                              <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '4px', fontWeight: 700, fontSize: '0.74rem' }}>
                                ⚠️ Reported Damage
                              </span>
                              {f.damage_details && (
                                <div style={{ fontSize: '0.74rem', color: '#fca5a5', marginTop: '0.2rem' }}>
                                  {f.damage_details}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#34d399', fontWeight: 600 }}>✓ Clean Delivery</span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: f.overall_satisfaction >= 4 ? '#34d399' : '#f87171' }}>
                          ⭐ {f.overall_satisfaction} / 5
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {f.auto_complaint_triggered ? (
                            <span style={{ padding: '0.2rem 0.55rem', background: 'rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '4px', fontWeight: 700, fontSize: '0.74rem' }}>
                              🚨 Auto Complaint Ticket Created
                            </span>
                          ) : (
                            <span style={{ padding: '0.2rem 0.55rem', background: 'rgba(16,185,129,0.2)', color: '#34d399', borderRadius: '4px', fontWeight: 700, fontSize: '0.74rem' }}>
                              ✓ Satisfied
                            </span>
                          )}
                          {f.dealer_comments && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                              &quot;{f.dealer_comments}&quot;
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 4: ENGINE 3 - MONTHLY DEFAULT FEEDBACK CALLING */}
      {/* ========================================================= */}
      {activeTab === 'monthly_feedback' && (() => {
        const activePartners = parties.filter(p => p.final_status === 'Active' || p.party_status === 'Active');

        // Map latest monthly feedback by party_id
        const monthlyMap = new Map();
        monthlyFeedbacks.forEach(m => {
          if (!monthlyMap.has(m.party_id)) {
            monthlyMap.set(m.party_id, m);
          }
        });

        // Metrics calculations
        const totalMonitored = activePartners.length;
        const healthyCount = monthlyFeedbacks.filter(m => m.market_sentiment === 'BOOMING' || m.market_sentiment === 'STEADY').length;
        const atRiskCount = monthlyFeedbacks.filter(m => m.market_sentiment === 'SLUGGISH' || m.is_dormant_risk).length;
        const criticalCount = monthlyFeedbacks.filter(m => m.market_sentiment === 'COMPETITOR_PRESSURE').length;

        // Filtered roster
        const filteredRoster = activePartners.filter(party => {
          const mRecord = monthlyMap.get(party.id);

          // Risk filter
          if (monthlyRiskFilter !== 'ALL') {
            if (monthlyRiskFilter === 'HEALTHY' && mRecord && (mRecord.is_dormant_risk || mRecord.market_sentiment === 'COMPETITOR_PRESSURE')) return false;
            if (monthlyRiskFilter === 'AT_RISK' && (!mRecord || !mRecord.is_dormant_risk)) return false;
            if (monthlyRiskFilter === 'DORMANT' && (!mRecord || mRecord.market_sentiment !== 'COMPETITOR_PRESSURE')) return false;
          }

          // Search term
          if (!monthlySearchTerm) return true;
          const term = monthlySearchTerm.trim().toLowerCase();
          const code = (party.distributor_code || party.dealer_code || party.sub_dealer_code || party.party_universal_code || '').toLowerCase();
          const firm = (party.firm_name || '').toLowerCase();
          const person = (party.contact_person_name_1 || party.owner_name || '').toLowerCase();
          const dist = (party.district_name || '').toLowerCase();
          const state = (party.state_name || '').toLowerCase();

          return code.includes(term) || firm.includes(term) || person.includes(term) || dist.includes(term) || state.includes(term);
        });

        return (
          <div>
            {/* KPI Ribbon */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Monitored Partners</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalMonitored}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Healthy Growth</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{healthyCount}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>At Risk / Slowing</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{atRiskCount}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>Critical Churn Risk</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f87171' }}>{criticalCount}</div>
                </div>
              </div>
            </div>

            {/* Filter and Action Bar */}
            <div style={{
              background: 'var(--bg-surface)',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              marginBottom: '1rem',
              border: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '420px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    value={monthlySearchTerm}
                    onChange={e => setMonthlySearchTerm(e.target.value)}
                    placeholder="Search Partner, Territory, Owner..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* Period Selector */}
                <select
                  value={monthlyPeriodFilter}
                  onChange={e => {
                    setMonthlyPeriodFilter(e.target.value);
                    loadOperationsData('monthly_feedback');
                  }}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Evaluation Periods</option>
                  <option value={currentPeriodStr}>Current Month ({currentPeriodStr})</option>
                  <option value="2026-08">August 2026</option>
                  <option value="2026-07">July 2026</option>
                </select>

                <select
                  value={monthlyRiskFilter}
                  onChange={e => setMonthlyRiskFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Health Risk Categories</option>
                  <option value="HEALTHY">🟢 Healthy Partners</option>
                  <option value="AT_RISK">🟡 At-Risk / Slowing</option>
                  <option value="DORMANT">🔴 Dormant Risk</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (activePartners.length > 0) {
                      setSelectedPartyForMonthly(activePartners[0]);
                      setShowMonthlyModal(true);
                    }
                  }}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
                  }}
                >
                  <Plus size={15} /> + Conduct Monthly Review
                </button>
              </div>
            </div>

            {/* Roster Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Partner Code &amp; Tier</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Firm Name &amp; Contact</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Territory</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Health Status</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Market Sentiment</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Field (TSE) &amp; Service</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Next Month Demand</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No partners match the current monthly review filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map(party => {
                      const mRecord = monthlyMap.get(party.id);
                      const isDist = party.party_type === 'Distributor';
                      const isDealer = party.party_type === 'Dealer';

                      return (
                        <tr key={party.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24', fontSize: '0.9rem' }}>
                              {party.distributor_code || party.dealer_code || party.sub_dealer_code || party.party_universal_code}
                            </div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.12rem 0.45rem',
                              borderRadius: '4px',
                              marginTop: '0.2rem',
                              background: isDist ? 'rgba(56,189,248,0.2)' : isDealer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                              color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24'
                            }}>
                              {party.party_type}
                            </span>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{party.firm_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              {party.contact_person_name_1 || party.owner_name || 'Principal'} • {party.contact_mobile_1_1 || party.primary_mobile || '-'}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600 }}>{party.district_name || 'District'}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{party.state_name || 'Punjab'}</div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            {mRecord ? (
                              <span style={{
                                padding: '0.2rem 0.6rem',
                                borderRadius: '5px',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                background: mRecord.market_sentiment === 'COMPETITOR_PRESSURE'
                                  ? 'rgba(239,68,68,0.2)'
                                  : mRecord.is_dormant_risk
                                  ? 'rgba(245,158,11,0.2)'
                                  : 'rgba(16,185,129,0.2)',
                                color: mRecord.market_sentiment === 'COMPETITOR_PRESSURE'
                                  ? '#f87171'
                                  : mRecord.is_dormant_risk
                                  ? '#fbbf24'
                                  : '#34d399'
                              }}>
                                {mRecord.market_sentiment === 'COMPETITOR_PRESSURE'
                                  ? '🔴 Dormant / High Churn'
                                  : mRecord.is_dormant_risk
                                  ? '🟡 At Risk / Slowing'
                                  : '🟢 Healthy Growth'}
                              </span>
                            ) : (
                              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.74rem', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 600 }}>
                                ⏳ Review Pending
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            {mRecord ? (
                              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#cbd5e1' }}>
                                {mRecord.market_sentiment}
                              </span>
                            ) : '-'}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            {mRecord ? (
                              <div>
                                <div>TSE Support: <strong style={{ color: '#fbbf24' }}>⭐ {mRecord.tse_support_rating || 5}/5</strong></div>
                                <div style={{ color: 'var(--text-secondary)' }}>Service: <strong style={{ color: '#38bdf8' }}>⭐ {mRecord.service_support_rating || 5}/5</strong></div>
                              </div>
                            ) : '-'}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            {mRecord?.next_month_demand_plan ? (
                              <span style={{ color: '#34d399', fontWeight: 600 }}>{mRecord.next_month_demand_plan}</span>
                            ) : (
                              <span style={{ color: '#64748b' }}>No plan recorded</span>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPartyForMonthly(party);
                                setMonthlyForm(prev => ({
                                  ...prev,
                                  party_id: party.id,
                                  evaluation_period: monthlyPeriodFilter !== 'ALL' ? monthlyPeriodFilter : currentPeriodStr
                                }));
                                setShowMonthlyModal(true);
                              }}
                              style={{
                                padding: '0.4rem 0.8rem',
                                background: '#2563eb',
                                border: 'none',
                                color: '#fff',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              Review / Update
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 5: ENGINE 4 - COMPLAINT MANAGEMENT SYSTEM */}
      {/* ========================================================= */}
      {activeTab === 'complaints' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Complaint Tickets, SLA & Resolution Desk</h3>
            <button
              onClick={() => setShowComplaintModal(true)}
              style={{ padding: '0.55rem 1.1rem', background: '#ef4444', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
            >
              + Raise Urgent Complaint Ticket
            </button>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Ticket Number</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Party Name</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Priority & SLA</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Assigned Dept</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {complaints.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No active complaints logged. System is operating at 100% health!
                    </td>
                  </tr>
                ) : (
                  complaints.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: '#f87171' }}>{c.ticket_number}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>{c.party?.firm_name || 'Party'}</td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{c.category}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
                          {c.priority} (24h SLA)
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>{c.assigned_department}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', background: c.ticket_status === 'RESOLVED_CLOSED' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: c.ticket_status === 'RESOLVED_CLOSED' ? '#34d399' : '#fbbf24' }}>
                          {c.ticket_status}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {c.ticket_status !== 'RESOLVED_CLOSED' && (
                          <button
                            onClick={async () => {
                              const otp = prompt('Enter 6-digit Customer Closure OTP:');
                              if (otp) {
                                await verifyAndCloseComplaint(c.id, otp, 5);
                                alert('Ticket Resolved & Closed successfully with OTP verification!');
                                loadOperationsData('complaints');
                              }
                            }}
                            style={{ padding: '0.35rem 0.75rem', background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                          >
                            Verify & Close
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 360 DEGREE PROFILE & RELATIONSHIP AUDIT MODAL */}
      {/* ========================================================= */}
      {view360Party && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0b1329', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '960px', maxHeight: '92vh', overflowY: 'auto', color: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9)' }}>
            
            {/* 1. MODAL HEADER WITH BADGES & CLOSE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                  {/* Channel / Universal Code */}
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.65rem', background: 'rgba(16,185,129,0.25)', color: '#34d399', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)', fontFamily: 'monospace' }}>
                    {view360Party.distributor_code || view360Party.dealer_code || view360Party.sub_dealer_code || view360Party.party_universal_code || 'UNASSIGNED'}
                  </span>
                  
                  {/* Party Tier */}
                  <span style={{
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px',
                    background: view360Party.party_type === 'Distributor' ? 'rgba(56,189,248,0.25)' : view360Party.party_type === 'Dealer' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
                    color: view360Party.party_type === 'Distributor' ? '#38bdf8' : view360Party.party_type === 'Dealer' ? '#34d399' : '#fbbf24',
                    border: `1px solid ${view360Party.party_type === 'Distributor' ? '#38bdf840' : view360Party.party_type === 'Dealer' ? '#34d39940' : '#fbbf2440'}`
                  }}>
                    {view360Party.party_type === 'Distributor' ? '👑 Level 1: Distributor' : view360Party.party_type === 'Dealer' ? '🏪 Level 2: Dealer' : '🛒 Level 3: Sub-Dealer'}
                  </span>

                  {/* Our Company Badge */}
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.18rem 0.55rem',
                    borderRadius: '6px',
                    background: (view360Party.our_company === 'NSTL' || view360Party.our_company === 'NSTLP') ? 'rgba(236,72,153,0.2)' : 'rgba(245,158,11,0.2)',
                    color: (view360Party.our_company === 'NSTL' || view360Party.our_company === 'NSTLP') ? '#f472b6' : '#fbbf24',
                    border: `1px solid ${(view360Party.our_company === 'NSTL' || view360Party.our_company === 'NSTLP') ? '#f472b640' : '#fbbf2440'}`
                  }}>
                    {view360Party.our_company === 'NSTLP' ? 'NSTL' : (view360Party.our_company || 'NSMLR')}
                  </span>

                  {/* Operational Status */}
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.18rem 0.55rem',
                    borderRadius: '6px',
                    background: (view360Party.final_status === 'Active' || view360Party.party_status === 'Active') ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                    color: (view360Party.final_status === 'Active' || view360Party.party_status === 'Active') ? '#34d399' : '#fbbf24',
                    border: `1px solid ${(view360Party.final_status === 'Active' || view360Party.party_status === 'Active') ? '#34d39940' : '#fbbf2440'}`
                  }}>
                    ● {view360Party.final_status || view360Party.party_status || 'Draft'}
                  </span>

                  {/* Onboarding Stage */}
                  {view360Party.onboarding_stage && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.18rem 0.5rem', background: 'rgba(148,163,184,0.15)', color: '#94a3b8', borderRadius: '6px' }}>
                      Stage: {view360Party.onboarding_stage}
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0.2rem 0', color: '#f8fafc' }}>
                  {view360Party.firm_name}
                </h2>
                {view360Party.legal_name && view360Party.legal_name !== view360Party.firm_name && (
                  <div style={{ fontSize: '0.86rem', color: '#94a3b8' }}>
                    Legal Registered Name: <strong style={{ color: '#cbd5e1' }}>{view360Party.legal_name}</strong>
                  </div>
                )}
              </div>

              <button
                onClick={() => { setView360Party(null); setParty360Data(null); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1.1rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <X size={16} /> Close
              </button>
            </div>

            {/* 2. STRICT CHANNEL HIERARCHY CHAIN */}
            <div style={{ background: '#131e36', padding: '1rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid rgba(56,189,248,0.25)' }}>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
                Channel Hierarchy Chain (Who Under Whom)
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {view360Party.party_type === 'Distributor' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8' }}>
                    <span style={{ fontSize: '1.2rem' }}>👑</span>
                    <span>{view360Party.firm_name}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>(Master Regional Hub)</span>
                  </div>
                ) : view360Party.party_type === 'Dealer' ? (
                  <>
                    <span style={{ color: '#60a5fa' }}>
                      👑 {view360Party.parent_distributor?.firm_name || view360Party.parent_distributor_name || 'Swan Direct / Open Territory'}
                    </span>
                    <ArrowRight size={14} style={{ color: '#94a3b8' }} />
                    <span style={{ color: '#34d399' }}>🏪 {view360Party.firm_name}</span>
                  </>
                ) : (
                  <>
                    {(view360Party.parent_distributor?.firm_name || view360Party.parent_distributor_name) && (
                      <>
                        <span style={{ color: '#60a5fa' }} title="Master Distributor">
                          👑 {view360Party.parent_distributor?.firm_name || view360Party.parent_distributor_name}
                        </span>
                        <ArrowRight size={14} style={{ color: '#94a3b8' }} />
                      </>
                    )}
                    <span style={{ color: '#34d399' }} title="Parent Dealer">
                      🏪 {view360Party.parent_dealer?.firm_name || view360Party.parent_dealer_name || 'Parent Dealer'}
                    </span>
                    <ArrowRight size={14} style={{ color: '#94a3b8' }} />
                    <span style={{ color: '#fbbf24' }}>🛒 {view360Party.firm_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* 3. FIRM & TAX IDENTIFICATION + REGISTERED LOCATION */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {/* Firm Master Details */}
              <div style={{ background: '#131e36', padding: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Building2 size={16} /> Firm & Tax Identification
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.83rem' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Constitution Type</span>
                    <strong style={{ color: '#e2e8f0' }}>{view360Party.constitution_type || 'PROPRIETORSHIP'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Operating Company</span>
                    <strong style={{ color: (view360Party.our_company === 'NSTL' || view360Party.our_company === 'NSTLP') ? '#f472b6' : '#fbbf24' }}>
                      {view360Party.our_company === 'NSTLP' ? 'NSTL' : (view360Party.our_company || 'NSMLR')}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>GSTIN</span>
                    <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                      {view360Party.gstin || 'NOT REGISTERED'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>PAN Number</span>
                    <span style={{ color: '#fbbf24', fontFamily: 'monospace', fontWeight: 700 }}>
                      {view360Party.pan || '-'}
                    </span>
                  </div>
                  {view360Party.cin && (
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>CIN</span>
                      <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{view360Party.cin}</span>
                    </div>
                  )}
                  {view360Party.udyam_number && (
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Udyam No</span>
                      <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{view360Party.udyam_number}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Source of Origin</span>
                    <span style={{ color: '#94a3b8' }}>{view360Party.acquisition_source || 'Direct Onboarding'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Created Date (IST)</span>
                    <span style={{ color: '#94a3b8' }}>
                      {view360Party.created_at ? new Date(view360Party.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Registered Address & Location Master */}
              <div style={{ background: '#131e36', padding: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34d399', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={16} /> Registered Address & Geography
                </div>
                <div style={{ fontSize: '0.83rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Premises / Street Address</span>
                    <strong style={{ color: '#e2e8f0' }}>{view360Party.address || 'Address on file'}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.2rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>State</span>
                      <strong style={{ color: '#38bdf8' }}>{view360Party.state_name || 'Punjab'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Primary District</span>
                      <strong style={{ color: '#e2e8f0' }}>{view360Party.district_name || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Tehsil / Taluka</span>
                      <span style={{ color: '#cbd5e1' }}>{view360Party.tehsil || '-'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>City / Village & Pin</span>
                      <span style={{ color: '#cbd5e1' }}>
                        {view360Party.city_village || '-'} {view360Party.pincode ? `(${view360Party.pincode})` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. COMPLETE CONTACT CHANNELS ("Firm & Contact Details sara data aaye") */}
            <div style={{ background: '#131e36', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fbbf24', marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Phone size={16} /> Complete Contact Channels & Personnel Records
              </div>

              {/* Grid with 4 Cards: Official Channels + Contact Persons 1, 2, 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
                
                {/* Card A: Official Business Channels */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    🏢 Official Business Channels
                  </div>
                  <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Biz Contact No 1:</span>{' '}
                      <strong style={{ color: '#e2e8f0' }}>{view360Party.biz_contact_no_1 || view360Party.primary_mobile || '-'}</strong>
                    </div>
                    {view360Party.biz_contact_no_2 && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Biz Contact No 2:</span>{' '}
                        <span style={{ color: '#cbd5e1' }}>{view360Party.biz_contact_no_2}</span>
                      </div>
                    )}
                    {(view360Party.biz_alt_no_1 || view360Party.biz_alt_no_2) && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Biz Alt Phone(s):</span>{' '}
                        <span style={{ color: '#cbd5e1' }}>{[view360Party.biz_alt_no_1, view360Party.biz_alt_no_2].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Official Email 1:</span>{' '}
                      <span style={{ color: '#38bdf8' }}>{view360Party.biz_email_1 || view360Party.official_email || '-'}</span>
                    </div>
                    {view360Party.biz_email_2 && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Official Email 2:</span>{' '}
                        <span style={{ color: '#38bdf8' }}>{view360Party.biz_email_2}</span>
                      </div>
                    )}
                    {(view360Party.biz_alt_email_1 || view360Party.biz_alt_email_2) && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Alt Biz Email(s):</span>{' '}
                        <span style={{ color: '#94a3b8' }}>{[view360Party.biz_alt_email_1, view360Party.biz_alt_email_2].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card B: Contact Person 1 (Primary Key Person / Owner) */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    👤 Contact Person 1 (Primary / Owner)
                  </div>
                  <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Name:</span>{' '}
                      <strong style={{ color: '#f8fafc' }}>{view360Party.contact_person_name_1 || view360Party.owner_name || 'Principal'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Primary Mobile:</span>{' '}
                      <strong style={{ color: '#34d399' }}>{view360Party.contact_mobile_1_1 || view360Party.primary_mobile || '-'}</strong>
                    </div>
                    {view360Party.contact_mobile_1_2 && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Secondary Mobile:</span>{' '}
                        <span style={{ color: '#cbd5e1' }}>{view360Party.contact_mobile_1_2}</span>
                      </div>
                    )}
                    {(view360Party.contact_alt_mobile_1_1 || view360Party.contact_alt_mobile_1_2) && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Alt Mobile(s):</span>{' '}
                        <span style={{ color: '#cbd5e1' }}>{[view360Party.contact_alt_mobile_1_1, view360Party.contact_alt_mobile_1_2].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {(view360Party.contact_email_1_2 || view360Party.contact_alt_email_1_1) && (
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Email:</span>{' '}
                        <span style={{ color: '#38bdf8' }}>{[view360Party.contact_email_1_2, view360Party.contact_alt_email_1_1].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card C: Contact Person 2 (Partner / General Manager) */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    👤 Contact Person 2 (Partner / Manager)
                  </div>
                  {view360Party.contact_person_name_2 || view360Party.contact_mobile_2_1 ? (
                    <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Name:</span>{' '}
                        <strong style={{ color: '#f8fafc' }}>{view360Party.contact_person_name_2 || '-'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Mobile:</span>{' '}
                        <strong style={{ color: '#fbbf24' }}>{view360Party.contact_mobile_2_1 || '-'}</strong>
                      </div>
                      {view360Party.contact_mobile_2_2 && (
                        <div>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Alt Mobile:</span>{' '}
                          <span style={{ color: '#cbd5e1' }}>{view360Party.contact_mobile_2_2}</span>
                        </div>
                      )}
                      {(view360Party.contact_email_2_2 || view360Party.contact_alt_email_2_1) && (
                        <div>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Email:</span>{' '}
                          <span style={{ color: '#38bdf8' }}>{view360Party.contact_email_2_2 || view360Party.contact_alt_email_2_1}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      No secondary contact person recorded.
                    </div>
                  )}
                </div>

                {/* Card D: Contact Person 3 (Accountant / Operations) */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    👤 Contact Person 3 (Accounts / Ops)
                  </div>
                  {view360Party.contact_person_name_3 || view360Party.contact_mobile_3_1 ? (
                    <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Name:</span>{' '}
                        <strong style={{ color: '#f8fafc' }}>{view360Party.contact_person_name_3 || '-'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Mobile:</span>{' '}
                        <strong style={{ color: '#c084fc' }}>{view360Party.contact_mobile_3_1 || '-'}</strong>
                      </div>
                      {view360Party.contact_mobile_3_2 && (
                        <div>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Alt Mobile:</span>{' '}
                          <span style={{ color: '#cbd5e1' }}>{view360Party.contact_mobile_3_2}</span>
                        </div>
                      )}
                      {(view360Party.contact_email_3_1 || view360Party.contact_email_3_2) && (
                        <div>
                          <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Email:</span>{' '}
                          <span style={{ color: '#38bdf8' }}>{view360Party.contact_email_3_1 || view360Party.contact_email_3_2}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                      No tertiary contact person recorded.
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* 5. COMMERCIAL SECURITY TERMS & BILLING (NO CREDIT LIMIT / SANCTIONED LIMIT AS REQUESTED) */}
            <div style={{ background: '#131e36', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#10b981', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <DollarSign size={16} /> Commercial Terms, Security Deposit & Billing Route
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.83rem' }}>
                {/* Billing Route */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Configured Billing Route</span>
                  <strong style={{
                    color: view360Party.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '#34d399' : view360Party.billing_route_type === 'DEALER_BILLED' ? '#f59e0b' : '#60a5fa',
                    fontSize: '0.9rem',
                    display: 'block',
                    marginTop: '0.2rem'
                  }}>
                    {view360Party.billing_route_type === 'DIRECT_COMPANY_BILLING'
                      ? '🏢 Direct Company Billing'
                      : view360Party.billing_route_type === 'DEALER_BILLED'
                      ? '🏬 Dealer Billed'
                      : '👑 Distributor Billed'}
                  </strong>
                </div>

                {/* Security Deposit Amount */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Security Deposit Amount</span>
                  <strong style={{ color: '#34d399', fontSize: '1.05rem', display: 'block', marginTop: '0.2rem' }}>
                    ₹{Number(view360Party.security_deposit_amount || 0).toLocaleString('en-IN')}
                  </strong>
                </div>

                {/* Security Mode & Receipt */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Payment Mode & Voucher</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    <strong style={{ color: '#e2e8f0' }}>{view360Party.security_mode || 'Cheque'}</strong>
                    {view360Party.receipt_no && (
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>
                        Receipt: <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{view360Party.receipt_no}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Deposit Date */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Security Deposit Date</span>
                  <strong style={{ color: '#e2e8f0', display: 'block', marginTop: '0.2rem' }}>
                    {view360Party.security_deposit_date || '-'}
                  </strong>
                </div>

                {/* Distributor Margin */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>Distributor Commission %</span>
                  <strong style={{ color: '#fbbf24', fontSize: '0.95rem', display: 'block', marginTop: '0.2rem' }}>
                    {view360Party.distributor_commission_percent ?? 2.5}%
                  </strong>
                </div>

                {/* 1st Billing Milestone */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.74rem' }}>1st Billing Milestone</span>
                  <div style={{ marginTop: '0.2rem' }}>
                    {view360Party.billing_first_amount ? (
                      <div>
                        <strong style={{ color: '#38bdf8' }}>₹{Number(view360Party.billing_first_amount).toLocaleString('en-IN')}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.3rem' }}>
                          ({view360Party.billing_first_status || 'Pending'})
                        </span>
                        {view360Party.billing_first_date && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Date: {view360Party.billing_first_date}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#64748b' }}>Pending 1st Order Dispatch</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 6. PRODUCTS AUTHORIZATION & TERRITORY JURISDICTION */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              
              {/* Product Authorization */}
              <div style={{ background: '#131e36', padding: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Package size={16} /> Authorized Product Machinery
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Product Category: </span>
                  <strong style={{ color: '#e2e8f0', fontSize: '0.84rem' }}>
                    {view360Party.product_category || 'Implement & Spare Parts'}
                  </strong>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                  {(() => {
                    const authList = (party360Data?.product_authorizations && party360Data.product_authorizations.length > 0)
                      ? party360Data.product_authorizations.map(a => a.product_name || a.order_category)
                      : (Array.isArray(view360Party.product_authorizations) && view360Party.product_authorizations.length > 0)
                      ? view360Party.product_authorizations.map(a => a.product_name || a)
                      : ['ROTAVATOR', 'SPARE_PARTS'];

                    return authList.map((pName, i) => (
                      <span key={i} style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        background: 'rgba(167,139,250,0.15)',
                        color: '#c084fc',
                        border: '1px solid rgba(167,139,250,0.3)',
                        borderRadius: '6px'
                      }}>
                        ⚙️ {pName}
                      </span>
                    ));
                  })()}
                </div>
              </div>

              {/* Territory Allocation & Area Jurisdiction */}
              <div style={{ background: '#131e36', padding: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={16} /> Territory Jurisdiction & Area Coverage
                </div>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Jurisdiction Zone: </span>
                    <strong style={{ color: '#e2e8f0' }}>{view360Party.zone || 'North Zone'}</strong>
                  </div>

                  {/* Assigned districts chips for distributors */}
                  {(() => {
                    const rawDists = view360Party.assigned_districts || view360Party.headquarter_districts;
                    const distList = Array.isArray(rawDists)
                      ? rawDists
                      : (typeof rawDists === 'string' && rawDists ? rawDists.split(',').map(s => s.trim()).filter(Boolean) : []);

                    if (distList.length > 0) {
                      return (
                        <div>
                          <span style={{ color: '#94a3b8', fontSize: '0.74rem', display: 'block', marginBottom: '0.25rem' }}>
                            Assigned Headquarter Districts:
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {distList.map((d, i) => (
                              <span key={i} style={{ fontSize: '0.72rem', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '0.12rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.3)' }}>
                                📍 {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Market Coverage Area for Dealers */}
                  {view360Party.party_type === 'Dealer' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.2rem' }}>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Showroom Area</span>
                        <strong style={{ color: '#e2e8f0', display: 'block' }}>{view360Party.showroom_area_sqft || 2500} sq.ft.</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Dealership Type</span>
                        <strong style={{ color: '#34d399', display: 'block' }}>{view360Party.dealership_type || 'EXCLUSIVE_SWAN'}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* 7. DEDICATED SWAN SALES & SUPPORT TEAM (ALL 7 ROLES) */}
            <div style={{ background: '#131e36', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#a78bfa', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} /> Dedicated Swan Company Personnel (7 Assigned Roles)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {ALL_CLIENT_TEAM_ROLES.map(role => {
                  // Find assigned employee names for this role
                  const assigned = (party360Data?.team_assignments || view360Party.team_assignments || [])
                    .filter(a => a.role_in_party === role.id)
                    .map(a => a.employee_name);

                  return (
                    <div key={role.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.7rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.73rem', display: 'block', fontWeight: 600 }}>
                        {role.id}
                      </span>
                      <div style={{ marginTop: '0.25rem' }}>
                        {assigned.length > 0 ? (
                          assigned.map((name, i) => (
                            <span key={i} style={{ display: 'inline-block', fontSize: '0.76rem', color: '#f8fafc', fontWeight: 700 }}>
                              {name}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: LOG DAILY SALES ORDER & FOLLOW-UP DISPOSITION */}
      {/* ========================================================= */}
      {showOrderModal && selectedPartyForOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                  Log Order / Call Followup
                </h3>
                <div style={{ fontSize: '0.86rem', color: '#f8fafc', fontWeight: 700, marginTop: '0.2rem' }}>
                  {selectedPartyForOrder.firm_name}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                    {selectedPartyForOrder.distributor_code || selectedPartyForOrder.dealer_code || selectedPartyForOrder.party_universal_code || 'CODE'}
                  </span>
                  {' '}• {selectedPartyForOrder.party_type} • Billing Route: <strong style={{ color: '#fbbf24' }}>{selectedPartyForOrder.billing_route_type || 'DIRECT'}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const isOrder = orderForm.call_status === 'ORDER_PLACED';
              const orderNo = isOrder ? `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}` : null;

              let notesSummary = orderForm.notes || '';
              if (isOrder) {
                notesSummary = `Order: ${orderForm.qty}x ${orderForm.product}. ${orderForm.notes ? 'Notes: ' + orderForm.notes : ''} ${orderForm.transport_details ? 'Transporter: ' + orderForm.transport_details : ''}`.trim();
              } else if (orderForm.call_status === 'RESCHEDULED') {
                notesSummary = `Callback scheduled: ${orderForm.next_followup_date || 'Later'}. Reason: ${orderForm.no_order_reason || 'Busy'}. ${orderForm.notes || ''}`.trim();
              } else if (orderForm.call_status === 'PAYMENT_PENDING') {
                notesSummary = `Payment Clearance Needed before dispatch. ${orderForm.notes || ''}`.trim();
              } else if (orderForm.call_status === 'NOT_REACHABLE') {
                notesSummary = `Partner unreachable / phone ringing. ${orderForm.notes || ''}`.trim();
              }

              await saveOrderFollowup({
                party_id: selectedPartyForOrder.id,
                is_order_placed: isOrder,
                generated_order_no: orderNo,
                billing_route: selectedPartyForOrder.billing_route_type || 'DIRECT_COMPANY_BILLING',
                call_status: orderForm.call_status,
                product: isOrder ? orderForm.product : null,
                qty: isOrder ? orderForm.qty : null,
                target_dispatch_date: isOrder ? orderForm.dispatch_date : null,
                transport_details: orderForm.transport_details || null,
                next_followup_date: orderForm.next_followup_date || null,
                no_order_reason: orderForm.no_order_reason || null,
                notes: notesSummary
              });

              setShowOrderModal(false);
              loadOperationsData('order_followup');

              setCenterAlert({
                isOpen: true,
                type: 'success',
                title: isOrder ? 'Sales Order Booked' : 'Followup Logged',
                message: isOrder
                  ? `Sales Order #${orderNo} punched successfully for ${selectedPartyForOrder.firm_name}!`
                  : `Follow-up call status "${orderForm.call_status}" recorded for ${selectedPartyForOrder.firm_name}.`,
                confirmText: 'Done',
                onConfirm: null
              });
            }}>
              {/* Call Disposition Selector */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Call Outcome / Disposition *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.45rem' }}>
                  {[
                    { id: 'ORDER_PLACED', label: '🟢 Order Booked', color: '#10b981' },
                    { id: 'CONNECTED', label: '🟡 Discussion Only', color: '#f59e0b' },
                    { id: 'PAYMENT_PENDING', label: '🟠 Payment Pending', color: '#ea580c' },
                    { id: 'RESCHEDULED', label: '🔵 Call Back Later', color: '#3b82f6' },
                    { id: 'NOT_REACHABLE', label: '⚪ Not Reachable', color: '#94a3b8' }
                  ].map(disp => (
                    <button
                      key={disp.id}
                      type="button"
                      onClick={() => setOrderForm(prev => ({ ...prev, call_status: disp.id }))}
                      style={{
                        padding: '0.55rem 0.5rem',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        border: orderForm.call_status === disp.id ? `2px solid ${disp.color}` : '1px solid rgba(255,255,255,0.12)',
                        background: orderForm.call_status === disp.id ? `${disp.color}25` : 'rgba(255,255,255,0.03)',
                        color: orderForm.call_status === disp.id ? '#ffffff' : '#cbd5e1',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {disp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Specific Fields */}
              {orderForm.call_status === 'ORDER_PLACED' && (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                    📦 Order &amp; Dispatch Particulars
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.65rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Product Machinery *</label>
                      <select
                        value={orderForm.product}
                        onChange={e => setOrderForm({ ...orderForm, product: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      >
                        {PRODUCT_GROUPS.map(p => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={orderForm.qty}
                        onChange={e => setOrderForm({ ...orderForm, qty: Number(e.target.value) })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Target Dispatch Date (IST)</label>
                      <input
                        type="date"
                        value={orderForm.dispatch_date}
                        onChange={e => setOrderForm({ ...orderForm, dispatch_date: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Transporter / Cargo Route</label>
                      <input
                        type="text"
                        placeholder="e.g. Ludhiana Goods Transport"
                        value={orderForm.transport_details}
                        onChange={e => setOrderForm({ ...orderForm, transport_details: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Callback Reschedule Specific Fields */}
              {orderForm.call_status === 'RESCHEDULED' && (
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                    ⏰ Callback Schedule
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Next Follow-up Date (IST) *</label>
                      <input
                        type="date"
                        required
                        value={orderForm.next_followup_date}
                        onChange={e => setOrderForm({ ...orderForm, next_followup_date: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Reason for Delay</label>
                      <input
                        type="text"
                        placeholder="e.g. Owner traveling, checking farmer demand"
                        value={orderForm.no_order_reason}
                        onChange={e => setOrderForm({ ...orderForm, no_order_reason: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', fontSize: '0.84rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Call Summary Notes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                  Discussion &amp; Call Remarks
                </label>
                <textarea
                  rows="3"
                  placeholder="Record partner feedback, existing yard stock, seasonal tractor attachment demand..."
                  value={orderForm.notes}
                  onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff', fontSize: '0.84rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: orderForm.call_status === 'ORDER_PLACED'
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {orderForm.call_status === 'ORDER_PLACED' ? 'Book Sales Order' : 'Save Follow-up Call'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: POST-ORDER FEEDBACK */}
      {/* ========================================================= */}
      {showFeedbackModal && selectedPartyForFeedback && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '540px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
              Customer Delivery Feedback: {selectedPartyForFeedback.firm_name}
            </h3>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await saveOrderFeedback({
                ...feedbackForm,
                party_id: selectedPartyForFeedback.id
              });
              setShowFeedbackModal(false);
              loadOperationsData('order_feedback');

              const isComplaint = (feedbackForm.overall_satisfaction <= 2) || feedbackForm.has_transit_damage_shortage;
              setCenterAlert({
                isOpen: true,
                type: isComplaint ? 'error' : 'success',
                title: isComplaint ? 'Complaint Ticket Created' : 'Feedback Saved',
                message: isComplaint
                  ? 'Delivery grievance logged! An automated High-Priority Complaint Ticket has been issued to Logistics & Plant QA.'
                  : 'Customer delivery satisfaction feedback saved successfully!',
                confirmText: 'Done',
                onConfirm: null
              });
            }}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Overall Satisfaction Score (1 to 5 Stars)</label>
                <select value={feedbackForm.overall_satisfaction} onChange={e => setFeedbackForm({ ...feedbackForm, overall_satisfaction: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="5">⭐⭐⭐⭐⭐ 5 Stars - Excellent Delivery</option>
                  <option value="4">⭐⭐⭐⭐ 4 Stars - Good</option>
                  <option value="3">⭐⭐⭐ 3 Stars - Average</option>
                  <option value="2">⭐⭐ 2 Stars - Poor (Auto-Escalates Complaint)</option>
                  <option value="1">⭐ 1 Star - Very Poor / Transit Damage</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fbbf24', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={feedbackForm.has_transit_damage_shortage}
                    onChange={e => setFeedbackForm({ ...feedbackForm, has_transit_damage_shortage: e.target.checked })}
                  />
                  Report Transit Shortage or Damage (Auto-triggers Ticket)
                </label>
              </div>

              {feedbackForm.has_transit_damage_shortage && (
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#ef4444', marginBottom: '0.3rem' }}>Damage / Shortage Details</label>
                  <input type="text" placeholder="e.g. Paint scratch on side frame, 1 PTO pin missing" value={feedbackForm.damage_details} onChange={e => setFeedbackForm({ ...feedbackForm, damage_details: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid #ef4444', borderRadius: '8px', color: '#fff' }} />
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Dealer Comments</label>
                <textarea rows="2" value={feedbackForm.dealer_comments} onChange={e => setFeedbackForm({ ...feedbackForm, dealer_comments: e.target.value })} placeholder="Dealer voice verbatim..." style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowFeedbackModal(false)} style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.25rem', background: '#2563eb', border: 'none', color: '#fff', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}>Save Feedback</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: MONTHLY PARTNER HEALTH REVIEW & DEMAND PLANNING */}
      {/* ========================================================= */}
      {showMonthlyModal && selectedPartyForMonthly && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                  Monthly Partner Review: {selectedPartyForMonthly.firm_name}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '0.25rem' }}>
                  {selectedPartyForMonthly.distributor_code || selectedPartyForMonthly.dealer_code || selectedPartyForMonthly.party_universal_code || 'CODE'} • {selectedPartyForMonthly.party_type} • {selectedPartyForMonthly.district_name || 'District'}, {selectedPartyForMonthly.state_name || 'State'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMonthlyModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await saveMonthlyFeedback({
                ...monthlyForm,
                party_id: selectedPartyForMonthly.id
              });
              setShowMonthlyModal(false);
              loadOperationsData('monthly_feedback');
              setCenterAlert({
                isOpen: true,
                type: 'success',
                title: 'Monthly Review Recorded',
                message: `Monthly health assessment and demand projection saved for ${selectedPartyForMonthly.firm_name}!`,
                confirmText: 'Done',
                onConfirm: null
              });
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Evaluation Period (Month)</label>
                  <input
                    type="month"
                    required
                    value={monthlyForm.evaluation_period}
                    onChange={e => setMonthlyForm({ ...monthlyForm, evaluation_period: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Days Inactive (No Orders)</label>
                  <input
                    type="number"
                    min="0"
                    value={monthlyForm.days_inactive}
                    onChange={e => setMonthlyForm({ ...monthlyForm, days_inactive: Number(e.target.value), is_dormant_risk: Number(e.target.value) > 45 })}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Territory Market Sentiment</label>
                  <select
                    value={monthlyForm.market_sentiment}
                    onChange={e => setMonthlyForm({ ...monthlyForm, market_sentiment: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="BOOMING">🚀 Booming / High Demand</option>
                    <option value="STEADY">⚖️ Steady / Normal Season</option>
                    <option value="SLUGGISH">📉 Sluggish / Off-Season</option>
                    <option value="COMPETITOR_PRESSURE">⚔️ Heavy Competitor Pressure</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Risk Status</label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '42px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: monthlyForm.is_dormant_risk ? '#f87171' : '#34d399', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={monthlyForm.is_dormant_risk}
                        onChange={e => setMonthlyForm({ ...monthlyForm, is_dormant_risk: e.target.checked })}
                      />
                      {monthlyForm.is_dormant_risk ? '⚠️ High Dormancy / Churn Risk' : '✓ Normal Engagement'}
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>TSE Field Support Score</label>
                  <select
                    value={monthlyForm.tse_support_rating}
                    onChange={e => setMonthlyForm({ ...monthlyForm, tse_support_rating: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="5">⭐⭐⭐⭐⭐ 5 Stars (Active visits)</option>
                    <option value="4">⭐⭐⭐⭐ 4 Stars (Good presence)</option>
                    <option value="3">⭐⭐⭐ 3 Stars (Average support)</option>
                    <option value="2">⭐⭐ 2 Stars (Rare visits)</option>
                    <option value="1">⭐ 1 Star (No support received)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Service &amp; Warranty Score</label>
                  <select
                    value={monthlyForm.service_support_rating}
                    onChange={e => setMonthlyForm({ ...monthlyForm, service_support_rating: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="5">⭐⭐⭐⭐⭐ 5 Stars (Prompt resolution)</option>
                    <option value="4">⭐⭐⭐⭐ 4 Stars (Good support)</option>
                    <option value="3">⭐⭐⭐ 3 Stars (Moderate delays)</option>
                    <option value="2">⭐⭐ 2 Stars (Complaints pending)</option>
                    <option value="1">⭐ 1 Star (Critical spare delays)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Next Month Projected Demand Plan</label>
                <input
                  type="text"
                  placeholder="e.g. 6 Rotavators (7ft), 2 Multi-crop Threshers, ₹1.5L spares"
                  value={monthlyForm.next_month_demand_plan}
                  onChange={e => setMonthlyForm({ ...monthlyForm, next_month_demand_plan: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Competitor Schemes &amp; Market Intel</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Competitor offers 45-day credit and 3% higher cash rebate in this tehsil..."
                  value={monthlyForm.competitor_schemes}
                  onChange={e => setMonthlyForm({ ...monthlyForm, competitor_schemes: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Partner Suggestions &amp; Action Plan</label>
                <textarea
                  rows="2"
                  placeholder="Key partner feedback or requested factory support..."
                  value={monthlyForm.dealer_suggestions}
                  onChange={e => setMonthlyForm({ ...monthlyForm, dealer_suggestions: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowMonthlyModal(false)}
                  style={{ padding: '0.6rem 1.1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '0.6rem 1.4rem', background: '#2563eb', border: 'none', color: '#fff', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}
                >
                  Save Monthly Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: RAISE COMPLAINT TICKET */}
      {/* ========================================================= */}
      {showComplaintModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '520px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
              🚨 Log Grievance / Complaint Ticket
            </h3>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await createComplaintTicket(complaintForm);
              setShowComplaintModal(false);
              loadOperationsData('complaints');
              setCenterAlert({
                isOpen: true,
                type: 'success',
                title: 'Complaint Ticket Issued',
                message: 'Complaint ticket generated successfully with SLA countdown timer!',
                confirmText: 'Done',
                onConfirm: null
              });
            }}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Select Channel Partner *</label>
                <select required value={complaintForm.party_id} onChange={e => setComplaintForm({ ...complaintForm, party_id: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="">-- Choose Party --</option>
                  {parties.map(p => <option key={p.id} value={p.id}>{p.firm_name} ({p.party_type})</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Complaint Category</label>
                <select value={complaintForm.category} onChange={e => setComplaintForm({ ...complaintForm, category: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="MANUFACTURING_DEFECT">Manufacturing Defect (Gearbox, Blade)</option>
                  <option value="TRANSIT_DAMAGE">Transit Shortage / Damage</option>
                  <option value="BILLING_DISPUTE">Billing & Scheme Dispute</option>
                  <option value="DELIVERY_DELAY">Delivery & Dispatch Delay</option>
                  <option value="SERVICE_WARRANTY">Field Service & Warranty</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Department Route</label>
                <select value={complaintForm.assigned_department} onChange={e => setComplaintForm({ ...complaintForm, assigned_department: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="QUALITY_ASSURANCE">Plant Quality Assurance (QA)</option>
                  <option value="LOGISTICS_DISPATCH">Logistics & Dispatch</option>
                  <option value="ACCOUNTS_FINANCE">Accounts & Billing</option>
                  <option value="SERVICE_ENGINEERING">Field Service Engineering</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Problem Description *</label>
                <textarea rows="3" required placeholder="Describe grievance in detail..." value={complaintForm.issue_description} onChange={e => setComplaintForm({ ...complaintForm, issue_description: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowComplaintModal(false)} style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.25rem', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, borderRadius: '8px' }}>Issue Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRMATION POPUP FOR PERMANENT PARTY DELETION */}
      {/* ========================================================= */}
      {deleteConfirmParty && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingParty) {
              setDeleteConfirmParty(null);
            }
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1.5px solid rgba(239, 68, 68, 0.45)',
              borderRadius: '20px',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
              color: '#ffffff',
              textAlign: 'center',
              boxShadow: '0 25px 55px rgba(0,0,0,0.85), 0 0 35px rgba(239, 68, 68, 0.25)',
              position: 'relative'
            }}
          >
            {/* Top Close [x] */}
            <button
              type="button"
              disabled={isDeletingParty}
              onClick={() => setDeleteConfirmParty(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#94a3b8',
                cursor: isDeletingParty ? 'not-allowed' : 'pointer',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>

            {/* Glowing Icon Badge */}
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                margin: '0 auto 1.25rem auto',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.1))',
                border: '2px solid #ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(239, 68, 68, 0.35)',
                color: '#ef4444'
              }}
            >
              <Trash2 size={34} />
            </div>

            {/* Badge */}
            <div style={{ marginBottom: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171'
                }}
              >
                Delete Channel Partner
              </span>
            </div>

            {/* Title */}
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: '0.5rem 0' }}>
              Delete &ldquo;{deleteConfirmParty.firm_name}&rdquo;?
            </h3>

            {/* Partner Details Card */}
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                margin: '0.85rem 0 1.25rem 0',
                fontSize: '0.82rem',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: '#94a3b8' }}>Partner Code:</span>
                <strong style={{ color: '#38bdf8' }}>{deleteConfirmParty.party_universal_code || 'Pending'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: '#94a3b8' }}>Partner Tier:</span>
                <strong style={{ color: '#fbbf24' }}>{deleteConfirmParty.party_type || 'Partner'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Location:</span>
                <strong style={{ color: '#cbd5e1' }}>
                  {[deleteConfirmParty.district_name, deleteConfirmParty.state_name].filter(Boolean).join(', ') || '-'}
                </strong>
              </div>
            </div>

            <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.45 }}>
              ⚠️ This will permanently remove this partner and all related contacts, addresses, commercial terms, product authorizations, and stage configurations.
              {deleteConfirmParty.source_lead_id ? ' The associated lead will be safely reset so you can re-transfer it.' : ''}
            </p>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={isDeletingParty}
                onClick={() => setDeleteConfirmParty(null)}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '8px',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isDeletingParty ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingParty}
                onClick={() => executeDeleteParty(deleteConfirmParty)}
                style={{
                  flex: 1.25,
                  padding: '0.75rem 1rem',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: isDeletingParty ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                }}
              >
                {isDeletingParty ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Yes, Delete Party
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CENTERED SUCCESS & ALERT POPUP MODAL (REPLACES BROWSER ALERT) */}
      {/* ========================================================= */}
      {centerAlert.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (centerAlert.onConfirm) centerAlert.onConfirm();
              setCenterAlert(prev => ({ ...prev, isOpen: false }));
            }
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: centerAlert.type === 'success'
                ? '1.5px solid rgba(16, 185, 129, 0.45)'
                : centerAlert.type === 'error'
                  ? '1.5px solid rgba(239, 68, 68, 0.45)'
                  : '1.5px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '20px',
              padding: '2.2rem 2rem',
              width: '100%',
              maxWidth: '460px',
              color: '#ffffff',
              textAlign: 'center',
              boxShadow: centerAlert.type === 'success'
                ? '0 25px 55px rgba(0,0,0,0.85), 0 0 35px rgba(16, 185, 129, 0.25)'
                : '0 25px 55px rgba(0,0,0,0.85), 0 0 30px rgba(239, 68, 68, 0.25)',
              position: 'relative'
            }}
          >
            {/* Top Close [x] */}
            <button
              onClick={() => {
                if (centerAlert.onConfirm) centerAlert.onConfirm();
                setCenterAlert(prev => ({ ...prev, isOpen: false }));
              }}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>

            {/* Glowing Icon Badge */}
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                margin: '0 auto 1.25rem auto',
                background: centerAlert.type === 'success'
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))'
                  : centerAlert.type === 'error'
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.1))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(180, 83, 9, 0.1))',
                border: centerAlert.type === 'success'
                  ? '2px solid #10b981'
                  : centerAlert.type === 'error'
                    ? '2px solid #ef4444'
                    : '2px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: centerAlert.type === 'success'
                  ? '0 0 20px rgba(16, 185, 129, 0.35)'
                  : '0 0 20px rgba(239, 68, 68, 0.35)'
              }}
            >
              {centerAlert.type === 'success' ? (
                <span style={{ fontSize: '2.3rem', lineHeight: 1 }}>🎉</span>
              ) : centerAlert.type === 'error' ? (
                <span style={{ fontSize: '2.3rem', lineHeight: 1 }}>⚠️</span>
              ) : (
                <span style={{ fontSize: '2.3rem', lineHeight: 1 }}>ℹ️</span>
              )}
            </div>

            {/* Title / Badge */}
            <div style={{ marginBottom: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '6px',
                  background: centerAlert.type === 'success'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                  color: centerAlert.type === 'success' ? '#34d399' : '#f87171'
                }}
              >
                {centerAlert.title || 'Notification'}
              </span>
            </div>

            {/* Main Message requested by user */}
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#f8fafc',
                margin: '0.65rem 0 0.5rem 0',
                lineHeight: 1.4
              }}
            >
              {centerAlert.message}
            </h3>

            {/* SubMessage if present */}
            {centerAlert.subMessage && (
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.86rem', color: '#94a3b8', lineHeight: 1.4 }}>
                {centerAlert.subMessage}
              </p>
            )}

            {/* Partner Info Details if available */}
            {centerAlert.partnerName && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  margin: '1rem 0 1.5rem 0',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.92rem' }}>
                  {centerAlert.partnerName}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  {centerAlert.partnerCode && <span>Code: <strong>{centerAlert.partnerCode}</strong></span>}
                  <span>•</span>
                  <span>Operational Status: <strong style={{ color: '#34d399' }}>{centerAlert.status || 'Active'}</strong></span>
                </div>
              </div>
            )}

            {!centerAlert.partnerName && !centerAlert.subMessage && <div style={{ height: '1.25rem' }} />}

            {/* Action Button */}
            <button
              onClick={() => {
                if (centerAlert.onConfirm) centerAlert.onConfirm();
                setCenterAlert(prev => ({ ...prev, isOpen: false }));
              }}
              style={{
                width: '100%',
                padding: '0.85rem 1.5rem',
                background: centerAlert.type === 'success'
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : centerAlert.type === 'error'
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.96rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: centerAlert.type === 'success'
                  ? '0 4px 18px rgba(16, 185, 129, 0.45)'
                  : '0 4px 18px rgba(239, 68, 68, 0.45)'
              }}
            >
              <CheckCircle2 size={18} />
              {centerAlert.confirmText || 'OK'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
