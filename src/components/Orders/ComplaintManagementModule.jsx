'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Shield, CheckCircle2, Clock, Search, Filter,
  RefreshCw, Plus, ArrowRight, CheckSquare, Phone, User, ExternalLink,
  LayoutGrid, List, Users, Wrench, ShieldAlert, Sparkles, Building2, MapPin, Eye, FileText
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import {
  getComplaintsTickets,
  createComplaintTicketDirect,
  updateComplaintTicketAction,
  verifyAndCloseComplaintTicket,
  advanceComplaintTicketStage
} from '@/app/actions/orderFulfillment';
import { getComplaintPipelineConfig } from '@/app/actions/complaintPipelineConfig';
import { getEndCustomers } from '@/app/actions/endCustomers';
import { getTeamMembers } from '@/app/actions/team';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';
import StandardTablePagination from '../common/StandardTablePagination';
import SearchablePartySelect from '../common/SearchablePartySelect';
import ComplaintStageActionModal from './modals/ComplaintStageActionModal';
import ComplaintStageHistoryModal from './modals/ComplaintStageHistoryModal';
import RegisterEndCustomerModal from './modals/RegisterEndCustomerModal';
import EndCustomerMasterModule from './EndCustomerMasterModule';

// Master 8 Categories Baseline
const DEFAULT_CATEGORIES = [
  { id: 'MANUFACTURING_DEFECT', label: 'Manufacturing Defect', dept: 'QUALITY_ASSURANCE', sla: '48h', color: '#ef4444' },
  { id: 'TRANSIT_DAMAGE', label: 'Transit Damage (Logistics)', dept: 'LOGISTICS_DISPATCH', sla: '24h', color: '#f97316' },
  { id: 'SHORTAGE_PRODUCT_SPAREPART', label: 'Shortage Product / Sparepart', dept: 'LOGISTICS_DISPATCH', sla: '24h', color: '#eab308' },
  { id: 'DELIVERY_DELAY', label: 'Delivery Delay', dept: 'LOGISTICS_DISPATCH', sla: '12h', color: '#06b6d4' },
  { id: 'BILLING_ISSUES', label: 'Billing Issues', dept: 'ACCOUNTS_FINANCE', sla: '24h', color: '#6366f1' },
  { id: 'ORDER_RELATED_ISSUES', label: 'Order Related Issues', dept: 'SALES_DESK', sla: '12h', color: '#8b5cf6' },
  { id: 'SERVICE_ISSUES', label: 'Service Issues', dept: 'SERVICE_ENGINEERING', sla: '48h', color: '#ec4899' },
  { id: 'WARRANTY_CLAIM', label: 'Warranty Claim', dept: 'SERVICE_ENGINEERING', sla: '72h', color: '#dc2626' }
];

const DEPARTMENTS = [
  { id: 'QUALITY_ASSURANCE', label: 'Plant Quality Assurance (QA)' },
  { id: 'LOGISTICS_DISPATCH', label: 'Logistics & Dispatch' },
  { id: 'ACCOUNTS_FINANCE', label: 'Accounts & Billing' },
  { id: 'SERVICE_ENGINEERING', label: 'Field Service Engineering' },
  { id: 'SALES_DESK', label: 'Sales Coordination / Order Desk' }
];

const DEFAULT_STAGES = [
  { id: 'C01', step_no: 1, name: 'Ticket Logged & Triaged', short_code: 'LOGGED', color: '#3b82f6', is_enabled: true },
  { id: 'C02', step_no: 2, name: 'Internal Dept RCA', short_code: 'RCA', color: '#6366f1', is_enabled: true },
  { id: 'C03', step_no: 3, name: 'Technician Deputed', short_code: 'DEPUTED', color: '#8b5cf6', is_enabled: true },
  { id: 'C04', step_no: 4, name: 'On-Site Job Card', short_code: 'JOB_CARD', color: '#f59e0b', is_enabled: true },
  { id: 'C05', step_no: 5, name: 'Customer OTP Sign-off', short_code: 'VERIFICATION', color: '#14b8a6', is_enabled: true },
  { id: 'C06', step_no: 6, name: 'Quality Audit & Closed', short_code: 'CLOSED', color: '#10b981', is_enabled: true }
];

