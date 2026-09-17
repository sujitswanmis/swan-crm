'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, Users, Plus, Eye, RefreshCw, X, MapPin, Phone, Mail,
  CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, ArrowRightLeft,
  DollarSign, Calendar, ChevronRight, Search, Filter, Clock, Star,
  MessageSquare, Truck, Package, Shield, ExternalLink, ThumbsUp,
  AlertCircle, FileText, Check, Lock, ChevronDown, CheckSquare, Sparkles
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

// Pre-defined Indian States for smooth fallback
const INDIAN_STATES = [
  'Punjab', 'Haryana', 'Uttar Pradesh', 'Rajasthan', 'Madhya Pradesh',
  'Maharashtra', 'Gujarat', 'Bihar', 'West Bengal', 'Uttarakhand',
  'Himachal Pradesh', 'Chhattisgarh', 'Jharkhand', 'Odisha', 'Andhra Pradesh',
  'Telangana', 'Karnataka', 'Tamil Nadu'
];

const PRODUCT_GROUPS = [
  { id: 'ROTAVATOR', name: 'Rotavator (Champion & Regular Series)' },
  { id: 'LASER_LEVELLER', name: 'Swan Laser Land Leveller & Transmitter' },
  { id: 'MULCHER', name: 'Straw Mulcher & Shrub Master' },
  { id: 'SUPER_SEEDER', name: 'Super Seeder & Happy Seeder' },
  { id: 'CULTIVATOR_TILLER', name: 'Spring Loaded Cultivator & Tiller' },
  { id: 'DISC_HARROW', name: 'Heavy Duty Disc Harrow' },
  { id: 'SPARE_PARTS', name: 'Genuine Swan Blades, Gearbox & Spares' }
];

