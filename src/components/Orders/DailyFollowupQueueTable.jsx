'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, MessageSquare, Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, Building2, Package, Calendar, ArrowRight, Shield, Sparkles, User,
  History, ListOrdered, TrendingUp, Check, X, PhoneCall, PhoneOff, CalendarClock
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import {
  saveOrderFollowupAndRecur,
  getPartyCallHistory,
  getDailyCallLogLedger
} from '@/app/actions/orderFulfillment';
import { getTenantProducts } from '@/app/actions/tenantProducts';
import { formatISTDateTime, formatISTShortDate } from '@/utils/orderFrequency';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';

export default function DailyFollowupQueueTable({
  queue = [],
  loading = false,
  onRefresh,
  tenantId,
  userCompany,
  userName = 'Admin',
  userId = null
}) {
  // Top View Toggle: 'QUEUE' | 'LEDGER'
  const [viewMode, setViewMode] = useState('QUEUE');

  // Filters for Queue
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('DUE_TODAY');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Ledger State
  const [todayLedger, setTodayLedger] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerOutcomeFilter, setLedgerOutcomeFilter] = useState('ALL');

  // Party History Drawer State
  const [historyParty, setHistoryParty] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Dynamic Products Synced from Settings (tenant_products)
  const [availableProducts, setAvailableProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadSettingsProducts() {
      setLoadingProducts(true);
      try {
        const prods = await getTenantProducts(userCompany || tenantId || 'New Swan Group');
        if (isMounted && Array.isArray(prods) && prods.length > 0) {
          const activeOnly = prods.filter(p => p.is_active !== false);
          setAvailableProducts(activeOnly.length > 0 ? activeOnly : prods);
        }
      } catch (err) {
        console.warn('Error loading settings products for daily queue:', err);
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    }
    loadSettingsProducts();
    return () => { isMounted = false; };
  }, [userCompany, tenantId]);

  // Load Today's Call Log Ledger
  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const logs = await getDailyCallLogLedger(tenantId);
      setTodayLedger(logs || []);
    } catch (err) {
      console.warn('Error loading daily call log ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Open History Drawer
  const openHistoryDrawer = async (partyItem) => {
    setHistoryParty(partyItem);
    setLoadingHistory(true);
    try {
      const logs = await getPartyCallHistory(partyItem.party_id, tenantId);
      setHistoryLogs(logs || []);
    } catch (err) {
      console.error('Error fetching party history:', err);
      setHistoryLogs([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Call / Order Modal State
  const [selectedParty, setSelectedParty] = useState(null);
  const [callOutcome, setCallOutcome] = useState('ORDER_PLACED');
  const [orderItems, setOrderItems] = useState([
    { product: PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)', qty: 1, rate: 0 }
  ]);
  const [billingRoute, setBillingRoute] = useState('DIRECT_COMPANY_BILLING');
  const [preferredDispatchDate, setPreferredDispatchDate] = useState('');
  
  // Outcome specific fields
  const [noOrderReason, setNoOrderReason] = useState('STOCK_FULL');
  const [nextRequirementDate, setNextRequirementDate] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('11:00 AM - 01:00 PM');
  const [unreachableSubReason, setUnreachableSubReason] = useState('RINGING_NO_ANSWER');
  const [unreachableRetryOption, setUnreachableRetryOption] = useState('RETRY_2_HOURS');
  const [callNotes, setCallNotes] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Table Column Resizer
  const defaultCols = {
    code_tier: 160,
    firm_contact: 240,
    location: 150,
    frequency: 150,
    due_status: 150,
    last_interaction: 240,
    actions: 170
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('daily_queue_table_widths_v2', defaultCols);

  const openCallModal = (partyItem, defaultOutcome = 'ORDER_PLACED') => {
    setSelectedParty(partyItem);
    setCallOutcome(defaultOutcome);
    setFeedbackSuccess('');
    const firstProd = availableProducts[0];
    const initialProductName = firstProd?.name || PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)';
    const initialRate = firstProd?.price ? Number(firstProd.price) : 0;
    setOrderItems([
      { product: initialProductName, qty: 1, rate: initialRate }
    ]);
    setBillingRoute(partyItem.party?.billing_route_type || 'DIRECT_COMPANY_BILLING');
    setPreferredDispatchDate('');
    setNoOrderReason('STOCK_FULL');
    setNextRequirementDate('');
    setRescheduleDate('');
    setRescheduleTimeSlot('11:00 AM - 01:00 PM');
    setUnreachableSubReason('RINGING_NO_ANSWER');
    setUnreachableRetryOption('RETRY_2_HOURS');
    setCallNotes('');
  };

  const handleAddItem = () => {
    const firstProd = availableProducts[0];
    const initialProductName = firstProd?.name || PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)';
    const initialRate = firstProd?.price ? Number(firstProd.price) : 0;
    setOrderItems([...orderItems, { product: initialProductName, qty: 1, rate: initialRate }]);
  };

  const handleRemoveItem = (index) => {
    if (orderItems.length <= 1) return;
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...orderItems];
    updated[index][field] = value;
    if (field === 'product') {
      const matched = availableProducts.find(p => p.name === value);
      if (matched && matched.price !== undefined && matched.price !== null) {
        updated[index].rate = Number(matched.price) || 0;
      }
    }
    setOrderItems(updated);
  };

  const handleSubmitCall = async (e) => {
    e.preventDefault();
    if (!selectedParty) return;
    setSaving(true);
    try {
      const isOrder = callOutcome === 'ORDER_PLACED';
      const totalQty = orderItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
      const totalAmount = orderItems.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);

      // Determine notes and reason based on disposition
      let resolvedReason = '';
      if (callOutcome === 'NO_ORDER') {
        resolvedReason = noOrderReason + (nextRequirementDate ? ` (Req by: ${nextRequirementDate})` : '');
      } else if (callOutcome === 'UNREACHABLE') {
        resolvedReason = unreachableSubReason + ` [Action: ${unreachableRetryOption}]`;
      }

      let resolvedRescheduledTime = null;
      if (callOutcome === 'RESCHEDULED' && rescheduleDate) {
        resolvedRescheduledTime = `${rescheduleDate} (${rescheduleTimeSlot})`;
      }

      const res = await saveOrderFollowupAndRecur({
        party_id: selectedParty.party_id,
        call_status: callOutcome,
        assigned_caller_name: userName || 'Admin',
        assigned_caller_id: userId || null,
        product: orderItems[0]?.product,
        qty: totalQty,
        total_amount: totalAmount,
        order_line_items: orderItems,
        billing_route: billingRoute,
        preferred_dispatch_date: preferredDispatchDate || null,
        next_followup_date: (callOutcome === 'RESCHEDULED' && rescheduleDate) ? rescheduleDate : null,
        no_order_reason: resolvedReason,
        rescheduled_time: resolvedRescheduledTime,
        notes: callNotes
      }, tenantId);

      if (res.success) {
        setFeedbackSuccess(
          isOrder
            ? `✓ Order punched successfully! Generated Order #${res.generated_order_no}. Next frequency cycle auto-scheduled.`
            : `✓ Call recorded! Next follow-up auto-scheduled.`
        );
        if (onRefresh) onRefresh();
        loadLedger();
        setTimeout(() => {
          setSelectedParty(null);
          setFeedbackSuccess('');
        }, 1200);
      } else {
        alert('Failed to save follow-up: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error recording call: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered queue
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const filteredQueue = useMemo(() => {
    return queue.filter(item => {
      const p = item.party;
      if (!p) return false;

      if (tierFilter !== 'ALL' && (p.party_type || '').toLowerCase() !== tierFilter.toLowerCase()) return false;

      if (statusFilter === 'DUE_TODAY' && item.next_due_date !== todayStr) return false;
      if (statusFilter === 'OVERDUE' && item.next_due_date >= todayStr) return false;
      if (statusFilter === 'COMPLETED_TODAY' && !item.isCompletedToday) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const code = (p.distributor_code || p.dealer_code || p.party_universal_code || '').toLowerCase();
      const firm = (p.firm_name || '').toLowerCase();
      const person = (p.owner_name || p.contact_person_name_1 || '').toLowerCase();
      const dist = (p.district_name || '').toLowerCase();

      return code.includes(term) || firm.includes(term) || person.includes(term) || dist.includes(term);
    });
  }, [queue, statusFilter, tierFilter, searchTerm, todayStr]);

  // Queue KPI counts
  const kpis = useMemo(() => {
    const total = queue.length;
    const dueToday = queue.filter(q => q.next_due_date === todayStr).length;
    const overdue = queue.filter(q => q.next_due_date < todayStr).length;
    const completedToday = queue.filter(q => q.isCompletedToday).length;
    return { total, dueToday, overdue, completedToday };
  }, [queue, todayStr]);

  // Ledger KPI counts
  const ledgerMetrics = useMemo(() => {
    const totalCalls = todayLedger.length;
    const ordersPlaced = todayLedger.filter(l => l.call_status === 'ORDER_PLACED');
    const orderCount = ordersPlaced.length;
    const totalValue = ordersPlaced.reduce((acc, l) => {
      const items = Array.isArray(l.order_line_items) ? l.order_line_items : [];
      const sum = items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);
      return acc + sum;
    }, 0);
    const noOrders = todayLedger.filter(l => l.call_status === 'NO_ORDER').length;
    const callbacks = todayLedger.filter(l => l.call_status === 'RESCHEDULED').length;
    const unreachable = todayLedger.filter(l => l.call_status === 'UNREACHABLE').length;
    const conversionRate = totalCalls > 0 ? Math.round((orderCount / totalCalls) * 100) : 0;

    return { totalCalls, orderCount, totalValue, noOrders, callbacks, unreachable, conversionRate };
  }, [todayLedger]);

  // Filtered Ledger list
  const filteredLedger = useMemo(() => {
    return todayLedger.filter(log => {
      if (ledgerOutcomeFilter !== 'ALL' && log.call_status !== ledgerOutcomeFilter) return false;
      if (!ledgerSearch) return true;
      const term = ledgerSearch.toLowerCase().trim();
      const firm = (log.party?.firm_name || '').toLowerCase();
      const caller = (log.assigned_caller_name || '').toLowerCase();
      const orderNo = (log.generated_order_no || '').toLowerCase();
      return firm.includes(term) || caller.includes(term) || orderNo.includes(term);
    });
  }, [todayLedger, ledgerSearch, ledgerOutcomeFilter]);

  return (
    <div>
      {/* Top View Toggle: Calling Queue vs Today's Call Log Ledger */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          background: 'var(--bg-surface)',
          padding: '0.25rem',
          borderRadius: '10px',
          border: '1px solid var(--border-light)'
        }}>
          <button
            type="button"
            onClick={() => setViewMode('QUEUE')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'QUEUE' ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
              color: viewMode === 'QUEUE' ? '#fff' : 'var(--text-secondary)',
              fontWeight: viewMode === 'QUEUE' ? 700 : 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Phone size={14} />
            <span>Daily Calling Queue ({filteredQueue.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { setViewMode('LEDGER'); loadLedger(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'LEDGER' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              color: viewMode === 'LEDGER' ? '#fff' : 'var(--text-secondary)',
              fontWeight: viewMode === 'LEDGER' ? 700 : 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <History size={14} />
            <span>Today&apos;s Call Log Ledger ({todayLedger.length})</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'var(--bg-surface)',
            padding: '0.45rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)'
          }}>
            <User size={13} style={{ color: '#38bdf8' }} />
            <span>Logged in as: <strong style={{ color: 'var(--text-primary)' }}>{userName || 'Admin'}</strong></span>
          </div>

          <button
            type="button"
            onClick={() => { if (onRefresh) onRefresh(); loadLedger(); }}
            disabled={loading || loadingLedger}
            style={{
              padding: '0.45rem 0.85rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: (loading || loadingLedger) ? 'not-allowed' : 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            <RefreshCw size={13} className={(loading || loadingLedger) ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: CALLING QUEUE */}
      {viewMode === 'QUEUE' && (
        <>
          {/* KPI Ribbon for Queue */}
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
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Due Today (IST)</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{kpis.dueToday}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Overdue Calls</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.overdue}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Completed Today</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{kpis.completedToday}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                <Building2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase' }}>Total Network</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{kpis.total}</div>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
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
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search Partner Code, Firm Name, District..."
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
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              >
                <option value="DUE_TODAY">📞 Due Today ({kpis.dueToday})</option>
                <option value="OVERDUE">⚠️ Overdue Calls ({kpis.overdue})</option>
                <option value="COMPLETED_TODAY">✓ Completed Today ({kpis.completedToday})</option>
                <option value="ALL">All Network Partners</option>
              </select>

              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              >
                <option value="ALL">All Partner Tiers</option>
                <option value="Distributor">👑 Distributor</option>
                <option value="Dealer">🏬 Dealer</option>
                <option value="Sub-Dealer">🤝 Sub-Dealer</option>
              </select>
            </div>
          </div>

          {/* Table with Resizable Columns */}
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            overflow: 'hidden'
          }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ width: `${columnWidths.code_tier}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Code &amp; Tier
                      <ColumnResizer onMouseDown={e => startResize('code_tier', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.firm_contact}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Firm &amp; Contact
                      <ColumnResizer onMouseDown={e => startResize('firm_contact', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.location}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Location
                      <ColumnResizer onMouseDown={e => startResize('location', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.frequency}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Frequency
                      <ColumnResizer onMouseDown={e => startResize('frequency', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.due_status}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Schedule Due (IST)
                      <ColumnResizer onMouseDown={e => startResize('due_status', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.last_interaction}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                      Last Call &amp; Emp
                      <ColumnResizer onMouseDown={e => startResize('last_interaction', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                    <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                      Dial &amp; Action
                      <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No partners in queue matching the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map(item => {
                      const p = item.party;
                      const phone = p?.contact_mobile_1_1 || p?.primary_mobile;
                      const isOverdue = item.next_due_date < todayStr;
                      const isDueToday = item.next_due_date === todayStr;
                      const latestCall = item.latestCall;

                      return (
                        <tr key={item.party_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 800, color: p?.party_type === 'Distributor' ? '#38bdf8' : '#34d399', fontSize: '0.9rem' }}>
                              {p?.distributor_code || p?.dealer_code || p?.party_universal_code}
                            </div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.12rem 0.45rem',
                              borderRadius: '4px',
                              marginTop: '0.2rem',
                              background: p?.party_type === 'Distributor' ? 'rgba(56,189,248,0.2)' : 'rgba(16,185,129,0.2)',
                              color: p?.party_type === 'Distributor' ? '#38bdf8' : '#34d399'
                            }}>
                              {p?.party_type}
                            </span>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                              {p?.firm_name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>{p?.owner_name || p?.contact_person_name_1 || 'Principal'}</span>
                              <span>•</span>
                              <MaskedPhoneDisplay phone={phone} size="sm" />
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600 }}>{p?.district_name || 'District'}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>{p?.state_name || 'State'}</div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 700, color: '#60a5fa' }}>
                              {item.frequency_type}
                            </div>
                            {item.preferred_time_slot && item.preferred_time_slot !== 'ANYTIME' && (
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                                Slot: {item.preferred_time_slot}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            {isOverdue ? (
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                background: 'rgba(239,68,68,0.15)',
                                color: '#ef4444'
                              }}>
                                ⚠️ Overdue ({item.next_due_date})
                              </span>
                            ) : isDueToday ? (
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                background: 'rgba(56,189,248,0.15)',
                                color: '#38bdf8'
                              }}>
                                🟢 Due Today ({item.next_due_date})
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Upcoming: {item.next_due_date}
                              </span>
                            )}
                          </td>

                          {/* Last Interaction & Caller Column */}
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                            {latestCall ? (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                  {latestCall.call_status === 'ORDER_PLACED' && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                      📦 Order Placed
                                    </span>
                                  )}
                                  {latestCall.call_status === 'NO_ORDER' && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>
                                      ❌ Stock Full / No Order
                                    </span>
                                  )}
                                  {latestCall.call_status === 'RESCHEDULED' && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                      ⏰ Callback Later
                                    </span>
                                  )}
                                  {latestCall.call_status === 'UNREACHABLE' && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                      📵 Ringing / Unreachable
                                    </span>
                                  )}
                                  {latestCall.generated_order_no && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38bdf8' }}>
                                      #{latestCall.generated_order_no}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    👤 {latestCall.assigned_caller_name || 'Agent'}
                                  </span>
                                  <span>•</span>
                                  <span>🕒 {formatISTDateTime(latestCall.created_at)}</span>
                                </div>
                                {latestCall.notes && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '210px' }} title={latestCall.notes}>
                                    📝 {latestCall.notes}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontStyle: 'italic' }}>
                                — Never Contacted —
                              </div>
                            )}
                          </td>

                          {/* Dial & Actions Column */}
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                onClick={() => openCallModal(item, 'ORDER_PLACED')}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                <Phone size={12} />
                                Call
                              </button>

                              <button
                                type="button"
                                onClick={() => openHistoryDrawer(item)}
                                style={{
                                  padding: '0.4rem 0.6rem',
                                  background: 'var(--bg-primary)',
                                  border: '1px solid var(--border-light)',
                                  color: 'var(--text-primary)',
                                  borderRadius: '6px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                title="View historical call log"
                              >
                                <History size={12} />
                                <span>{item.callCount || 0}</span>
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
        </>
      )}

      {/* VIEW MODE 2: TODAY'S CALL LOG LEDGER */}
      {viewMode === 'LEDGER' && (
        <>
          {/* Summary Metric Cards for Today's Calls */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Today&apos;s Total Calls</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{ledgerMetrics.totalCalls}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Orders Placed</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
                {ledgerMetrics.orderCount}
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                  (₹{ledgerMetrics.totalValue.toLocaleString('en-IN')})
                </span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Stock Full / No Order</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#94a3b8', marginTop: '0.2rem' }}>{ledgerMetrics.noOrders}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>Callbacks Scheduled</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.2rem' }}>{ledgerMetrics.callbacks}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Ringing / Unreachable</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', marginTop: '0.2rem' }}>{ledgerMetrics.unreachable}</div>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, textTransform: 'uppercase' }}>Conversion Rate</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>{ledgerMetrics.conversionRate}%</div>
            </div>
          </div>

          {/* Ledger Search & Filter */}
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
                  value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  placeholder="Filter by Partner, Calling Employee, Order #..."
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <select
                value={ledgerOutcomeFilter}
                onChange={e => setLedgerOutcomeFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              >
                <option value="ALL">All Outcomes ({todayLedger.length})</option>
                <option value="ORDER_PLACED">📦 Order Placed ({ledgerMetrics.orderCount})</option>
                <option value="NO_ORDER">❌ Stock Full / No Order ({ledgerMetrics.noOrders})</option>
                <option value="RESCHEDULED">⏰ Callback Later ({ledgerMetrics.callbacks})</option>
                <option value="UNREACHABLE">📵 Ringing / Unreachable ({ledgerMetrics.unreachable})</option>
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            overflow: 'hidden'
          }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Call Time (IST)</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Channel Partner</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Calling Emp</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Call Outcome</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Details / Order Punch</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Conversation Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No calls recorded today matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map(log => {
                      const p = log.party;
                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            🕒 {formatISTDateTime(log.created_at)}
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {p?.firm_name || 'Partner ID: ' + log.party_id.slice(0, 8)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                              {p?.owner_name} • {p?.district_name}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                              <User size={13} style={{ color: '#38bdf8' }} />
                              {log.assigned_caller_name || 'Agent'}
                            </div>
                          </td>

                          <td style={{ padding: '0.85rem 1rem' }}>
                            {log.call_status === 'ORDER_PLACED' && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                📦 Order Placed
                              </span>
                            )}
                            {log.call_status === 'NO_ORDER' && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>
                                ❌ Stock Full / No Order
                              </span>
                            )}
                            {log.call_status === 'RESCHEDULED' && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                                ⏰ Callback Later
                              </span>
                            )}
                            {log.call_status === 'UNREACHABLE' && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                📵 Ringing / Unreachable
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                            {log.is_order_placed ? (
                              <div>
                                <span style={{ fontWeight: 800, color: '#38bdf8' }}>#{log.generated_order_no}</span>
                                {Array.isArray(log.order_line_items) && log.order_line_items.length > 0 && (
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                    {log.order_line_items.map(it => `${it.product} (x${it.qty})`).join(', ')}
                                  </div>
                                )}
                              </div>
                            ) : log.no_order_reason ? (
                              <div style={{ color: 'var(--text-secondary)' }}>
                                {log.no_order_reason}
                              </div>
                            ) : log.rescheduled_time ? (
                              <div style={{ color: '#f59e0b', fontWeight: 600 }}>
                                Callback at: {log.rescheduled_time}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {log.notes || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL 1: CALL LOG & ORDER PUNCH MODAL */}
      {selectedParty && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, transparent 100%)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Record Order Follow-up Call
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {selectedParty.party?.firm_name} • {selectedParty.party?.owner_name} ({selectedParty.party?.primary_mobile})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParty(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCall} style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {/* Caller Identity Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.85rem',
                background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: '8px',
                marginBottom: '1.2rem',
                fontSize: '0.78rem'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Calling Executive:</span>
                <span style={{ fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <User size={13} /> {userName || 'Admin'}
                </span>
              </div>

              {/* Outcome Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Call Outcome / Disposition *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  {[
                    { id: 'ORDER_PLACED', label: '📦 Order Placed', color: '#10b981' },
                    { id: 'NO_ORDER', label: '❌ Stock Full / No Order', color: '#94a3b8' },
                    { id: 'RESCHEDULED', label: '⏰ Callback Later', color: '#f59e0b' },
                    { id: 'UNREACHABLE', label: '📵 Ringing / Unreachable', color: '#ef4444' }
                  ].map(opt => {
                    const isSelected = callOutcome === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCallOutcome(opt.id)}
                        style={{
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-light)',
                          background: isSelected ? `${opt.color}20` : 'var(--bg-primary)',
                          color: isSelected ? opt.color : 'var(--text-secondary)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DISPOSITION 1: ORDER PLACED */}
              {callOutcome === 'ORDER_PLACED' && (
                <div style={{
                  background: 'rgba(16,185,129,0.05)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#34d399' }}>
                        PUNCH SALES ORDER ITEMS
                      </div>
                      {availableProducts.length > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          background: 'rgba(16,185,129,0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16,185,129,0.3)'
                        }}>
                          <Sparkles size={11} /> Auto-synced with Settings ({availableProducts.length} Products)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          (Default Catalog)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      style={{
                        padding: '0.25rem 0.65rem',
                        background: 'rgba(16,185,129,0.2)',
                        border: '1px solid #10b981',
                        color: '#34d399',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Add Line Item
                    </button>
                  </div>

                  {orderItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={item.product}
                        onChange={e => handleItemChange(idx, 'product', e.target.value)}
                        style={{ padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        {availableProducts.length > 0 ? (
                          availableProducts.map(p => (
                            <option key={p.id || p.sku || p.name} value={p.name}>
                              {p.name} {p.sku ? `(${p.sku})` : ''} {p.price ? `- ₹${Number(p.price).toLocaleString('en-IN')}` : ''}
                            </option>
                          ))
                        ) : (
                          PRODUCT_GROUPS.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))
                        )}
                      </select>

                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                        style={{ padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      />

                      <input
                        type="number"
                        min="0"
                        placeholder="Rate ₹"
                        value={item.rate}
                        onChange={e => handleItemChange(idx, 'rate', e.target.value)}
                        style={{ padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      />

                      {orderItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Billing Mode
                      </label>
                      <select
                        value={billingRoute}
                        onChange={e => setBillingRoute(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        <option value="DIRECT_COMPANY_BILLING">🏢 Direct Company Billing</option>
                        <option value="DISTRIBUTOR_BILLED">👑 Distributor Billed</option>
                        <option value="DEALER_BILLED">🏬 Dealer Billed</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Preferred Dispatch Date
                      </label>
                      <input
                        type="date"
                        min={todayStr}
                        value={preferredDispatchDate}
                        onChange={e => setPreferredDispatchDate(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* DISPOSITION 2: STOCK FULL / NO ORDER */}
              {callOutcome === 'NO_ORDER' && (
                <div style={{
                  background: 'rgba(148,163,184,0.06)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ marginBottom: '0.85rem' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Specific Reason for No Order *
                    </label>
                    <select
                      value={noOrderReason}
                      onChange={e => setNoOrderReason(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      <option value="STOCK_FULL">📦 Adequate Stock in Godown (Pichhla maal bacha hai)</option>
                      <option value="PAYMENT_ISSUE">💸 Pending Ledger Payment / Credit Shortage</option>
                      <option value="DEMAND_LOW">🌾 Off-Season / Slow Retail Farmer Demand</option>
                      <option value="COMPETITOR">🔄 Purchased from Competitor Brand</option>
                      <option value="PRICE_ISSUE">🏷️ Price / Scheme Mismatch</option>
                      <option value="OTHER">📝 Other Reason</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Estimated Next Requirement Date (Optional)
                    </label>
                    <input
                      type="date"
                      min={todayStr}
                      value={nextRequirementDate}
                      onChange={e => setNextRequirementDate(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              )}

              {/* DISPOSITION 3: CALLBACK LATER */}
              {callOutcome === 'RESCHEDULED' && (
                <div style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Callback Date *
                      </label>
                      <input
                        type="date"
                        required
                        min={todayStr}
                        value={rescheduleDate}
                        onChange={e => setRescheduleDate(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Target Time Slot
                      </label>
                      <select
                        value={rescheduleTimeSlot}
                        onChange={e => setRescheduleTimeSlot(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                      >
                        <option value="10:00 AM - 12:00 PM">🌅 Morning (10:00 AM - 12:00 PM)</option>
                        <option value="12:00 PM - 02:00 PM">☀️ Afternoon (12:00 PM - 02:00 PM)</option>
                        <option value="02:00 PM - 04:00 PM">🌤️ Mid-Day (02:00 PM - 04:00 PM)</option>
                        <option value="04:00 PM - 06:00 PM">🌇 Evening (04:00 PM - 06:00 PM)</option>
                        <option value="06:00 PM - 08:00 PM">🌙 Late Evening (06:00 PM - 08:00 PM)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* DISPOSITION 4: RINGING / UNREACHABLE */}
              {callOutcome === 'UNREACHABLE' && (
                <div style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Attempt Status *
                      </label>
                      <select
                        value={unreachableSubReason}
                        onChange={e => setUnreachableSubReason(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                      >
                        <option value="RINGING_NO_ANSWER">📳 Ringing but Not Answering</option>
                        <option value="SWITCHED_OFF">📴 Switched Off / Out of Coverage</option>
                        <option value="BUSY">📞 Line Busy / Call Waiting</option>
                        <option value="WRONG_NUMBER">🚫 Invalid / Wrong Number</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Auto-Retry Strategy
                      </label>
                      <select
                        value={unreachableRetryOption}
                        onChange={e => setUnreachableRetryOption(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                      >
                        <option value="RETRY_2_HOURS">⏳ Retry in 2 Hours (Keep in Queue)</option>
                        <option value="RETRY_TOMORROW">📅 Retry Tomorrow</option>
                        <option value="NO_RETRY">⏹️ Standard Next Cycle</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Call Notes & Observations */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Conversation Notes &amp; Observations
                </label>
                <textarea
                  rows="2"
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                  placeholder="Notes from customer call..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              {feedbackSuccess && (
                <div style={{ padding: '0.65rem 1rem', background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#34d399', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem' }}>
                  {feedbackSuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedParty(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: callOutcome === 'ORDER_PLACED'
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {saving ? 'Saving...' : callOutcome === 'ORDER_PLACED' ? 'Book Sales Order' : 'Record Call Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PARTY CALL HISTORY DRAWER */}
      {historyParty && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-light)',
            width: '100%',
            maxWidth: '520px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
            animation: 'fadeInRight 0.2s ease-out'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={16} style={{ color: '#38bdf8' }} />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Call Audit History
                  </h3>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {historyParty.party?.firm_name} ({historyParty.party?.distributor_code || historyParty.party?.dealer_code || historyParty.party?.party_universal_code})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryParty(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            {/* Drawer Body - Timeline */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem' }} />
                  <div>Loading complete call history...</div>
                </div>
              ) : historyLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <PhoneOff size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600 }}>No prior calls logged yet for this partner.</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
                    Click &ldquo;Call&rdquo; in the queue to record the first conversation.
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-light)' }}>
                  {historyLogs.map(log => {
                    const isOrder = log.is_order_placed;
                    return (
                      <div key={log.id} style={{ position: 'relative', marginBottom: '1.75rem' }}>
                        {/* Timeline Node Dot */}
                        <div style={{
                          position: 'absolute',
                          left: '-1.95rem',
                          top: '0.15rem',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: isOrder ? '#10b981' : log.call_status === 'RESCHEDULED' ? '#f59e0b' : log.call_status === 'UNREACHABLE' ? '#ef4444' : '#64748b',
                          border: '3px solid var(--bg-surface)'
                        }} />

                        {/* Timeline Card */}
                        <div style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '10px',
                          padding: '0.85rem 1rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {log.call_status === 'ORDER_PLACED' && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                                  📦 Order Placed
                                </span>
                              )}
                              {log.call_status === 'NO_ORDER' && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                                  ❌ Stock Full / No Order
                                </span>
                              )}
                              {log.call_status === 'RESCHEDULED' && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                  ⏰ Callback Later
                                </span>
                              )}
                              {log.call_status === 'UNREACHABLE' && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                                  📵 Ringing / Unreachable
                                </span>
                              )}
                              {log.generated_order_no && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8' }}>
                                  #{log.generated_order_no}
                                </span>
                              )}
                            </div>

                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              🕒 {formatISTDateTime(log.created_at)}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <User size={12} style={{ color: '#38bdf8' }} />
                            <span>Caller: <strong style={{ color: 'var(--text-primary)' }}>{log.assigned_caller_name || 'Staff'}</strong></span>
                          </div>

                          {/* Order Details or Specific Reason */}
                          {isOrder && Array.isArray(log.order_line_items) && log.order_line_items.length > 0 && (
                            <div style={{
                              background: 'rgba(16,185,129,0.06)',
                              border: '1px solid rgba(16,185,129,0.15)',
                              borderRadius: '6px',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.76rem',
                              marginBottom: '0.4rem'
                            }}>
                              <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.2rem' }}>Items Booked:</div>
                              {log.order_line_items.map((it, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)' }}>
                                  <span>• {it.product}</span>
                                  <span>x{it.qty} {it.rate ? `(@ ₹${Number(it.rate).toLocaleString('en-IN')})` : ''}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {log.no_order_reason && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>Reason:</strong> {log.no_order_reason}
                            </div>
                          )}

                          {log.rescheduled_time && (
                            <div style={{ fontSize: '0.76rem', color: '#f59e0b', marginBottom: '0.35rem' }}>
                              <strong>Callback Time:</strong> {log.rescheduled_time}
                            </div>
                          )}

                          {log.notes && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                              📝 &ldquo;{log.notes}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
