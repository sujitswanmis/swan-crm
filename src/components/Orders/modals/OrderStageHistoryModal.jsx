'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  X, Clock, CheckCircle2, AlertTriangle, User, Calendar, ShieldCheck,
  Truck, FileText, IndianRupee, Layers, Check, ArrowRight, Table,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Edit3, Ban, Package, Info
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

// Format ISO date string to readable Indian Standard Time (+05:30)
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
    return isoDate;
  }
}

// Calculate human elapsed hours/days
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 hrs';
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours} hr(s)`;
  const days = (hours / 24).toFixed(1);
  return `${days} day(s)`;
}

// Format high-precision duration (mins/hours/days)
function formatExactDuration(ms) {
  if (!ms || ms <= 0) return '0 mins';
  const totalMins = Math.round(ms / (1000 * 60));
  if (totalMins < 60) return `${totalMins} min(s)`;
  const hours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;
  if (hours < 24) {
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours} hr(s)`;
  }
  const days = (hours / 24).toFixed(1);
  return `${days}d (${hours}h)`;
}

// Default master stages metadata fallback
const STAGE_METADATA_FALLBACK = {
  S01: { name: 'Order Confirmation', dept: 'Sales Desk', tat: 4, color: '#3b82f6' },
  S02: { name: 'PI Generation', dept: 'Accounts', tat: 2, color: '#6366f1' },
  S03: { name: 'PI Shared', dept: 'Sales Coordination', tat: 2, color: '#8b5cf6' },
  S04: { name: 'Request Advance Payment', dept: 'Accounts & Sales', tat: 4, color: '#ec4899' },
  S05: { name: 'Receive Advance Payment', dept: 'Accounts Team', tat: 24, color: '#14b8a6' },
  S06: { name: 'Check Stock & Production', dept: 'Plant / Works', tat: 48, color: '#f59e0b' },
  S07: { name: 'Product Partial & Full Status', dept: 'Plant Supervisor', tat: 12, color: '#d97706' },
  S08: { name: 'Quality Check (PDI)', dept: 'Quality Assurance', tat: 8, color: '#10b981' },
  S09: { name: 'Request 70% Balance', dept: 'Accounts & Sales', tat: 4, color: '#8b5cf6' },
  S10: { name: 'Receive 70% Balance', dept: 'Accounts Team', tat: 24, color: '#059669' },
  S11: { name: 'Ready for Dispatch', dept: 'Logistics', tat: 6, color: '#0284c7' },
  S12: { name: 'Dispatch Material', dept: 'Gate & Logistics', tat: 12, color: '#ea580c' },
  S13: { name: 'Material Delivered (POD)', dept: 'Customer Support', tat: 48, color: '#15803d' }
};

