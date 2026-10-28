'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Package, Truck, CheckCircle2, Clock, AlertTriangle, Search, Filter,
  RefreshCw, ChevronRight, FileText, ExternalLink, Calendar, MapPin,
  Edit3, Ban, ArrowRight, Sparkles, Building2, Layers, Lock, ShieldCheck, UserCheck, History
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { getOrderPipelineConfig } from '@/app/actions/orderPipelineConfig';
import { getSubItemPermissions, checkIsAdminRole } from '@/utils/permissionUtils';
import StandardTablePagination from '../common/StandardTablePagination';
import DateRangePicker from '../common/DateRangePicker';
import OrderRevisionModal from './modals/OrderRevisionModal';
import CancelOrderModal from './modals/CancelOrderModal';
import StageActionModal from './modals/StageActionModal';
import OrderStageHistoryModal from './modals/OrderStageHistoryModal';

// Master 13 Stages Baseline Fallback
const DEFAULT_13_STAGES = [
  { id: 'S01', step_no: 1, name: 'Order Confirmation', short_code: 'CONFIRMED', department: 'Sales / Order Desk', tat_hours: 4, color: '#3b82f6', is_enabled: true },
  { id: 'S02', step_no: 2, name: 'PI Generation', short_code: 'PI_GENERATED', department: 'Accounts / Billing', tat_hours: 2, color: '#6366f1', is_enabled: true },
  { id: 'S03', step_no: 3, name: 'PI Shared', short_code: 'PI_SHARED', department: 'Sales / Coordination', tat_hours: 2, color: '#8b5cf6', is_enabled: true },
  { id: 'S04', step_no: 4, name: 'Request Advance Payment', short_code: 'ADVANCE_REQUESTED', department: 'Accounts & Sales', tat_hours: 4, color: '#ec4899', is_enabled: true },
  { id: 'S05', step_no: 5, name: 'Receive Advance Payment', short_code: 'ADVANCE_RECEIVED', department: 'Accounts Team', tat_hours: 24, color: '#14b8a6', is_enabled: true },
  { id: 'S06', step_no: 6, name: 'Check Stock & Production', short_code: 'IN_PRODUCTION', department: 'Plant / Works', tat_hours: 48, color: '#f59e0b', is_enabled: true },
  { id: 'S07', step_no: 7, name: 'Product Partial & Full Status', short_code: 'BATCH_READINESS', department: 'Plant Floor Supervisor', tat_hours: 12, color: '#d97706', is_enabled: true },
  { id: 'S08', step_no: 8, name: 'Quality Check (PDI)', short_code: 'PDI_PASSED', department: 'Quality Assurance (QC)', tat_hours: 8, color: '#10b981', is_enabled: true },
  { id: 'S09', step_no: 9, name: 'Request 70% Balance', short_code: 'BALANCE_REQUESTED', department: 'Accounts & Sales', tat_hours: 4, color: '#8b5cf6', is_enabled: true },
  { id: 'S10', step_no: 10, name: 'Receive 70% Balance', short_code: 'BALANCE_RECEIVED', department: 'Accounts Team', tat_hours: 24, color: '#059669', is_enabled: true },
  { id: 'S11', step_no: 11, name: 'Ready for Dispatch', short_code: 'READY_FOR_DISPATCH', department: 'Godown / Logistics', tat_hours: 6, color: '#0284c7', is_enabled: true },
  { id: 'S12', step_no: 12, name: 'Dispatch Material', short_code: 'DISPATCHED', department: 'Gate & Logistics', tat_hours: 12, color: '#ea580c', is_enabled: true },
  { id: 'S13', step_no: 13, name: 'Material Delivered (POD)', short_code: 'DELIVERED', department: 'Customer Support', tat_hours: 48, color: '#15803d', is_enabled: true }
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

// Stage resolver helper
function resolveOrderStage(order, stages = []) {
  if (order.order_status === 'CANCELLED' || order.delivery_status === 'CANCELLED') {
    return { id: 'CANCELLED', name: 'Order Cancelled', color: '#ef4444', is_cancelled: true };
  }

  const raw = order.delivery_status || 'S01';
  const direct = stages.find(s => s.id === raw);
  if (direct) return direct;

  // Legacy status mapping
  if (raw === 'PUNCHED') return stages.find(s => s.id === 'S01') || stages[0];
  if (raw === 'CONFIRMED') return stages.find(s => s.id === 'S02') || stages[1];
  if (raw === 'PROCESSING') return stages.find(s => s.id === 'S06') || stages[5];
  if (raw === 'DISPATCHED') return stages.find(s => s.id === 'S12') || stages[11];
  if (raw === 'DELIVERED') return stages.find(s => s.id === 'S13') || stages[12];

  return stages[0] || DEFAULT_13_STAGES[0];
}

// Next stage resolver
function getNextStage(currentStage, stages, order, allOrders = []) {
  if (!currentStage || currentStage.id === 'CANCELLED') return null;
  const activeStages = stages.filter(s => s.is_enabled !== false);
  const currentIndex = activeStages.findIndex(s => s.id === currentStage.id);
  if (currentIndex === -1 || currentIndex >= activeStages.length - 1) return null;

  // Check if 100% payment credited (or inherited from parent order for Lot-B)
  const isParentFullPaid = Boolean(
    order?.order_number?.endsWith('-B') &&
    Array.isArray(allOrders) &&
    (() => {
      const parentNum = order.order_number.replace(/-B$/, '');
      const parent = allOrders.find(o => o.order_number === parentNum);
      return parent && (
        parent.order_status === 'FULL_PAID' || 
        (Array.isArray(parent.stage_history) && parent.stage_history.some(h => (h.stage_id === 'S05' || h.delivery_status === 'S05_ADVANCE_RECEIVED') && h.custom_fields_data?.is_100_percent_paid))
      );
    })()
  );

  const isFullPaid = order.order_status === 'FULL_PAID' || 
    isParentFullPaid ||
    (Array.isArray(order.stage_history) && order.stage_history.some(h => (h.stage_id === 'S05' || h.delivery_status === 'S05_ADVANCE_RECEIVED') && h.custom_fields_data?.is_100_percent_paid));

  if (isFullPaid && currentStage.id === 'S08') {
    const s11 = activeStages.find(s => s.id === 'S11');
    if (s11) return s11;
  }

  return activeStages[currentIndex + 1];
}

// SLA & TAT status calculator
function computeOrderSLA(order, currentStage) {
  if (order.order_status === 'CANCELLED') {
    return { status: 'CANCELLED', badge: 'Cancelled', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
  }
  if (currentStage.id === 'S13' || order.delivery_status === 'DELIVERED') {
    return { status: 'COMPLETED', badge: 'Delivered', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  }

  const tatHours = Number(currentStage.tat_hours) || 4;
  const history = Array.isArray(order.stage_history) ? order.stage_history : [];
  const lastEntry = history[history.length - 1];

  const baseDate = lastEntry?.actual_timestamp ? new Date(lastEntry.actual_timestamp) : new Date(order.created_at || Date.now());
  const plannedDeadline = new Date(baseDate.getTime() + (tatHours * 60 * 60 * 1000));
  const now = new Date();

  if (now.getTime() > plannedDeadline.getTime()) {
    const hoursOver = Math.round((now.getTime() - plannedDeadline.getTime()) / (1000 * 60 * 60));
    return {
      status: 'BREACHED',
      badge: `Overdue (+${hoursOver}h)`,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      deadlineFormatted: formatIST(plannedDeadline)
    };
  } else {
    const hoursRemaining = Math.max(0, Math.round((plannedDeadline.getTime() - now.getTime()) / (1000 * 60 * 60)));
    return {
      status: 'ON_TIME',
      badge: `On Time (${hoursRemaining}h left)`,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      deadlineFormatted: formatIST(plannedDeadline)
    };
  }
}

// 3-Tier Stage Execution Authorization
function checkCanUserExecuteStage({
  stage,
  userRole = '',
  userId = '',
  moduleAccess = null
}) {
  const isAdmin = checkIsAdminRole(userRole);
  if (isAdmin) {
    return { allowed: true, reason: 'Admin Access' };
  }

  if (!stage) {
    return { allowed: false, reason: 'Invalid Stage' };
  }

  // 0. Granular Stage Permission (S01..S13 from Permission Matrix)
  const stageKey = (stage.id || '').toLowerCase();
  const granularPerm = getSubItemPermissions(moduleAccess, userRole, 'channel_ops', stageKey);
  if (granularPerm && granularPerm.view === false) {
    return { allowed: false, reason: `View access to ${stage.id} denied in Permission Matrix` };
  }
  if (granularPerm && (granularPerm.edit || granularPerm.add)) {
    return { allowed: true, reason: `Permission Matrix (${stage.id} Edit Access)` };
  }

  // 1. Specific Assigned Incharge
  if (stage.assigned_emp_id) {
    if (userId && String(userId) === String(stage.assigned_emp_id)) {
      return { allowed: true, reason: 'Assigned Stage Incharge' };
    }
    return {
      allowed: false,
      reason: `Restricted to Stage Incharge (${stage.assigned_emp_name || 'Assigned Staff'})`
    };
  }

  // 2. Authorized Roles
  const roles = Array.isArray(stage.authorized_roles) ? stage.authorized_roles : [];
  if (roles.length > 0) {
    const rLower = String(userRole || '').trim().toLowerCase();
    const roleMatches = roles.some(r => {
      const target = String(r || '').toLowerCase().trim();
      if (rLower === target) return true;
      if (target === 'accounts_team' && rLower.includes('account')) return true;
      if (target === 'sales_coordinator' && rLower.includes('sales')) return true;
      if (target === 'plant_supervisor' && (rLower.includes('plant') || rLower.includes('work'))) return true;
      if (target === 'quality_assurance' && (rLower.includes('qc') || rLower.includes('quality'))) return true;
      if (target === 'logistics_incharge' && (rLower.includes('logistics') || rLower.includes('dispatch'))) return true;
      return false;
    });
    if (roleMatches) {
      return { allowed: true, reason: 'Authorized Role' };
    }
    return {
      allowed: false,
      reason: `Restricted to authorized roles: ${roles.join(', ')}`
    };
  }

  // 3. Open Fallback: Both blank -> Governed directly by Permission Matrix (Edit/Add)
  const subPerms = getSubItemPermissions(moduleAccess, userRole, 'channel_ops', 'order_pipeline');
  if (subPerms && (subPerms.edit || subPerms.add)) {
    return { allowed: true, reason: 'Permission Matrix (Edit Access)' };
  }

  return {
    allowed: false,
    reason: 'Permission Matrix Edit permission required'
  };
}

export default function OrderDeliveryPipeline({
  orders = [],
  loading = false,
  onRefresh,
  tenantId = 'TNT00002',
  userCompany = 'New Swan Group',
  userName = 'Operations',
  userRole = '',
  userId = '',
  moduleAccess = null
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Quick Date Presets State (Strict IST)
  const [pipelineDatePreset, setPipelineDatePreset] = useState('all');
  const [pipelineStartDate, setPipelineStartDate] = useState('');
  const [pipelineEndDate, setPipelineEndDate] = useState('');

  const handleDateRangeChange = ({ preset, startDate, endDate }) => {
    setPipelineDatePreset(preset);
    setPipelineStartDate(startDate);
    setPipelineEndDate(endDate);
    setCurrentPage(1);
  };

  // Active Pipeline Config loaded from backend
  const [pipelineConfig, setPipelineConfig] = useState(null);
  const [stages, setStages] = useState(DEFAULT_13_STAGES);

  // Modals state
  const [modifyingOrder, setModifyingOrder] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [historyOrder, setHistoryOrder] = useState(null);
  const [stageActionState, setStageActionState] = useState({
    isOpen: false,
    order: null,
    targetStage: null
  });

  // Table Column Resizer
  const defaultCols = {
    order_no: 160,
    partner: 220,
    line_items: 220,
    stage: 200,
    sla_tat: 180,
    logistics: 200,
    actions: 180
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('order_pipeline_table_v2', defaultCols);

  // Load active pipeline configuration
  const loadConfig = useCallback(async () => {
    try {
      const res = await getOrderPipelineConfig(tenantId, 'All Branches');
      if (res.success && res.config) {
        setPipelineConfig(res.config);
        if (Array.isArray(res.config.stages) && res.config.stages.length > 0) {
          setStages(res.config.stages);
        }
      }
    } catch (_) {
      setStages(DEFAULT_13_STAGES);
    }
  }, [tenantId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Handle Action Triggers
  const handleOpenModify = (order) => setModifyingOrder(order);
  const handleOpenCancel = (order) => setCancellingOrder(order);
  const handleOpenAdvance = (order, targetStage) => {
    setStageActionState({
      isOpen: true,
      order,
      targetStage
    });
  };

  const handleModalSuccess = () => {
    if (onRefresh) onRefresh();
  };

  // Granular Stage Access Permissions
  const allOrdersPerm = useMemo(() => {
    return getSubItemPermissions(moduleAccess, userRole, 'channel_ops', 'all_orders');
  }, [moduleAccess, userRole]);

  // Permitted stages that the user can view
  const visibleStages = useMemo(() => {
    const isAdmin = checkIsAdminRole(userRole);
    if (isAdmin) return stages;
    return stages.filter(st => {
      const p = getSubItemPermissions(moduleAccess, userRole, 'channel_ops', st.id.toLowerCase());
      return p.view !== false;
    });
  }, [stages, moduleAccess, userRole]);

  // If user does not have All Orders access and currently stageFilter is 'ALL', default to their first visible stage
  useEffect(() => {
    const isAdmin = checkIsAdminRole(userRole);
    if (!isAdmin && allOrdersPerm.view === false && stageFilter === 'ALL' && visibleStages.length > 0) {
      setStageFilter(visibleStages[0].id);
    }
  }, [allOrdersPerm.view, stageFilter, visibleStages, userRole]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const isAdmin = checkIsAdminRole(userRole);

    return orders.filter(order => {
      // Date range filter in IST Asia/Kolkata
      if (pipelineDatePreset !== 'all' && (pipelineStartDate || pipelineEndDate)) {
        if (!order.created_at) return false;
        try {
          const orderDateIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(order.created_at));
          if (pipelineStartDate && orderDateIST < pipelineStartDate) return false;
          if (pipelineEndDate && orderDateIST > pipelineEndDate) return false;
        } catch (_) {
          const isoDate = String(order.created_at).slice(0, 10);
          if (pipelineStartDate && isoDate < pipelineStartDate) return false;
          if (pipelineEndDate && isoDate > pipelineEndDate) return false;
        }
      }

      const resolvedStage = resolveOrderStage(order, stages);

      // If user does not have All Orders permission, they only see orders for their permitted stages
      if (!isAdmin && allOrdersPerm.view === false) {
        if (!visibleStages.some(vs => vs.id === resolvedStage.id)) {
          return false;
        }
      }

      if (stageFilter !== 'ALL' && resolvedStage.id !== stageFilter) {
        return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (order.order_number || '').toLowerCase();
      const firm = (order.party?.firm_name || '').toLowerCase();
      const lr = (order.lr_number || '').toLowerCase();
      const veh = (order.vehicle_number || '').toLowerCase();
      const trans = (order.transporter_name || '').toLowerCase();
      const owner = (order.party?.owner_name || '').toLowerCase();

      return num.includes(term) || firm.includes(term) || lr.includes(term) || veh.includes(term) || trans.includes(term) || owner.includes(term);
    });
  }, [orders, stageFilter, searchTerm, stages, userRole, allOrdersPerm.view, visibleStages, pipelineDatePreset, pipelineStartDate, pipelineEndDate]);

  // Auto-reset page on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stageFilter, pageSize, pipelineDatePreset, pipelineStartDate, pipelineEndDate]);

  const paginatedOrders = useMemo(() => {
    if (pageSize === 100000) return filteredOrders;
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Stage counts for progress strip
  const stageCounts = useMemo(() => {
    const map = { ALL: 0, CANCELLED: 0 };
    stages.forEach(st => { map[st.id] = 0; });

    orders.forEach(o => {
      // Date filter check
      if (pipelineDatePreset !== 'all' && (pipelineStartDate || pipelineEndDate)) {
        if (!o.created_at) return;
        try {
          const oDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(o.created_at));
          if (pipelineStartDate && oDate < pipelineStartDate) return;
          if (pipelineEndDate && oDate > pipelineEndDate) return;
        } catch (_) {
          const isoDate = String(o.created_at).slice(0, 10);
          if (pipelineStartDate && isoDate < pipelineStartDate) return;
          if (pipelineEndDate && isoDate > pipelineEndDate) return;
        }
      }

      map.ALL++;
      const st = resolveOrderStage(o, stages);
      if (st.is_cancelled) {
        map.CANCELLED++;
      } else if (map[st.id] !== undefined) {
        map[st.id]++;
      }
    });
    return map;
  }, [orders, stages, pipelineDatePreset, pipelineStartDate, pipelineEndDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* 13-Stage Visual Progress Bar Strip */}
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
        {/* All Orders Tab (Rendered if user has all_orders view or is Admin) */}
        {(checkIsAdminRole(userRole) || allOrdersPerm.view !== false) && (
          <div
            onClick={() => setStageFilter('ALL')}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              background: stageFilter === 'ALL' ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
              color: stageFilter === 'ALL' ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <span>All Orders</span>
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
        )}

        {visibleStages.map(st => {
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
                color: isSelected ? st.color : 'var(--text-primary)'
              }}>
                {st.name}
              </span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '0.1rem 0.4rem',
                borderRadius: '10px',
                background: isSelected ? st.color : 'var(--border-light)',
                color: isSelected ? '#ffffff' : 'var(--text-secondary)'
              }}>
                {count}
              </span>
            </div>
          );
        })}

        {stageCounts.CANCELLED > 0 && (
          <div
            onClick={() => setStageFilter(stageFilter === 'CANCELLED' ? 'ALL' : 'CANCELLED')}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              background: stageFilter === 'CANCELLED' ? 'rgba(239,68,68,0.2)' : 'var(--bg-primary)',
              border: stageFilter === 'CANCELLED' ? '2px solid #ef4444' : '1px solid var(--border-light)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#ef4444' }}>
              Cancelled
            </span>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.1rem 0.4rem',
              borderRadius: '10px',
              background: '#ef4444',
              color: '#ffffff'
            }}>
              {stageCounts.CANCELLED}
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px', maxWidth: '440px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Order #, Partner, City, Transporter, LR/Bilty..."
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
          {/* Quick Date Presets Dropdown */}
          <DateRangePicker
            preset={pipelineDatePreset}
            startDate={pipelineStartDate}
            endDate={pipelineEndDate}
            allowAllTime={true}
            title="Filter Order Pipeline by Date"
            onChange={handleDateRangeChange}
          />

          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Stages ({stageCounts.ALL})</option>
            {stages.map(s => (
              <option key={s.id} value={s.id}>{s.id} — {s.name} ({stageCounts[s.id] || 0})</option>
            ))}
            <option value="CANCELLED">Cancelled Orders ({stageCounts.CANCELLED || 0})</option>
          </select>

          <button
            type="button"
            onClick={onRefresh}
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
        </div>
      </div>

      {/* Orders Table with Resizable Columns and Sticky Header */}
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
                <th style={{ width: `${columnWidths.order_no}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Order # / Date
                  <ColumnResizer onMouseDown={e => startResize('order_no', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.line_items}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Products &amp; Amount
                  <ColumnResizer onMouseDown={e => startResize('line_items', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.stage}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Current Stage
                  <ColumnResizer onMouseDown={e => startResize('stage', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.sla_tat}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  SLA TAT &amp; Deadline
                  <ColumnResizer onMouseDown={e => startResize('sla_tat', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.logistics}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Logistics &amp; Dispatch
                  <ColumnResizer onMouseDown={e => startResize('logistics', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Stage Actions
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No sales orders found in this view.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(order => {
                  const p = order.party;
                  const currentStage = resolveOrderStage(order, stages);
                  const nextStage = getNextStage(currentStage, stages, order, orders);
                  const sla = computeOrderSLA(order, currentStage);
                  const items = Array.isArray(order.order_line_items) ? order.order_line_items : [];

                  const isFullPaidOrder = order.order_status === 'FULL_PAID' ||
                    (Array.isArray(order.stage_history) && order.stage_history.some(h => (h.stage_id === 'S05' || h.delivery_status === 'S05_ADVANCE_RECEIVED') && h.custom_fields_data?.is_100_percent_paid)) ||
                    Boolean(order.order_number?.endsWith('-B') && orders.some(o => o.order_number === order.order_number.replace(/-B$/, '') && (o.order_status === 'FULL_PAID' || (Array.isArray(o.stage_history) && o.stage_history.some(h => (h.stage_id === 'S05' || h.delivery_status === 'S05_ADVANCE_RECEIVED') && h.custom_fields_data?.is_100_percent_paid)))));

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      {/* Order # */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>
                          {order.order_number}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          📅 {formatIST(order.created_at)}
                        </div>
                        {order.order_number?.endsWith('-B') ? (
                          <div style={{ marginTop: '0.2rem' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
                              LOT-B (IN ASSEMBLY)
                            </span>
                          </div>
                        ) : (Array.isArray(order.stage_history) && order.stage_history.some(h => h.stage_id === 'PARTIAL_LOT_DISPATCH')) ? (
                          <div style={{ marginTop: '0.2rem' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(37,99,235,0.12)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.25)' }}>
                              LOT-A DISPATCH
                            </span>
                          </div>
                        ) : null}
                        {isFullPaidOrder && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                              100% ADVANCE
                            </span>
                          </div>
                        )}
                        <div style={{ marginTop: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => setHistoryOrder(order)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#0284c7',
                              fontSize: '0.71rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="View stage history, SLA performance and full audit timeline"
                          >
                            <History size={12} />
                            <span>Stage History</span>
                          </button>
                        </div>
                      </td>

                      {/* Partner */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                          {p?.firm_name || 'Channel Partner'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {p?.owner_name} • {p?.district_name || p?.city}, {p?.state_name}
                        </div>
                      </td>

                      {/* Products & Amount */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.88rem' }}>
                          ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          {items.length === 0 ? (
                            <span>{order.total_ordered_qty || 1} Unit(s)</span>
                          ) : (
                            items.slice(0, 2).map((it, idx) => (
                              <div key={idx}>• {it.product || it.name} ({it.qty || 1}x)</div>
                            ))
                          )}
                          {items.length > 2 && <div>+{items.length - 2} more...</div>}
                        </div>
                      </td>

                      {/* Current Stage */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          background: `${currentStage.color || '#3b82f6'}20`,
                          color: currentStage.color || '#3b82f6',
                          border: `1px solid ${currentStage.color || '#3b82f6'}40`
                        }}>
                          {currentStage.id} — {currentStage.name}
                        </span>
                        {currentStage.assigned_emp_name ? (
                          <div style={{ fontSize: '0.71rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
                            👤 {currentStage.assigned_emp_name}
                          </div>
                        ) : (Array.isArray(currentStage.authorized_roles) && currentStage.authorized_roles.length > 0) ? (
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            👥 {currentStage.authorized_roles.slice(0, 2).join(', ')}{currentStage.authorized_roles.length > 2 ? '...' : ''}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            {currentStage.department || 'Open / Matrix'}
                          </div>
                        )}
                      </td>

                      {/* SLA TAT & Deadline */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          background: sla.bg,
                          color: sla.color
                        }}>
                          {sla.badge}
                        </span>
                        {sla.deadlineFormatted && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            Target: {sla.deadlineFormatted}
                          </div>
                        )}
                      </td>

                      {/* Logistics & Dispatch */}
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.78rem' }}>
                        {order.transporter_name || order.lr_number ? (
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              🚛 {order.transporter_name || 'Transporter'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              LR: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{order.lr_number || '-'}</span>
                            </div>
                            {order.vehicle_number && (
                              <div style={{ color: 'var(--text-secondary)' }}>
                                Veh: {order.vehicle_number}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            Not dispatched yet
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {(() => {
                          if (currentStage.is_cancelled) {
                            return (
                              <span style={{ fontSize: '0.76rem', color: '#ef4444', fontWeight: 800 }}>
                                Cancelled
                              </span>
                            );
                          }

                          const currentAuth = checkCanUserExecuteStage({ stage: currentStage, userRole, userId, moduleAccess });
                          const nextAuth = nextStage
                            ? checkCanUserExecuteStage({ stage: nextStage, userRole, userId, moduleAccess })
                            : { allowed: false, reason: 'Completed' };
                          const canAdvance = currentAuth.allowed || nextAuth.allowed;

                          if (currentStage.id === 'S01') {
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                  <button
                                    type="button"
                                    disabled={!currentAuth.allowed}
                                    onClick={() => currentAuth.allowed && handleOpenModify(order)}
                                    title={currentAuth.allowed ? 'Modify Line Items / Quantities / Rates' : `Locked: ${currentAuth.reason}`}
                                    style={{
                                      padding: '0.3rem 0.55rem',
                                      background: currentAuth.allowed ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-primary)',
                                      border: currentAuth.allowed ? '1px solid #38bdf8' : '1px solid var(--border-light)',
                                      color: currentAuth.allowed ? '#0284c7' : 'var(--text-secondary)',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      cursor: currentAuth.allowed ? 'pointer' : 'not-allowed',
                                      opacity: currentAuth.allowed ? 1 : 0.6,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem'
                                    }}
                                  >
                                    {!currentAuth.allowed ? <Lock size={11} /> : <Edit3 size={12} />}
                                    Modify
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!currentAuth.allowed}
                                    onClick={() => currentAuth.allowed && handleOpenCancel(order)}
                                    title={currentAuth.allowed ? 'Cancel Sales Order' : `Locked: ${currentAuth.reason}`}
                                    style={{
                                      padding: '0.3rem 0.55rem',
                                      background: currentAuth.allowed ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-primary)',
                                      border: currentAuth.allowed ? '1px solid #ef4444' : '1px solid var(--border-light)',
                                      color: currentAuth.allowed ? '#ef4444' : 'var(--text-secondary)',
                                      borderRadius: '6px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      cursor: currentAuth.allowed ? 'pointer' : 'not-allowed',
                                      opacity: currentAuth.allowed ? 1 : 0.6,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem'
                                    }}
                                  >
                                    {!currentAuth.allowed ? <Lock size={11} /> : <Ban size={12} />}
                                    Cancel
                                  </button>
                                </div>

                                {nextStage && (
                                  <button
                                    type="button"
                                    disabled={!canAdvance}
                                    onClick={() => canAdvance && handleOpenAdvance(order, nextStage)}
                                    title={canAdvance ? `Confirm & Advance to ${nextStage.name} (${nextStage.id})` : `Locked: ${nextAuth.reason || currentAuth.reason}`}
                                    style={{
                                      width: '100%',
                                      padding: '0.35rem 0.65rem',
                                      background: canAdvance ? '#2563eb' : '#64748b',
                                      border: 'none',
                                      color: '#ffffff',
                                      borderRadius: '6px',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      cursor: canAdvance ? 'pointer' : 'not-allowed',
                                      opacity: canAdvance ? 1 : 0.65,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '0.3rem'
                                    }}
                                  >
                                    {!canAdvance && <Lock size={12} />}
                                    Confirm ➔ {nextStage.name} ({nextStage.id})
                                  </button>
                                )}
                              </div>
                            );
                          }

                          if (nextStage) {
                            return (
                              <button
                                type="button"
                                disabled={!canAdvance}
                                onClick={() => canAdvance && handleOpenAdvance(order, nextStage)}
                                title={canAdvance ? `Confirm & Move to ${nextStage.name} (${nextStage.id})` : `Locked: ${nextAuth.reason || currentAuth.reason}`}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  background: canAdvance ? (nextStage.color || '#2563eb') : '#64748b',
                                  border: 'none',
                                  color: '#ffffff',
                                  borderRadius: '6px',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: canAdvance ? 'pointer' : 'not-allowed',
                                  opacity: canAdvance ? 1 : 0.65,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  boxShadow: canAdvance ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                              >
                                {!canAdvance && <Lock size={12} />}
                                <span>Confirm ➔ {nextStage.name} ({nextStage.id})</span>
                              </button>
                            );
                          }

                          if (currentStage.id === 'S13') {
                            return (
                              <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 800 }}>
                                ✓ Complete
                              </span>
                            );
                          }

                          return null;
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Standard Table Pagination Footer */}
        <StandardTablePagination
          currentPage={currentPage}
          totalRecords={filteredOrders.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* S01 Order Revision Modal */}
      {modifyingOrder && (
        <OrderRevisionModal
          isOpen={!!modifyingOrder}
          order={modifyingOrder}
          onClose={() => setModifyingOrder(null)}
          onSuccess={handleModalSuccess}
          userName={userName}
          tenantId={tenantId}
        />
      )}

      {/* S01 Order Cancellation Modal */}
      {cancellingOrder && (
        <CancelOrderModal
          isOpen={!!cancellingOrder}
          order={cancellingOrder}
          onClose={() => setCancellingOrder(null)}
          onSuccess={handleModalSuccess}
          userName={userName}
          tenantId={tenantId}
        />
      )}

      {/* Stage Progression Action Modal (Dynamic Fields) */}
      {stageActionState.isOpen && stageActionState.order && stageActionState.targetStage && (
        <StageActionModal
          isOpen={stageActionState.isOpen}
          order={stageActionState.order}
          targetStage={stageActionState.targetStage}
          onClose={() => setStageActionState({ isOpen: false, order: null, targetStage: null })}
          onSuccess={handleModalSuccess}
          userName={userName}
          tenantId={tenantId}
          tatMode={pipelineConfig?.tat_mode || 'DYNAMIC'}
          allowPartialSplit={
            pipelineConfig?.allow_partial_split_lots !== false &&
            !stageActionState.order?.order_number?.endsWith('-B')
          }
          autoSkipBalanceOnFullAdvance={pipelineConfig?.auto_skip_balance_on_full_advance !== false}
        />
      )}

      {/* Order Stage History & SLA Audit Modal */}
      {historyOrder && (
        <OrderStageHistoryModal
          isOpen={!!historyOrder}
          order={historyOrder}
          onClose={() => setHistoryOrder(null)}
          masterStages={stages}
        />
      )}
    </div>
  );
}