export default function PartyMasterModule() {
  const [activeTab, setActiveTab] = useState('r03'); // 'r03' | 'order_followup' | 'order_feedback' | 'monthly_feedback' | 'complaints'
  const [parties, setParties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters & Search for R03 Report
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'Distributor' | 'Dealer' | 'Sub-Dealer'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Active' | 'Draft'
  const [billingFilter, setBillingFilter] = useState('ALL'); // 'ALL' | 'DIRECT_COMPANY_BILLING' | 'DISTRIBUTOR_BILLED'

  // Wizard States (S00 to S07)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState('S00'); // 'S00' | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S05_1' | 'S06' | 'S07'
  const [activePartyId, setActivePartyId] = useState(null);
  const [wizardParty, setWizardParty] = useState(null);

  // S00 Form State
  const [s00Form, setS00Form] = useState({
    party_type: 'Dealer',
    firm_name: '',
    legal_name: '',
    owner_name: '',
    contact_person: '',
    primary_mobile: '',
    whatsapp_no: '',
    official_email: '',
    gstin: '',
    pan: '',
    address: '',
    state_name: 'Punjab',
    district_name: '',
    city_village: '',
    pincode: '',
    order_category: 'Rotavator',
    constitution_type: 'PROPRIETORSHIP'
  });

  // Step Data States
  const [s01DistForm, setS01DistForm] = useState({ zone: 'North Zone', territory: 'Punjab Central', monthly_business_potential: 2500000, annual_business_potential: 30000000 });
  const [s02DealerForm, setS02DealerForm] = useState({ parent_distributor_id: '', territory: '', monthly_business_potential: 500000, annual_business_potential: 6000000 });
  const [s03SubDealerForm, setS03SubDealerForm] = useState({ parent_dealer_id: '', territory: '', monthly_business_potential: 200000 });
  const [s04CommForm, setS04CommForm] = useState({ credit_limit: 500000, credit_days: 30, security_deposit_amount: 100000, security_mode: 'Cheque', receipt_no: '', billing_route_type: 'DIRECT_COMPANY_BILLING', distributor_commission_percent: 2.5 });
  const [s05SelectedProducts, setS05SelectedProducts] = useState(['ROTAVATOR', 'SPARE_PARTS']);
  const [s051TerritoryForm, setS051TerritoryForm] = useState({ zone: 'North Zone', state: 'Punjab', district: '', tehsil_area: '', market_coverage_area: '', territory_type: 'Exclusive' });
  const [s06TeamAssignments, setS06TeamAssignments] = useState([
    { role_in_party: 'Sales Coordinator', employee_id: '', employee_name: '' },
    { role_in_party: 'Telecaller', employee_id: '', employee_name: '' },
    { role_in_party: 'Sales Executive', employee_id: '', employee_name: '' }
  ]);
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

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [partyRes, empRes] = await Promise.all([
        getPartyList(),
        getEmployeesMaster()
      ]);
      setParties(partyRes || []);
      setEmployees(empRes || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
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

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (newTab !== 'r03') {
      loadOperationsData(newTab);
    }
  };

  // Filtered Distributors & Dealers for Dropdowns
  const activeDistributors = useMemo(() => {
    return parties.filter(p => p.party_type === 'Distributor');
  }, [parties]);

  const activeDealers = useMemo(() => {
    return parties.filter(p => p.party_type === 'Dealer');
  }, [parties]);

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
        (p.owner_name && p.owner_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      const matchesType = typeFilter === 'ALL' || p.party_type === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'Active' ? p.final_status === 'Active' : p.final_status !== 'Active');
      const matchesBilling = billingFilter === 'ALL' || p.billing_route_type === billingFilter;

      return matchesSearch && matchesType && matchesStatus && matchesBilling;
    });
  }, [parties, searchTerm, typeFilter, statusFilter, billingFilter]);

  // Wizard Launch Handler
  const startNewPartyWizard = () => {
    setActivePartyId(null);
    setWizardParty(null);
    setWizardStep('S00');
    setS00Form({
      party_type: 'Dealer',
      firm_name: '',
      legal_name: '',
      owner_name: '',
      contact_person: '',
      primary_mobile: '',
      whatsapp_no: '',
      official_email: '',
      gstin: '',
      pan: '',
      address: '',
      state_name: 'Punjab',
      district_name: '',
      city_village: '',
      pincode: '',
      order_category: 'Rotavator',
      constitution_type: 'PROPRIETORSHIP'
    });
    setShowWizard(true);
  };

  const resumeWizard = (party) => {
    setActivePartyId(party.id);
    setWizardParty(party);
    setWizardStep(party.next_step?.split('_')[0] || 'S00');
    setShowWizard(true);
  };

  // Wizard Save Handlers
  const handleS00Submit = async (e) => {
    e.preventDefault();
    try {
      const created = await createPartyMaster(s00Form);
      setActivePartyId(created.id);
      setWizardParty(created);
      await loadInitialData();

      // Conditional Next Routing
      if (s00Form.party_type === 'Distributor') {
        setWizardStep('S01');
      } else if (s00Form.party_type === 'Dealer') {
        setWizardStep('S02');
      } else {
        setWizardStep('S03');
      }
    } catch (err) {
      alert('Error creating Party: ' + err.message);
    }
  };

  const handleS01DistSubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePartyStep(activePartyId, 'S01_Distributor_Registration', {
        ...s01DistForm,
        workflow_status: 'S01_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setWizardStep('S04');
    } catch (err) {
      alert('Error in S01: ' + err.message);
    }
  };

  const handleS02DealerSubmit = async (e) => {
    e.preventDefault();
    if (!s02DealerForm.parent_distributor_id) {
      alert('CRITICAL RULE: Dealer must belong to an Active Parent Distributor!');
      return;
    }
    try {
      await updatePartyStep(activePartyId, 'S02_Dealer_Registration', {
        ...s02DealerForm,
        workflow_status: 'S02_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setWizardStep('S04');
    } catch (err) {
      alert('Error in S02: ' + err.message);
    }
  };

  const handleS03SubDealerSubmit = async (e) => {
    e.preventDefault();
    if (!s03SubDealerForm.parent_dealer_id) {
      alert('CRITICAL RULE: Sub-Dealer must belong to an Active Parent Dealer!');
      return;
    }
    const selectedDealer = parties.find(p => p.id === s03SubDealerForm.parent_dealer_id);
    const derivedDistId = selectedDealer?.parent_distributor_id;

    try {
      await updatePartyStep(activePartyId, 'S03_Sub_Dealer_Registration', {
        parent_dealer_id: s03SubDealerForm.parent_dealer_id,
        parent_distributor_id: derivedDistId,
        territory: s03SubDealerForm.territory,
        monthly_business_potential: s03SubDealerForm.monthly_business_potential,
        workflow_status: 'S03_Completed',
        next_step: 'S04_Commercial'
      });
      await loadInitialData();
      setWizardStep('S04');
    } catch (err) {
      alert('Error in S03: ' + err.message);
    }
  };

  const handleS04CommercialSubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePartyStep(activePartyId, 'S04_Commercial', {
        ...s04CommForm,
        commercial_status: 'Completed',
        workflow_status: 'S04_Completed',
        next_step: 'S05_Product_Authorization'
      });
      await loadInitialData();
      setWizardStep('S05');
    } catch (err) {
      alert('Error in S04: ' + err.message);
    }
  };

  const handleS05ProductsSubmit = async (e) => {
    e.preventDefault();
    if (s05SelectedProducts.length === 0) {
      alert('At least one Product must be authorized for this party!');
      return;
    }
    try {
      const items = s05SelectedProducts.map(p => ({ product_name: p, opening_stock_required: 1 }));
      await saveProductAuthorizations(activePartyId, items);
      await updatePartyStep(activePartyId, 'S05_Product_Authorization', {
        workflow_status: 'S05_Completed',
        next_step: 'S05_1_Territory'
      });
      await loadInitialData();
      setWizardStep('S05_1');
    } catch (err) {
      alert('Error in S05: ' + err.message);
    }
  };

  const handleS051TerritorySubmit = async (e) => {
    e.preventDefault();
    try {
      await saveTerritoryAllocation(activePartyId, s051TerritoryForm);
      await updatePartyStep(activePartyId, 'S05_1_Territory', {
        state_name: s051TerritoryForm.state,
        district_name: s051TerritoryForm.district,
        workflow_status: 'S05_1_Completed',
        next_step: 'S06_Team_Assignment'
      });
      await loadInitialData();
      setWizardStep('S06');
    } catch (err) {
      alert('Error in S05.1: ' + err.message);
    }
  };

  const handleS06TeamSubmit = async (e) => {
    e.preventDefault();
    try {
      await saveTeamAssignments(activePartyId, s06TeamAssignments);
      await updatePartyStep(activePartyId, 'S06_Team_Assignment', {
        workflow_status: 'S06_Completed',
        next_step: 'S07_Activation'
      });
      await loadInitialData();
      setWizardStep('S07');
    } catch (err) {
      alert('Error in S06: ' + err.message);
    }
  };

  const handleS07Activation = async () => {
    setActivationErrors([]);
    try {
      const res = await activatePartner(activePartyId);
      if (!res.success) {
        setActivationErrors(res.errors || []);
      } else {
        alert('🎉 Channel Partner Activated Successfully! Permanent Code locked and Welcome Card triggered.');
        setShowWizard(false);
        await loadInitialData();
      }
    } catch (err) {
      alert('Activation Error: ' + err.message);
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

  return (
    <div style={{ padding: '1.5rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Building2 className="text-emerald-500" size={30} />
            Client Management & Channel Partner Portal
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.3rem 0 0 0' }}>
            Strict 3-Tier Hierarchy (Distributor ➔ Dealer ➔ Sub-Dealer), Direct vs Distributor Billing & 4 Operational Follow-up Engines
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
            <Plus size={18} /> + Onboard New Channel Partner (S00 Wizard)
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Channel Partners</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{parties.length}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 700 }}>👑 Level 1: Distributors (DIS-)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>
            {parties.filter(p => p.party_type === 'Distributor').length}
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: 700 }}>🏪 Level 2: Dealers (DLR-)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
            {parties.filter(p => p.party_type === 'Dealer').length}
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>🛒 Level 3: Sub-Dealers (SDL-)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.2rem' }}>
            {parties.filter(p => p.party_type === 'Sub-Dealer').length}
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>⚡ Active & Billed Directly</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', marginTop: '0.2rem' }}>
            {parties.filter(p => p.billing_route_type === 'DIRECT_COMPANY_BILLING').length}
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginBottom: '1.25rem', overflowX: 'auto' }}>
        {[
          { id: 'r03', label: '📊 R03: Party Directory & Hierarchy Report', icon: FileText },
          { id: 'order_followup', label: '📞 Engine 1: Daily Order Followups', icon: Phone },
          { id: 'order_feedback', label: '⭐ Engine 2: Post-Order Feedback', icon: Star },
          { id: 'monthly_feedback', label: '📅 Engine 3: Monthly Health Checks', icon: Calendar },
          { id: 'complaints', label: '🚨 Engine 4: Complaint Management', icon: AlertTriangle }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '0.65rem 1.1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: isActive ? '#2563eb' : 'var(--bg-surface)',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: isActive ? '0 3px 10px rgba(37,99,235,0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: R03 PARTY MANAGEMENT REPORT & HIERARCHY TABLE */}
      {/* ========================================================= */}
      {activeTab === 'r03' && (
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
                  <th style={{ padding: '0.85rem 1rem' }}>Firm & Contact</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Strict Channel Hierarchy (Breadcrumb)</th>
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
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            marginTop: '0.2rem',
                            background: isDist ? 'rgba(56,189,248,0.2)' : isDealer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                            color: isDist ? '#38bdf8' : isDealer ? '#34d399' : '#fbbf24'
                          }}>
                            {isDist ? '👑 Level 1: Distributor' : isDealer ? '🏪 Level 2: Dealer' : '🛒 Level 3: Sub-Dealer'}
                          </span>
                        </td>

                        {/* Firm & Contact */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{p.firm_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {p.owner_name || p.contact_person || 'Principal'} • {p.primary_mobile}
                          </div>
                        </td>

                        {/* Strict Channel Hierarchy Breadcrumb */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isDist && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontWeight: 700 }}>
                              👑 {p.firm_name}
                            </div>
                          )}

                          {isDealer && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#94a3b8' }}>
                                👑 {p.parent_distributor ? p.parent_distributor.firm_name : <span style={{ color: '#ef4444' }}>Missing Parent DIS!</span>}
                              </span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span style={{ color: '#34d399', fontWeight: 700 }}>🏪 {p.firm_name}</span>
                            </div>
                          )}

                          {isSubDealer && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ color: '#94a3b8' }}>
                                👑 {p.parent_distributor ? p.parent_distributor.firm_name : 'Parent DIS'}
                              </span>
                              <ArrowRight size={12} className="text-gray-400" />
                              <span style={{ color: '#94a3b8' }}>
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{party.owner_name} • {party.primary_mobile}</div>
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
      {/* S00 TO S07 ONBOARDING WIZARD MODAL (MATCHING USER'S IMAGE) */}
      {/* ========================================================= */}
      {showWizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '980px', maxHeight: '92vh', overflowY: 'auto', color: '#ffffff', boxShadow: '0 25px 60px rgba(0,0,0,0.8)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', letterSpacing: '0.05em' }}>SWAN CLIENT MANAGEMENT ONBOARDING PIPELINE</span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.2rem 0 0 0', color: '#ffffff' }}>
                  {activePartyId ? `Editing: ${wizardParty?.firm_name || 'Channel Partner'}` : 'Onboard New Channel Partner'}
                </h2>
              </div>
              <button onClick={() => setShowWizard(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {/* Visual Step Cards Header (Exact match of User's Uploaded Image) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {[
                { id: 'S00', label: 'S00 Party Master Creation' },
                { id: 'S01', label: 'S01 Distributor Registration' },
                { id: 'S02', label: 'S02 Dealer Registration' },
                { id: 'S03', label: 'S03 Sub-Dealer Registration' },
                { id: 'S04', label: 'S04 Commercial Security Details' },
                { id: 'S05', label: 'S05 Product Authorization' },
                { id: 'S05_1', label: 'S05.1 Territory Allocation' },
                { id: 'S06', label: 'S06 Sales Team Assignment' },
                { id: 'S07', label: 'S07 Partner Activation' }
              ].map(step => {
                const isCurrent = wizardStep === step.id;
                return (
                  <div
                    key={step.id}
                    onClick={() => {
                      if (activePartyId) setWizardStep(step.id);
                    }}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderRadius: '8px',
                      background: isCurrent ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.04)',
                      border: isCurrent ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                      cursor: activePartyId ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: isCurrent ? '#60a5fa' : '#94a3b8' }}>{step.id}</span>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isCurrent ? '#ffffff' : '#cbd5e1', lineHeight: '1.2' }}>{step.label.replace(step.id + ' ', '')}</div>
                  </div>
                );
              })}
            </div>

            {/* STEP S00: PARTY MASTER CREATION */}
            {wizardStep === 'S00' && (
              <form onSubmit={handleS00Submit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '1rem' }}>S00: Channel Partner Main Identity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Party Tier *</label>
                    <select
                      value={s00Form.party_type}
                      onChange={e => setS00Form({ ...s00Form, party_type: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    >
                      <option value="Distributor">Level 1: Distributor (Super Stockist)</option>
                      <option value="Dealer">Level 2: Dealer (Authorized Showroom)</option>
                      <option value="Sub-Dealer">Level 3: Sub-Dealer (Retail Counter)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Firm / Trade Name *</label>
                    <input
                      type="text"
                      required
                      value={s00Form.firm_name}
                      onChange={e => setS00Form({ ...s00Form, firm_name: e.target.value })}
                      placeholder="e.g. Kisan Agro Machinery"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Owner / Principal Name *</label>
                    <input
                      type="text"
                      required
                      value={s00Form.owner_name}
                      onChange={e => setS00Form({ ...s00Form, owner_name: e.target.value })}
                      placeholder="e.g. Sardar Gurdeep Singh"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Primary Mobile (Calling & WhatsApp) *</label>
                    <input
                      type="text"
                      required
                      value={s00Form.primary_mobile}
                      onChange={e => setS00Form({ ...s00Form, primary_mobile: e.target.value })}
                      placeholder="10-digit mobile number"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>State *</label>
                    <select
                      value={s00Form.state_name}
                      onChange={e => setS00Form({ ...s00Form, state_name: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    >
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>District Name</label>
                    <input
                      type="text"
                      value={s00Form.district_name}
                      onChange={e => setS00Form({ ...s00Form, district_name: e.target.value })}
                      placeholder="e.g. Ludhiana"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>GSTIN Number</label>
                    <input
                      type="text"
                      value={s00Form.gstin}
                      onChange={e => setS00Form({ ...s00Form, gstin: e.target.value })}
                      placeholder="15-digit GSTIN"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>PAN Number</label>
                    <input
                      type="text"
                      value={s00Form.pan}
                      onChange={e => setS00Form({ ...s00Form, pan: e.target.value })}
                      placeholder="10-digit PAN"
                      style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Save & Proceed to Next Step <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}

            {/* STEP S01: DISTRIBUTOR REGISTRATION */}
            {wizardStep === 'S01' && (
              <form onSubmit={handleS01DistSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>S01: Distributor Registration (Level 1 Hub)</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Distributors are the highest level partners. No parent party is required.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Zone</label>
                    <input type="text" value={s01DistForm.zone} onChange={e => setS01DistForm({ ...s01DistForm, zone: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Territory Coverage</label>
                    <input type="text" value={s01DistForm.territory} onChange={e => setS01DistForm({ ...s01DistForm, territory: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Monthly Business Potential (₹)</label>
                    <input type="number" value={s01DistForm.monthly_business_potential} onChange={e => setS01DistForm({ ...s01DistForm, monthly_business_potential: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Annual Business Potential (₹)</label>
                    <input type="number" value={s01DistForm.annual_business_potential} onChange={e => setS01DistForm({ ...s01DistForm, annual_business_potential: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S04 Commercial ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S02: DEALER REGISTRATION (PARENT DISTRIBUTOR MANDATORY) */}
            {wizardStep === 'S02' && (
              <form onSubmit={handleS02DealerSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#34d399', marginBottom: '0.5rem' }}>S02: Dealer Registration (Level 2)</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  CRITICAL RULE: Dealer must belong to an Active Parent Distributor. Relationship history is preserved.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#34d399', fontWeight: 700 }}>Parent Distributor * (Mandatory)</label>
                    <select
                      required
                      value={s02DealerForm.parent_distributor_id}
                      onChange={e => setS02DealerForm({ ...s02DealerForm, parent_distributor_id: e.target.value })}
                      style={{ width: '100%', padding: '0.7rem', background: '#1e293b', border: '1.5px solid #10b981', borderRadius: '8px', color: '#fff', fontWeight: 600 }}
                    >
                      <option value="">-- Select Active Parent Distributor --</option>
                      {activeDistributors.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.distributor_code || d.party_universal_code} | {d.firm_name} ({d.state_name || 'Punjab'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Territory / Mandi</label>
                    <input type="text" value={s02DealerForm.territory} onChange={e => setS02DealerForm({ ...s02DealerForm, territory: e.target.value })} placeholder="e.g. Khanna Mandi" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Monthly Business Potential (₹)</label>
                    <input type="number" value={s02DealerForm.monthly_business_potential} onChange={e => setS02DealerForm({ ...s02DealerForm, monthly_business_potential: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S04 Commercial ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S03: SUB-DEALER REGISTRATION (AUTO-DERIVED DISTRIBUTOR) */}
            {wizardStep === 'S03' && (
              <form onSubmit={handleS03SubDealerSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.5rem' }}>S03: Sub-Dealer Registration (Level 3)</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  CRITICAL RULE: Sub-Dealer must belong to a Dealer. Parent Distributor is <strong>automatically derived</strong> and locked (Read-only).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#fbbf24', fontWeight: 700 }}>Parent Dealer * (Mandatory)</label>
                    <select
                      required
                      value={s03SubDealerForm.parent_dealer_id}
                      onChange={e => setS03SubDealerForm({ ...s03SubDealerForm, parent_dealer_id: e.target.value })}
                      style={{ width: '100%', padding: '0.7rem', background: '#1e293b', border: '1.5px solid #f59e0b', borderRadius: '8px', color: '#fff', fontWeight: 600 }}
                    >
                      <option value="">-- Select Active Parent Dealer --</option>
                      {activeDealers.map(dlr => (
                        <option key={dlr.id} value={dlr.id}>
                          {dlr.dealer_code || dlr.party_universal_code} | {dlr.firm_name} ({dlr.state_name || 'Punjab'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* AUTO-DERIVED READ-ONLY DISTRIBUTOR CARD */}
                  <div style={{ gridColumn: 'span 2', background: 'rgba(16,185,129,0.12)', border: '1px solid #10b981', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399', fontWeight: 700, fontSize: '0.88rem' }}>
                      <Lock size={15} /> Auto-Derived Parent Distributor (System Enforced / Read-Only)
                    </div>
                    {s03SubDealerForm.parent_dealer_id ? (
                      (() => {
                        const selDlr = parties.find(p => p.id === s03SubDealerForm.parent_dealer_id);
                        const distName = selDlr?.parent_distributor?.firm_name || (selDlr?.parent_distributor_id ? 'Tagged Distributor' : 'Direct Company');
                        return (
                          <div style={{ marginTop: '0.4rem', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                            👑 {distName} <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>(Derived from {selDlr?.firm_name})</span>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                        Please select a Parent Dealer above to auto-identify Distributor.
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Tehsil / Village</label>
                    <input type="text" value={s03SubDealerForm.territory} onChange={e => setS03SubDealerForm({ ...s03SubDealerForm, territory: e.target.value })} placeholder="e.g. Samrala" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Monthly Potential (₹)</label>
                    <input type="number" value={s03SubDealerForm.monthly_business_potential} onChange={e => setS03SubDealerForm({ ...s03SubDealerForm, monthly_business_potential: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#f59e0b', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S04 Commercial ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S04: COMMERCIAL & SECURITY DETAILS (BILLING ROUTING INCLUDED) */}
            {wizardStep === 'S04' && (
              <form onSubmit={handleS04CommercialSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fbbf24', marginBottom: '1rem' }}>S04: Commercial Terms, Credit & Billing Route</h3>
                
                {/* Direct vs Distributor Billing Route Selector */}
                <div style={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#60a5fa', fontWeight: 700, fontSize: '0.92rem' }}>
                    ⚡ Billing Route Selection (Company vs Distributor Billing)
                  </label>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="billing_route"
                        value="DIRECT_COMPANY_BILLING"
                        checked={s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING'}
                        onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DIRECT_COMPANY_BILLING' })}
                      />
                      <span style={{ fontWeight: 600 }}>Direct Company Billing (Swan Agro Ltd.)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="billing_route"
                        value="DISTRIBUTOR_BILLED"
                        checked={s04CommForm.billing_route_type === 'DISTRIBUTOR_BILLED'}
                        onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DISTRIBUTOR_BILLED' })}
                      />
                      <span style={{ fontWeight: 600 }}>Distributor Billed (via Tagged Distributor Godown)</span>
                    </label>
                  </div>

                  {s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING' && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#34d399' }}>
                      ℹ️ Direct Billing selected: Tagged Distributor will automatically receive a <strong>{s04CommForm.distributor_commission_percent}%</strong> Territory Override Commission.
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Sanctioned Credit Limit (₹) *</label>
                    <input type="number" required value={s04CommForm.credit_limit} onChange={e => setS04CommForm({ ...s04CommForm, credit_limit: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Credit Days (e.g. 30/45 Days) *</label>
                    <input type="number" required value={s04CommForm.credit_days} onChange={e => setS04CommForm({ ...s04CommForm, credit_days: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Security Deposit (₹)</label>
                    <input type="number" value={s04CommForm.security_deposit_amount} onChange={e => setS04CommForm({ ...s04CommForm, security_deposit_amount: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Security Mode</label>
                    <select value={s04CommForm.security_mode} onChange={e => setS04CommForm({ ...s04CommForm, security_mode: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                      <option value="Cheque">Security Cheques</option>
                      <option value="Bank Guarantee">Bank Guarantee</option>
                      <option value="Fixed Deposit">Fixed Deposit Lien</option>
                      <option value="Cash">Cash Deposit</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Cheque / Receipt No.</label>
                    <input type="text" value={s04CommForm.receipt_no} onChange={e => setS04CommForm({ ...s04CommForm, receipt_no: e.target.value })} placeholder="e.g. CHQ-402911" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S05 Product Authorization ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S05: PRODUCT AUTHORIZATION */}
            {wizardStep === 'S05' && (
              <form onSubmit={handleS05ProductsSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>S05: Product Authorization (Select Permitted Categories)</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  At least one Product must be authorized for partner activation.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  {PRODUCT_GROUPS.map(p => {
                    const isChecked = s05SelectedProducts.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (isChecked) {
                            setS05SelectedProducts(s05SelectedProducts.filter(x => x !== p.id));
                          } else {
                            setS05SelectedProducts([...s05SelectedProducts, p.id]);
                          }
                        }}
                        style={{
                          padding: '0.85rem',
                          borderRadius: '8px',
                          border: isChecked ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                          background: isChecked ? 'rgba(16,185,129,0.12)' : '#1e293b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem'
                        }}
                      >
                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '1.5px solid', borderColor: isChecked ? '#10b981' : '#94a3b8', background: isChecked ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isChecked && <Check size={12} color="#fff" />}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{p.name}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S05.1 Territory ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S05.1: TERRITORY ALLOCATION */}
            {wizardStep === 'S05_1' && (
              <form onSubmit={handleS051TerritorySubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>S05.1: Geographic Territory Allocation</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>State *</label>
                    <select value={s051TerritoryForm.state} onChange={e => setS051TerritoryForm({ ...s051TerritoryForm, state: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>District *</label>
                    <input type="text" required value={s051TerritoryForm.district} onChange={e => setS051TerritoryForm({ ...s051TerritoryForm, district: e.target.value })} placeholder="e.g. Ludhiana" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Tehsil / Area</label>
                    <input type="text" value={s051TerritoryForm.tehsil_area} onChange={e => setS051TerritoryForm({ ...s051TerritoryForm, tehsil_area: e.target.value })} placeholder="e.g. Khanna" style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Territory Type</label>
                    <select value={s051TerritoryForm.territory_type} onChange={e => setS051TerritoryForm({ ...s051TerritoryForm, territory_type: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                      <option value="Exclusive">Exclusive Territory (No other dealer in this tehsil)</option>
                      <option value="Shared">Shared Territory</option>
                      <option value="Open">Open Territory</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S06 Team Assignment ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S06: CLIENT TEAM ASSIGNMENT */}
            {wizardStep === 'S06' && (
              <form onSubmit={handleS06TeamSubmit}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>S06: Client Team Assignment (Staff Mapping)</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Assign dedicated personnel for Order Taking, Sales Coordination, and Territory Management.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                  {s06TeamAssignments.map((assign, idx) => (
                    <div key={idx} style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <label style={{ display: 'block', marginBottom: '0.4rem', color: '#60a5fa', fontWeight: 700 }}>
                        {assign.role_in_party}
                      </label>
                      <select
                        value={assign.employee_id}
                        onChange={e => {
                          const emp = employees.find(emp => emp.id === e.target.value);
                          const updated = [...s06TeamAssignments];
                          updated[idx] = { ...updated[idx], employee_id: e.target.value, employee_name: emp?.emp_name || 'Employee' };
                          setS06TeamAssignments(updated);
                        }}
                        style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="">-- Select Employee --</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.emp_name} ({emp.emp_code || 'EMP'})</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="submit" style={{ padding: '0.65rem 1.4rem', background: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Save & Go to S07 Partner Activation ➔
                  </button>
                </div>
              </form>
            )}

            {/* STEP S07: PARTNER ACTIVATION (PRE-FLIGHT VALIDATION) */}
            {wizardStep === 'S07' && (
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginBottom: '0.5rem' }}>S07: Pre-Flight Verification & Partner Activation</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  All hierarchy rules, commercial terms, product authorizations, and team assignments are verified before setting the partner to <strong>ACTIVE</strong>.
                </p>

                {activationErrors.length > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>❌ Cannot Activate Partner. Please complete the following:</div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                      {activationErrors.map((err, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{err}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#ffffff', fontSize: '1rem' }}>Pre-Flight Verification Checklist</h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                      <CheckCircle2 size={16} /> S00 Party Master Identity Created
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                      <CheckCircle2 size={16} /> S04 Commercial & Credit Sanctioned
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                      <CheckCircle2 size={16} /> S05 Product Authorization Mapped
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                      <CheckCircle2 size={16} /> S05.1 Territory & Mandi Allocated
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                      <CheckCircle2 size={16} /> S06 Primary Coordinator Assigned
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                      <ShieldCheck size={16} /> Strict Hierarchy Chain Validated
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    onClick={handleS07Activation}
                    style={{
                      padding: '0.75rem 1.75rem',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(16,185,129,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <CheckCircle2 size={18} /> Approve & Activate Channel Partner
                  </button>
                </div>
              </div>
            )}

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
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Owner: <strong>{view360Party.owner_name}</strong> • Mobile: <strong>{view360Party.primary_mobile}</strong></div>
              </div>
              <button onClick={() => setView360Party(null)} style={{ padding: '0.5rem 1.2rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>

            {/* Complete Channel Breadcrumb */}
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Channel Hierarchy Chain</div>
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
                  <option value="Rotavator 7ft Champion">Rotavator 7ft Champion Series</option>
                  <option value="Rotavator 6ft Semi-Champion">Rotavator 6ft Semi-Champion</option>
                  <option value="Swan Laser Land Leveller">Swan Laser Land Leveller Kit</option>
                  <option value="Straw Mulcher 7ft">Straw Mulcher 7ft</option>
                  <option value="Super Seeder 8ft">Super Seeder 8ft</option>
                  <option value="Rotavator Blades Box (50 pcs)">Rotavator Blades Box (50 pcs)</option>
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
              alert('Complaint ticket generated successfully with SLA countdown timer!');
              setShowComplaintModal(false);
              loadOperationsData('complaints');
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

    </div>
  );
}