function formatIST(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (_) {
    return String(isoDate).slice(0, 16);
  }
}

export default function ComplaintManagementModule({
  tenantId = 'TNT00002',
  parties = [],
  userName = 'Operations',
  userId = '',
  userRole = ''
}) {
  const [viewMode, setViewMode] = useState('pipeline'); // 'pipeline' | 'table' | 'customers'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Dynamic Pipeline Config & Team
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [teamMembers, setTeamMembers] = useState([]);
  const [endCustomers, setEndCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRegisterCustomerModal, setShowRegisterCustomerModal] = useState(false);
  const [stageActionModal, setStageActionModal] = useState({ isOpen: false, ticket: null, targetStage: null });
  const [stageHistoryModal, setStageHistoryModal] = useState({ isOpen: false, ticket: null });

  // Ticket Creation Form State
  const [createForm, setCreateForm] = useState({
    complaint_type: 'CHANNEL_PARTNER', // 'CHANNEL_PARTNER' | 'END_CUSTOMER'
    party_id: '',
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    category: 'MANUFACTURING_DEFECT',
    priority: 'HIGH',
    assigned_department: 'QUALITY_ASSURANCE',
    issue_description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Table Column Resizer
  const defaultCols = {
    ticket_id: 170,
    source_target: 240,
    category_dept: 220,
    stage_sla: 200,
    issue: 260,
    technician: 180,
    actions: 140
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('complaints_table_v2', defaultCols);

  // Load Pipeline Config
  const loadConfig = useCallback(async () => {
    try {
      const res = await getComplaintPipelineConfig(tenantId, 'All Branches');
      if (res.success && res.config?.stages?.length > 0) {
        setStages(res.config.stages);
      }
    } catch (_) {
      setStages(DEFAULT_STAGES);
    }
  }, [tenantId]);

  // Load Team Members
  const loadTeam = useCallback(async () => {
    try {
      const members = await getTeamMembers('', tenantId);
      if (Array.isArray(members)) setTeamMembers(members);
    } catch (_) {
      setTeamMembers([]);
    }
  }, [tenantId]);

  // Load End Customers
  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const list = await getEndCustomers(tenantId);
      if (Array.isArray(list)) setEndCustomers(list);
    } catch (_) {
      setEndCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [tenantId]);

  // Load Tickets
  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getComplaintsTickets(tenantId, {
        department: deptFilter
      });
      setTickets(data || []);
    } catch (err) {
      console.error('Error loading complaints tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, deptFilter]);

  useEffect(() => {
    loadConfig();
    loadTeam();
    loadCustomers();
  }, [loadConfig, loadTeam, loadCustomers]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Resolve Stage Helper
  const resolveTicketStage = (ticket) => {
    const rawStage = ticket.stage_id;
    const direct = stages.find(s => s.id === rawStage);
    if (direct) return direct;
    if (ticket.ticket_status === 'RESOLVED_CLOSED') return stages[stages.length - 1] || DEFAULT_STAGES[5];
    if (ticket.ticket_status === 'ACTION_TAKEN') return stages[3] || DEFAULT_STAGES[3];
    return stages[0] || DEFAULT_STAGES[0];
  };

  // Get Next Stage Helper
  const getNextStage = (currentStageId) => {
    const idx = stages.findIndex(s => s.id === currentStageId);
    if (idx !== -1 && idx < stages.length - 1) {
      return stages[idx + 1];
    }
    return null;
  };

  // Open Stage Action Modal
  const handleOpenAdvanceStage = (ticket, targetStage) => {
    setStageActionModal({
      isOpen: true,
      ticket,
      targetStage
    });
  };

  // Handle Advance Stage Success
  const handleStageActionSuccess = async (actionPayload) => {
    const res = await advanceComplaintTicketStage(actionPayload.ticketId, actionPayload, tenantId);
    if (res.success) {
      loadTickets();
    } else {
      alert('Failed to advance stage: ' + (res.error || 'Unknown error'));
    }
  };

  // Handle Create Ticket
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (createForm.complaint_type === 'CHANNEL_PARTNER' && !createForm.party_id) {
      alert('Please select a Channel Partner.');
      return;
    }
    if (createForm.complaint_type === 'END_CUSTOMER' && !createForm.customer_name) {
      alert('Please select or register an End Customer.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createComplaintTicketDirect(createForm, tenantId);
      if (res.success) {
        setShowCreateModal(false);
        setCreateForm({
          complaint_type: 'CHANNEL_PARTNER',
          party_id: '',
          customer_id: '',
          customer_name: '',
          customer_phone: '',
          category: 'MANUFACTURING_DEFECT',
          priority: 'HIGH',
          assigned_department: 'QUALITY_ASSURANCE',
          issue_description: ''
        });
        loadTickets();
      } else {
        alert('Failed to create ticket: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error creating ticket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const st = resolveTicketStage(t);

      if (stageFilter === 'BREACHED') {
        if (!t.isSlaBreached) return false;
      } else if (stageFilter !== 'ALL' && st.id !== stageFilter) {
        return false;
      }

      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) {
        return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (t.ticket_number || '').toLowerCase();
      const party = (t.party?.firm_name || '').toLowerCase();
      const cust = (t.customer_name || '').toLowerCase();
      const desc = (t.issue_description || '').toLowerCase();
      const tech = (t.technician_name || '').toLowerCase();

      return num.includes(term) || party.includes(term) || cust.includes(term) || desc.includes(term) || tech.includes(term);
    });
  }, [tickets, stageFilter, categoryFilter, searchTerm, stages]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stageFilter, categoryFilter, pageSize]);

  const paginatedTickets = useMemo(() => {
    if (pageSize === 100000) return filteredTickets;
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, currentPage, pageSize]);

  // Stage counts for visual progress strip
  const stageCounts = useMemo(() => {
    const map = { ALL: tickets.length, BREACHED: 0 };
    stages.forEach(s => { map[s.id] = 0; });

    tickets.forEach(t => {
      const st = resolveTicketStage(t);
      if (t.isSlaBreached) map.BREACHED++;
      if (map[st.id] !== undefined) map[st.id]++;
    });
    return map;
  }, [tickets, stages]);

  // KPI Ribbon stats
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.stage_id !== 'C06' && t.ticket_status !== 'RESOLVED_CLOSED').length;
    const underService = tickets.filter(t => t.stage_id === 'C03' || t.stage_id === 'C04').length;
    const closed = tickets.filter(t => t.stage_id === 'C06' || t.ticket_status === 'RESOLVED_CLOSED').length;
    const breached = tickets.filter(t => t.isSlaBreached).length;
    return { total, open, underService, closed, breached };
  }, [tickets]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* KPI Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.75rem'
      }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Active Complaints</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.open}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
            <Wrench size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase' }}>Field Service / Tech</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24' }}>{kpis.underService}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Verified &amp; Closed</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{kpis.closed}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>SLA Breached</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.breached}</div>
          </div>
        </div>
      </div>

      {/* Visual 6-Stage Progress Strip */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        overflowX: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        {/* All Tab */}
        <div
          onClick={() => setStageFilter('ALL')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '8px',
            background: stageFilter === 'ALL' ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
            color: stageFilter === 'ALL' ? '#ffffff' : 'var(--text-primary)',
            border: '1px solid var(--border-light)',
            cursor: 'pointer',
            fontSize: '0.76rem',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease'
          }}
        >
          <span>All Complaints</span>
          <span style={{
            fontSize: '0.72rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '10px',
            background: stageFilter === 'ALL' ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
            color: stageFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)'
          }}>
            {stageCounts.ALL}
          </span>
        </div>

        {/* Stages C01 to C06 */}
        {stages.map(st => {
          const count = stageCounts[st.id] || 0;
          const isSelected = stageFilter === st.id;
          return (
            <div
              key={st.id}
              onClick={() => setStageFilter(isSelected ? 'ALL' : st.id)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                background: isSelected ? `${st.color}20` : 'var(--bg-primary)',
                border: isSelected ? `2px solid ${st.color}` : '1px solid var(--border-light)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                color: st.color,
                background: `${st.color}20`,
                padding: '0.1rem 0.35rem',
                borderRadius: '4px'
              }}>
                {st.id}
              </span>
              <span style={{
                fontSize: '0.76rem',
                fontWeight: isSelected ? 800 : 600,
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}>
                {st.name}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.05rem 0.35rem',
                borderRadius: '10px',
                background: isSelected ? `${st.color}30` : 'var(--border-light)',
                color: isSelected ? st.color : 'var(--text-secondary)'
              }}>
                {count}
              </span>
            </div>
          );
        })}

        {/* Breached Tab */}
        <div
          onClick={() => setStageFilter(stageFilter === 'BREACHED' ? 'ALL' : 'BREACHED')}
          style={{
            padding: '0.45rem 0.75rem',
            borderRadius: '8px',
            background: stageFilter === 'BREACHED' ? 'rgba(239,68,68,0.2)' : 'var(--bg-primary)',
            border: stageFilter === 'BREACHED' ? '2px solid #ef4444' : '1px solid var(--border-light)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginLeft: 'auto'
          }}
        >
          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ef4444' }}>⚠️ SLA Breached</span>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            padding: '0.05rem 0.35rem',
            borderRadius: '10px',
            background: 'rgba(239,68,68,0.25)',
            color: '#ef4444'
          }}>
            {stageCounts.BREACHED}
          </span>
        </div>
      </div>

      {/* Control Bar (Search, Category Filter, View Switcher & Log Ticket) */}
      <div style={{
        background: 'var(--bg-surface)',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 280px', maxWidth: '380px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Ticket #, Customer, Dealer, Technician..."
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem'
              }}
            />
          </div>
        </div>

        {/* Filters and View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Category Filter (8 Categories) */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All 8 Categories</option>
            {DEFAULT_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>

          {/* View Mode Buttons */}
          <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-light)', padding: '2px' }}>
            <button
              type="button"
              onClick={() => setViewMode('pipeline')}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: '6px',
                background: viewMode === 'pipeline' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: viewMode === 'pipeline' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
            >
              <LayoutGrid size={13} />
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: '6px',
                background: viewMode === 'table' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
            >
              <List size={13} />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('customers')}
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: '6px',
                background: viewMode === 'customers' ? 'var(--accent-color, #2563eb)' : 'transparent',
                color: viewMode === 'customers' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
            >
              <Users size={13} />
              End Customers ({endCustomers.length})
            </button>
          </div>

          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            style={{
              padding: '0.5rem 0.85rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem'
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.5rem 0.95rem',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 700
            }}
          >
            <Plus size={14} />
            + Log Complaint Ticket
          </button>
        </div>
      </div>

      {/* VIEW 1: KANBAN PIPELINE BOARD */}
      {viewMode === 'pipeline' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(260px, 1fr))`,
          gap: '0.75rem',
          overflowX: 'auto',
          paddingBottom: '0.75rem',
          minHeight: '480px'
        }}>
          {stages.map(st => {
            const columnTickets = filteredTickets.filter(t => resolveTicketStage(t).id === st.id);
            const nextSt = getNextStage(st.id);

            return (
              <div
                key={st.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Column Header */}
                <div style={{
                  padding: '0.75rem 0.9rem',
                  borderBottom: `2px solid ${st.color}`,
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: st.color,
                      background: `${st.color}20`,
                      padding: '0.1rem 0.35rem',
                      borderRadius: '4px'
                    }}>
                      {st.id}
                    </span>
                    <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{st.name}</strong>
                  </div>
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    background: `${st.color}25`,
                    color: st.color
                  }}>
                    {columnTickets.length}
                  </span>
                </div>

                {/* Cards List */}
                <div style={{ padding: '0.65rem', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {columnTickets.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      No tickets in {st.id}
                    </div>
                  ) : (
                    columnTickets.map(ticket => {
                      const catObj = DEFAULT_CATEGORIES.find(c => c.id === ticket.category) || {};
                      return (
                        <div
                          key={ticket.id}
                          style={{
                            background: 'var(--bg-primary)',
                            border: ticket.isSlaBreached ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--border-light)',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.45rem',
                            boxShadow: ticket.isSlaBreached ? '0 0 10px rgba(239,68,68,0.2)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Ticket Number & Urgency */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-color, #38bdf8)' }}>
                              #{ticket.ticket_number}
                            </span>

                            {ticket.isSlaBreached ? (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                Breached
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                                {ticket.slaHoursRemaining ? `${ticket.slaHoursRemaining}h left` : 'On Time'}
                              </span>
                            )}
                          </div>

                          {/* Target Person / Party */}
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {ticket.customer_name ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <User size={12} style={{ color: '#38bdf8' }} />
                                  {ticket.customer_name}
                                </span>
                              ) : (
                                <span>{ticket.party?.firm_name || 'Dealer Partner'}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {ticket.customer_phone ? (
                                <MaskedPhoneDisplay phone={ticket.customer_phone} />
                              ) : ticket.party?.primary_mobile ? (
                                <MaskedPhoneDisplay phone={ticket.party.primary_mobile} />
                              ) : null}
                            </div>
                          </div>

                          {/* Category Badge */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: `${catObj.color || '#6366f1'}20`,
                              color: catObj.color || '#6366f1',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px'
                            }}>
                              {catObj.label || ticket.category}
                            </span>
                            <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                              • {ticket.priority || 'NORMAL'}
                            </span>
                          </div>

                          {/* Issue Description Snippet */}
                          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {ticket.issue_description || 'No description'}
                          </p>

                          {/* Technician Assigned Badge (if C03+) */}
                          {ticket.technician_name && (
                            <div style={{ fontSize: '0.7rem', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Wrench size={11} />
                              <span>Tech: <strong>{ticket.technician_name}</strong></span>
                            </div>
                          )}

                          {/* Card Action Footer */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem', borderTop: '1px solid var(--border-light)' }}>
                            <button
                              type="button"
                              onClick={() => setStageHistoryModal({ isOpen: true, ticket })}
                              title="View Stage History"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem'
                              }}
                            >
                              <Clock size={12} />
                              History
                            </button>

                            {nextSt && (
                              <button
                                type="button"
                                onClick={() => handleOpenAdvanceStage(ticket, nextSt)}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  background: `${nextSt.color}25`,
                                  border: `1px solid ${nextSt.color}`,
                                  color: nextSt.color,
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                <span>Advance ➔</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: TABULAR GRID VIEW */}
      {viewMode === 'table' && (
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                  <th style={{ width: `${columnWidths.ticket_id}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Ticket # &amp; Priority
                    <ColumnResizer onMouseDown={e => startResize('ticket_id', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                  <th style={{ width: `${columnWidths.source_target}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Raised By / Customer / Dealer
                    <ColumnResizer onMouseDown={e => startResize('source_target', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                  <th style={{ width: `${columnWidths.category_dept}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Category &amp; Department
                    <ColumnResizer onMouseDown={e => startResize('category_dept', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                  <th style={{ width: `${columnWidths.stage_sla}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Current Stage &amp; SLA Status
                    <ColumnResizer onMouseDown={e => startResize('stage_sla', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                  <th style={{ width: `${columnWidths.technician}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Assigned Technician
                    <ColumnResizer onMouseDown={e => startResize('technician', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                  <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                    Actions
                    <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No complaint tickets found matching criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedTickets.map(ticket => {
                    const st = resolveTicketStage(ticket);
                    const catObj = DEFAULT_CATEGORIES.find(c => c.id === ticket.category) || {};
                    const nextSt = getNextStage(st.id);

                    return (
                      <tr key={ticket.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <strong style={{ color: 'var(--accent-color, #38bdf8)' }}>#{ticket.ticket_number}</strong>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {formatIST(ticket.created_at)}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {ticket.customer_name ? (
                              <span style={{ color: '#38bdf8' }}>👤 {ticket.customer_name}</span>
                            ) : (
                              <span>🏢 {ticket.party?.firm_name || 'Dealer Partner'}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {ticket.customer_phone || ticket.party?.primary_mobile || '-'}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, background: `${catObj.color || '#6366f1'}20`, color: catObj.color || '#6366f1', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                            {catObj.label || ticket.category}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {ticket.assigned_department}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: st.color, background: `${st.color}20`, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                              {st.id}
                            </span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {st.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', marginTop: '2px' }}>
                            {ticket.isSlaBreached ? (
                              <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠️ SLA Breached</span>
                            ) : (
                              <span style={{ color: '#10b981' }}>✓ On Time</span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          {ticket.technician_name ? (
                            <div>
                              <strong style={{ fontSize: '0.78rem', color: '#c084fc' }}>{ticket.technician_name}</strong>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{ticket.technician_phone || '-'}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Not Deputed</span>
                          )}
                        </td>

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            {nextSt && (
                              <button
                                type="button"
                                onClick={() => handleOpenAdvanceStage(ticket, nextSt)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: '6px',
                                  background: `${nextSt.color}25`,
                                  border: `1px solid ${nextSt.color}`,
                                  color: nextSt.color,
                                  cursor: 'pointer',
                                  fontSize: '0.72rem',
                                  fontWeight: 700
                                }}
                              >
                                Advance ➔
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setStageHistoryModal({ isOpen: true, ticket })}
                              title="View History"
                              style={{
                                background: 'none',
                                border: '1px solid var(--border-light)',
                                borderRadius: '6px',
                                padding: '0.3rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer'
                              }}
                            >
                              <Clock size={14} />
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

          {/* Unified Standard Table Pagination */}
          <StandardTablePagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={filteredTickets.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* VIEW 3: END CUSTOMERS DIRECTORY */}
      {viewMode === 'customers' && (
        <EndCustomerMasterModule
          tenantId={tenantId}
          userRole={userRole}
          userName={userName}
          onNavigateToComplaints={(cust) => {
            setViewMode('pipeline');
            setCreateForm(prev => ({
              ...prev,
              complaint_type: 'END_CUSTOMER',
              customer_id: cust.id,
              customer_name: cust.full_name,
              customer_phone: cust.mobile_1
            }));
            setShowCreateModal(true);
          }}
        />
      )}

      {/* MODAL 1: Log Complaint Ticket Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Log New Complaint Ticket (C01)
                </h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Dual Selector: Channel Partner vs End Customer */}
              <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
                  Complaint Raised By:
                </label>
                <div style={{ display: 'flex', gap: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="comp_type"
                      checked={createForm.complaint_type === 'CHANNEL_PARTNER'}
                      onChange={() => setCreateForm({ ...createForm, complaint_type: 'CHANNEL_PARTNER' })}
                    />
                    <span>🏢 Channel Partner (Dealer / Distributor)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="comp_type"
                      checked={createForm.complaint_type === 'END_CUSTOMER'}
                      onChange={() => setCreateForm({ ...createForm, complaint_type: 'END_CUSTOMER' })}
                    />
                    <span>👤 End Customer</span>
                  </label>
                </div>
              </div>

              {/* Channel Partner Select */}
              {createForm.complaint_type === 'CHANNEL_PARTNER' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Select Channel Partner <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <SearchablePartySelect
                    parties={parties}
                    value={createForm.party_id}
                    onChange={val => setCreateForm({ ...createForm, party_id: val })}
                    placeholder="Search Distributor or Dealer..."
                  />
                </div>
              ) : (
                /* End Customer Select / Register */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Select Registered End Customer <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRegisterCustomerModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-color, #38bdf8)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Register New Customer
                    </button>
                  </div>
                  <select
                    value={createForm.customer_id}
                    onChange={e => {
                      const cust = endCustomers.find(c => c.id === e.target.value);
                      if (cust) {
                        setCreateForm(prev => ({
                          ...prev,
                          customer_id: cust.id,
                          customer_name: cust.full_name,
                          customer_phone: cust.mobile_1,
                          party_id: cust.linked_party_id || ''
                        }));
                      }
                    }}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    <option value="">-- Choose End Customer --</option>
                    {endCustomers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.mobile_1}) - {c.district_name} [Dealer: {c.linked_party_name || 'Direct'}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 8 Categories */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Complaint Category (8 Categories) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={createForm.category}
                  onChange={e => {
                    const catObj = DEFAULT_CATEGORIES.find(c => c.id === e.target.value);
                    setCreateForm(prev => ({
                      ...prev,
                      category: e.target.value,
                      assigned_department: catObj?.dept || prev.assigned_department
                    }));
                  }}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                >
                  {DEFAULT_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label} (SLA: {c.sla})</option>
                  ))}
                </select>
              </div>

              {/* Priority & Assigned Department */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Priority
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={e => setCreateForm({ ...createForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    <option value="CRITICAL">🔴 Critical (P1)</option>
                    <option value="HIGH">🟠 High (P2)</option>
                    <option value="MEDIUM">🟡 Medium (P3)</option>
                    <option value="LOW">🟢 Low (P4)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Assigned Department
                  </label>
                  <select
                    value={createForm.assigned_department}
                    onChange={e => setCreateForm({ ...createForm, assigned_department: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Issue Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Issue Description &amp; Problem Details <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the complaint in detail..."
                  value={createForm.issue_description}
                  onChange={e => setCreateForm({ ...createForm, issue_description: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                />
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'none', color: '#fff', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.84rem' }}
                >
                  {submitting ? 'Logging...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Register End Customer Modal */}
      <RegisterEndCustomerModal
        isOpen={showRegisterCustomerModal}
        onClose={() => setShowRegisterCustomerModal(false)}
        parties={parties}
        tenantId={tenantId}
        onSuccess={newCustomer => {
          setEndCustomers(prev => [newCustomer, ...prev]);
          setCreateForm(prev => ({
            ...prev,
            complaint_type: 'END_CUSTOMER',
            customer_id: newCustomer.id,
            customer_name: newCustomer.full_name,
            customer_phone: newCustomer.mobile_1,
            party_id: newCustomer.linked_party_id || ''
          }));
        }}
      />

      {/* MODAL 3: Complaint Stage Action Modal */}
      <ComplaintStageActionModal
        isOpen={stageActionModal.isOpen}
        onClose={() => setStageActionModal({ isOpen: false, ticket: null, targetStage: null })}
        ticket={stageActionModal.ticket}
        targetStage={stageActionModal.targetStage}
        teamMembers={teamMembers}
        userName={userName}
        userId={userId}
        onSuccess={handleStageActionSuccess}
      />

      {/* MODAL 4: Complaint Stage History Audit Modal */}
      <ComplaintStageHistoryModal
        isOpen={stageHistoryModal.isOpen}
        onClose={() => setStageHistoryModal({ isOpen: false, ticket: null })}
        ticket={stageHistoryModal.ticket}
      />
    </div>
  );
}