export default function OrderStageHistoryModal({
  order,
  isOpen,
  onClose,
  masterStages = []
}) {
  if (!isOpen || !order) return null;

  // View state: 'TABLE' (default) or 'TIMELINE'
  const [activeView, setActiveView] = useState('TABLE');

  // Pagination state (default 25 so all stages fit on 1-2 pages)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const history = Array.isArray(order.stage_history) ? order.stage_history : [];

  // Master stages dictionary for lookup
  const masterStageMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(masterStages)) {
      masterStages.forEach(s => {
        if (s?.id) map.set(s.id.toUpperCase(), s);
      });
    }
    return map;
  }, [masterStages]);

  // SLA Performance Scorecard metrics
  const scorecard = useMemo(() => {
    let onTimeCount = 0;
    let delayedCount = 0;

    history.forEach(h => {
      if (h.tat_breached) {
        delayedCount++;
      } else {
        onTimeCount++;
      }
    });

    const createdTime = order.created_at ? new Date(order.created_at).getTime() : Date.now();
    const lastTime = history.length > 0 && history[history.length - 1].actual_timestamp
      ? new Date(history[history.length - 1].actual_timestamp).getTime()
      : Date.now();
    const elapsedMs = Math.max(0, lastTime - createdTime);

    return {
      totalCompleted: history.length + 1, // Including S00 Order Punch
      onTimeCount: onTimeCount + 1, // S00 punch is always baseline on-time
      delayedCount,
      elapsedFormatted: formatDuration(elapsedMs)
    };
  }, [order, history]);

  // Construct comprehensive chronological audit events (S00 Punch + Revisions + Stages + Splits)
  const allAuditRows = useMemo(() => {
    const rows = [];
    const createdDate = order.created_at ? new Date(order.created_at) : new Date();
    const createdMs = createdDate.getTime();
    const createdIso = createdDate.toISOString();

    // 1. Step 0: Order Booked & Punched into Pipeline
    rows.push({
      id: 'row_s00_booked',
      stage_id: 'STAGE S00',
      stage_code: 'S00',
      stage_name: 'Order Booked & Punched into Pipeline',
      department: 'Sales Desk',
      action_by: order.assigned_caller_name || order.created_by || 'Sales / Order Desk',
      planned_timestamp: createdIso,
      actual_timestamp: createdIso,
      tat_hours: 0,
      time_taken_ms: 0,
      time_taken_formatted: 'Baseline (0m)',
      tat_breached: false,
      delay_diff_ms: 0,
      badge_type: 'PUNCH',
      badge_color: '#2563eb',
      notes: `Initial sales order punched with ${order.total_ordered_qty || 1} unit(s) totaling ₹${Number(order.total_amount || 0).toLocaleString('en-IN')}.`,
      custom_fields_data: {},
      product_allocations: [],
      previous_items: null,
      previous_amount: null,
      new_amount: order.total_amount || 0,
      initial_units: order.total_ordered_qty || 1
    });

    // 2. Subsequent Historical Events
    let prevActualMs = createdMs;

    history.forEach((entry, idx) => {
      const rawStageId = (entry.stage_id || `STEP_${idx + 1}`).toUpperCase();
      const masterInfo = masterStageMap.get(rawStageId) || STAGE_METADATA_FALLBACK[rawStageId] || {};

      const stageName = entry.stage_name || masterInfo.name || rawStageId;
      const dept = entry.department || masterInfo.department || 'Operations';
      const tatHours = Number(entry.tat_hours) || masterInfo.tat_hours || 2;

      const actualIso = entry.actual_timestamp || entry.created_at || new Date().toISOString();
      const actualMs = new Date(actualIso).getTime();

      // Duration taken for this stage action
      const timeTakenMs = Math.max(0, actualMs - prevActualMs);

      // Planned target deadline
      let plannedMs = entry.planned_timestamp ? new Date(entry.planned_timestamp).getTime() : null;
      if (!plannedMs) {
        plannedMs = prevActualMs + (tatHours * 3600 * 1000);
      }
      const plannedIso = new Date(plannedMs).toISOString();

      // Delayed SLA inspection
      const isDelayed = entry.tat_breached === true || (actualMs > plannedMs);
      const delayDiffMs = isDelayed ? Math.max(0, actualMs - plannedMs) : 0;

      // Update pointer for next chronological event
      prevActualMs = actualMs;

      // Categorize event type
      let badgeType = 'STAGE';
      let badgeColor = masterInfo.color || '#3b82f6';

      if (rawStageId.includes('REVISION') || stageName.toLowerCase().includes('revision')) {
        badgeType = 'REVISION';
        badgeColor = '#8b5cf6';
      } else if (rawStageId.includes('PARTIAL') || rawStageId.includes('SPLIT') || entry.lot_no) {
        badgeType = 'PARTIAL_LOT';
        badgeColor = '#d97706';
      } else if (rawStageId === 'CANCELLED' || stageName.toLowerCase().includes('cancel')) {
        badgeType = 'CANCEL';
        badgeColor = '#ef4444';
      }

      rows.push({
        id: `row_hist_${idx}_${rawStageId}`,
        stage_id: rawStageId,
        stage_code: rawStageId,
        stage_name: stageName,
        department: dept,
        action_by: entry.action_by || 'User',
        planned_timestamp: plannedIso,
        actual_timestamp: actualIso,
        tat_hours: tatHours,
        time_taken_ms: timeTakenMs,
        time_taken_formatted: formatExactDuration(timeTakenMs),
        tat_breached: isDelayed,
        delay_diff_ms: delayDiffMs,
        badge_type: badgeType,
        badge_color: badgeColor,
        notes: entry.notes || '',
        custom_fields_data: entry.custom_fields_data || {},
        product_allocations: entry.product_allocations || [],
        previous_items: entry.previous_items || null,
        previous_amount: entry.previous_amount || null,
        new_amount: entry.new_amount || null,
        lot_no: entry.lot_no || null,
        dispatched_qty: entry.dispatched_qty || null,
        remaining_qty: entry.remaining_qty || null,
        transporter_name: entry.transporter_name || '',
        lr_number: entry.lr_number || '',
        vehicle_number: entry.vehicle_number || ''
      });
    });

    return rows;
  }, [order, history, masterStageMap]);

  // Identify completed stage IDs
  const completedStageIds = useMemo(() => {
    return new Set(allAuditRows.map(r => r.stage_code.toUpperCase()));
  }, [allAuditRows]);

  // Pending upcoming stages from master stages list
  const pendingStages = useMemo(() => {
    if (!Array.isArray(masterStages) || masterStages.length === 0) return [];
    return masterStages.filter(s => !completedStageIds.has(s.id.toUpperCase()) && !s.is_cancelled);
  }, [masterStages, completedStageIds]);

  // Column Resizer setup
  const defaultColWidths = {
    stage: 210,
    action_by: 165,
    planned: 175,
    actual: 175,
    sla: 160,
    details: 330
  };

  const {
    colWidths,
    isResizing,
    handleResizeStart,
    resetColWidth,
    resetAllWidths
  } = useTableColumnResize(
    'order_stage_history_modal_cols_v1',
    defaultColWidths,
    { stage: 150, action_by: 120, planned: 130, actual: 130, sla: 120, details: 200 }
  );

  // Pagination calculation
  const totalRecords = allAuditRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const fromRecord = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const toRecord = Math.min(safeCurrentPage * pageSize, totalRecords);

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return allAuditRows.slice(start, start + pageSize);
  }, [allAuditRows, safeCurrentPage, pageSize]);

  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(Number(newSize) || 25);
    setCurrentPage(1);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1150,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '14px',
        width: '96%',
        maxWidth: '1200px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 40px -5px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.1rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '0.2rem 0.55rem',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#0284c7',
                border: '1px solid rgba(56, 189, 248, 0.3)'
              }}>
                AUDIT MATRIX
              </span>
              <h3 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Order Pipeline History — {order.order_number}
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Channel Partner: <strong style={{ color: 'var(--text-primary)' }}>{order.party?.firm_name || 'Channel Partner'}</strong>
              {' '}• Ordered: <strong>{order.total_ordered_qty || 1} Unit(s)</strong>
              {' '}• Amount: <strong style={{ color: '#059669' }}>₹{Number(order.total_amount || 0).toLocaleString('en-IN')}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* View Mode Switcher */}
            <div style={{
              display: 'flex',
              gap: '0.25rem',
              background: 'var(--bg-primary)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)'
            }}>
              <button
                type="button"
                onClick={() => { setActiveView('TABLE'); setCurrentPage(1); }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeView === 'TABLE' ? 'var(--bg-surface)' : 'transparent',
                  color: activeView === 'TABLE' ? '#2563eb' : 'var(--text-secondary)',
                  fontWeight: activeView === 'TABLE' ? 800 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: activeView === 'TABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Table size={14} />
                Table Matrix View
              </button>

              <button
                type="button"
                onClick={() => setActiveView('TIMELINE')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeView === 'TIMELINE' ? 'var(--bg-surface)' : 'transparent',
                  color: activeView === 'TIMELINE' ? '#2563eb' : 'var(--text-secondary)',
                  fontWeight: activeView === 'TIMELINE' ? 800 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: activeView === 'TIMELINE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Clock size={14} />
                Stepper Timeline View
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.35rem',
                display: 'flex',
                borderRadius: '6px'
              }}
              title="Close Audit View"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{
          padding: '1.25rem 1.5rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.15rem'
        }}>
          {/* SLA Performance Scorecard */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '0.75rem'
          }}>
            <div style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Audit Actions</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {scorecard.totalCompleted} Event(s)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>SLA On-Time (Within TAT)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '0.15rem' }}>
                {scorecard.onTimeCount} Stages (On-Time)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: scorecard.delayedCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-primary)',
              border: `1px solid ${scorecard.delayedCount > 0 ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-light)'}`,
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: scorecard.delayedCount > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: 600 }}>
                SLA Breached / Delayed
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: scorecard.delayedCount > 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {scorecard.delayedCount} Stage(s)
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Elapsed Pipeline Time</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                {scorecard.elapsedFormatted}
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: TABULAR AUDIT MATRIX (1-2 Page Comprehensive View) */}
          {activeView === 'TABLE' && (
            <div style={{
              background: 'var(--bg-surface)',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Bounded Scrollable Table Area with Sticky Header */}
              <div style={{
                overflow: 'auto',
                maxHeight: 'calc(80vh - 210px)',
                minHeight: '320px',
                width: '100%'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                      {/* Column 1: Stage / Action */}
                      <th style={{
                        width: `${colWidths.stage}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        Stage / Event
                        <ColumnResizer
                          colKey="stage"
                          isResizing={isResizing('stage')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>

                      {/* Column 2: Done By & Dept */}
                      <th style={{
                        width: `${colWidths.action_by}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        Action By &amp; Dept
                        <ColumnResizer
                          colKey="action_by"
                          isResizing={isResizing('action_by')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>

                      {/* Column 3: Planned Timestamp */}
                      <th style={{
                        width: `${colWidths.planned}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        Planned Target (SLA)
                        <ColumnResizer
                          colKey="planned"
                          isResizing={isResizing('planned')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>

                      {/* Column 4: Actual Timestamp */}
                      <th style={{
                        width: `${colWidths.actual}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        Actual Timestamp
                        <ColumnResizer
                          colKey="actual"
                          isResizing={isResizing('actual')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>

                      {/* Column 5: SLA Duration / TAT */}
                      <th style={{
                        width: `${colWidths.sla}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        SLA Duration / Status
                        <ColumnResizer
                          colKey="sla"
                          isResizing={isResizing('sla')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>

                      {/* Column 6: Details & Remarks */}
                      <th style={{
                        width: `${colWidths.details}px`,
                        padding: '0.8rem 1rem',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: 'var(--bg-surface)',
                        boxShadow: 'inset 0 -1px 0 var(--border-light)'
                      }}>
                        Key Details &amp; Audit Log
                        <ColumnResizer
                          colKey="details"
                          isResizing={isResizing('details')}
                          onResizeStart={handleResizeStart}
                          onReset={resetColWidth}
                        />
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No stage history recorded for this order yet.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, rIdx) => {
                        const isEven = rIdx % 2 === 0;

                        return (
                          <tr
                            key={row.id}
                            style={{
                              background: isEven ? 'var(--bg-surface)' : 'rgba(148, 163, 184, 0.03)',
                              borderBottom: '1px solid var(--border-light)'
                            }}
                          >
                            {/* 1. Stage / Event */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  padding: '0.18rem 0.5rem',
                                  borderRadius: '5px',
                                  background: `${row.badge_color}18`,
                                  color: row.badge_color,
                                  border: `1px solid ${row.badge_color}35`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {row.stage_id}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                                {row.stage_name}
                              </div>
                            </td>

                            {/* 2. Action By & Dept */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                <User size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                                <span>{row.action_by}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                {row.department}
                              </div>
                            </td>

                            {/* 3. Planned Target (SLA) */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {formatIST(row.planned_timestamp)}
                              </div>
                              <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                {row.tat_hours > 0 ? `Target TAT: ${row.tat_hours} Hours` : 'Baseline Event'}
                              </div>
                            </td>

                            {/* 4. Actual Timestamp */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {formatIST(row.actual_timestamp)}
                              </div>
                              <div style={{ fontSize: '0.71rem', color: '#10b981', marginTop: '0.2rem', fontWeight: 600 }}>
                                📅 Recorded IST
                              </div>
                            </td>

                            {/* 5. SLA Duration / Status */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Taken: {row.time_taken_formatted}
                              </div>

                              <div style={{ marginTop: '0.25rem' }}>
                                {row.badge_type === 'PUNCH' ? (
                                  <span style={{
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '12px',
                                    background: 'rgba(37, 99, 235, 0.1)',
                                    color: '#2563eb',
                                    border: '1px solid rgba(37, 99, 235, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    ⏱ Baseline
                                  </span>
                                ) : row.tat_breached ? (
                                  <span style={{
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '12px',
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    <AlertTriangle size={11} />
                                    Delayed (+{formatExactDuration(row.delay_diff_ms)})
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '12px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    <CheckCircle2 size={11} />
                                    ✓ On-Time
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 6. Key Details & Remarks */}
                            <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                              {/* Order Revision Event Details */}
                              {row.badge_type === 'REVISION' && (
                                <div style={{
                                  padding: '0.4rem 0.6rem',
                                  background: 'rgba(139, 92, 246, 0.08)',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(139, 92, 246, 0.25)',
                                  marginBottom: '0.35rem',
                                  fontSize: '0.76rem'
                                }}>
                                  <div style={{ fontWeight: 800, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Edit3 size={12} />
                                    Order Items / Value Revision:
                                  </div>
                                  {row.previous_amount && row.new_amount ? (
                                    <div style={{ marginTop: '0.2rem', color: 'var(--text-primary)' }}>
                                      Amount: <s>₹{Number(row.previous_amount).toLocaleString('en-IN')}</s> ➔ <strong style={{ color: '#059669' }}>₹{Number(row.new_amount).toLocaleString('en-IN')}</strong>
                                    </div>
                                  ) : null}
                                </div>
                              )}

                              {/* Split Lot Dispatch Details */}
                              {row.badge_type === 'PARTIAL_LOT' && (
                                <div style={{
                                  padding: '0.4rem 0.6rem',
                                  background: 'rgba(217, 119, 6, 0.08)',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(217, 119, 6, 0.25)',
                                  marginBottom: '0.35rem',
                                  fontSize: '0.76rem'
                                }}>
                                  <div style={{ fontWeight: 800, color: '#d97706', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Package size={12} />
                                    Split Lot Allocation: {row.dispatched_qty || 0} Units Ready
                                  </div>
                                  {row.remaining_qty > 0 && (
                                    <div style={{ color: '#b45309', fontWeight: 600, marginTop: '0.15rem' }}>
                                      • Retained in Assembly: {row.remaining_qty} Units
                                    </div>
                                  )}
                                  {row.transporter_name && (
                                    <div style={{ marginTop: '0.2rem', color: 'var(--text-primary)' }}>
                                      Transporter: <strong>{row.transporter_name}</strong> (LR: {row.lr_number || 'N/A'})
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Product Allocations Breakdown */}
                              {Array.isArray(row.product_allocations) && row.product_allocations.length > 0 && (
                                <div style={{
                                  padding: '0.35rem 0.55rem',
                                  background: 'rgba(37, 99, 235, 0.05)',
                                  border: '1px solid rgba(37, 99, 235, 0.2)',
                                  borderRadius: '6px',
                                  fontSize: '0.74rem',
                                  marginBottom: '0.35rem'
                                }}>
                                  <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: '0.15rem' }}>
                                    📦 Product Allocation:
                                  </div>
                                  {row.product_allocations.map((alloc, aidx) => (
                                    <div key={aidx} style={{ color: 'var(--text-primary)' }}>
                                      • <strong>{alloc.product}</strong>: {alloc.ready_qty} of {alloc.ordered_qty} Ready
                                      {alloc.remaining_qty > 0 && (
                                        <span style={{ color: '#d97706', fontWeight: 600 }}> ({alloc.remaining_qty} in Assembly)</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Custom Fields (PI No., Bank, Vehicle, LR, etc.) */}
                              {row.custom_fields_data && Object.keys(row.custom_fields_data).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.35rem' }}>
                                  {Object.entries(row.custom_fields_data).map(([k, v]) => {
                                    if (v === null || v === undefined || v === '') return null;
                                    return (
                                      <span
                                        key={k}
                                        style={{
                                          fontSize: '0.7rem',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          background: 'rgba(148, 163, 184, 0.12)',
                                          color: 'var(--text-secondary)',
                                          border: '1px solid var(--border-light)'
                                        }}
                                      >
                                        <strong style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                                          {k.replace(/_/g, ' ')}:
                                        </strong>{' '}
                                        {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* User Notes / Remarks */}
                              {row.notes && (
                                <div style={{
                                  fontSize: '0.76rem',
                                  color: 'var(--text-secondary)',
                                  fontStyle: 'italic',
                                  lineHeight: 1.35
                                }}>
                                  &quot;{row.notes}&quot;
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Standard Table Pagination Footer (CRM Unified Standard) */}
              <div style={{
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                background: 'var(--bg-surface)'
              }}>
                {/* Record Counter */}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Showing <strong>{fromRecord}</strong> to <strong>{toRecord}</strong> of <strong>{totalRecords}</strong> records
                </div>

                {/* Rows per page selector and 5-Button Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(e.target.value)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  {/* Standard 5-Button Navigation Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => handlePageChange(1)}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: safeCurrentPage <= 1 ? 'var(--bg-primary)' : 'var(--bg-surface)',
                        color: safeCurrentPage <= 1 ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                        cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="First Page"
                    >
                      <ChevronsLeft size={14} />
                    </button>

                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => handlePageChange(safeCurrentPage - 1)}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: safeCurrentPage <= 1 ? 'var(--bg-primary)' : 'var(--bg-surface)',
                        color: safeCurrentPage <= 1 ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                        cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Previous Page"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', padding: '0 0.35rem' }}>
                      Page {safeCurrentPage} of {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => handlePageChange(safeCurrentPage + 1)}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: safeCurrentPage >= totalPages ? 'var(--bg-primary)' : 'var(--bg-surface)',
                        color: safeCurrentPage >= totalPages ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                        cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Next Page"
                    >
                      <ChevronRight size={14} />
                    </button>

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => handlePageChange(totalPages)}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: safeCurrentPage >= totalPages ? 'var(--bg-primary)' : 'var(--bg-surface)',
                        color: safeCurrentPage >= totalPages ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                        cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Last Page"
                    >
                      <ChevronsRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: STEPPER TIMELINE CARDS VIEW (Optional Alternate View) */}
          {activeView === 'TIMELINE' && (
            <div>
              <h4 style={{
                margin: '0 0 1rem 0',
                fontSize: '0.88rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}>
                <Clock size={16} style={{ color: '#2563eb' }} />
                Chronological Audit Trail (Cards View):
              </h4>

              <div style={{ position: 'relative', paddingLeft: '1.75rem' }}>
                {/* Vertical connecting line */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  bottom: '12px',
                  left: '9px',
                  width: '2px',
                  background: 'var(--border-light)'
                }} />

                {allAuditRows.map((entry, idx) => {
                  const isDelayed = entry.tat_breached;
                  const formattedActual = formatIST(entry.actual_timestamp);
                  const formattedPlanned = formatIST(entry.planned_timestamp);

                  return (
                    <div key={entry.id || idx} style={{ position: 'relative', marginBottom: '1.25rem' }}>
                      {/* Node Icon */}
                      <div style={{
                        position: 'absolute',
                        left: '-1.75rem',
                        top: '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: entry.badge_type === 'PUNCH' ? '#2563eb' : (isDelayed ? '#ef4444' : '#10b981'),
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 0 3px var(--bg-surface)'
                      }}>
                        <Check size={11} />
                      </div>

                      {/* Step Card */}
                      <div style={{
                        background: 'var(--bg-primary)',
                        border: isDelayed ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-light)',
                        borderRadius: '10px',
                        padding: '0.85rem 1rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: `${entry.badge_color}18`,
                              color: entry.badge_color
                            }}>
                              {entry.stage_id}
                            </span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {entry.stage_name}
                            </strong>
                          </div>

                          {/* SLA Badge */}
                          <div>
                            {entry.badge_type === 'PUNCH' ? (
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(37, 99, 235, 0.1)',
                                color: '#2563eb',
                                border: '1px solid rgba(37, 99, 235, 0.25)'
                              }}>
                                ⏱ Baseline Event
                              </span>
                            ) : isDelayed ? (
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                <AlertTriangle size={11} />
                                Delayed (+{formatExactDuration(entry.delay_diff_ms)})
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                <CheckCircle2 size={11} />
                                ✓ On Time (Within SLA)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Metadata Row: Action By + Date + Department */}
                        <div style={{
                          marginTop: '0.45rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          flexWrap: 'wrap',
                          fontSize: '0.76rem',
                          color: 'var(--text-secondary)'
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <User size={13} style={{ color: '#2563eb' }} />
                            Action By: <strong style={{ color: 'var(--text-primary)' }}>{entry.action_by}</strong>
                          </span>

                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Calendar size={13} />
                            Actual: {formattedActual}
                          </span>

                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={12} />
                            Planned Target: {formattedPlanned}
                          </span>

                          <span style={{ color: '#2563eb', fontWeight: 600 }}>
                            Duration: {entry.time_taken_formatted}
                          </span>
                        </div>

                        {/* Notes / Remarks */}
                        {entry.notes && (
                          <div style={{
                            marginTop: '0.5rem',
                            padding: '0.45rem 0.65rem',
                            background: 'var(--bg-surface)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            fontSize: '0.78rem',
                            color: 'var(--text-primary)',
                            fontStyle: 'italic'
                          }}>
                            &quot;{entry.notes}&quot;
                          </div>
                        )}

                        {/* Product Allocations (Split Lot) */}
                        {Array.isArray(entry.product_allocations) && entry.product_allocations.length > 0 && (
                          <div style={{
                            marginTop: '0.5rem',
                            padding: '0.45rem 0.65rem',
                            background: 'rgba(37,99,235,0.06)',
                            border: '1px solid rgba(37,99,235,0.2)',
                            borderRadius: '6px',
                            fontSize: '0.74rem'
                          }}>
                            <div style={{ fontWeight: 700, color: '#2563eb', marginBottom: '0.2rem' }}>
                              📦 Product-Wise Split Lot Breakdown:
                            </div>
                            {entry.product_allocations.map((alloc, aidx) => (
                              <div key={aidx} style={{ color: 'var(--text-primary)' }}>
                                • <strong>{alloc.product}</strong>: {alloc.ready_qty} of {alloc.ordered_qty} Ready to Dispatch
                                {alloc.remaining_qty > 0 && (
                                  <span style={{ color: '#d97706', fontWeight: 600 }}> ({alloc.remaining_qty} in Assembly)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Stages Preview in Pipeline */}
          {pendingStages.length > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.65rem'
              }}>
                Upcoming Pending Stages in Pipeline:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
                {pendingStages.map((stg) => (
                  <div
                    key={stg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-medium, #cbd5e1)',
                      background: 'rgba(148, 163, 184, 0.04)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.76rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(148,163,184,0.15)',
                        color: 'var(--text-secondary)'
                      }}>
                        {stg.id}
                      </span>
                      <span style={{ fontWeight: 600 }}>{stg.name}</span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      TAT: <strong>{stg.tat_hours || 4}h</strong> • {stg.department || 'Matrix'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.5rem',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Info size={13} style={{ color: '#2563eb' }} />
            <span>All timestamps and planned deadlines are strictly evaluated in Indian Standard Time (IST UTC+5:30).</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 1.25rem',
              background: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Close Audit View
          </button>
        </div>
      </div>
    </div>
  );
}
