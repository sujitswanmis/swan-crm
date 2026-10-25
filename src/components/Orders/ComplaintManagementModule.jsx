'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle, Shield, CheckCircle2, Clock, Search, Filter,
  RefreshCw, Plus, ArrowRight, CheckSquare, Phone, User, ExternalLink
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import {
  getComplaintsTickets,
  createComplaintTicketDirect,
  updateComplaintTicketAction,
  verifyAndCloseComplaintTicket
} from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';
import StandardTablePagination from '../common/StandardTablePagination';
import SearchablePartySelect from '../common/SearchablePartySelect';

const CATEGORIES = [
  { id: 'MANUFACTURING_DEFECT', label: 'Manufacturing Defect (QA)', dept: 'QUALITY_ASSURANCE', sla: '48h' },
  { id: 'TRANSIT_DAMAGE', label: 'Transit Damage (Logistics)', dept: 'LOGISTICS_DISPATCH', sla: '24h' },
  { id: 'SHORTAGE_MISSING_PARTS', label: 'Shortage / Missing Parts', dept: 'LOGISTICS_DISPATCH', sla: '24h' },
  { id: 'BILLING_DISPUTE', label: 'Billing / Scheme Dispute', dept: 'ACCOUNTS_FINANCE', sla: '24h' },
  { id: 'DELIVERY_DELAY', label: 'Delivery Delay / Untraceable', dept: 'LOGISTICS_DISPATCH', sla: '12h' },
  { id: 'SERVICE_WARRANTY', label: 'Service / Warranty Claim', dept: 'SERVICE_ENGINEERING', sla: '72h' }
];

const DEPARTMENTS = [
  { id: 'QUALITY_ASSURANCE', label: 'Plant Quality Assurance (QA)' },
  { id: 'LOGISTICS_DISPATCH', label: 'Logistics & Dispatch' },
  { id: 'ACCOUNTS_FINANCE', label: 'Accounts & Billing' },
  { id: 'SERVICE_ENGINEERING', label: 'Field Service Engineering' }
];

const CLOSURE_METHODS = [
  { id: 'PHONE_CALL', label: '📞 Phone Call Confirmation with Partner' },
  { id: 'WHATSAPP_CONFIRMED', label: '💬 WhatsApp Written Confirmation' },
  { id: 'SIGNED_SLIP', label: '📝 Signed Delivery Slip / Replacement POD' },
  { id: 'FIELD_VISIT', label: '🧑‍🔧 Field Visit by Service Engineer' }
];

