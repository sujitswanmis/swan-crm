'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Search, Plus, RefreshCw, Filter, ShieldCheck, AlertCircle,
  Clock, Download, Eye, Phone, MapPin, Building2, Package, FileText,
  ExternalLink, Calendar, CheckCircle2, AlertTriangle, X, Wrench,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Check
} from 'lucide-react';
import { getEndCustomers } from '@/app/actions/endCustomers';
import { getPartyList } from '@/app/actions/partyMaster';
import { getComplaintsTickets } from '@/app/actions/orderFulfillment';
import RegisterEndCustomerModal from './modals/RegisterEndCustomerModal';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import MaskedPhoneDisplay from '@/components/common/MaskedPhoneDisplay';

const DEFAULT_COL_WIDTHS = {
  select: 45,
  customer_code: 160,
  full_name: 200,
  contact: 170,
  location: 200,
  linked_dealer: 220,
  machine_chassis: 220,
  purchase_info: 170,
  warranty: 160,
  complaints_count: 120,
  actions: 110
};

const MIN_COL_WIDTHS = {
  select: 40,
  customer_code: 130,
  full_name: 150,
  contact: 140,
  location: 150,
  linked_dealer: 160,
  machine_chassis: 160,
  purchase_info: 140,
  warranty: 130,
  complaints_count: 100,
  actions: 100
};

