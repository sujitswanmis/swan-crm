'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import MobileTableView from '@/components/common/MobileTableView';
import {
  Phone, MessageSquare, Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle,
  Star, RefreshCw, X, Building2, Users, Check, Truck, Package, Shield, ArrowRight,
  ChevronRight, Calendar, AlertCircle, Headphones, CheckSquare, Sparkles, MapPin
} from 'lucide-react';
import {
  getPartyList,
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
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import { ALL_INDIAN_STATES } from '@/config/indianStateDistricts';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';

const OPERATIONS_TABS = [
  { id: 'order_followup', label: 'Daily Order Followups', icon: '📞' },
  { id: 'order_feedback', label: 'Post-Order Feedback', icon: '⭐' },
  { id: 'monthly_feedback', label: 'Monthly Health Checks', icon: '📅' },
  { id: 'complaints', label: 'Complaint Management', icon: '⚠️' }
];

export default function ChannelOperationsModule({
  initialSubTab = 'order_followup',
  activeSubTab,
  onSubTabChange,
  userRole,
  moduleAccess,
  userCompany,
  tenantId
}) {
  const effectiveTenantId = tenantId || null;

  // Tab State
  const [activeTab, setActiveTab] = useState(() => {
    const raw = (activeSubTab || initialSubTab || 'order_followup').toLowerCase();
    return OPERATIONS_TABS.some(t => t.id === raw) ? raw : 'order_followup';
  });

  useEffect(() => {
    if (activeSubTab && OPERATIONS_TABS.some(t => t.id === activeSubTab.toLowerCase())) {
      setActiveTab(activeSubTab.toLowerCase());
    }
  }, [activeSubTab]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    }
  };

  // Data State
  const [parties, setParties] = useState([]);
  const [orderFollowups, setOrderFollowups] = useState([]);
  const [orderFeedbacks, setOrderFeedbacks] = useState([]);
  const [monthlyFeedbacks, setMonthlyFeedbacks] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderCallStatusFilter, setOrderCallStatusFilter] = useState('ALL');
  const [orderTierFilter, setOrderTierFilter] = useState('ALL');
  const [orderStateFilter, setOrderStateFilter] = useState('ALL');

  const [feedbackSearchTerm, setFeedbackSearchTerm] = useState('');
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState('ALL');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('ALL');

  const [monthlySearchTerm, setMonthlySearchTerm] = useState('');
  const [monthlyRiskFilter, setMonthlyRiskFilter] = useState('ALL');
  const [monthlyStateFilter, setMonthlyStateFilter] = useState('ALL');

  const [complaintSearchTerm, setComplaintSearchTerm] = useState('');
  const [complaintStatusFilter, setComplaintStatusFilter] = useState('ALL');
  const [complaintDeptFilter, setComplaintDeptFilter] = useState('ALL');

  // Modals & Action Forms
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedPartyForOrder, setSelectedPartyForOrder] = useState(null);
  const [orderForm, setOrderForm] = useState({
    call_status: 'ORDER_PLACED',
    product: PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)',
    qty: 1,
    dispatch_date: '',
    transport_details: '',
    next_followup_date: '',
    no_order_reason: '',
    notes: ''
  });

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedPartyForFeedback, setSelectedPartyForFeedback] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState({
    overall_satisfaction: 5,
    has_transit_damage_shortage: false,
    damage_details: '',
    dealer_comments: ''
  });

  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [selectedPartyForMonthly, setSelectedPartyForMonthly] = useState(null);
  const [monthlyForm, setMonthlyForm] = useState({
    evaluation_period: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()),
    days_inactive: 0,
    is_dormant_risk: false,
    rating_order_delivery: 5,
    rating_product_quality: 5,
    rating_service_quality: 5,
    rating_account_related: 5,
    rating_overall: 5,
    next_month_demand_plan: '',
    competitor_schemes: '',
    dealer_suggestions: ''
  });

  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintForm, setComplaintForm] = useState({
    party_id: '',
    category: 'MANUFACTURING_DEFECT',
    assigned_department: 'QUALITY_ASSURANCE',
    issue_description: ''
  });

  // Centered Alert/Success Modal state
  const [centerAlert, setCenterAlert] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'success',
    confirmText: 'Done',
    onConfirm: null
  });

  // Load All Operational Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [partiesRes, followupsRes, feedbacksRes, monthlyRes, complaintsRes] = await Promise.all([
        getPartyList(effectiveTenantId),
        getOrderFollowups(effectiveTenantId),
        getOrderFeedbackList(effectiveTenantId),
        getMonthlyFeedbackList(effectiveTenantId),
        getComplaintsList(effectiveTenantId)
      ]);

      if (Array.isArray(partiesRes)) setParties(partiesRes);
      if (Array.isArray(followupsRes)) setOrderFollowups(followupsRes);
      if (Array.isArray(feedbacksRes)) setOrderFeedbacks(feedbacksRes);
      if (Array.isArray(monthlyRes)) setMonthlyFeedbacks(monthlyRes);
      if (Array.isArray(complaintsRes)) setComplaints(complaintsRes);
    } catch (err) {
      console.error('Error loading channel operations data:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Active Channel Partners
  const activePartners = useMemo(() => {
    return parties.filter(p => p.final_status === 'Active' || p.party_status === 'Active');
  }, [parties]);

  // Available States for Filters
  const availableStates = useMemo(() => {
    const set = new Set();
    parties.forEach(p => {
      if (p.state_name) set.add(p.state_name);
    });
    return Array.from(set).sort();
  }, [parties]);

  // Column Resizers for Tables
  const defaultFollowupCols = {
    code_tier: 170,
    firm_contact: 260,
    location: 170,
    billing: 170,
    status: 220,
    actions: 160
  };
  const { columnWidths: followupWidths, startResize: startFollowupResize, resetWidths: resetFollowupWidths } = useTableColumnResize('channel_ops_followup_widths', defaultFollowupCols);

  const defaultFeedbackCols = {
    order_no: 160,
    partner: 240,
    dispatch: 180,
    ratings: 220,
    issues: 220,
    actions: 140
  };
  const { columnWidths: feedbackWidths, startResize: startFeedbackResize, resetWidths: resetFeedbackWidths } = useTableColumnResize('channel_ops_feedback_widths', defaultFeedbackCols);

  const defaultMonthlyCols = {
    partner: 240,
    location: 180,
    period: 150,
    days: 140,
    health: 180,
    demand: 220,
    intel: 220,
    actions: 130
  };
  const { columnWidths: monthlyWidths, startResize: startMonthlyResize, resetWidths: resetMonthlyWidths } = useTableColumnResize('channel_ops_monthly_widths', defaultMonthlyCols);

  const defaultComplaintCols = {
    ticket_id: 170,
    partner: 220,
    dept_cat: 200,
    sla: 170,
    issue: 260,
    status: 140,
    actions: 140
  };
  const { columnWidths: complaintWidths, startResize: startComplaintResize, resetWidths: resetComplaintWidths } = useTableColumnResize('channel_ops_complaint_widths', defaultComplaintCols);

  // Counts for Badges
  const openComplaintsCount = useMemo(() => {
    return complaints.filter(c => c.status !== 'CLOSED' && c.status !== 'RESOLVED').length;
  }, [complaints]);

  const dormantRiskCount = useMemo(() => {
    return monthlyFeedbacks.filter(m => m.is_dormant_risk || m.days_inactive > 45).length;
  }, [monthlyFeedbacks]);

  return (
    <div style={{ padding: '1.25rem 1.5rem', color: 'var(--text-primary)', background: 'var(--bg-primary)', minHeight: '100%' }}>
      {/* Top Module Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(37,99,235,0.2) 0%, rgba(59,130,246,0.3) 100%)', border: '1px solid rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <Phone size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Channel Operations &amp; Partner Governance
              </h1>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Post-Onboarding Operational Cockpit: Daily Calling, Order Punching, Delivery Audits &amp; Grievance SLA
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.55rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '0.84rem',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Operations'}
        </button>
      </div>

      {/* Main Subpage Switcher Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem',
        background: 'var(--bg-surface)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        marginBottom: '1.25rem',
        overflowX: 'auto'
      }}>
        {OPERATIONS_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          let badgeCount = 0;
          if (tab.id === 'order_followup') badgeCount = activePartners.length;
          if (tab.id === 'order_feedback') badgeCount = orderFeedbacks.length;
          if (tab.id === 'monthly_feedback' && dormantRiskCount > 0) badgeCount = dormantRiskCount;
          if (tab.id === 'complaints' && openComplaintsCount > 0) badgeCount = openComplaintsCount;

          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.15rem',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.86rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '0.12rem 0.45rem',
                  borderRadius: '10px',
                  background: isActive ? 'rgba(255,255,255,0.25)' : (tab.id === 'complaints' || (tab.id === 'monthly_feedback' && dormantRiskCount > 0)) ? '#ef4444' : 'rgba(148,163,184,0.25)',
                  color: isActive ? '#ffffff' : (tab.id === 'complaints' || (tab.id === 'monthly_feedback' && dormantRiskCount > 0)) ? '#ffffff' : 'var(--text-primary)'
                }}>
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ENGINE 1 - DAILY ORDER FOLLOWUP COCKPIT */}
      {/* ========================================================= */}
      {activeTab === 'order_followup' && (() => {
        const latestFollowupMap = new Map();
        orderFollowups.forEach(f => {
          if (!latestFollowupMap.has(f.party_id)) {
            latestFollowupMap.set(f.party_id, f);
          }
        });

        const totalInQueue = activePartners.length;
        const totalFollowupsLogged = orderFollowups.length;
        const totalOrdersPlaced = orderFollowups.filter(f => f.is_order_placed).length;
        const totalRescheduled = orderFollowups.filter(f => f.call_status === 'RESCHEDULED').length;

        const filteredQueue = activePartners.filter(party => {
          const latest = latestFollowupMap.get(party.id);

          if (orderCallStatusFilter !== 'ALL') {
            if (orderCallStatusFilter === 'PENDING_CALL' && latest) return false;
            if (orderCallStatusFilter !== 'PENDING_CALL') {
              if (!latest) return false;
              if (orderCallStatusFilter === 'ORDER_PLACED' && !latest.is_order_placed) return false;
              if (orderCallStatusFilter !== 'ORDER_PLACED' && latest.call_status !== orderCallStatusFilter) return false;
            }
          }

          if (orderTierFilter !== 'ALL' && party.party_type !== orderTierFilter) return false;
          if (orderStateFilter !== 'ALL' && (party.state_name || '').toLowerCase() !== orderStateFilter.toLowerCase()) return false;

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

                <select
                  value={orderStateFilter}
                  onChange={e => setOrderStateFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All States</option>
                  {availableStates.map(st => (
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
              <MobileTableView id="ChannelOps-OrderFollowup">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      <th style={{ width: `${followupWidths.code_tier}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Partner Code &amp; Tier
                        <ColumnResizer onMouseDown={e => startFollowupResize('code_tier', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
                      <th style={{ width: `${followupWidths.firm_contact}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Firm Name &amp; Contact
                        <ColumnResizer onMouseDown={e => startFollowupResize('firm_contact', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
                      <th style={{ width: `${followupWidths.location}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Location
                        <ColumnResizer onMouseDown={e => startFollowupResize('location', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
                      <th style={{ width: `${followupWidths.billing}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Billing Mode
                        <ColumnResizer onMouseDown={e => startFollowupResize('billing', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
                      <th style={{ width: `${followupWidths.status}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Latest Follow-up Status
                        <ColumnResizer onMouseDown={e => startFollowupResize('status', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
                      <th style={{ width: `${followupWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                        Dial &amp; Action
                        <ColumnResizer onMouseDown={e => startFollowupResize('actions', e)} onDoubleClick={() => resetFollowupWidths()} />
                      </th>
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
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{party.firm_name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span>{party.contact_person_name_1 || party.owner_name || 'Principal'}</span>
                                <span>•</span>
                                <MaskedPhoneDisplay phone={phone} size="sm" />
                              </div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                              <div style={{ fontWeight: 600 }}>{party.district_name || 'District'}</div>
                              <div style={{ color: 'var(--text-secondary)' }}>{party.state_name || 'Punjab'}</div>
                            </td>

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
              </MobileTableView>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 2: ENGINE 2 - POST-ORDER FEEDBACK CALLING */}
      {/* ========================================================= */}
      {activeTab === 'order_feedback' && (() => {
        const filteredFeedbacks = orderFeedbacks.filter(f => {
          if (feedbackRatingFilter !== 'ALL') {
            if (feedbackRatingFilter === 'POOR') {
              if (f.overall_satisfaction > 2) return false;
            } else if (Number(feedbackRatingFilter) !== f.overall_satisfaction) {
              return false;
            }
          }

          if (feedbackStatusFilter === 'DAMAGE_ONLY' && !f.has_transit_damage_shortage) return false;

          if (!feedbackSearchTerm) return true;
          const term = feedbackSearchTerm.trim().toLowerCase();
          const firm = (f.party?.firm_name || '').toLowerCase();
          const code = (f.party?.party_universal_code || '').toLowerCase();
          const order = (f.order_no || '').toLowerCase();
          const invoice = (f.invoice_no || '').toLowerCase();

          return firm.includes(term) || code.includes(term) || order.includes(term) || invoice.includes(term);
        });

        const totalFeedbacks = orderFeedbacks.length;
        const totalFiveStars = orderFeedbacks.filter(f => f.overall_satisfaction === 5).length;
        const totalDamageShortage = orderFeedbacks.filter(f => f.has_transit_damage_shortage).length;
        const totalLowScores = orderFeedbacks.filter(f => f.overall_satisfaction <= 2).length;

        return (
          <div>
            {/* KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Star size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Feedbacks</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalFeedbacks}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>5-Star Delight</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{totalFiveStars}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Low Scores (≤ 2★)</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{totalLowScores}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                  <Truck size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>Damage / Shortage</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{totalDamageShortage}</div>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
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
                    placeholder="Search Order No, Invoice, Firm..."
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
                  <option value="ALL">All Ratings</option>
                  <option value="5">⭐⭐⭐⭐⭐ 5 Stars</option>
                  <option value="4">⭐⭐⭐⭐ 4 Stars</option>
                  <option value="3">⭐⭐⭐ 3 Stars</option>
                  <option value="POOR">⚠️ Poor (≤ 2 Stars)</option>
                </select>

                <select
                  value={feedbackStatusFilter}
                  onChange={e => setFeedbackStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Deliveries</option>
                  <option value="DAMAGE_ONLY">🚨 Transit Damage / Shortage Only</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (activePartners.length > 0) {
                      setSelectedPartyForFeedback(activePartners[0]);
                      setShowFeedbackModal(true);
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
                  <Plus size={15} /> + Record Delivery Feedback
                </button>
              </div>
            </div>

            {/* Feedback Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <MobileTableView id="ChannelOps-OrderFeedback">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      <th style={{ width: `${feedbackWidths.order_no}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Order &amp; Invoice
                        <ColumnResizer onMouseDown={e => startFeedbackResize('order_no', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                      <th style={{ width: `${feedbackWidths.partner}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Partner Firm &amp; Code
                        <ColumnResizer onMouseDown={e => startFeedbackResize('partner', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                      <th style={{ width: `${feedbackWidths.dispatch}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Dispatch Date &amp; Transporter
                        <ColumnResizer onMouseDown={e => startFeedbackResize('dispatch', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                      <th style={{ width: `${feedbackWidths.ratings}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Delivery Satisfaction
                        <ColumnResizer onMouseDown={e => startFeedbackResize('ratings', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                      <th style={{ width: `${feedbackWidths.issues}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Damage / Issues Reported
                        <ColumnResizer onMouseDown={e => startFeedbackResize('issues', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                      <th style={{ width: `${feedbackWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                        Action
                        <ColumnResizer onMouseDown={e => startFeedbackResize('actions', e)} onDoubleClick={() => resetFeedbackWidths()} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeedbacks.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No customer delivery feedbacks recorded yet.
                        </td>
                      </tr>
                    ) : (
                      filteredFeedbacks.map(f => (
                        <tr key={f.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{f.order_no || 'ORD-DIRECT'}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Inv: {f.invoice_no || 'NA'}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{f.party?.firm_name || 'Channel Partner'}</div>
                            <div style={{ fontSize: '0.76rem', color: '#38bdf8' }}>{f.party?.party_universal_code || 'CODE'}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            <div>{f.dispatch_date || 'Dispatched'}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>{f.transporter_name || 'Direct Transport'}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '5px',
                              background: f.overall_satisfaction >= 4 ? 'rgba(16,185,129,0.2)' : f.overall_satisfaction === 3 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                              color: f.overall_satisfaction >= 4 ? '#34d399' : f.overall_satisfaction === 3 ? '#fbbf24' : '#f87171'
                            }}>
                              {'★'.repeat(f.overall_satisfaction || 5)} ({f.overall_satisfaction}/5)
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {f.has_transit_damage_shortage ? (
                              <span style={{ fontSize: '0.76rem', color: '#f87171', fontWeight: 700 }}>
                                🚨 {f.damage_details || 'Transit Damage Reported'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 600 }}>
                                ✓ Delivered in Perfect Condition
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPartyForFeedback(f.party || { id: f.party_id, firm_name: 'Partner' });
                                setShowFeedbackModal(true);
                              }}
                              style={{ padding: '0.35rem 0.75rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-primary)', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                              Update
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </MobileTableView>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 3: ENGINE 3 - MONTHLY PARTNER HEALTH CHECKS */}
      {/* ========================================================= */}
      {activeTab === 'monthly_feedback' && (() => {
        const latestMonthlyMap = new Map();
        monthlyFeedbacks.forEach(m => {
          if (!latestMonthlyMap.has(m.party_id)) {
            latestMonthlyMap.set(m.party_id, m);
          }
        });

        const filteredMonthly = activePartners.filter(party => {
          const latest = latestMonthlyMap.get(party.id);

          if (monthlyRiskFilter === 'DORMANT_ONLY' && (!latest || !latest.is_dormant_risk)) return false;
          if (monthlyRiskFilter === 'ACTIVE_ONLY' && latest?.is_dormant_risk) return false;
          if (monthlyStateFilter !== 'ALL' && (party.state_name || '').toLowerCase() !== monthlyStateFilter.toLowerCase()) return false;

          if (!monthlySearchTerm) return true;
          const term = monthlySearchTerm.trim().toLowerCase();
          const firm = (party.firm_name || '').toLowerCase();
          const code = (party.distributor_code || party.dealer_code || party.sub_dealer_code || party.party_universal_code || '').toLowerCase();
          const dist = (party.district_name || '').toLowerCase();

          return firm.includes(term) || code.includes(term) || dist.includes(term);
        });

        const totalPartners = activePartners.length;
        const totalReviews = monthlyFeedbacks.length;
        const totalHighSatisfaction = monthlyFeedbacks.filter(m => (m.rating_overall || 5) >= 4).length;
        const totalDormantRisk = monthlyFeedbacks.filter(m => m.is_dormant_risk || m.days_inactive > 45).length;

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
                  <Calendar size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Reviews Recorded</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalReviews}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Healthy Partners (≥4★)</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{totalHighSatisfaction}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Dormancy Alert (&gt;45d)</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{totalDormantRisk}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                  <Users size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase' }}>Active Network</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalPartners}</div>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
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
                    placeholder="Search Partner, Code, District..."
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
                  value={monthlyRiskFilter}
                  onChange={e => setMonthlyRiskFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Partner Health Status</option>
                  <option value="DORMANT_ONLY">⚠️ Dormancy Risk Only</option>
                  <option value="ACTIVE_ONLY">✓ Healthy / Active Engagement</option>
                </select>

                <select
                  value={monthlyStateFilter}
                  onChange={e => setMonthlyStateFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All States</option>
                  {availableStates.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Monthly Health Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <MobileTableView id="ChannelOps-MonthlyHealth">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      <th style={{ width: `${monthlyWidths.partner}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Partner Code &amp; Tier
                        <ColumnResizer onMouseDown={e => startMonthlyResize('partner', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.location}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Firm Name &amp; Location
                        <ColumnResizer onMouseDown={e => startMonthlyResize('location', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.period}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Last Review Period
                        <ColumnResizer onMouseDown={e => startMonthlyResize('period', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.days}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Days Inactive
                        <ColumnResizer onMouseDown={e => startMonthlyResize('days', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.health}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Composite Health Rating
                        <ColumnResizer onMouseDown={e => startMonthlyResize('health', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.demand}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Next Month Demand Plan
                        <ColumnResizer onMouseDown={e => startMonthlyResize('demand', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.intel}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Competitor Market Intel
                        <ColumnResizer onMouseDown={e => startMonthlyResize('intel', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                      <th style={{ width: `${monthlyWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                        Action
                        <ColumnResizer onMouseDown={e => startMonthlyResize('actions', e)} onDoubleClick={() => resetMonthlyWidths()} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMonthly.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No channel partners match the monthly health filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredMonthly.map(party => {
                        const latest = latestMonthlyMap.get(party.id);
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
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{party.district_name}, {party.state_name}</div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                              {latest ? (
                                <span style={{ fontWeight: 600 }}>{latest.evaluation_period}</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>Not Evaluated</span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              {latest ? (
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '0.76rem',
                                  fontWeight: 800,
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '4px',
                                  background: latest.is_dormant_risk ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                                  color: latest.is_dormant_risk ? '#f87171' : '#34d399'
                                }}>
                                  {latest.days_inactive} Days {latest.is_dormant_risk ? '(⚠️ Risk)' : '(Active)'}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>-</span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              {latest ? (
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: '0.76rem',
                                  fontWeight: 800,
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '4px',
                                  background: (latest.rating_overall || 5) >= 4 ? 'rgba(16,185,129,0.2)' : (latest.rating_overall || 5) === 3 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                                  color: (latest.rating_overall || 5) >= 4 ? '#34d399' : (latest.rating_overall || 5) === 3 ? '#fbbf24' : '#f87171'
                                }}>
                                  {'★'.repeat(latest.rating_overall || 5)} ({latest.rating_overall || 5}/5)
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Pending Review</span>
                              )}
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {latest?.next_month_demand_plan || 'No projection logged'}
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {latest?.competitor_schemes || 'No intel recorded'}
                            </td>

                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPartyForMonthly(party);
                                  setShowMonthlyModal(true);
                                }}
                                style={{ padding: '0.35rem 0.75rem', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </MobileTableView>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* TAB 4: ENGINE 4 - COMPLAINTS & GRIEVANCE MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'complaints' && (() => {
        const filteredComplaints = complaints.filter(c => {
          if (complaintStatusFilter !== 'ALL' && c.status !== complaintStatusFilter) return false;
          if (complaintDeptFilter !== 'ALL' && c.assigned_department !== complaintDeptFilter) return false;

          if (!complaintSearchTerm) return true;
          const term = complaintSearchTerm.trim().toLowerCase();
          const ticket = (c.ticket_no || '').toLowerCase();
          const firm = (c.party?.firm_name || '').toLowerCase();
          const desc = (c.issue_description || '').toLowerCase();

          return ticket.includes(term) || firm.includes(term) || desc.includes(term);
        });

        const totalTickets = complaints.length;
        const totalOpen = complaints.filter(c => c.status === 'OPEN').length;
        const totalInvestigating = complaints.filter(c => c.status === 'INVESTIGATING').length;
        const totalResolved = complaints.filter(c => c.status === 'RESOLVED' || c.status === 'CLOSED').length;

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
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Open Tickets</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{totalOpen}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>Under Investigation</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{totalInvestigating}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Resolved &amp; Closed</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{totalResolved}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Shield size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Tickets</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalTickets}</div>
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
                    value={complaintSearchTerm}
                    onChange={e => setComplaintSearchTerm(e.target.value)}
                    placeholder="Search Ticket No, Partner, Issue..."
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
                  value={complaintStatusFilter}
                  onChange={e => setComplaintStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Ticket Statuses</option>
                  <option value="OPEN">🔴 Open</option>
                  <option value="INVESTIGATING">🟡 Under Investigation</option>
                  <option value="RESOLVED">🟢 Resolved</option>
                  <option value="CLOSED">⚪ Closed (Verified)</option>
                </select>

                <select
                  value={complaintDeptFilter}
                  onChange={e => setComplaintDeptFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  <option value="ALL">All Assigned Departments</option>
                  <option value="QUALITY_ASSURANCE">Plant Quality Assurance (QA)</option>
                  <option value="LOGISTICS_DISPATCH">Logistics &amp; Dispatch</option>
                  <option value="ACCOUNTS_FINANCE">Accounts &amp; Billing</option>
                  <option value="SERVICE_ENGINEERING">Field Service Engineering</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowComplaintModal(true)}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 8px rgba(239,68,68,0.25)'
                  }}
                >
                  <Plus size={15} /> + Log Grievance Ticket
                </button>
              </div>
            </div>

            {/* Complaints Table */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflowX: 'auto' }}>
              <MobileTableView id="ChannelOps-Complaints">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      <th style={{ width: `${complaintWidths.ticket_id}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Ticket ID &amp; Date
                        <ColumnResizer onMouseDown={e => startComplaintResize('ticket_id', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.partner}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Partner Firm &amp; Code
                        <ColumnResizer onMouseDown={e => startComplaintResize('partner', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.dept_cat}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Category &amp; Department
                        <ColumnResizer onMouseDown={e => startComplaintResize('dept_cat', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.sla}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        SLA Target (IST)
                        <ColumnResizer onMouseDown={e => startComplaintResize('sla', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.issue}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Problem Description
                        <ColumnResizer onMouseDown={e => startComplaintResize('issue', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.status}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                        Status
                        <ColumnResizer onMouseDown={e => startComplaintResize('status', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                      <th style={{ width: `${complaintWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                        Action
                        <ColumnResizer onMouseDown={e => startComplaintResize('actions', e)} onDoubleClick={() => resetComplaintWidths()} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplaints.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No complaint tickets matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredComplaints.map(c => {
                        const isClosed = c.status === 'CLOSED' || c.status === 'RESOLVED';
                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 800, color: '#f87171', fontFamily: 'monospace' }}>{c.ticket_no}</div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{c.created_at ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(c.created_at)) : 'Today'}</div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.party?.firm_name || 'Channel Partner'}</div>
                              <div style={{ fontSize: '0.76rem', color: '#38bdf8' }}>{c.party?.party_universal_code || 'CODE'}</div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{c.category?.replace(/_/g, ' ')}</div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Dept: {c.assigned_department?.replace(/_/g, ' ')}</div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                              <div style={{ fontWeight: 600 }}>{c.target_resolution_hours || 48} Hours SLA</div>
                              <div style={{ color: isClosed ? '#34d399' : '#fbbf24', fontSize: '0.74rem' }}>
                                {isClosed ? '✓ Resolved within SLA' : '⏱️ Active Investigation'}
                              </div>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              {c.issue_description}
                            </td>

                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                padding: '0.18rem 0.55rem',
                                borderRadius: '4px',
                                background: isClosed ? 'rgba(16,185,129,0.2)' : c.status === 'INVESTIGATING' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                                color: isClosed ? '#34d399' : c.status === 'INVESTIGATING' ? '#fbbf24' : '#f87171'
                              }}>
                                {c.status}
                              </span>
                            </td>

                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                              {!isClosed && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const otp = prompt('Enter 6-digit Customer Closure OTP:');
                                    if (otp) {
                                      await verifyAndCloseComplaint(c.id, otp, 5);
                                      setCenterAlert({
                                        isOpen: true,
                                        type: 'success',
                                        title: 'Ticket Closed',
                                        message: 'Ticket Resolved & Closed successfully with OTP verification!',
                                        confirmText: 'Done',
                                        onConfirm: null
                                      });
                                      loadData();
                                    }
                                  }}
                                  style={{ padding: '0.35rem 0.75rem', background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                                >
                                  Verify &amp; Close
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </MobileTableView>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL 1: LOG DAILY ORDER / CALL FOLLOWUP */}
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
              }, effectiveTenantId);

              setShowOrderModal(false);
              loadData();

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
      {/* MODAL 2: POST-ORDER DELIVERY FEEDBACK */}
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
              }, effectiveTenantId);
              setShowFeedbackModal(false);
              loadData();

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
      {/* MODAL 3: MONTHLY PARTNER HEALTH REVIEW & DEMAND PLANNING */}
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
              try {
                await saveMonthlyFeedback({
                  ...monthlyForm,
                  party_id: selectedPartyForMonthly.id
                }, effectiveTenantId);
                setShowMonthlyModal(false);
                loadData();

                setCenterAlert({
                  isOpen: true,
                  type: 'success',
                  title: 'Monthly Review Recorded',
                  message: `Monthly health assessment and demand projection saved for ${selectedPartyForMonthly.firm_name}!`,
                  confirmText: 'Done',
                  onConfirm: null
                });
              } catch (err) {
                console.error('Save review error:', err);
                setCenterAlert({
                  isOpen: true,
                  type: 'error',
                  title: 'Save Failed',
                  message: err.message || 'Could not save monthly review. Please try again.',
                  confirmText: 'Close',
                  onConfirm: null
                });
              }
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
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
                <div style={{ paddingTop: '1.2rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: monthlyForm.is_dormant_risk ? '#f87171' : '#34d399', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={monthlyForm.is_dormant_risk}
                      onChange={e => setMonthlyForm({ ...monthlyForm, is_dormant_risk: e.target.checked })}
                    />
                    {monthlyForm.is_dormant_risk ? '⚠️ High Dormancy Risk' : '✓ Normal Engagement'}
                  </label>
                </div>
              </div>

              {/* 5-DIMENSION PERFORMANCE RATING SCORES */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '0.9rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>⭐</span>
                    <span>Evaluation Rating Scores</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Scale: 1 (Very Poor) to 5 (Excellent)</span>
                </div>

                {[
                  { key: 'rating_order_delivery', label: 'Order Delivery', desc: 'Fulfillment speed & condition', icon: '🚚' },
                  { key: 'rating_product_quality', label: 'Product Quality', desc: 'Machine performance & build', icon: '📦' },
                  { key: 'rating_service_quality', label: 'Service Quality', desc: 'TSE field support & warranty', icon: '🛠️' },
                  { key: 'rating_account_related', label: 'Account Related', desc: 'Billing accuracy & ledger', icon: '💳' }
                ].map(item => {
                  const currentVal = Number(monthlyForm[item.key] || 5);
                  return (
                    <div
                      key={item.key}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '8px',
                        background: 'rgba(15,23,42,0.6)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        marginBottom: '0.55rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.2rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#e2e8f0', marginRight: '0.4rem' }}>
                            {item.icon} {item.label}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({item.desc})</span>
                        </div>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.12rem 0.5rem',
                          borderRadius: '4px',
                          color: currentVal >= 5 ? '#34d399' : currentVal === 4 ? '#38bdf8' : currentVal === 3 ? '#fbbf24' : currentVal === 2 ? '#fb923c' : '#f87171',
                          background: 'rgba(0,0,0,0.3)',
                          border: `1px solid ${currentVal >= 5 ? '#34d399' : currentVal === 4 ? '#38bdf8' : currentVal === 3 ? '#fbbf24' : currentVal === 2 ? '#fb923c' : '#f87171'}40`
                        }}>
                          {currentVal >= 5 ? '🌟 5 - Excellent' : currentVal === 4 ? '🙂 4 - Good' : currentVal === 3 ? '😐 3 - Average' : currentVal === 2 ? '🙁 2 - Poor' : '😡 1 - Very Poor'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                        {[
                          { val: 1, label: 'Very Poor', emoji: '😡', color: '#ef4444' },
                          { val: 2, label: 'Poor', emoji: '🙁', color: '#f97316' },
                          { val: 3, label: 'Average', emoji: '😐', color: '#f59e0b' },
                          { val: 4, label: 'Good', emoji: '🙂', color: '#38bdf8' },
                          { val: 5, label: 'Excellent', emoji: '🌟', color: '#10b981' }
                        ].map(opt => {
                          const isSelected = currentVal === opt.val;
                          return (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() => {
                                const newDelivery = item.key === 'rating_order_delivery' ? opt.val : (monthlyForm.rating_order_delivery || 5);
                                const newProduct = item.key === 'rating_product_quality' ? opt.val : (monthlyForm.rating_product_quality || 5);
                                const newService = item.key === 'rating_service_quality' ? opt.val : (monthlyForm.rating_service_quality || 5);
                                const newAccount = item.key === 'rating_account_related' ? opt.val : (monthlyForm.rating_account_related || 5);
                                const autoOverall = Math.round((newDelivery + newProduct + newService + newAccount) / 4);

                                setMonthlyForm(prev => ({
                                  ...prev,
                                  [item.key]: opt.val,
                                  rating_overall: autoOverall
                                }));
                              }}
                              style={{
                                padding: '0.4rem 0.2rem',
                                borderRadius: '6px',
                                border: isSelected ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                                background: isSelected ? `${opt.color}25` : 'rgba(30,41,59,0.5)',
                                color: isSelected ? '#fff' : '#94a3b8',
                                fontWeight: isSelected ? 800 : 500,
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                            >
                              <div style={{ fontSize: '0.9rem' }}>{opt.emoji}</div>
                              <div>{opt.val} - {opt.label}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Dimension 5: OverAll Rating */}
                <div style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(30,58,138,0.2) 100%)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  marginTop: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.2rem' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#60a5fa', marginRight: '0.4rem' }}>
                        🏆 OverAll Rating
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>(Composite score, click to override)</span>
                    </div>
                    {(() => {
                      const ov = Number(monthlyForm.rating_overall || 5);
                      return (
                        <span style={{
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.6rem',
                          borderRadius: '5px',
                          color: ov >= 5 ? '#34d399' : ov === 4 ? '#38bdf8' : ov === 3 ? '#fbbf24' : ov === 2 ? '#fb923c' : '#f87171',
                          background: 'rgba(0,0,0,0.4)',
                          border: `1px solid ${ov >= 5 ? '#34d399' : ov === 4 ? '#38bdf8' : ov === 3 ? '#fbbf24' : ov === 2 ? '#fb923c' : '#f87171'}50`
                        }}>
                          {ov >= 5 ? '🌟 5 - Excellent' : ov === 4 ? '🙂 4 - Good' : ov === 3 ? '😐 3 - Average' : ov === 2 ? '🙁 2 - Poor' : '😡 1 - Very Poor'}
                        </span>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                    {[
                      { val: 1, label: 'Very Poor', emoji: '😡', color: '#ef4444' },
                      { val: 2, label: 'Poor', emoji: '🙁', color: '#f97316' },
                      { val: 3, label: 'Average', emoji: '😐', color: '#f59e0b' },
                      { val: 4, label: 'Good', emoji: '🙂', color: '#38bdf8' },
                      { val: 5, label: 'Excellent', emoji: '🌟', color: '#10b981' }
                    ].map(opt => {
                      const isSelected = Number(monthlyForm.rating_overall || 5) === opt.val;
                      return (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setMonthlyForm(prev => ({ ...prev, rating_overall: opt.val }))}
                          style={{
                            padding: '0.45rem 0.2rem',
                            borderRadius: '6px',
                            border: isSelected ? `2px solid ${opt.color}` : '1px solid rgba(255,255,255,0.12)',
                            background: isSelected ? `${opt.color}30` : 'rgba(15,23,42,0.6)',
                            color: isSelected ? '#fff' : '#94a3b8',
                            fontWeight: isSelected ? 800 : 500,
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontSize: '1rem' }}>{opt.emoji}</div>
                          <div>{opt.val} - {opt.label}</div>
                        </button>
                      );
                    })}
                  </div>
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
      {/* MODAL 4: RAISE COMPLAINT / GRIEVANCE TICKET */}
      {/* ========================================================= */}
      {showComplaintModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '520px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#f87171' }}>
              🚨 Log Grievance / Complaint Ticket
            </h3>

            <form onSubmit={async (e) => {
              e.preventDefault();
              await createComplaintTicket(complaintForm, effectiveTenantId);
              setShowComplaintModal(false);
              loadData();
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
                  <option value="BILLING_DISPUTE">Billing &amp; Scheme Dispute</option>
                  <option value="DELIVERY_DELAY">Delivery &amp; Dispatch Delay</option>
                  <option value="SERVICE_WARRANTY">Field Service &amp; Warranty</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Department Route</label>
                <select value={complaintForm.assigned_department} onChange={e => setComplaintForm({ ...complaintForm, assigned_department: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                  <option value="QUALITY_ASSURANCE">Plant Quality Assurance (QA)</option>
                  <option value="LOGISTICS_DISPATCH">Logistics &amp; Dispatch</option>
                  <option value="ACCOUNTS_FINANCE">Accounts &amp; Billing</option>
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
      {/* CENTERED POPUP ALERT MODAL */}
      {/* ========================================================= */}
      {centerAlert.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
          }}
          onClick={() => {
            if (centerAlert.onConfirm) centerAlert.onConfirm();
            setCenterAlert(prev => ({ ...prev, isOpen: false }));
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: `1.5px solid ${centerAlert.type === 'success' ? '#10b981' : centerAlert.type === 'error' ? '#ef4444' : '#f59e0b'}`,
              borderRadius: '18px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '440px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
              {centerAlert.type === 'success' ? '✅' : centerAlert.type === 'error' ? '❌' : '⚠️'}
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
              {centerAlert.title}
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5 }}>
              {centerAlert.message}
            </p>
            <button
              type="button"
              onClick={() => {
                if (centerAlert.onConfirm) centerAlert.onConfirm();
                setCenterAlert(prev => ({ ...prev, isOpen: false }));
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: 'none',
                background: centerAlert.type === 'success' ? '#10b981' : centerAlert.type === 'error' ? '#ef4444' : '#f59e0b',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              {centerAlert.confirmText || 'Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
