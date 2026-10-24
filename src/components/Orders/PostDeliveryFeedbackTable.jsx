'use client';

import React, { useState, useMemo } from 'react';
import {
  Star, MessageSquare, CheckCircle2, AlertTriangle, RefreshCw,
  Search, Filter, ShieldAlert, Calendar, Clock, Truck
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { savePostDeliveryFeedback } from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';

export default function PostDeliveryFeedbackTable({
  deliveredOrders = [],
  loading = false,
  onRefresh,
  tenantId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('ALL');
  const [selectedOrderForFeedback, setSelectedOrderForFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState('');

  // Form State
  const [feedbackForm, setFeedbackForm] = useState({
    overall_satisfaction: 5,
    rating_delivery_time: 5,
    rating_product_quality: 5,
    rating_packaging: 5,
    rating_transporter: 5,
    has_transit_damage_shortage: false,
    damage_details: '',
    dealer_comments: '',
    repeat_order_intent: 'WITHIN_15_DAYS',
    repeat_order_expected_date: ''
  });

  // Table Column Resizer
  const defaultCols = {
    order_no: 160,
    partner: 240,
    delivery_date: 160,
    transporter: 180,
    feedback_score: 200,
    issues: 200,
    actions: 150
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('order_feedback_table_widths', defaultCols);

  const openFeedbackModal = (order) => {
    setSelectedOrderForFeedback(order);
    setFeedbackSuccessMsg('');
    setFeedbackForm({
      overall_satisfaction: order.feedback?.overall_satisfaction || 5,
      rating_delivery_time: order.feedback?.rating_delivery_time || 5,
      rating_product_quality: order.feedback?.rating_product_quality || 5,
      rating_packaging: order.feedback?.rating_packaging || 5,
      rating_transporter: order.feedback?.rating_transporter || 5,
      has_transit_damage_shortage: order.feedback?.has_transit_damage_shortage || false,
      damage_details: order.feedback?.damage_details || '',
      dealer_comments: order.feedback?.dealer_comments || '',
      repeat_order_intent: order.feedback?.repeat_order_intent || 'WITHIN_15_DAYS',
      repeat_order_expected_date: order.feedback?.repeat_order_expected_date || ''
    });
  };

  const isAutoComplaintWillTrigger = useMemo(() => {
    return (Number(feedbackForm.overall_satisfaction) <= 2) || feedbackForm.has_transit_damage_shortage;
  }, [feedbackForm.overall_satisfaction, feedbackForm.has_transit_damage_shortage]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!selectedOrderForFeedback) return;
    setSaving(true);
    try {
      const res = await savePostDeliveryFeedback({
        order_id: selectedOrderForFeedback.id,
        order_number: selectedOrderForFeedback.order_number,
        party_id: selectedOrderForFeedback.party_id,
        ...feedbackForm
      }, tenantId);

      if (res.success) {
        setFeedbackSuccessMsg(
          res.ticket_generated
            ? '✓ Feedback recorded! High-priority Complaint Ticket automatically generated and routed to QA/Logistics.'
            : '✓ Post-delivery feedback recorded successfully!'
        );
        if (onRefresh) onRefresh();
        setTimeout(() => {
          setSelectedOrderForFeedback(null);
          setFeedbackSuccessMsg('');
        }, 1200);
      } else {
        alert('Failed to save feedback: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error recording feedback: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return deliveredOrders.filter(item => {
      if (feedbackStatusFilter === 'PENDING' && item.isFeedbackRecorded) return false;
      if (feedbackStatusFilter === 'RECORDED' && !item.isFeedbackRecorded) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (item.order_number || '').toLowerCase();
      const firm = (item.party?.firm_name || '').toLowerCase();
      const lr = (item.lr_number || '').toLowerCase();

      return num.includes(term) || firm.includes(term) || lr.includes(term);
    });
  }, [deliveredOrders, feedbackStatusFilter, searchTerm]);

  return (
    <div>
      {/* Top Filter and Search Bar */}
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
              placeholder="Search Delivered Order #, Dealer..."
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
            value={feedbackStatusFilter}
            onChange={e => setFeedbackStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Delivered Orders</option>
            <option value="PENDING">🟡 Feedback Pending Call</option>
            <option value="RECORDED">🟢 Feedback Recorded</option>
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
                <th style={{ width: `${columnWidths.order_no}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Order #
                  <ColumnResizer onMouseDown={e => startResize('order_no', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.delivery_date}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Delivery Date (IST)
                  <ColumnResizer onMouseDown={e => startResize('delivery_date', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.transporter}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Transporter &amp; LR
                  <ColumnResizer onMouseDown={e => startResize('transporter', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.feedback_score}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Satisfaction Rating
                  <ColumnResizer onMouseDown={e => startResize('feedback_score', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.issues}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Damage / Issues
                  <ColumnResizer onMouseDown={e => startResize('issues', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                  Action
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No delivered orders found matching current filter.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const p = order.party;
                  const phone = p?.primary_mobile;
                  const fb = order.feedback;

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>
                          {order.order_number}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                          {p?.firm_name || 'Customer'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{p?.owner_name}</span>
                          <span>•</span>
                          <MaskedPhoneDisplay phone={phone} size="sm" />
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 700, color: '#10b981' }}>
                          {order.actual_delivery_date ? order.actual_delivery_date.slice(0, 10) : 'Delivered'}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600 }}>{order.transporter_name || 'Direct Transport'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>LR: {order.lr_number || 'N/A'}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {fb ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#fbbf24' }}>
                              {'★'.repeat(fb.overall_satisfaction)}
                              {'☆'.repeat(5 - fb.overall_satisfaction)}
                              <span style={{ fontWeight: 800, color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.85rem' }}>
                                {fb.overall_satisfaction}/5
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              Del: {fb.rating_delivery_time}★ • Prod: {fb.rating_product_quality || 5}★
                            </div>
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            background: 'rgba(245,158,11,0.15)',
                            color: '#f59e0b'
                          }}>
                            Pending Feedback
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        {fb?.has_transit_damage_shortage ? (
                          <span style={{ color: '#ef4444', fontWeight: 700 }}>
                            ⚠️ Damage / Shortage Reported
                          </span>
                        ) : fb ? (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>
                            ✓ Good Condition
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openFeedbackModal(order)}
                          style={{
                            padding: '0.4rem 0.85rem',
                            background: fb ? 'rgba(59,130,246,0.15)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: fb ? '1px solid #3b82f6' : 'none',
                            color: fb ? '#60a5fa' : '#fff',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {fb ? 'Edit Feedback' : 'Log Feedback'}
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

      {/* Feedback Modal */}
      {selectedOrderForFeedback && (
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
            maxWidth: '560px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Star size={20} color="#fbbf24" fill="#fbbf24" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Post-Delivery Satisfaction Feedback
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForFeedback(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} style={{ padding: '1.5rem', overflowY: 'auto' }}>
              <div style={{
                background: 'var(--bg-primary)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                marginBottom: '1.25rem'
              }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedOrderForFeedback.party?.firm_name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Order #{selectedOrderForFeedback.order_number} • Transporter: {selectedOrderForFeedback.transporter_name || 'N/A'} (LR: {selectedOrderForFeedback.lr_number || 'N/A'})
                </div>
              </div>

              {/* Star Ratings Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Overall Satisfaction *
                  </label>
                  <select
                    value={feedbackForm.overall_satisfaction}
                    onChange={e => setFeedbackForm({ ...feedbackForm, overall_satisfaction: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700 }}
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                    <option value={4}>⭐⭐⭐⭐ 4 - Good</option>
                    <option value={3}>⭐⭐⭐ 3 - Average</option>
                    <option value={2}>⭐⭐ 2 - Poor (Auto-Complaint)</option>
                    <option value={1}>⭐ 1 - Very Bad (Auto-Complaint)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    On-Time Delivery *
                  </label>
                  <select
                    value={feedbackForm.rating_delivery_time}
                    onChange={e => setFeedbackForm({ ...feedbackForm, rating_delivery_time: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  >
                    <option value={5}>5 Stars - On Time</option>
                    <option value={4}>4 Stars - Minor Delay</option>
                    <option value={3}>3 Stars - Moderate Delay</option>
                    <option value={2}>2 Stars - Substantial Delay</option>
                    <option value={1}>1 Star - Extreme Delay</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Product Quality &amp; Finish
                  </label>
                  <select
                    value={feedbackForm.rating_product_quality}
                    onChange={e => setFeedbackForm({ ...feedbackForm, rating_product_quality: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  >
                    <option value={5}>5 Stars - Flawless</option>
                    <option value={4}>4 Stars - Satisfactory</option>
                    <option value={3}>3 Stars - Needs Attention</option>
                    <option value={2}>2 Stars - Defect Suspected</option>
                    <option value={1}>1 Star - Defective</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Packaging &amp; Protection
                  </label>
                  <select
                    value={feedbackForm.rating_packaging}
                    onChange={e => setFeedbackForm({ ...feedbackForm, rating_packaging: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  >
                    <option value={5}>5 Stars - Perfect Packing</option>
                    <option value={4}>4 Stars - Good</option>
                    <option value={3}>3 Stars - Minor Scratches</option>
                    <option value={2}>2 Stars - Torn Packing</option>
                    <option value={1}>1 Star - Damaged Packing</option>
                  </select>
                </div>
              </div>

              {/* Transit Damage Checkbox */}
              <div style={{
                background: feedbackForm.has_transit_damage_shortage ? 'rgba(239,68,68,0.1)' : 'var(--bg-primary)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: feedbackForm.has_transit_damage_shortage ? '1px solid #ef4444' : '1px solid var(--border-light)',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <input
                  type="checkbox"
                  id="hasTransitDamage"
                  checked={feedbackForm.has_transit_damage_shortage}
                  onChange={e => setFeedbackForm({ ...feedbackForm, has_transit_damage_shortage: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="hasTransitDamage" style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: feedbackForm.has_transit_damage_shortage ? '#ef4444' : 'var(--text-primary)' }}>
                  Transit Damage or Shortage Reported by Partner
                </label>
              </div>

              {feedbackForm.has_transit_damage_shortage && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.35rem' }}>
                    Damage / Shortage Specifics *
                  </label>
                  <textarea
                    rows="2"
                    required
                    value={feedbackForm.damage_details}
                    onChange={e => setFeedbackForm({ ...feedbackForm, damage_details: e.target.value })}
                    placeholder="Describe specific missing parts, dented panel, broken levers, or transport shortage..."
                    style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid #ef4444', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  />
                </div>
              )}

              {/* Auto Complaint Alert Banner */}
              {isAutoComplaintWillTrigger && (
                <div style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid #ef4444',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  color: '#ef4444',
                  fontSize: '0.82rem'
                }}>
                  <ShieldAlert size={22} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>🚨 Automatic Grievance Escalation:</strong>
                    <div>Low score (≤ 2★) or transit damage will automatically generate a High-Priority Complaint Ticket assigned to Plant QA &amp; Logistics!</div>
                  </div>
                </div>
              )}

              {/* Dealer Comments */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Dealer Remarks &amp; Feedback Comments
                </label>
                <textarea
                  rows="2"
                  value={feedbackForm.dealer_comments}
                  onChange={e => setFeedbackForm({ ...feedbackForm, dealer_comments: e.target.value })}
                  placeholder="Dealer voice, driver behavior, compliments or suggestions..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              {/* Repeat Order Intent */}
              <div style={{
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1.25rem'
              }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.35rem' }}>
                  🔁 Next Repeat Order Expected Timeframe:
                </label>
                <select
                  value={feedbackForm.repeat_order_intent}
                  onChange={e => setFeedbackForm({ ...feedbackForm, repeat_order_intent: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  <option value="WITHIN_7_DAYS">⚡ Within 7 Days (Fast Turnaround)</option>
                  <option value="WITHIN_15_DAYS">📅 Within 15 Days (Fortnightly)</option>
                  <option value="NEXT_MONTH">🗓️ Next Month Cycle</option>
                  <option value="SEASONAL">🌾 Seasonal (After 2-3 Months)</option>
                  <option value="STOCK_FULL">📦 Ample Stock Currently</option>
                </select>
              </div>

              {feedbackSuccessMsg && (
                <div style={{ padding: '0.65rem 1rem', background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#34d399', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem' }}>
                  {feedbackSuccessMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedOrderForFeedback(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {saving ? 'Saving...' : 'Submit Satisfaction Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