export default function ComplaintManagementModule({
  tenantId,
  parties = []
}) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    party_id: '',
    category: 'MANUFACTURING_DEFECT',
    priority: 'HIGH',
    assigned_department: 'QUALITY_ASSURANCE',
    issue_description: ''
  });

  const [selectedTicketForAction, setSelectedTicketForAction] = useState(null);
  const [actionForm, setActionForm] = useState({
    resolution_type: 'REPLACEMENT_DISPATCHED',
    action_reference_no: '',
    resolution_notes: ''
  });

  const [selectedTicketForClose, setSelectedTicketForClose] = useState(null);
  const [closeForm, setCloseForm] = useState({
    closure_method: 'PHONE_CALL',
    closure_notes: '',
    dealer_satisfaction_rating: 5,
    partner_remarks: ''
  });

  const [submitting, setSubmitting] = useState(false);

  // Table Column Resizer
  const defaultCols = {
    ticket_id: 170,
    partner: 240,
    category_dept: 220,
    sla_status: 180,
    issue: 260,
    status: 150,
    actions: 140
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('complaints_table_widths', defaultCols);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await getComplaintsTickets(tenantId, {
        status: statusFilter,
        department: deptFilter
      });
      setTickets(data || []);
    } catch (err) {
      console.error('Error loading complaints tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter, deptFilter, tenantId]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!createForm.party_id) {
      alert('Please select a Channel Partner.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createComplaintTicketDirect(createForm, tenantId);
      if (res.success) {
        setShowCreateModal(false);
        setCreateForm({
          party_id: '',
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

  const handleSaveAction = async (e) => {
    e.preventDefault();
    if (!selectedTicketForAction) return;
    setSubmitting(true);
    try {
      const res = await updateComplaintTicketAction(selectedTicketForAction.id, actionForm, tenantId);
      if (res.success) {
        setSelectedTicketForAction(null);
        loadTickets();
      } else {
        alert('Failed to update action: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error updating action: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyClose = async (e) => {
    e.preventDefault();
    if (!selectedTicketForClose) return;
    setSubmitting(true);
    try {
      const methodObj = CLOSURE_METHODS.find(m => m.id === closeForm.closure_method);
      const methodLabel = methodObj?.label || closeForm.closure_method;
      const notesPart = closeForm.closure_notes ? ` - ${closeForm.closure_notes}` : '';
      const remarksPart = closeForm.partner_remarks ? ` | Partner Remarks: ${closeForm.partner_remarks}` : '';
      const payload = {
        closure_otp: `${methodLabel}${notesPart}${remarksPart}`,
        dealer_satisfaction_rating: Number(closeForm.dealer_satisfaction_rating) || 5
      };
      const res = await verifyAndCloseComplaintTicket(selectedTicketForClose.id, payload, tenantId);
      if (res.success) {
        setSelectedTicketForClose(null);
        loadTickets();
      } else {
        alert('Failed to close ticket: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error closing ticket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const num = (t.ticket_number || '').toLowerCase();
      const firm = (t.party?.firm_name || '').toLowerCase();
      const desc = (t.issue_description || '').toLowerCase();

      return num.includes(term) || firm.includes(term) || desc.includes(term);
    });
  }, [tickets, searchTerm]);

  // Auto-reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const paginatedTickets = useMemo(() => {
    if (pageSize === 100000) return filteredTickets;
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, currentPage, pageSize]);

  // KPI Ribbon counts
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter(t => t.ticket_status === 'OPEN').length;
    const actionTaken = tickets.filter(t => t.ticket_status === 'ACTION_TAKEN').length;
    const closed = tickets.filter(t => t.ticket_status === 'RESOLVED_CLOSED').length;
    const breached = tickets.filter(t => t.isSlaBreached).length;
    return { total, open, actionTaken, closed, breached };
  }, [tickets]);

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
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.open}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase' }}>Action Recorded</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#60a5fa' }}>{kpis.actionTaken}</div>
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
            <Shield size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>SLA Breached</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.breached}</div>
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
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Ticket #, Partner, Issue description..."
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
            <option value="ALL">All Ticket Statuses</option>
            <option value="OPEN">🔴 Open</option>
            <option value="ACTION_TAKEN">🔵 Action Taken</option>
            <option value="RESOLVED_CLOSED">🟢 Verified &amp; Closed</option>
          </select>

          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>

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

      {/* Table with Resizable Columns and Sticky Header */}
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
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.category_dept}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Category &amp; Department
                  <ColumnResizer onMouseDown={e => startResize('category_dept', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.sla_status}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  SLA Status (IST)
                  <ColumnResizer onMouseDown={e => startResize('sla_status', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.issue}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Issue Description
                  <ColumnResizer onMouseDown={e => startResize('issue', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.status}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Ticket Status
                  <ColumnResizer onMouseDown={e => startResize('status', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Resolution Action
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No complaint tickets found matching filter.
                  </td>
                </tr>
              ) : (
                paginatedTickets.map(t => {
                  const p = t.party;
                  const isClosed = t.ticket_status === 'RESOLVED_CLOSED';

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#f87171', fontSize: '0.88rem' }}>
                          {t.ticket_number}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.45rem',
                          borderRadius: '4px',
                          marginTop: '0.25rem',
                          background: t.priority === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                          color: t.priority === 'CRITICAL' ? '#ef4444' : '#f59e0b'
                        }}>
                          {t.priority}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {p?.firm_name || 'Direct Customer'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          {[p?.district_name || p?.district, p?.state_name || p?.state].filter(Boolean).join(', ') || 'N/A'}
                        </div>
                        {(p?.primary_mobile || p?.biz_contact_no_1) && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <MaskedPhoneDisplay phone={p.primary_mobile || p.biz_contact_no_1} size="sm" />
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 600, color: '#60a5fa' }}>
                          {t.category?.replace(/_/g, ' ')}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                          Dept: {t.assigned_department?.replace(/_/g, ' ')}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isClosed ? (
                          <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.8rem' }}>
                            ✓ Resolved within SLA
                          </span>
                        ) : t.isSlaBreached ? (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: 'rgba(239,68,68,0.2)',
                            color: '#ef4444'
                          }}>
                            ⚠️ SLA Breached ({Math.abs(t.slaHoursRemaining)}h ago)
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: 'rgba(16,185,129,0.15)',
                            color: '#10b981'
                          }}>
                            🟢 {t.slaHoursRemaining}h remaining
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        <div style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.issue_description}
                        </div>
                        {t.action_reference_no && (
                          <div style={{ color: '#38bdf8', fontSize: '0.74rem', marginTop: '0.2rem' }}>
                            Ref: {t.action_reference_no} ({t.resolution_type})
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          background: t.ticket_status === 'OPEN'
                            ? 'rgba(239,68,68,0.15)'
                            : t.ticket_status === 'ACTION_TAKEN'
                            ? 'rgba(59,130,246,0.15)'
                            : 'rgba(16,185,129,0.15)',
                          color: t.ticket_status === 'OPEN'
                            ? '#ef4444'
                            : t.ticket_status === 'ACTION_TAKEN'
                            ? '#60a5fa'
                            : '#34d399'
                        }}>
                          {t.ticket_status?.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {t.ticket_status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicketForAction(t);
                              setActionForm({
                                resolution_type: 'REPLACEMENT_DISPATCHED',
                                action_reference_no: '',
                                resolution_notes: ''
                              });
                            }}
                            style={{
                              padding: '0.35rem 0.75rem',
                              background: 'rgba(59,130,246,0.15)',
                              border: '1px solid #3b82f6',
                              color: '#60a5fa',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Take Action
                          </button>
                        )}
                        {t.ticket_status === 'ACTION_TAKEN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicketForClose(t);
                              setCloseForm({
                                closure_method: 'PHONE_CALL',
                                closure_notes: '',
                                dealer_satisfaction_rating: 5,
                                partner_remarks: ''
                              });
                            }}
                            style={{
                              padding: '0.35rem 0.75rem',
                              background: 'rgba(16,185,129,0.15)',
                              border: '1px solid #10b981',
                              color: '#34d399',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Verify &amp; Close
                          </button>
                        )}
                        {isClosed && (
                          <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 700 }}>
                            ⭐ {t.dealer_satisfaction_rating || 5}/5 Partner Verified
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
          totalRecords={filteredTickets.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
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
            maxWidth: '540px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'visible'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTopLeftRadius: '15px',
              borderTopRightRadius: '15px',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, transparent 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Log Channel Partner Complaint
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <SearchablePartySelect
                  parties={parties}
                  selectedId={createForm.party_id}
                  onChange={(id) => setCreateForm(prev => ({ ...prev, party_id: id }))}
                  label="Select Channel Partner"
                  placeholder="Type to search partner by name, code, district, phone..."
                  color="#ef4444"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Complaint Category *
                  </label>
                  <select
                    value={createForm.category}
                    onChange={e => {
                      const cat = CATEGORIES.find(c => c.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        category: e.target.value,
                        assigned_department: cat?.dept || createForm.assigned_department
                      });
                    }}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.label} ({c.sla})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Priority *
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={e => setCreateForm({ ...createForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="CRITICAL">🔴 Critical (Immediate Action)</option>
                    <option value="HIGH">🟠 High (Within SLA)</option>
                    <option value="MEDIUM">🟡 Medium</option>
                    <option value="LOW">🟢 Low</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Issue Description &amp; Partner Voice *
                </label>
                <textarea
                  rows="3"
                  required
                  value={createForm.issue_description}
                  onChange={e => setCreateForm({ ...createForm, issue_description: e.target.value })}
                  placeholder="Detail the exact problem reported by channel partner (e.g. Broken gear tooth in rotavator chassis #8421)..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {submitting ? 'Creating Ticket...' : 'Generate Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Taken Modal */}
      {selectedTicketForAction && (
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
              background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, transparent 100%)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Record Corrective Action
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Ticket #{selectedTicketForAction.ticket_number} • {selectedTicketForAction.party?.firm_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForAction(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAction} style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Resolution / Corrective Action Type *
                </label>
                <select
                  value={actionForm.resolution_type}
                  onChange={e => setActionForm({ ...actionForm, resolution_type: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  <option value="REPLACEMENT_DISPATCHED">📦 Free Replacement Dispatched</option>
                  <option value="CREDIT_NOTE_ISSUED">💰 Credit Note / Billing Adjustment</option>
                  <option value="SPARE_PARTS_SENT">⚙️ Free Spare Parts Dispatched</option>
                  <option value="SERVICE_ENGINEER_VISIT">🧑‍🔧 Service Engineer Deputed On-site</option>
                  <option value="TECHNICAL_CLARIFICATION">📞 Technical Guidance Provided</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Action Reference Voucher / LR / Service No *
                </label>
                <input
                  type="text"
                  required
                  value={actionForm.action_reference_no}
                  onChange={e => setActionForm({ ...actionForm, action_reference_no: e.target.value })}
                  placeholder="e.g. Replacement Bilty #VT-4412 or Credit Note #CN-881"
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Action Notes
                </label>
                <textarea
                  rows="2"
                  value={actionForm.resolution_notes}
                  onChange={e => setActionForm({ ...actionForm, resolution_notes: e.target.value })}
                  placeholder="Details of action taken, dispatch courier, technician name..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedTicketForAction(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {submitting ? 'Saving...' : 'Record Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel Partner Verified Closure Modal */}
      {selectedTicketForClose && (
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
            maxWidth: '540px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, transparent 100%)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Channel Partner Verified Closure
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>#{selectedTicketForClose.ticket_number}</span>
                  <span>•</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedTicketForClose.party?.firm_name || 'Channel Partner'}</span>
                  {selectedTicketForClose.party?.primary_mobile && (
                    <MaskedPhoneDisplay phone={selectedTicketForClose.party.primary_mobile} size="sm" />
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketForClose(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifyClose} style={{ padding: '1.4rem' }}>
              {/* Context Summary Card: Original Issue & Action Taken */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                marginBottom: '1.15rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                fontSize: '0.82rem'
              }}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Reported Grievance:
                  </span>
                  <div style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontWeight: 600 }}>
                    {selectedTicketForClose.issue_description}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Corrective Action Taken:
                    </span>
                    <div style={{ color: '#3b82f6', fontWeight: 700, marginTop: '0.1rem' }}>
                      {selectedTicketForClose.resolution_type?.replace(/_/g, ' ') || 'Action Recorded'}
                      {selectedTicketForClose.action_reference_no && ` (Ref: ${selectedTicketForClose.action_reference_no})`}
                    </div>
                  </div>
                  {selectedTicketForClose.resolution_notes && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      "{selectedTicketForClose.resolution_notes}"
                    </div>
                  )}
                </div>
              </div>

              {/* Closure Verification Method (Selection List) */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Closure Verification Method *
                </label>
                <select
                  required
                  value={closeForm.closure_method}
                  onChange={e => setCloseForm({ ...closeForm, closure_method: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.86rem', fontWeight: 600 }}
                >
                  {CLOSURE_METHODS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Spoke with Person / Verification Note */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Person Spoke With / Verification Note
                </label>
                <input
                  type="text"
                  value={closeForm.closure_notes}
                  onChange={e => setCloseForm({ ...closeForm, closure_notes: e.target.value })}
                  placeholder="e.g. Confirmed with Proprietor Mr. Sharma / Signed voucher collected"
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                />
              </div>

              {/* Partner Resolution Satisfaction Score */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Partner Resolution Satisfaction Score *
                </label>
                <select
                  value={closeForm.dealer_satisfaction_rating}
                  onChange={e => setCloseForm({ ...closeForm, dealer_satisfaction_rating: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  <option value={5}>⭐⭐⭐⭐⭐ 5 - Highly Satisfied</option>
                  <option value={4}>⭐⭐⭐⭐ 4 - Satisfied</option>
                  <option value={3}>⭐⭐⭐ 3 - Acceptable</option>
                  <option value={2}>⭐⭐ 2 - Partially Satisfied</option>
                  <option value={1}>⭐ 1 - Not Satisfied</option>
                </select>
              </div>

              {/* Partner Remarks / Closing Feedback Textarea */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Partner Closing Remarks / Additional Feedback
                </label>
                <textarea
                  rows="2"
                  value={closeForm.partner_remarks}
                  onChange={e => setCloseForm({ ...closeForm, partner_remarks: e.target.value })}
                  placeholder="Record any comments, remarks, or observations shared by the partner..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.86rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedTicketForClose(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {submitting ? 'Verifying & Closing...' : 'Verify & Close Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
