'use client';

import React, { useState, useMemo } from 'react';
import {
  Package, Truck, CheckCircle2, Clock, AlertTriangle, Search, Filter,
  RefreshCw, ChevronRight, FileText, ExternalLink, Calendar, MapPin
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { updateOrderLifecycleStatus } from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';
import StandardTablePagination from '../common/StandardTablePagination';

const STAGES = [
  { id: 'PUNCHED', label: '1. Order Punched', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { id: 'CONFIRMED', label: '2. Confirmed', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' },
  { id: 'PROCESSING', label: '3. Allocation & Packing', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  { id: 'DISPATCHED', label: '4. Dispatched & In-Transit', color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
  { id: 'DELIVERED', label: '5. Delivered', color: '#10b981', bg: 'rgba(16,185,129,0.15)' }
];

export default function OrderDeliveryPipeline({
  orders = [],
  loading = false,
  onRefresh,
  tenantId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedOrderForAction, setSelectedOrderForAction] = useState(null);
  const [actionStage, setActionStage] = useState('');
  const [actionForm, setActionForm] = useState({
    transporter_name: '',
    lr_number: '',
    vehicle_number: '',
    eway_bill_no: '',
    estimated_delivery_date: '',
    pod_document_url: '',
    delivery_confirmed_by: 'Customer Telephonic Confirmation',
    delivery_notes: ''
  });
  const [updating, setUpdating] = useState(false);

  // Table Column Resizer
  const defaultCols = {
    order_no: 160,
    partner: 240,
    line_items: 220,
    stage: 180,
    logistics: 220,
    dates: 180,
    actions: 140
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('order_pipeline_table_widths', defaultCols);

  const openActionModal = (order, targetStage) => {
    setSelectedOrderForAction(order);
    setActionStage(targetStage);
    setActionForm({
      transporter_name: order.transporter_name || '',
      lr_number: order.lr_number || '',
      vehicle_number: order.vehicle_number || '',
      eway_bill_no: order.eway_bill_no || '',
      estimated_delivery_date: order.estimated_delivery_date || '',
      pod_document_url: order.pod_document_url || '',
      delivery_confirmed_by: order.delivery_confirmed_by || 'Customer Telephonic Confirmation',
      delivery_notes: order.delivery_notes || ''
    });
  };

  const handleUpdateStage = async (e) => {
    e.preventDefault();
    if (!selectedOrderForAction || !actionStage) return;
    setUpdating(true);
    try {
      const res = await updateOrderLifecycleStatus(selectedOrderForAction.id, {
        delivery_status: actionStage,
        ...actionForm
      }, tenantId);

      if (res.success) {
        setSelectedOrderForAction(null);
        if (onRefresh) onRefresh();
      } else {
        alert('Failed to update stage: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error updating order stage: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const currentStage = order.delivery_status || 'PUNCHED';
      if (stageFilter !== 'ALL' && currentStage !== stageFilter) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (order.order_number || '').toLowerCase();
      const firm = (order.party?.firm_name || '').toLowerCase();
      const lr = (order.lr_number || '').toLowerCase();
      const veh = (order.vehicle_number || '').toLowerCase();
      const trans = (order.transporter_name || '').toLowerCase();

      return num.includes(term) || firm.includes(term) || lr.includes(term) || veh.includes(term) || trans.includes(term);
    });
  }, [orders, stageFilter, searchTerm]);

  // Auto-reset page on filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stageFilter, pageSize]);

  const paginatedOrders = useMemo(() => {
    if (pageSize === 100000) return filteredOrders;
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Stage counts for quick summary
  const stageCounts = useMemo(() => {
    const map = { PUNCHED: 0, CONFIRMED: 0, PROCESSING: 0, DISPATCHED: 0, DELIVERED: 0 };
    orders.forEach(o => {
      const st = o.delivery_status || 'PUNCHED';
      if (map[st] !== undefined) map[st]++;
    });
    return map;
  }, [orders]);

  return (
    <div>
      {/* Stage Flow Indicator Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.65rem',
        marginBottom: '1rem'
      }}>
        {STAGES.map(st => {
          const count = stageCounts[st.id] || 0;
          const isSelected = stageFilter === st.id;
          return (
            <div
              key={st.id}
              onClick={() => setStageFilter(isSelected ? 'ALL' : st.id)}
              style={{
                background: isSelected ? st.bg : 'var(--bg-surface)',
                border: isSelected ? `2px solid ${st.color}` : '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '0.72rem', color: st.color, fontWeight: 700, textTransform: 'uppercase' }}>
                {st.label}
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {count}
              </div>
            </div>
          );
        })}
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
              placeholder="Search Order #, Dealer, Transporter, LR/Bilty..."
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
            <option value="ALL">All Lifecycle Stages</option>
            {STAGES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
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
                  Order #
                  <ColumnResizer onMouseDown={e => startResize('order_no', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.line_items}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Ordered Items
                  <ColumnResizer onMouseDown={e => startResize('line_items', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.stage}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Current Stage
                  <ColumnResizer onMouseDown={e => startResize('stage', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.logistics}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Logistics &amp; LR / Bilty
                  <ColumnResizer onMouseDown={e => startResize('logistics', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.dates}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Timeline (IST)
                  <ColumnResizer onMouseDown={e => startResize('dates', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Update Stage
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No sales orders found in this stage.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(order => {
                  const p = order.party;
                  const currentStage = order.delivery_status || 'PUNCHED';
                  const stageObj = STAGES.find(s => s.id === currentStage) || STAGES[0];

                  const items = Array.isArray(order.order_line_items) ? order.order_line_items : [];

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>
                          {order.order_number}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {order.created_at?.slice(0, 10)}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                          {p?.firm_name || 'Direct Customer'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {p?.owner_name} • {p?.district_name}, {p?.state_name}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {items.length === 0 ? (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            Qty: {order.total_ordered_qty || 1} Unit(s)
                          </div>
                        ) : (
                          items.map((it, idx) => (
                            <div key={idx} style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              • {it.product || it.name} ({it.qty || 1}x)
                            </div>
                          ))
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          background: stageObj.bg,
                          color: stageObj.color,
                          border: `1px solid ${stageObj.color}40`
                        }}>
                          {stageObj.label}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        {order.transporter_name || order.lr_number ? (
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              🚛 {order.transporter_name || 'Transport'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                              LR: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{order.lr_number || 'N/A'}</span>
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

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        {order.actual_dispatch_date && (
                          <div>Dispatched: {order.actual_dispatch_date.slice(0, 10)}</div>
                        )}
                        {order.actual_delivery_date ? (
                          <div style={{ color: '#10b981', fontWeight: 700, marginTop: '0.15rem' }}>
                            Delivered: {order.actual_delivery_date.slice(0, 10)}
                          </div>
                        ) : order.estimated_delivery_date ? (
                          <div style={{ color: '#f59e0b', marginTop: '0.15rem' }}>
                            EDD: {order.estimated_delivery_date}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {currentStage === 'PUNCHED' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(order, 'CONFIRMED')}
                            style={{ padding: '0.35rem 0.75rem', background: 'rgba(56,189,248,0.15)', border: '1px solid #38bdf8', color: '#38bdf8', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Approve Order
                          </button>
                        )}
                        {currentStage === 'CONFIRMED' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(order, 'PROCESSING')}
                            style={{ padding: '0.35rem 0.75rem', background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa', color: '#a78bfa', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Packing &amp; Stock
                          </button>
                        )}
                        {currentStage === 'PROCESSING' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(order, 'DISPATCHED')}
                            style={{ padding: '0.35rem 0.75rem', background: 'rgba(251,146,60,0.15)', border: '1px solid #fb923c', color: '#fb923c', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Dispatch Goods
                          </button>
                        )}
                        {currentStage === 'DISPATCHED' && (
                          <button
                            type="button"
                            onClick={() => openActionModal(order, 'DELIVERED')}
                            style={{ padding: '0.35rem 0.75rem', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', color: '#34d399', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Mark Delivered
                          </button>
                        )}
                        {currentStage === 'DELIVERED' && (
                          <span style={{ fontSize: '0.76rem', color: '#10b981', fontWeight: 700 }}>
                            ✓ Complete
                          </span>
                        )}
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

      {/* Stage Progression Modal */}
      {selectedOrderForAction && (
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
            maxWidth: '520px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, transparent 100%)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Update Order Stage ➔ {STAGES.find(s => s.id === actionStage)?.label}
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Order #{selectedOrderForAction.order_number} • {selectedOrderForAction.party?.firm_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForAction(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStage} style={{ padding: '1.5rem' }}>
              {/* Form fields for Dispatch */}
              {actionStage === 'DISPATCHED' && (
                <div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Transporter / Logistics Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={actionForm.transporter_name}
                      onChange={e => setActionForm({ ...actionForm, transporter_name: e.target.value })}
                      placeholder="e.g. V-Trans, TCI Freight, Local Truck Union"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        LR / Bilty Number *
                      </label>
                      <input
                        type="text"
                        required
                        value={actionForm.lr_number}
                        onChange={e => setActionForm({ ...actionForm, lr_number: e.target.value })}
                        placeholder="e.g. VT-98421"
                        style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Vehicle / Truck Number
                      </label>
                      <input
                        type="text"
                        value={actionForm.vehicle_number}
                        onChange={e => setActionForm({ ...actionForm, vehicle_number: e.target.value })}
                        placeholder="e.g. PB-10-DF-4421"
                        style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        E-Way Bill Number
                      </label>
                      <input
                        type="text"
                        value={actionForm.eway_bill_no}
                        onChange={e => setActionForm({ ...actionForm, eway_bill_no: e.target.value })}
                        placeholder="12-digit E-Way Bill"
                        style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Estimated Delivery Date (EDD)
                      </label>
                      <input
                        type="date"
                        value={actionForm.estimated_delivery_date}
                        onChange={e => setActionForm({ ...actionForm, estimated_delivery_date: e.target.value })}
                        style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Form fields for Delivered */}
              {actionStage === 'DELIVERED' && (
                <div>
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(16,185,129,0.1)',
                    borderRadius: '8px',
                    border: '1px solid rgba(16,185,129,0.3)',
                    marginBottom: '1rem',
                    fontSize: '0.82rem',
                    color: '#34d399'
                  }}>
                    ✓ Marking this order as <strong>DELIVERED</strong> will record the delivery timestamp in IST and automatically queue this order for <strong>Post-Delivery Feedback</strong>.
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Delivery Confirmation Mode / Receiver *
                    </label>
                    <input
                      type="text"
                      required
                      value={actionForm.delivery_confirmed_by}
                      onChange={e => setActionForm({ ...actionForm, delivery_confirmed_by: e.target.value })}
                      placeholder="e.g. Received by Dealer Owner, Stamped Delivery Challan"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Delivery / Proof Notes (Optional)
                    </label>
                    <textarea
                      rows="2"
                      value={actionForm.delivery_notes}
                      onChange={e => setActionForm({ ...actionForm, delivery_notes: e.target.value })}
                      placeholder="e.g. Safe delivery, goods unloaded at main godown..."
                      style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>
              )}

              {/* Default confirmation for Confirmed or Processing */}
              {(actionStage === 'CONFIRMED' || actionStage === 'PROCESSING') && (
                <div style={{ padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Are you sure you want to transition Order <strong>#{selectedOrderForAction.order_number}</strong> to <strong>{STAGES.find(s => s.id === actionStage)?.label}</strong>?
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedOrderForAction(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: updating ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {updating ? 'Updating...' : `Confirm Stage ➔ ${actionStage}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
