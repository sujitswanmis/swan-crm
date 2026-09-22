'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Building2, Users, Plus, Eye, RefreshCw, X, MapPin, Phone, Mail,
  CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, ArrowRightLeft,
  DollarSign, Calendar, ChevronRight, Search, Filter, Clock, Star,
  MessageSquare, Truck, Package, Shield, ExternalLink, ThumbsUp,
  AlertCircle, FileText, Check, Lock, ChevronDown, CheckSquare, Sparkles,
  UserCheck, Layers, GitFork, UserPlus, Tag
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
  verifyAndCloseComplaint
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
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Active' | 'Draft'
  const [billingFilter, setBillingFilter] = useState('ALL'); // 'ALL' | 'DIRECT_COMPANY_BILLING' | 'DISTRIBUTOR_BILLED'
  const [companyFilter, setCompanyFilter] = useState('ALL'); // 'ALL' | 'NSMLR' | 'NSTLP'

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
    zone: 'North Zone'
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
    distributor_commission_percent: 2.5
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
  const [orderForm, setOrderForm] = useState({ product: 'Rotavator 7ft Champion', qty: 2, notes: '', dispatch_date: '' });

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
      const matchesSearch = !searchTerm || (
        (p.firm_name && p.firm_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.party_universal_code && p.party_universal_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.distributor_code && p.distributor_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.dealer_code && p.dealer_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.sub_dealer_code && p.sub_dealer_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.primary_mobile && p.primary_mobile.includes(searchTerm)) ||
        (p.biz_contact_no_1 && p.biz_contact_no_1.includes(searchTerm)) ||
        (p.contact_mobile_1_1 && p.contact_mobile_1_1.includes(searchTerm)) ||
        (p.owner_name && p.owner_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      const matchesType = typeFilter === 'ALL' || p.party_type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'Active' ? p.final_status === 'Active' : p.final_status !== 'Active');
      const matchesBilling = billingFilter === 'ALL' || p.billing_route_type === billingFilter;
      const matchesCompany = companyFilter === 'ALL' || 
        (companyFilter === 'NSTL' 
          ? (p.our_company === 'NSTL' || p.our_company === 'NSTLP')
          : (p.our_company || 'NSMLR') === companyFilter);

      return matchesSearch && matchesType && matchesStatus && matchesBilling && matchesCompany;
    });
  }, [parties, searchTerm, typeFilter, statusFilter, billingFilter, companyFilter]);

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
      credit_days: party.credit_days ?? commTerms.credit_days ?? prev.credit_days
    }));

    if (party.zone) {
      setS01DistForm(prev => ({ ...prev, zone: party.zone }));
    }
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

    const targetSubmenu = {
      'S00': 's01',
      'S01': party.party_type === 'Distributor' ? 's02' : (party.party_type === 'Dealer' ? 's03' : 's04'),
      'S02': 's03',
      'S03': 's04',
      'S04': 's05',
      'S05': 's06',
      'S05_1': 's06',
      'S06': 's07',
      'S07': 's08',
      'R03': 'report',
      'report': 'report'
    }[step] || 's01';

    if (targetTab) {
      if (targetTab !== activeTab) {
        switchTab(targetTab, true);
      }
    } else if (!activeTab || activeTab === 's00' || activeTab === 'overview') {
      switchTab(targetSubmenu, true);
    }
    setShowWizard(false);
  };

  const stageFormRef = useRef(null);

  const handleSelectStageParty = (party) => {
    resumeWizard(party, activeTab);
    setIsStageModalOpen(true);
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
      await updatePartyStep(activePartyId, 'S01_Distributor_Registration', {
        zone: s01DistForm.zone,
        state: s01DistForm.state,
        district: s01DistForm.district,
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

  const getStageApprovalStatus = (party) => {
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
  };

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
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Transfered to Party Master (Leads from Stage 08)</h2>
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

          <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Lead Universal ID</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Our Company</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Lead & Firm Name</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Contact Person & Phone</th>
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
                ) : transferredLeads.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                        No leads transferred from Stage 08 yet.
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '520px', margin: '0 auto 1.25rem auto' }}>
                        When an executive marks a deal as won or ready to transfer in <strong>Lead Data &gt; 08 - Transfer to Party</strong> (or Stage 07), click the <strong>&quot;Transfer to Party Master (S00)&quot;</strong> button to send it here.
                      </p>
                      <button onClick={startNewPartyWizard} style={{ padding: '0.6rem 1.2rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                        + Create Party Master Directly
                      </button>
                    </td>
                  </tr>
                ) : (
                  transferredLeads.map(lead => {
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
          {/* Controls Bar */}
          <div style={{ background: 'var(--bg-surface)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid var(--border-light)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by Firm, Code, Mobile, or Parent..."
                  style={{ width: '100%', padding: '0.55rem 0.65rem 0.55rem 2.2rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
                style={{ padding: '0.55rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Companies (Our Company)</option>
                <option value="NSMLR">NSMLR</option>
                <option value="NSTL">NSTL</option>
              </select>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{ padding: '0.55rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Party Tiers</option>
                <option value="Distributor">Level 1: Distributor</option>
                <option value="Dealer">Level 2: Dealer</option>
                <option value="Sub-Dealer">Level 3: Sub-Dealer</option>
              </select>

              <select
                value={billingFilter}
                onChange={e => setBillingFilter(e.target.value)}
                style={{ padding: '0.55rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Billing Routes</option>
                <option value="DIRECT_COMPANY_BILLING">Direct Company Billing</option>
                <option value="DISTRIBUTOR_BILLED">Distributor Billed</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '0.55rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">All Status</option>
                <option value="Active">Active Only</option>
                <option value="Draft">Incomplete / Draft</option>
              </select>
            </div>
          </div>

          {/* R03 Table */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Party Code & Tier</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Firm & Contact Details</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Strict Channel Hierarchy (Who Under Whom)</th>
                  <th style={{ padding: '0.85rem 1rem' }}>State / Territory</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Billing Route</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Credit & Status</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParties.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No Channel Partners match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredParties.map(p => {
                    const isDist = p.party_type === 'Distributor';
                    const isDealer = p.party_type === 'Dealer';
                    const isSubDealer = p.party_type === 'Sub-Dealer';

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        {/* Party Code & Tier */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24' }}>
                            {p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code}
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
                        </td>

                        {/* Firm & Contact Details */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{p.firm_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {p.contact_person_name_1 || p.owner_name || 'Principal'} • {p.contact_mobile_1_1 || p.primary_mobile || p.biz_contact_no_1}
                          </div>
                          {(p.biz_email_1 || p.official_email) && (
                            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{p.biz_email_1 || p.official_email}</div>
                          )}
                        </td>

                        {/* Strict Channel Hierarchy Breadcrumb */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isDist && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontWeight: 700 }}>
                              👑 {p.firm_name} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(Top-Level Master Hub)</span>
                            </div>
                          )}

                          {isDealer && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                                👑 {p.parent_distributor ? p.parent_distributor.firm_name : <span style={{ color: '#ef4444' }}>Missing Parent DIS!</span>}
                              </span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span style={{ color: '#34d399', fontWeight: 700 }}>🏪 {p.firm_name}</span>
                            </div>
                          )}

                          {isSubDealer && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                                👑 {p.parent_distributor ? p.parent_distributor.firm_name : 'Parent DIS'}
                              </span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span style={{ color: '#34d399', fontWeight: 600 }}>
                                🏪 {p.parent_dealer ? p.parent_dealer.firm_name : 'Parent DLR'}
                              </span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span style={{ color: '#fbbf24', fontWeight: 700 }}>🛒 {p.firm_name}</span>
                            </div>
                          )}
                        </td>

                        {/* State / Territory */}
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                          <div style={{ fontWeight: 600 }}>{p.state_name || 'Punjab'}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>{p.district_name || p.city_village || 'District'}</div>
                        </td>

                        {/* Billing Route */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            background: p.billing_route_type === 'DIRECT_COMPANY_BILLING' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                            color: p.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '#34d399' : '#60a5fa'
                          }}>
                            {p.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '🏢 Direct Company' : '👑 Distributor Billed'}
                          </span>
                        </td>

                        {/* Credit & Status */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#fbbf24' }}>
                            ₹{p.party_commercial_terms?.[0]?.credit_limit ? p.party_commercial_terms[0].credit_limit.toLocaleString('en-IN') : '5,00,000'}
                          </div>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            background: p.final_status === 'Active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                            color: p.final_status === 'Active' ? '#34d399' : '#fbbf24'
                          }}>
                            {p.final_status || 'Draft'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => open360Modal(p)}
                              title="Full 360 Profile"
                              style={{ padding: '0.4rem 0.65rem', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <Eye size={13} /> 360°
                            </button>

                            {p.final_status !== 'Active' ? (
                              <button
                                onClick={() => resumeWizard(p)}
                                title="Resume Onboarding Steps S00-S07"
                                style={{ padding: '0.4rem 0.65rem', background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Sparkles size={13} /> Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSelectedPartyForOrder(p); setShowOrderModal(true); }}
                                title="Log Daily Order"
                                style={{ padding: '0.4rem 0.65rem', background: '#059669', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Phone size={13} /> Order
                              </button>
                            )}
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
                                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '4px', background: dlr.billing_route_type === 'DIRECT_COMPANY_BILLING' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)', color: dlr.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '#60a5fa' : '#fbbf24' }}>
                                        {dlr.billing_route_type === 'DIRECT_COMPANY_BILLING' ? 'Direct Swan' : 'Distributor Billed'}
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
      {/* TAB 2: ENGINE 1 - DAILY ORDER FOLLOWUP COCKPIT */}
      {/* ========================================================= */}
      {activeTab === 'order_followup' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Today&apos;s Order Followup Dialing Queue</h3>
            <button
              onClick={() => {
                if (parties.length > 0) {
                  setSelectedPartyForOrder(parties[0]);
                  setShowOrderModal(true);
                }
              }}
              style={{ padding: '0.55rem 1.1rem', background: '#10b981', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              + Punch Sales Order
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {parties.filter(p => p.final_status === 'Active').slice(0, 9).map(party => (
              <div key={party.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.2rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>{party.distributor_code || party.dealer_code || party.party_universal_code}</span>
                    <h4 style={{ margin: '0.2rem 0', fontSize: '1.05rem', fontWeight: 700 }}>{party.firm_name}</h4>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{party.contact_person_name_1 || party.owner_name} • {party.contact_mobile_1_1 || party.primary_mobile}</div>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', background: 'rgba(16,185,129,0.2)', color: '#34d399', borderRadius: '4px' }}>
                    {party.party_type}
                  </span>
                </div>

                <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', margin: '0.85rem 0', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)' }}>Available Credit</div>
                    <div style={{ fontWeight: 800, color: '#34d399' }}>₹5,00,000</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-secondary)' }}>Billing Mode</div>
                    <div style={{ fontWeight: 700, color: '#60a5fa' }}>{party.billing_route_type === 'DIRECT_COMPANY_BILLING' ? 'Direct Swan' : 'Distributor'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => { setSelectedPartyForOrder(party); setShowOrderModal(true); }}
                    style={{ flex: 1, padding: '0.5rem', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                  >
                    <Phone size={14} /> Call & Punch Order
                  </button>
                  <button
                    onClick={() => { setSelectedPartyForFeedback(party); setShowFeedbackModal(true); }}
                    style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    Feedback
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ENGINE 2 - POST-ORDER FEEDBACK CALLING */}
      {/* ========================================================= */}
      {activeTab === 'order_feedback' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Post-Delivery Customer Satisfaction Calling (24-48h Post Dispatch)</h3>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Order Ref</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Party Name</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Delivery Timing</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Packaging & Finish</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Transit Shortage/Damage</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Overall Score</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Complaint Status</th>
                </tr>
              </thead>
              <tbody>
                {orderFeedbacks.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No feedback responses recorded yet. Click on any party in &quot;Daily Order Followups&quot; to log feedback.
                    </td>
                  </tr>
                ) : (
                  orderFeedbacks.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{f.order_id}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>{f.party?.firm_name || 'Party'}</td>
                      <td style={{ padding: '0.85rem 1rem' }}>⭐ {f.rating_delivery_time} / 5</td>
                      <td style={{ padding: '0.85rem 1rem' }}>⭐ {f.rating_packaging_finish} / 5</td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {f.has_transit_damage_shortage ? (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠️ Yes (Reported)</span>
                        ) : (
                          <span style={{ color: '#34d399' }}>No Damage</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: f.overall_satisfaction >= 4 ? '#34d399' : '#ef4444' }}>
                        ⭐ {f.overall_satisfaction} / 5
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {f.auto_complaint_triggered ? (
                          <span style={{ padding: '0.2rem 0.55rem', background: 'rgba(239,68,68,0.2)', color: '#f87171', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                            🚨 Complaint Ticket Created
                          </span>
                        ) : (
                          <span style={{ padding: '0.2rem 0.55rem', background: 'rgba(16,185,129,0.2)', color: '#34d399', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem' }}>
                            Satisfied
                          </span>
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
      {/* TAB 4: ENGINE 3 - MONTHLY DEFAULT FEEDBACK CALLING */}
      {/* ========================================================= */}
      {activeTab === 'monthly_feedback' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Monthly Health-Check & Dormancy Risk Roster</h3>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {parties.slice(0, 6).map(p => (
                <div key={p.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.firm_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.party_type} • {p.state_name || 'Punjab'}</div>
                  <div style={{ margin: '0.6rem 0', fontSize: '0.82rem' }}>
                    Days Since Last Order: <strong style={{ color: '#fbbf24' }}>14 Days</strong>
                  </div>
                  <button
                    onClick={async () => {
                      await saveMonthlyFeedback({
                        party_id: p.id,
                        market_sentiment: 'STEADY',
                        tse_support_rating: 5,
                        service_support_rating: 5,
                        next_month_demand_plan: '4 Rotavators expected'
                      });
                      alert('Monthly Health-Check logged successfully!');
                      loadOperationsData('monthly_feedback');
                    }}
                    style={{ width: '100%', padding: '0.45rem', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Log Monthly Health Check
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
      {view360Party && party360Data && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.6rem', background: 'rgba(16,185,129,0.25)', color: '#34d399', borderRadius: '4px' }}>
                    {view360Party.distributor_code || view360Party.dealer_code || view360Party.sub_dealer_code || view360Party.party_universal_code}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.2rem 0.6rem', background: 'rgba(59,130,246,0.25)', color: '#60a5fa', borderRadius: '4px' }}>
                    {view360Party.party_type}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.4rem 0 0 0' }}>{view360Party.firm_name}</h2>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Contact: <strong>{view360Party.contact_person_name_1 || view360Party.owner_name}</strong> • Phone: <strong>{view360Party.contact_mobile_1_1 || view360Party.primary_mobile}</strong></div>
              </div>
              <button onClick={() => setView360Party(null)} style={{ padding: '0.5rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>

            {/* Complete Channel Breadcrumb */}
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Channel Hierarchy Chain (Who Under Whom)</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#38bdf8' }}>👑 {view360Party.parent_distributor ? view360Party.parent_distributor.firm_name : (view360Party.party_type === 'Distributor' ? view360Party.firm_name : 'No Tagged Distributor')}</span>
                {view360Party.party_type !== 'Distributor' && (
                  <>
                    <ArrowRight size={14} className="text-gray-400" />
                    <span style={{ color: '#34d399' }}>🏪 {view360Party.party_type === 'Dealer' ? view360Party.firm_name : (view360Party.parent_dealer?.firm_name || 'Dealer')}</span>
                  </>
                )}
                {view360Party.party_type === 'Sub-Dealer' && (
                  <>
                    <ArrowRight size={14} className="text-gray-400" />
                    <span style={{ color: '#fbbf24' }}>🛒 {view360Party.firm_name}</span>
                  </>
                )}
              </div>
            </div>

            {/* Relationship History Audit Log */}
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.5rem' }}>📜 Parent Relationship History (Never Overwritten)</div>
              {party360Data.relationship_history.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Original parent relationship active since onboarding. No transfers recorded.</div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: '#94a3b8' }}>
                      <th>Parent Type</th>
                      <th>Effective From</th>
                      <th>Effective To</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {party360Data.relationship_history.map((h, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '0.4rem 0' }}>{h.parent_type}</td>
                        <td>{h.effective_from}</td>
                        <td>{h.effective_to || 'Current'}</td>
                        <td>
                          <span style={{ color: h.status === 'ACTIVE' ? '#34d399' : '#94a3b8', fontWeight: 700 }}>
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Commercial Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.88rem' }}>
              <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: '0.4rem' }}>Commercial Terms</div>
                <div>Sanctioned Limit: <strong>₹{view360Party.party_commercial_terms?.[0]?.credit_limit?.toLocaleString('en-IN') || '5,00,000'}</strong></div>
                <div>Credit Days: <strong>{view360Party.party_commercial_terms?.[0]?.credit_days || 30} Days</strong></div>
                <div>Billing Route: <strong style={{ color: '#34d399' }}>{view360Party.billing_route_type}</strong></div>
              </div>

              <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px' }}>
                <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: '0.4rem' }}>Authorized Range & Team</div>
                <div>Products: <strong>{party360Data.product_authorizations?.length || 'Standard Range'} Authorized</strong></div>
                <div>Territory: <strong>{view360Party.state_name || 'Punjab'} ({view360Party.district_name || 'District'})</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: LOG DAILY SALES ORDER */}
      {/* ========================================================= */}
      {showOrderModal && selectedPartyForOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '520px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
              Punch Sales Order: {selectedPartyForOrder.firm_name}
            </h3>
            <div style={{ fontSize: '0.85rem', color: '#38bdf8', marginBottom: '1rem' }}>
              Billing Route: <strong>{selectedPartyForOrder.billing_route_type}</strong>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await saveOrderFollowup({
                party_id: selectedPartyForOrder.id,
                is_order_placed: true,
                generated_order_no: `SO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
                billing_route: selectedPartyForOrder.billing_route_type,
                notes: `${orderForm.qty}x ${orderForm.product}. Notes: ${orderForm.notes}`
              });
              alert('🎉 Order punched successfully and routed as per billing configuration!');
              setShowOrderModal(false);
              loadOperationsData('order_followup');
            }}>
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Select Product Machinery</label>
                <select value={orderForm.product} onChange={e => setOrderForm({ ...orderForm, product: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  {PRODUCT_GROUPS.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Quantity (Units / Boxes)</label>
                <input type="number" min="1" required value={orderForm.qty} onChange={e => setOrderForm({ ...orderForm, qty: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Dispatch Notes</label>
                <input type="text" placeholder="e.g. Transport via Ludhiana Cargo" value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setShowOrderModal(false)} style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.25rem', background: '#10b981', border: 'none', color: '#fff', fontWeight: 700, borderRadius: '8px' }}>Submit Order</button>
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
              alert('Feedback saved! If rating <= 2, complaint ticket was automatically opened.');
              setShowFeedbackModal(false);
              loadOperationsData('order_feedback');
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
                <button type="button" onClick={() => setShowFeedbackModal(false)} style={{ padding: '0.6rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '8px' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.6rem 1.25rem', background: '#2563eb', border: 'none', color: '#fff', fontWeight: 700, borderRadius: '8px' }}>Save Feedback</button>
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