export default function EndCustomerMasterModule({
  tenantId = 'TNT00002',
  userCompany = 'New Swan Group',
  userRole = '',
  userName = '',
  onNavigateToComplaints = null
}) {
  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [warrantyFilter, setWarrantyFilter] = useState('ALL');
  const [dealerFilter, setDealerFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');

  // Pagination state (Standard Table Pagination Rule)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Column Resizing hook
  const { colWidths, resizingCol, handleResizeStart, resetWidth } = useTableColumnResize(
    'end_customer_master_col_widths',
    DEFAULT_COL_WIDTHS,
    MIN_COL_WIDTHS
  );

  // Load Customers, Parties & Tickets data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [custList, partyRes, ticketsRes] = await Promise.all([
        getEndCustomers(tenantId),
        getPartyList(tenantId).catch(() => ({ data: [] })),
        getComplaintsTickets(tenantId).catch(() => ({ tickets: [] }))
      ]);

      setCustomers(Array.isArray(custList) ? custList : []);
      const partyData = Array.isArray(partyRes?.data) ? partyRes.data : (Array.isArray(partyRes) ? partyRes : []);
      setParties(partyData);
      setTickets(Array.isArray(ticketsRes?.tickets) ? ticketsRes.tickets : []);
    } catch (err) {
      console.error('Failed to load end customers:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract unique states for filter
  const uniqueStates = useMemo(() => {
    const s = new Set();
    customers.forEach(c => {
      if (c.state_name) s.add(c.state_name);
    });
    return Array.from(s).sort();
  }, [customers]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (searchTerm && searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(c => {
        const code = (c.customer_code || '').toLowerCase();
        const name = (c.full_name || '').toLowerCase();
        const m1 = (c.mobile_1 || '').toLowerCase();
        const m2 = (c.mobile_2 || '').toLowerCase();
        const serial = (c.chassis_serial_number || '').toLowerCase();
        const dealer = (c.linked_party_name || '').toLowerCase();
        const district = (c.district_name || '').toLowerCase();
        return code.includes(q) || name.includes(q) || m1.includes(q) || m2.includes(q) || serial.includes(q) || dealer.includes(q) || district.includes(q);
      });
    }

    if (warrantyFilter !== 'ALL') {
      result = result.filter(c => c.warranty_info?.status === warrantyFilter);
    }

    if (dealerFilter !== 'ALL') {
      result = result.filter(c => c.linked_party_id === dealerFilter || c.linked_party_code === dealerFilter);
    }

    if (stateFilter !== 'ALL') {
      result = result.filter(c => c.state_name === stateFilter);
    }

    return result;
  }, [customers, searchTerm, warrantyFilter, dealerFilter, stateFilter]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, warrantyFilter, dealerFilter, stateFilter, pageSize]);

  // Pagination calculation
  const totalRecords = filteredCustomers.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const fromRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toRecord = Math.min(currentPage * pageSize, totalRecords);

  // Copy helper
  const handleCopy = (text, id) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Helper to count customer complaints
  const getCustomerComplaints = useCallback((customer) => {
    return tickets.filter(t => 
      String(t.customer_id) === String(customer.id) ||
      (t.chassis_serial_number && customer.chassis_serial_number && t.chassis_serial_number.toLowerCase() === customer.chassis_serial_number.toLowerCase())
    );
  }, [tickets]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) return;
    const headers = [
      'Customer Code',
      'Full Name',
      'Mobile 1',
      'Mobile 2',
      'State',
      'District',
      'Full Address',
      'Linked Dealer',
      'Dealer Code',
      'Product Model',
      'Chassis Serial No',
      'Purchase Date',
      'Invoice No',
      'Warranty Status',
      'Warranty Expiry Date',
      'Total Complaints'
    ];

    const rows = filteredCustomers.map(c => [
      `"${c.customer_code || ''}"`,
      `"${c.full_name || ''}"`,
      `"${c.mobile_1 || ''}"`,
      `"${c.mobile_2 || ''}"`,
      `"${c.state_name || ''}"`,
      `"${c.district_name || ''}"`,
      `"${(c.full_address || '').replace(/"/g, '""')}"`,
      `"${c.linked_party_name || ''}"`,
      `"${c.linked_party_code || ''}"`,
      `"${c.product_name || ''}"`,
      `"${c.chassis_serial_number || ''}"`,
      `"${c.purchase_date || ''}"`,
      `"${c.purchase_invoice_no || ''}"`,
      `"${c.warranty_info?.status || ''}"`,
      `"${c.warranty_info?.expiry_date || ''}"`,
      getCustomerComplaints(c).length
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `End_Customers_${tenantId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {/* Top Banner Header */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'rgba(37, 99, 235, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb'
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                End Customer &amp; Farmer Master Directory
              </h2>
              <span style={{
                fontSize: '0.74rem',
                padding: '0.2rem 0.55rem',
                background: 'rgba(37, 99, 235, 0.1)',
                color: '#2563eb',
                borderRadius: '6px',
                fontWeight: 700
              }}>
                {customers.length} Registered Owners
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Retail consumer registry mapped to authorized channel dealers, chassis numbers, live warranty status, and service history.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '0.55rem 0.85rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredCustomers.length === 0}
            style={{
              padding: '0.55rem 0.85rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: filteredCustomers.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <Download size={14} />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            style={{
              padding: '0.55rem 1.15rem',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            <Plus size={15} />
            + Register End Customer
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '10px',
        padding: '0.85rem 1rem',
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
              placeholder="Search Customer ID, Name, Mobile, Chassis, Dealer..."
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

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Warranty Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Warranty:</span>
            <select
              value={warrantyFilter}
              onChange={e => setWarrantyFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">🟢 Active Warranty</option>
              <option value="EXPIRING_SOON">🟡 Expiring Soon (30 Days)</option>
              <option value="EXPIRED">🔴 Out of Warranty (Expired)</option>
              <option value="EXTENDED">🟠 Extended Warranty</option>
            </select>
          </div>

          {/* Linked Dealer Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Dealer:</span>
            <select
              value={dealerFilter}
              onChange={e => setDealerFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                maxWidth: '190px'
              }}
            >
              <option value="ALL">All Channel Dealers</option>
              {parties.map(p => (
                <option key={p.id || p.party_code} value={p.id || p.party_code}>
                  {p.firm_name || p.name} [{p.party_code || 'DLR'}]
                </option>
              ))}
            </select>
          </div>

          {/* State Filter */}
          {uniqueStates.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>State:</span>
              <select
                value={stateFilter}
                onChange={e => setStateFilter(e.target.value)}
                style={{
                  padding: '0.45rem 0.65rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              >
                <option value="ALL">All States</option>
                {uniqueStates.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Grid Container with Sticky Header & Column Resizing */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          overflow: 'auto',
          maxHeight: 'calc(100vh - 340px)',
          minHeight: '380px'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.83rem',
            tableLayout: 'fixed'
          }}>
            <thead style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: 'var(--bg-surface)',
              boxShadow: 'inset 0 -1px 0 var(--border-light)'
            }}>
              <tr style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                {/* Select / # */}
                <th style={{ width: `${colWidths.select}px`, minWidth: `${MIN_COL_WIDTHS.select}px`, padding: '0.75rem 0.5rem', textAlign: 'center', position: 'relative' }}>
                  #
                  <ColumnResizer colKey="select" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'select'} />
                </th>

                {/* Customer Code */}
                <th style={{ width: `${colWidths.customer_code}px`, minWidth: `${MIN_COL_WIDTHS.customer_code}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Customer ID
                  <ColumnResizer colKey="customer_code" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'customer_code'} />
                </th>

                {/* Customer Full Name */}
                <th style={{ width: `${colWidths.full_name}px`, minWidth: `${MIN_COL_WIDTHS.full_name}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Full Name
                  <ColumnResizer colKey="full_name" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'full_name'} />
                </th>

                {/* Contact (Mobile 1 & 2) */}
                <th style={{ width: `${colWidths.contact}px`, minWidth: `${MIN_COL_WIDTHS.contact}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Contact (Primary / Alt)
                  <ColumnResizer colKey="contact" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'contact'} />
                </th>

                {/* State, District & Address */}
                <th style={{ width: `${colWidths.location}px`, minWidth: `${MIN_COL_WIDTHS.location}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Location / Territory
                  <ColumnResizer colKey="location" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'location'} />
                </th>

                {/* Linked Dealer */}
                <th style={{ width: `${colWidths.linked_dealer}px`, minWidth: `${MIN_COL_WIDTHS.linked_dealer}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Linked Dealer (Party)
                  <ColumnResizer colKey="linked_dealer" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'linked_dealer'} />
                </th>

                {/* Machine & Chassis */}
                <th style={{ width: `${colWidths.machine_chassis}px`, minWidth: `${MIN_COL_WIDTHS.machine_chassis}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Machine &amp; Chassis No.
                  <ColumnResizer colKey="machine_chassis" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'machine_chassis'} />
                </th>

                {/* Purchase Info */}
                <th style={{ width: `${colWidths.purchase_info}px`, minWidth: `${MIN_COL_WIDTHS.purchase_info}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Purchase Bill / Date
                  <ColumnResizer colKey="purchase_info" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'purchase_info'} />
                </th>

                {/* Warranty Status */}
                <th style={{ width: `${colWidths.warranty}px`, minWidth: `${MIN_COL_WIDTHS.warranty}px`, padding: '0.75rem 0.75rem', position: 'relative' }}>
                  Warranty Status
                  <ColumnResizer colKey="warranty" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'warranty'} />
                </th>

                {/* Complaints Count */}
                <th style={{ width: `${colWidths.complaints_count}px`, minWidth: `${MIN_COL_WIDTHS.complaints_count}px`, padding: '0.75rem 0.75rem', position: 'relative', textAlign: 'center' }}>
                  Service Hist.
                  <ColumnResizer colKey="complaints_count" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'complaints_count'} />
                </th>

                {/* Actions */}
                <th style={{ width: `${colWidths.actions}px`, minWidth: `${MIN_COL_WIDTHS.actions}px`, padding: '0.75rem 0.75rem', position: 'relative', textAlign: 'center' }}>
                  Action
                  <ColumnResizer colKey="actions" onResizeStart={handleResizeStart} onReset={resetWidth} isResizing={resizingCol === 'actions'} />
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.6rem auto', color: '#2563eb' }} />
                    Loading End Customer directory...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Users size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
                    <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-primary)' }}>No End Customers Found</strong>
                    <span style={{ fontSize: '0.8rem' }}>Click "+ Register End Customer" to add your first machine owner.</span>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((cust, idx) => {
                  const custComplaints = getCustomerComplaints(cust);
                  const wInfo = cust.warranty_info || {};
                  const isExp = wInfo.status === 'EXPIRED';
                  const isSoon = wInfo.status === 'EXPIRING_SOON';
                  const isAct = wInfo.status === 'ACTIVE';

                  return (
                    <tr
                      key={cust.id || cust.customer_code || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.02))'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* # Sequence */}
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>

                      {/* Customer ID */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-color, #2563eb)', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                            {cust.customer_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(cust.customer_code, cust.id)}
                            title="Copy Universal Code"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: copiedId === cust.id ? '#10b981' : 'var(--text-secondary)',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            {copiedId === cust.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Full Name */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '0.84rem' }}>
                          {cust.full_name}
                        </strong>
                        {cust.email_1 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {cust.email_1}
                          </span>
                        )}
                      </td>

                      {/* Contact */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Phone size={12} style={{ color: '#10b981' }} />
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                            {cust.mobile_1 || 'N/A'}
                          </strong>
                        </div>
                        {cust.mobile_2 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                            Alt: {cust.mobile_2}
                          </span>
                        )}
                      </td>

                      {/* Location */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {cust.district_name || '—'}, {cust.state_name || '—'}
                        </div>
                        {cust.block_area_name && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Block: {cust.block_area_name}
                          </span>
                        )}
                      </td>

                      {/* Linked Dealer */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Building2 size={13} style={{ color: '#ea580c', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                            {cust.linked_party_name || 'Direct Swan Customer'}
                          </span>
                        </div>
                        {cust.linked_party_code && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            [{cust.linked_party_code}]
                          </span>
                        )}
                      </td>

                      {/* Machine & Chassis */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <strong style={{ color: 'var(--text-primary)', fontSize: '0.82rem', display: 'block' }}>
                          {cust.product_name || 'Rotavator / Ag Machine'}
                        </strong>
                        <span style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          background: 'var(--bg-primary)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-light)',
                          color: '#0284c7',
                          fontWeight: 700
                        }}>
                          SN: {cust.chassis_serial_number || 'N/A'}
                        </span>
                      </td>

                      {/* Purchase Info */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {cust.purchase_date || '—'}
                        </div>
                        {cust.purchase_invoice_no && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Bill: {cust.purchase_invoice_no}
                          </span>
                        )}
                      </td>

                      {/* Warranty Status */}
                      <td style={{ padding: '0.75rem 0.75rem' }}>
                        <span style={{
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: isAct
                            ? 'rgba(16, 185, 129, 0.12)'
                            : isSoon
                            ? 'rgba(245, 158, 11, 0.12)'
                            : 'rgba(239, 68, 68, 0.12)',
                          color: isAct
                            ? '#059669'
                            : isSoon
                            ? '#d97706'
                            : '#dc2626',
                          border: `1px solid ${isAct ? 'rgba(16, 185, 129, 0.3)' : isSoon ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}>
                          {isAct && '🟢 Active'}
                          {isSoon && '🟡 Expiring Soon'}
                          {isExp && '🔴 Expired'}
                          {!isAct && !isSoon && !isExp && (wInfo.status || 'Active')}
                        </span>
                        {wInfo.expiry_date && (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Exp: {wInfo.expiry_date}
                          </span>
                        )}
                      </td>

                      {/* Complaints History */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '12px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          background: custComplaints.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-primary)',
                          color: custComplaints.length > 0 ? '#ef4444' : 'var(--text-secondary)',
                          border: '1px solid var(--border-light)'
                        }}>
                          {custComplaints.length} Tickets
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setViewingCustomer(cust)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '6px',
                            color: 'var(--accent-color, #2563eb)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={13} />
                          View 360
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Unified Standard Bottom Page Navigation (Standard Pagination Rule) */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.82rem'
        }}>
          {/* Record Counter */}
          <div style={{ color: 'var(--text-secondary)' }}>
            Showing <strong>{fromRecord}</strong> to <strong>{toRecord}</strong> of <strong>{totalRecords}</strong> records
          </div>

          {/* Controls: Rows per page + 5-button nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Rows Per Page Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{
                  padding: '0.3rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {[10, 25, 50, 100].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>

            {/* 5-Button Navigation Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1}
                title="First Page"
                style={{
                  padding: '0.35rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: currentPage <= 1 ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronsLeft size={14} />
              </button>

              {/* Previous Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage <= 1}
                title="Previous Page"
                style={{
                  padding: '0.35rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: currentPage <= 1 ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronLeft size={14} />
              </button>

              {/* Current Page Indicator */}
              <span style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--text-primary)'
              }}>
                Page {currentPage} of {totalPages}
              </span>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages}
                title="Next Page"
                style={{
                  padding: '0.35rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: currentPage >= totalPages ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronRight size={14} />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                title="Last Page"
                style={{
                  padding: '0.35rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: currentPage >= totalPages ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer 360 Detail Modal */}
      {viewingCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-primary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  background: 'rgba(37,99,235,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb'
                }}>
                  <Users size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {viewingCustomer.full_name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--accent-color, #2563eb)', fontFamily: 'monospace', fontWeight: 700 }}>
                      {viewingCustomer.customer_code}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>•</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Registered: {viewingCustomer.created_at ? String(viewingCustomer.created_at).slice(0, 10) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Section 1: Contact & Location */}
              <div style={{
                background: 'var(--bg-primary)',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  👤 Contact &amp; Geographic Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Primary Mobile:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.mobile_1 || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Secondary Mobile:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.mobile_2 || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Email ID:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.email_1 || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>State &amp; District:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.district_name}, {viewingCustomer.state_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Block / Area:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.block_area_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>PIN Code:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.pin_code || '—'}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Full Address:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.full_address || '—'}</strong>
                  </div>
                </div>
              </div>

              {/* Section 2: Machine & Warranty Card */}
              <div style={{
                background: 'var(--bg-primary)',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)'
              }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  🚜 Machine, Dealer &amp; Warranty Information
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Linked Dealer:</span>
                    <strong style={{ color: '#ea580c' }}>{viewingCustomer.linked_party_name || 'Direct Swan Customer'}</strong>
                    {viewingCustomer.linked_party_code && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                        [{viewingCustomer.linked_party_code}]
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Machine Model:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.product_name || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Chassis Serial No:</span>
                    <strong style={{ color: '#0284c7', fontFamily: 'monospace' }}>{viewingCustomer.chassis_serial_number || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Purchase Date:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.purchase_date || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Invoice Bill No:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{viewingCustomer.purchase_invoice_no || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'block' }}>Warranty Status:</span>
                    <strong style={{
                      color: viewingCustomer.warranty_info?.status === 'ACTIVE'
                        ? '#059669'
                        : viewingCustomer.warranty_info?.status === 'EXPIRING_SOON'
                        ? '#d97706'
                        : '#dc2626'
                    }}>
                      {viewingCustomer.warranty_info?.status || 'Active'} (Expires: {viewingCustomer.warranty_info?.expiry_date || '—'})
                    </strong>
                  </div>
                </div>

                {/* Uploaded Documents / Photos Preview */}
                {(viewingCustomer.invoice_document_url || viewingCustomer.chassis_plate_photo_url) && (
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-light)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {viewingCustomer.invoice_document_url && (
                      <a
                        href={viewingCustomer.invoice_document_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '0.45rem 0.75rem',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          color: '#2563eb',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          textDecoration: 'none'
                        }}
                      >
                        <FileText size={14} />
                        View Purchase Invoice (PDF/Img)
                      </a>
                    )}
                    {viewingCustomer.chassis_plate_photo_url && (
                      <a
                        href={viewingCustomer.chassis_plate_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '0.45rem 0.75rem',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '6px',
                          color: '#0284c7',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          textDecoration: 'none'
                        }}
                      >
                        <ExternalLink size={14} />
                        View Chassis Plate Photo
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Section 3: Live Service & Complaint History */}
              <div style={{
                background: 'var(--bg-primary)',
                padding: '1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    🛠️ Service &amp; Complaint History ({getCustomerComplaints(viewingCustomer).length})
                  </h4>
                  {onNavigateToComplaints && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewingCustomer(null);
                        onNavigateToComplaints(viewingCustomer);
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        background: '#ef4444',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Log Complaint for Customer
                    </button>
                  )}
                </div>

                {getCustomerComplaints(viewingCustomer).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    No service complaints logged for this customer or machine chassis.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {getCustomerComplaints(viewingCustomer).map((t, idx) => (
                      <div
                        key={t.id || idx}
                        style={{
                          background: 'var(--bg-surface)',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem'
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.82rem', display: 'block' }}>
                            {t.ticket_number || t.id} — {t.category || 'Service Issue'}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {t.issue_description || 'No description entered'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#2563eb'
                          }}>
                            {t.current_stage || t.stage || 'C01'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--bg-primary)'
            }}>
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Register End Customer Modal */}
      <RegisterEndCustomerModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={() => {
          setShowRegisterModal(false);
          loadData();
        }}
        parties={parties}
        tenantId={tenantId}
      />
    </div>
  );
}
