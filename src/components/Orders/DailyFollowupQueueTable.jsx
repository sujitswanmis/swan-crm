'use client';

import React, { useState, useMemo } from 'react';
import {
  Phone, MessageSquare, Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, Building2, Package, Calendar, ArrowRight, Shield
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { saveOrderFollowupAndRecur } from '@/app/actions/orderFulfillment';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';

export default function DailyFollowupQueueTable({
  queue = [],
  loading = false,
  onRefresh,
  tenantId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('DUE_TODAY');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Call / Order Modal State
  const [selectedParty, setSelectedParty] = useState(null);
  const [callOutcome, setCallOutcome] = useState('ORDER_PLACED');
  const [orderItems, setOrderItems] = useState([
    { product: PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)', qty: 1, rate: 0 }
  ]);
  const [billingRoute, setBillingRoute] = useState('DIRECT_COMPANY_BILLING');
  const [preferredDispatchDate, setPreferredDispatchDate] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [noOrderReason, setNoOrderReason] = useState('STOCK_FULL');
  const [callNotes, setCallNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Table Column Resizer
  const defaultCols = {
    code_tier: 170,
    firm_contact: 260,
    location: 170,
    frequency: 180,
    due_status: 160,
    actions: 160
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('daily_queue_table_widths', defaultCols);

  const openCallModal = (partyItem, defaultOutcome = 'ORDER_PLACED') => {
    setSelectedParty(partyItem);
    setCallOutcome(defaultOutcome);
    setFeedbackSuccess('');
    setOrderItems([
      { product: PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)', qty: 1, rate: 0 }
    ]);
    setBillingRoute(partyItem.party?.billing_route_type || 'DIRECT_COMPANY_BILLING');
    setPreferredDispatchDate('');
    setRescheduleDate('');
    setCallNotes('');
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { product: PRODUCT_GROUPS[0]?.name || 'Swan Rotary Tiller (Rotavator)', qty: 1, rate: 0 }]);
  };

  const handleRemoveItem = (index) => {
    if (orderItems.length <= 1) return;
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...orderItems];
    updated[index][field] = value;
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

      const res = await saveOrderFollowupAndRecur({
        party_id: selectedParty.party_id,
        call_status: callOutcome,
        product: orderItems[0]?.product,
        qty: totalQty,
        total_amount: totalAmount,
        order_line_items: orderItems,
        billing_route: billingRoute,
        preferred_dispatch_date: preferredDispatchDate || null,
        next_followup_date: rescheduleDate || null,
        no_order_reason: callOutcome === 'NO_ORDER' ? noOrderReason : '',
        notes: callNotes
      }, tenantId);

      if (res.success) {
        setFeedbackSuccess(
          isOrder
            ? `✓ Order punched successfully! Generated Order #${res.generated_order_no}. Next frequency cycle auto-scheduled.`
            : `✓ Call recorded! Next follow-up auto-scheduled.`
        );
        if (onRefresh) onRefresh();
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

      if (tierFilter !== 'ALL' && p.party_type !== tierFilter) return false;

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

  // KPI ribbon counts
  const kpis = useMemo(() => {
    const total = queue.length;
    const dueToday = queue.filter(q => q.next_due_date === todayStr).length;
    const overdue = queue.filter(q => q.next_due_date < todayStr).length;
    const completedToday = queue.filter(q => q.isCompletedToday).length;
    return { total, dueToday, overdue, completedToday };
  }, [queue, todayStr]);

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
                  Calling Frequency
                  <ColumnResizer onMouseDown={e => startResize('frequency', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.due_status}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Schedule Due (IST)
                  <ColumnResizer onMouseDown={e => startResize('due_status', e)} onDoubleClick={() => resetWidths()} />
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
                  <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No partners in queue matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredQueue.map(item => {
                  const p = item.party;
                  const phone = p?.contact_mobile_1_1 || p?.primary_mobile;
                  const isOverdue = item.next_due_date < todayStr;
                  const isDueToday = item.next_due_date === todayStr;

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

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openCallModal(item, 'ORDER_PLACED')}
                          style={{
                            padding: '0.4rem 0.85rem',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <Phone size={13} />
                          Call &amp; Log
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

      {/* Call Log & Order Punch Modal */}
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
            maxWidth: '620px',
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
                          padding: '0.6rem 0.75rem',
                          borderRadius: '8px',
                          border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-light)',
                          background: isSelected ? `${opt.color}20` : 'var(--bg-primary)',
                          color: isSelected ? opt.color : 'var(--text-secondary)',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Order Punching Form */}
              {callOutcome === 'ORDER_PLACED' && (
                <div style={{
                  background: 'rgba(16,185,129,0.05)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#34d399' }}>
                      PUNCH SALES ORDER ITEMS
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
                        {PRODUCT_GROUPS.map(p => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
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
                        value={preferredDispatchDate}
                        onChange={e => setPreferredDispatchDate(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Reschedule Date picker */}
              {callOutcome === 'RESCHEDULED' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Select Callback Date &amp; Time (Temporary Snooze) *
                  </label>
                  <input
                    type="date"
                    required
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  />
                </div>
              )}

              {/* No order reason */}
              {callOutcome === 'NO_ORDER' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Reason for No Order
                  </label>
                  <select
                    value={noOrderReason}
                    onChange={e => setNoOrderReason(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="STOCK_FULL">📦 Adequate Stock in Godown</option>
                    <option value="MARKET_SLOW">🌾 Off-Season / Slow Retail Demand</option>
                    <option value="CREDIT_LIMIT">💳 Pending Ledger Payment / Credit Issue</option>
                    <option value="COMPETITOR_SCHEME">⚔️ Competitor Scheme Running</option>
                  </select>
                </div>
              )}

              {/* Call Notes */}
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
    </div>
  );
}
