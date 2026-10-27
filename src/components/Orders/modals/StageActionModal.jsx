'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldAlert,
  FileText, Truck, DollarSign, Layers, Sparkles
} from 'lucide-react';
import { updateOrderLifecycleStatus, dispatchPartialLot } from '@/app/actions/orderFulfillment';

// Format Date in IST (+05:30)
function formatIST(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (_) {
    return String(isoDate);
  }
}

export default function StageActionModal({
  order,
  targetStage,
  isOpen,
  onClose,
  onSuccess,
  userName = 'Operations',
  tenantId = 'TNT00002',
  tatMode = 'DYNAMIC',
  allowPartialSplit = true,
  autoSkipBalanceOnFullAdvance = true
}) {
  const [customValues, setCustomValues] = useState({});
  const [note, setNote] = useState('');
  const [isPartialLot, setIsPartialLot] = useState(false);
  const [productAllocations, setProductAllocations] = useState([]);
  const [partialLotData, setPartialLotData] = useState({
    lot_no: 'Lot-A',
    dispatched_qty: 1,
    remaining_qty: 0,
    transporter_name: '',
    lr_number: '',
    vehicle_number: ''
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Calculate Planned Timestamp and SLA Status
  const slaInfo = useMemo(() => {
    if (!order || !targetStage) return null;

    const tatHours = Number(targetStage.tat_hours) || 4;
    const history = Array.isArray(order.stage_history) ? order.stage_history : [];
    const lastStage = history[history.length - 1];

    // Base timestamp: last stage actual timestamp or order created_at
    const baseDate = lastStage?.actual_timestamp ? new Date(lastStage.actual_timestamp) : new Date(order.created_at || Date.now());
    const plannedDate = new Date(baseDate.getTime() + (tatHours * 60 * 60 * 1000));
    const now = new Date();

    const isBreached = now.getTime() > plannedDate.getTime();
    const diffHours = Math.abs((now.getTime() - plannedDate.getTime()) / (1000 * 60 * 60)).toFixed(1);

    return {
      plannedDateISO: plannedDate.toISOString(),
      plannedFormatted: formatIST(plannedDate),
      isBreached,
      diffHours
    };
  }, [order, targetStage]);

  // Initialize custom fields and smart defaults
  useEffect(() => {
    if (!order || !targetStage) return;

    const initial = {};
    const fields = targetStage.custom_fields || [];
    const totalQty = Number(order.total_ordered_qty) || 1;
    const totalAmount = Number(order.total_amount) || 0;

    fields.forEach(f => {
      let val = f.default_value ?? '';

      // Smart Defaults based on field ID & order data
      if (f.id === 'dealer_po_no' && order.dealer_po_no) val = order.dealer_po_no;
      if (f.id === 'pi_number' && order.pi_number) val = order.pi_number;
      if (f.id === 'advance_target_amount') val = Math.round(totalAmount * 0.3);
      if (f.id === 'advance_received_amount') val = Math.round(totalAmount * 0.3);
      if (f.id === 'balance_amount_requested') val = Math.round(totalAmount * 0.7);
      if (f.id === 'units_ready_count') val = totalQty;
      if (f.id === 'tax_invoice_number' && order.invoice_number) val = order.invoice_number;
      if (f.id === 'final_billed_amount') val = totalAmount;
      if (f.id === 'eway_bill_no' && order.eway_bill_no) val = order.eway_bill_no;
      if (f.id === 'transporter_name' && order.transporter_name) val = order.transporter_name;
      if (f.id === 'lr_number' && order.lr_number) val = order.lr_number;
      if (f.id === 'vehicle_number' && order.vehicle_number) val = order.vehicle_number;
      if (f.id === 'actual_delivery_date') {
        val = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      }

      initial[f.id] = val;
    });

    setCustomValues(initial);
    setNote(targetStage.default_note || '');
    setErrorMsg('');
    setIsPartialLot(false);

    // Initialize product-wise allocations from order_line_items or fallback
    const rawItems = Array.isArray(order.order_line_items) && order.order_line_items.length > 0
      ? order.order_line_items
      : [{ product: order.product_name || 'Standard Product', qty: totalQty }];

    const initialAlloc = rawItems.map((it, idx) => {
      const q = Number(it.qty) || 1;
      return {
        id: idx,
        product: it.product || it.name || `Product #${idx + 1}`,
        ordered_qty: q,
        ready_qty: q,
        remaining_qty: 0
      };
    });
    setProductAllocations(initialAlloc);

    const initReadySum = initialAlloc.reduce((sum, it) => sum + it.ready_qty, 0);
    const initRemSum = initialAlloc.reduce((sum, it) => sum + it.remaining_qty, 0);

    setPartialLotData({
      lot_no: 'Lot-A',
      dispatched_qty: initReadySum,
      remaining_qty: initRemSum,
      transporter_name: order.transporter_name || '',
      lr_number: order.lr_number || '',
      vehicle_number: order.vehicle_number || ''
    });
  }, [order, targetStage]);

  if (!isOpen || !order || !targetStage) return null;

  const handleCustomChange = (fieldId, val) => {
    setCustomValues(prev => ({ ...prev, [fieldId]: val }));
  };

  const handleProductAllocChange = (index, val) => {
    setProductAllocations(prev => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;

      const numVal = Math.min(item.ordered_qty, Math.max(0, Number(val) || 0));
      const rem = Math.max(0, item.ordered_qty - numVal);

      updated[index] = {
        ...item,
        ready_qty: numVal,
        remaining_qty: rem
      };

      const totalDispatched = updated.reduce((sum, it) => sum + (Number(it.ready_qty) || 0), 0);
      const totalRemaining = updated.reduce((sum, it) => sum + (Number(it.remaining_qty) || 0), 0);

      setPartialLotData(d => ({
        ...d,
        dispatched_qty: totalDispatched,
        remaining_qty: totalRemaining
      }));

      return updated;
    });
  };

  const handlePartialLotChange = (field, val) => {
    const totalQty = Number(order.total_ordered_qty) || 1;
    let updated = { ...partialLotData, [field]: val };
    if (field === 'dispatched_qty') {
      const dQty = Math.min(totalQty, Math.max(0, Number(val) || 0));
      updated.dispatched_qty = dQty;
      updated.remaining_qty = Math.max(0, totalQty - dQty);

      // Distribute dQty sequentially across product allocations
      setProductAllocations(prev => {
        let remainingToDistribute = dQty;
        return prev.map(item => {
          const alloc = Math.min(item.ordered_qty, remainingToDistribute);
          remainingToDistribute = Math.max(0, remainingToDistribute - alloc);
          return {
            ...item,
            ready_qty: alloc,
            remaining_qty: Math.max(0, item.ordered_qty - alloc)
          };
        });
      });
    }
    setPartialLotData(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check mandatory fields
    const fields = targetStage.custom_fields || [];
    for (const f of fields) {
      if (f.required) {
        const val = customValues[f.id];
        if (val === undefined || val === null || val === '') {
          setErrorMsg(`Please fill required field: "${f.label}"`);
          return;
        }
      }
    }

    setSaving(true);
    setErrorMsg('');

    try {
      if (isPartialLot && (targetStage.id === 'S07' || targetStage.id === 'S12')) {
        // Dispatch partial lot
        const lotRes = await dispatchPartialLot(order.id, {
          ...partialLotData,
          product_allocations: productAllocations,
          notes: note
        }, userName, tenantId);

        if (!lotRes.success) throw new Error(lotRes.error);
      }

      // Advance stage
      const res = await updateOrderLifecycleStatus(order.id, {
        delivery_status: targetStage.id,
        stage_id: targetStage.id,
        stage_name: targetStage.name,
        department: targetStage.department,
        tat_hours: targetStage.tat_hours,
        planned_timestamp: slaInfo?.plannedDateISO,
        tat_breached: slaInfo?.isBreached,
        action_by: userName,
        notes: note,
        custom_fields_data: customValues,
        transporter_name: customValues.transporter_name || order.transporter_name,
        lr_number: customValues.lr_number || order.lr_number,
        vehicle_number: customValues.vehicle_number || order.vehicle_number,
        eway_bill_no: customValues.eway_bill_no || order.eway_bill_no,
        actual_delivery_date: customValues.actual_delivery_date
      }, tenantId);

      if (res.success) {
        if (onSuccess) onSuccess(res.order);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to update order stage.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{
                fontSize: '0.76rem',
                fontWeight: 800,
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                background: `${targetStage.color || '#3b82f6'}20`,
                color: targetStage.color || '#3b82f6',
                border: `1px solid ${targetStage.color || '#3b82f6'}40`
              }}>
                STEP {targetStage.id}
              </span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {targetStage.name}
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {targetStage.assigned_emp_name ? (
                <span>Incharge: <strong style={{ color: '#10b981' }}>{targetStage.assigned_emp_name}</strong> • </span>
              ) : (Array.isArray(targetStage.authorized_roles) && targetStage.authorized_roles.length > 0) ? (
                <span>Roles: <strong style={{ color: '#38bdf8' }}>{targetStage.authorized_roles.join(', ')}</strong> • </span>
              ) : (
                <span>Dept / Access: <strong style={{ color: 'var(--text-primary)' }}>{targetStage.department || 'Open / Matrix'}</strong> • </span>
              )}
              Target TAT: <strong>{targetStage.tat_hours} Hours</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {errorMsg && (
              <div style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <AlertTriangle size={15} />
                {errorMsg}
              </div>
            )}

            {/* SLA & TAT Status Banner */}
            {slaInfo && (
              <div style={{
                background: slaInfo.isBreached ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                border: `1px solid ${slaInfo.isBreached ? '#ef4444' : '#10b981'}`,
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={16} style={{ color: slaInfo.isBreached ? '#ef4444' : '#10b981' }} />
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Planned TAT Deadline (IST): {slaInfo.plannedFormatted}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Target TAT: {targetStage.tat_hours} Hours from previous stage handover
                    </div>
                  </div>
                </div>

                <div>
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    background: slaInfo.isBreached ? '#ef4444' : '#10b981',
                    color: '#ffffff'
                  }}>
                    {slaInfo.isBreached ? `🔴 Overdue (${slaInfo.diffHours}h)` : '🟢 On Time (Within SLA)'}
                  </span>
                </div>
              </div>
            )}

            {/* Order Reference Information Bar */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.5rem',
              border: '1px solid var(--border-light)',
              fontSize: '0.8rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>Order #</span>
                <div style={{ fontWeight: 800, color: '#38bdf8' }}>{order.order_number}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>Channel Partner</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.party?.firm_name || 'Direct Dealer'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>Total Units</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.total_ordered_qty || 1} Unit(s)</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>Order Amount</span>
                <div style={{ fontWeight: 800, color: '#10b981' }}>₹{Number(order.total_amount || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Dynamic Custom Fields Section */}
            {(targetStage.custom_fields || []).length > 0 && (
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'block' }}>
                  Stage Data &amp; ERP Vouchers:
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {(targetStage.custom_fields || []).map(f => {
                    const currentVal = customValues[f.id] ?? '';

                    return (
                      <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                        </label>

                        {/* Text */}
                        {f.type === 'text' && (
                          <input
                            type="text"
                            value={currentVal}
                            placeholder={f.placeholder || `Enter ${f.label}`}
                            onChange={e => handleCustomChange(f.id, e.target.value)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem'
                            }}
                          />
                        )}

                        {/* Number */}
                        {f.type === 'number' && (
                          <input
                            type="number"
                            value={currentVal}
                            placeholder={f.placeholder || '0'}
                            onChange={e => handleCustomChange(f.id, e.target.value)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem'
                            }}
                          />
                        )}

                        {/* Date */}
                        {f.type === 'date' && (
                          <input
                            type="date"
                            value={currentVal}
                            onChange={e => handleCustomChange(f.id, e.target.value)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem'
                            }}
                          />
                        )}

                        {/* Select */}
                        {f.type === 'select' && (
                          <select
                            value={currentVal}
                            onChange={e => handleCustomChange(f.id, e.target.value)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem'
                            }}
                          >
                            <option value="">-- Select {f.label} --</option>
                            {(f.options || []).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}

                        {/* Checkbox */}
                        {f.type === 'checkbox' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.3rem' }}>
                            <input
                              type="checkbox"
                              checked={!!currentVal}
                              onChange={e => handleCustomChange(f.id, e.target.checked)}
                              style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                              {f.label}
                            </span>
                          </label>
                        )}

                        {/* File upload input / URL */}
                        {f.type === 'file' && (
                          <input
                            type="text"
                            placeholder="Enter POD / Document URL or path"
                            value={currentVal}
                            onChange={e => handleCustomChange(f.id, e.target.value)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              fontSize: '0.82rem'
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Policy Notice for S05 100% Payment */}
            {targetStage.id === 'S05' && customValues.is_100_percent_paid && (
              <div style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '8px',
                color: '#10b981',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <Sparkles size={15} />
                <strong>100% Full Payment Credited:</strong> The pipeline will automatically fast-track through S08 directly to S11 (Ready for Dispatch), skipping S09 &amp; S10.
              </div>
            )}

            {/* Partial Split Lot Options (S07 and S12) */}
            {allowPartialSplit && (targetStage.id === 'S07' || targetStage.id === 'S12') && (
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={isPartialLot}
                    onChange={e => setIsPartialLot(e.target.checked)}
                  />
                  <span>Partial Order Dispatch (Split Lot)</span>
                </label>

                {isPartialLot && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.35rem' }}>
                    {/* Top Total Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                      <div style={{
                        padding: '0.6rem 0.85rem',
                        background: 'rgba(37,99,235,0.08)',
                        border: '1px solid rgba(37,99,235,0.25)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Ready to Dispatch (Lot-A):
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                          {partialLotData.dispatched_qty} Unit(s)
                        </div>
                      </div>

                      <div style={{
                        padding: '0.6rem 0.85rem',
                        background: partialLotData.remaining_qty > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                        border: `1px solid ${partialLotData.remaining_qty > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Remaining in Assembly (Lot-B):
                        </div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: partialLotData.remaining_qty > 0 ? '#d97706' : '#10b981', marginTop: '0.15rem' }}>
                          {partialLotData.remaining_qty} Unit(s)
                        </div>
                      </div>
                    </div>

                    {/* Product-Wise Dispatch Allocation Table */}
                    <div style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: 'var(--bg-surface)'
                    }}>
                      {/* Table Header */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(240px, 1fr) 85px 125px 150px',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(148,163,184,0.1)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        <div>Product Name</div>
                        <div style={{ textAlign: 'center' }}>Ordered</div>
                        <div style={{ textAlign: 'center' }}>Ready (Lot-A)</div>
                        <div style={{ textAlign: 'center' }}>Remaining (Lot-B)</div>
                      </div>

                      {/* Product Rows */}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {productAllocations.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(240px, 1fr) 85px 125px 150px',
                              gap: '0.5rem',
                              alignItems: 'center',
                              padding: '0.55rem 0.75rem',
                              borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none'
                            }}
                          >
                            {/* Product Name */}
                            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                              {item.product}
                            </div>

                            {/* Ordered Qty */}
                            <div style={{ textAlign: 'center', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              {item.ordered_qty}
                            </div>

                            {/* Ready to Dispatch Input (Lot-A) */}
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                max={item.ordered_qty}
                                value={item.ready_qty}
                                onChange={e => handleProductAllocChange(idx, e.target.value)}
                                style={{
                                  width: '85px',
                                  padding: '0.35rem 0.5rem',
                                  background: 'var(--bg-primary)',
                                  border: '1.5px solid var(--accent-color, #2563eb)',
                                  borderRadius: '6px',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.86rem',
                                  fontWeight: 700,
                                  textAlign: 'center'
                                }}
                              />
                            </div>

                            {/* Remaining in Assembly (Lot-B) */}
                            <div style={{ textAlign: 'center' }}>
                              {item.remaining_qty === 0 ? (
                                <span style={{
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: 'rgba(16,185,129,0.12)',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(16,185,129,0.25)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  Full Ready (0)
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  color: '#d97706',
                                  background: 'rgba(245,158,11,0.12)',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(245,158,11,0.25)',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {item.remaining_qty} in Assembly
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Note Textarea */}
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Action Note / Verification Remark
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="Enter stage completion remarks..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  marginTop: '0.25rem'
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            background: 'var(--bg-surface)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.5rem 1.25rem',
                background: targetStage.color || '#2563eb',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <CheckCircle2 size={15} />
              {saving ? 'Advancing Stage...' : `Advance to ${targetStage.id}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
