'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  Calendar,
  Clock,
  RefreshCw,
  Receipt,
  Printer,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Users,
  Phone,
  Mail,
  UserPlus,
  Building2,
  Infinity as InfinityIcon
} from 'lucide-react';
import { getOwnTenantBillingSummary, cancelPendingSaasProforma } from '@/app/actions/saasSubscription';
import { saasInvoiceTotals } from '@/lib/saasBilling';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const DEFAULT_BILLING_COL_WIDTHS = {
  invoice_no: 145,
  date_ist: 130,
  period: 155,
  description: 260,
  base_amt: 115,
  gst_amt: 105,
  total_amt: 120,
  payment_ref: 165,
  status: 110,
  action: 120
};

const MIN_BILLING_COL_WIDTHS = {
  invoice_no: 110,
  date_ist: 110,
  period: 120,
  description: 160,
  base_amt: 90,
  gst_amt: 85,
  total_amt: 95,
  payment_ref: 120,
  status: 90,
  action: 100
};

function formatISTDate(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return 'N/A';
  }
}

function formatISTDateTime(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'N/A';
  }
}

/**
 * TenantBillingConfig
 * Read-only subscription period, expiry countdown, quotas, and billing history for Tenant Admins inside Settings.
 */
export default function TenantBillingConfig({ tenantId = null, userCompany = '', isMasterAdmin = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantInfo, setTenantInfo] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedModuleUsage, setSelectedModuleUsage] = useState(null);
  const [moduleUserSearch, setModuleUserSearch] = useState('');
  const [moduleRoleFilter, setModuleRoleFilter] = useState('ALL');
  const [cancellingInv, setCancellingInv] = useState(null);
  const [tableView, setTableView] = useTableViewPreference('settings_tenant_billing_view');

  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) {
          if (settings.defaultPageSize === 'All') return 100000;
          return parseInt(settings.defaultPageSize, 10) || 15;
        }
      } catch { /* ignore */ }
    }
    return 15;
  });

  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'settings_tenant_billing_cols_v1',
    DEFAULT_BILLING_COL_WIDTHS,
    MIN_BILLING_COL_WIDTHS
  );

  const loadBilling = useCallback(async ({ showSpinner = true } = {}) => {
    if (showSpinner) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await getOwnTenantBillingSummary(tenantId);
      if (!res?.success) {
        throw new Error(res?.error || 'Could not load subscription & billing details.');
      }
      setTenantInfo(res.tenant);
      setSubscription(res.subscription);
      setInvoices(Array.isArray(res.invoices) ? res.invoices : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load billing summary.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    getOwnTenantBillingSummary(tenantId)
      .then(res => {
        if (!active) return;
        if (!res?.success) {
          throw new Error(res?.error || 'Could not load subscription & billing details.');
        }
        setTenantInfo(res.tenant);
        setSubscription(res.subscription);
        setInvoices(Array.isArray(res.invoices) ? res.invoices : []);
        setError('');
      })
      .catch(err => {
        if (!active) return;
        setError(err.message || 'Unable to load billing summary.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    const handleBillingUpdated = () => {
      loadBilling({ showSpinner: false });
    };
    const openPendingRenewal = () => {
      try { sessionStorage.removeItem('open_saas_renewal_modal'); } catch { /* ignore */ }
      const pendingRenewal = invoices.find(inv =>
        String(inv.status || '').toUpperCase() === 'PENDING' &&
        (inv.category === 'RENEWAL_PROFORMA' || inv.operation === 'RENEWAL_PROFORMA')
      );
      if (pendingRenewal) {
        setSelectedInvoice(pendingRenewal);
      }
    };
    window.addEventListener('saas-billing-updated', handleBillingUpdated);
    window.addEventListener('open-renewal-proforma-modal', openPendingRenewal);
    return () => {
      window.removeEventListener('saas-billing-updated', handleBillingUpdated);
      window.removeEventListener('open-renewal-proforma-modal', openPendingRenewal);
    };
  }, [loadBilling, invoices]);

  useEffect(() => {
    if (loading || !invoices.length) return;
    let shouldOpen = false;
    try {
      shouldOpen = sessionStorage.getItem('open_saas_renewal_modal') === '1';
      if (shouldOpen) sessionStorage.removeItem('open_saas_renewal_modal');
    } catch { /* ignore */ }
    if (!shouldOpen) return;
    const pendingRenewal = invoices.find(inv =>
      String(inv.status || '').toUpperCase() === 'PENDING' &&
      (inv.category === 'RENEWAL_PROFORMA' || inv.operation === 'RENEWAL_PROFORMA')
    );
    if (pendingRenewal) {
      const t = setTimeout(() => setSelectedInvoice(pendingRenewal), 0);
      return () => clearTimeout(t);
    }
  }, [loading, invoices]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter(inv => {
      const st = String(inv.status || '').toUpperCase();
      const isVoidOrCancelled = st === 'VOID' || st === 'CANCELLED';
      if (statusFilter === 'ACTIVE' && isVoidOrCancelled) return false;
      if (statusFilter === 'PAID' && st !== 'PAID') return false;
      if (statusFilter === 'PENDING' && st !== 'PENDING') return false;
      if (statusFilter === 'VOID' && !isVoidOrCancelled) return false;
      if (!q) return true;
      return (
        String(inv.invoice_number || '').toLowerCase().includes(q) ||
        String(inv.description || '').toLowerCase().includes(q) ||
        String(inv.transaction_id || '').toLowerCase().includes(q) ||
        String(inv.payment_mode || '').toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, statusFilter]);

  const handleCancelProforma = async (invNo) => {
    if (!invNo || cancellingInv) return;
    setCancellingInv(invNo);
    setError('');
    try {
      const res = await cancelPendingSaasProforma(tenantId, invNo, 'Cancelled by Workspace Admin');
      if (!res?.success) throw new Error(res?.error || 'Could not cancel proforma.');
      await loadBilling({ showSpinner: false });
      window.dispatchEvent(new CustomEvent('saas-billing-updated'));
    } catch (err) {
      setError(err.message || 'Could not cancel proforma.');
    } finally {
      setCancellingInv(null);
    }
  };

  const handlePrintInvoice = (inv) => {
    if (!inv || typeof window === 'undefined') return;
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const totals = saasInvoiceTotals(inv.amount, inv.gst_type || 'IGST', inv);
    const items = Array.isArray(inv.line_items) ? inv.line_items : [];
    const statusUpper = String(inv.status || '').toUpperCase();
    const isPaid = statusUpper === 'PAID';
    const docLabel = isPaid ? 'TAX INVOICE / PAYMENT RECEIPT' : 'PROFORMA INVOICE';
    const rowsHtml = items.length > 0
      ? items.map((li, idx) => `
          <tr style="background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">
              <div style="font-weight:700;color:#0f172a;">${esc(li.display_name || li.module_key)}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">
                ${li.days_remaining
                  ? `${esc(li.days_remaining)}/30 days prorated`
                  : `${esc(li.months || 12)} mo${li.discount_percent ? ` (-${esc(li.discount_percent)}% disc)` : ''}`}
              </div>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb;">${esc(li.seats)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;${Number(li.rate_per_user || 0).toLocaleString('en-IN')}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">&#8377;${Number(li.net_amount || 0).toLocaleString('en-IN')}</td>
          </tr>`).join('')
      : `<tr>
          <td colspan="3" style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:600;">${esc(inv.description || inv.category)}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">&#8377;${Number(totals.amount ?? inv.amount ?? 0).toLocaleString('en-IN')}</td>
        </tr>`;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(inv.invoice_number)} — ${esc(docLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; font-size: 12.5px; line-height: 1.45; }
    .sheet { width: 100%; max-width: 780px; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 14px; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { background: #f1f5f9; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; border-bottom: 1px solid #cbd5e1; }
    .footer-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 12px; margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div>
        <div style="font-size:18px;font-weight:800;color:#1e1b4b;">NEW SWAN MULTITECH LIMITED</div>
        <div style="font-size:11px;color:#64748b;">SaaS Cloud Solutions &amp; Enterprise Software Division</div>
        <div style="font-size:11px;color:#475569;">CIN: L29222PB2014PLC038891 | GSTIN: 03AABCN5123K1Z4</div>
        <div style="font-size:11px;color:#475569;">C-222, Phase VIII, Focal Point, Ludhiana - 141010, Punjab</div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;background:${isPaid ? '#d1fae5' : '#fef3c7'};color:${isPaid ? '#065f46' : '#92400e'};border:1px solid ${isPaid ? '#6ee7b7' : '#fde68a'};">${esc(docLabel)}</span>
        <div style="font-size:14px;font-weight:800;margin-top:6px;">#${esc(inv.invoice_number)}</div>
        <div style="font-size:11px;color:#64748b;">Issued: ${esc(formatISTDateTime(inv.created_at))} IST</div>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Billed To</div>
        <div style="font-weight:700;font-size:13px;">${esc(tenantInfo?.name || userCompany)}</div>
        <div style="font-family:monospace;color:#3730a3;font-size:11.5px;">Code: ${esc(tenantInfo?.tenant_code)}</div>
        ${tenantInfo?.gstin ? `<div style="font-size:11.5px;">GSTIN: ${esc(tenantInfo.gstin)}</div>` : ''}
      </div>
      <div class="card">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Subscription &amp; Payment</div>
        <div>Plan: <strong>${esc(subscription?.plan_name)}</strong></div>
        <div>Status: <strong>${esc(statusUpper)}</strong> • Mode: <strong>${esc(inv.payment_mode || '—')}</strong></div>
        ${inv.transaction_id ? `<div>Ref: <strong>${esc(inv.transaction_id)}</strong></div>` : ''}
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-bottom:none;border-radius:8px 8px 0 0;padding:8px 10px;">
      <div style="font-weight:700;color:#0f172a;">${esc(inv.description || inv.category)}</div>
      ${inv.pricing_basis ? `<div style="font-size:11px;font-weight:600;color:#4338ca;margin-top:2px;">Basis: ${esc(inv.pricing_basis)}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align:left;">Module / Item</th>
          <th style="text-align:center;width:70px;">Users</th>
          <th style="text-align:right;width:100px;">Rate/u/mo</th>
          <th style="text-align:right;width:120px;">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="footer-grid">
      <div class="card" style="font-size:11.5px;">
        <div style="font-weight:700;color:#374151;margin-bottom:4px;">BANK TRANSFER / UPI DETAILS:</div>
        <div>Account Name: <strong>New Swan Multitech Limited</strong></div>
        <div>Bank Name: <strong>HDFC Bank Ltd</strong></div>
        <div>Account No: <strong>50200039281746</strong> • IFSC: <strong>HDFC0000259</strong></div>
        <div>UPI VPA: <strong>newswan@okhdfcbank</strong></div>
      </div>
      <div class="card" style="background:#fff;">
        <div style="display:flex;justify-content:space-between;padding:3px 0;">
          <span>Taxable Base Amount</span>
          <strong>&#8377;${Number(totals.amount ?? inv.amount ?? 0).toLocaleString('en-IN')}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;padding:3px 0;color:#64748b;">
          <span>GST (${esc(inv.gst_type || 'IGST')})</span>
          <span>&#8377;${Number(totals.tax_amount ?? 0).toLocaleString('en-IN')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0 0;margin-top:6px;border-top:2px solid #111827;font-size:14px;font-weight:800;color:#1e3a8a;">
          <span>Total Payable</span>
          <span>&#8377;${Number(totals.total_payable ?? inv.amount ?? 0).toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=920,height=1050');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        try { printWin.print(); } catch { /* ignore */ }
      }, 250);
    } else {
      window.print();
    }
  };

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  const statusMeta = useMemo(() => {
    if (subscription?.never_expires || subscription?.is_master_hq || isMasterAdmin) {
      return { label: 'ACTIVE • MASTER HQ', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    }
    if (subscription?.is_expired || subscription?.status === 'EXPIRED') {
      return { label: 'EXPIRED', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    }
    if (subscription?.is_expiring_soon || subscription?.status === 'EXPIRING_SOON') {
      return { label: 'EXPIRING SOON', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    }
    if (subscription?.status === 'TRIAL') {
      return { label: 'TRIAL', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    }
    return { label: subscription?.status || 'ACTIVE', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
  }, [subscription, isMasterAdmin]);

  if (loading) {
    return (
      <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.6rem', opacity: 0.7 }} />
        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Loading plan period &amp; billing history...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={20} style={{ color: '#2563eb' }} />
              Plan, Validity &amp; Billing History
            </h2>
            {tenantInfo?.tenant_code && (
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                background: '#e0e7ff',
                color: '#3730a3',
                border: '1px solid #c7d2fe',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px'
              }}>
                {tenantInfo.tenant_code}
              </span>
            )}
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              background: statusMeta.bg,
              color: statusMeta.color,
              border: `1px solid ${statusMeta.border}`,
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px'
            }}>
              {statusMeta.label}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            Workspace: <strong>{tenantInfo?.name || userCompany || 'Organization'}</strong> • Active subscription period, expiry countdown (IST), quotas &amp; GST invoices
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!subscription?.never_expires && !isMasterAdmin && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-addon-modal'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 0.9rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <UserPlus size={15} /> Request Seats / Add-ons
            </button>
          )}
          <button
            type="button"
            onClick={loadBilling}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '0.5rem 0.85rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} style={{ color: '#2563eb' }} /> Current Plan &amp; Cycle
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            {subscription?.plan_name || 'Standard Plan'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Billing Cycle: <strong>{subscription?.billing_cycle || 'YEARLY'}</strong>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={14} style={{ color: '#059669' }} /> Plan Period (IST)
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            {subscription?.never_expires ? (
              <span style={{ color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <InfinityIcon size={16} /> Lifetime (Master HQ)
              </span>
            ) : (
              `${formatISTDate(subscription?.start_date)} → ${formatISTDate(subscription?.valid_until)}`
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {subscription?.never_expires
              ? 'Permanent platform owner license'
              : `Expires on: ${formatISTDate(subscription?.valid_until)}`}
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={14} style={{ color: subscription?.is_expired ? '#dc2626' : subscription?.is_expiring_soon ? '#d97706' : '#059669' }} />
            Expiry Countdown
          </div>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            marginTop: '0.35rem',
            color: subscription?.never_expires
              ? '#059669'
              : subscription?.is_expired
                ? '#dc2626'
                : subscription?.is_expiring_soon
                  ? '#d97706'
                  : 'var(--text-primary)'
          }}>
            {subscription?.never_expires
              ? 'Never Expires'
              : subscription?.is_expired
                ? 'Expired'
                : subscription?.days_remaining != null
                  ? `${subscription.days_remaining} Day${subscription.days_remaining === 1 ? '' : 's'} Left`
                  : 'Active'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {subscription?.never_expires
              ? 'Auto-exempt from expiry lock'
              : subscription?.is_expiring_soon
                ? 'Renew before expiry to avoid lock'
                : 'Workspace running normally'}
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Users size={14} style={{ color: '#6366f1' }} /> Seats &amp; Quotas
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            {subscription?.active_users_count ?? 0} / {subscription?.user_seat_limit ?? 0} Users
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Phone size={12} /> {subscription?.calling_seats_limit || 5} Calling ({subscription?.calling_mode === 'byoc' ? 'BYOC' : 'Managed'})
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Mail size={12} /> SMTP: {subscription?.smtp_accounts_limit || 1}
            </span>
          </div>
        </div>
      </div>

      {/* Enabled Modules */}
      {(() => {
        const rawMods = subscription?.enabled_modules || [];
        const hasCombo = rawMods.some(m => m.process_code === 'LEADS_WITH_CALLING');
        const billableMods = hasCombo
          ? rawMods.filter(m => m.process_code !== 'LEADS_ONLY' && m.process_code !== 'CALLING_STANDALONE')
          : rawMods;
        return (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Building2 size={15} style={{ color: '#2563eb' }} />
                Active Business Modules ({billableMods.length})
              </div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                Used / Licensed seats • Click any module to view assigned users
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))', gap: '0.55rem' }}>
              {billableMods.map(mod => {
                const used = Number(mod.used_seats ?? 0);
                const licensed = Number(mod.licensed_seats || 0);
                const pct = licensed > 0 ? Math.min(100, Math.round((used / licensed) * 100)) : 0;
                const isOver = licensed > 0 && used > licensed;
                const isFull = licensed > 0 && used === licensed;
                const isWarn = !isOver && !isFull && pct >= 80;
                const tone = isOver
                  ? { bg: '#fef2f2', border: '#fecaca', badgeBg: '#fee2e2', badgeColor: '#b91c1c', bar: '#dc2626', tag: `Over (+${used - licensed})` }
                  : isFull
                    ? { bg: '#fff7ed', border: '#fed7aa', badgeBg: '#ffedd5', badgeColor: '#c2410c', bar: '#ea580c', tag: 'FULL' }
                    : isWarn
                      ? { bg: '#fffbeb', border: '#fde68a', badgeBg: '#fef3c7', badgeColor: '#b45309', bar: '#d97706', tag: `${pct}%` }
                      : { bg: mod.has_custom_seats ? '#f5f7ff' : '#f8fafc', border: mod.has_custom_seats ? '#c7d2fe' : '#e2e8f0', badgeBg: mod.has_custom_seats ? '#e0e7ff' : '#e2e8f0', badgeColor: mod.has_custom_seats ? '#3730a3' : '#1e293b', bar: '#2563eb', tag: `${pct}%` };

                return (
                  <button
                    key={mod.process_code}
                    type="button"
                    onClick={() => {
                      setModuleUserSearch('');
                      setModuleRoleFilter('ALL');
                      setSelectedModuleUsage(mod);
                    }}
                    title={`Click to view ${used} user(s) with ${mod.display_name || mod.process_code} access`}
                    style={{
                      textAlign: 'left',
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      borderRadius: '8px',
                      padding: '0.6rem 0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      transition: 'transform 0.12s ease, box-shadow 0.12s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.77rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>
                        {mod.display_name || mod.process_code}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background: tone.badgeBg,
                        color: tone.badgeColor,
                        padding: '0.12rem 0.42rem',
                        borderRadius: '9999px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        {licensed > 0 ? `${used} / ${licensed}u` : `${used}u`}
                      </span>
                    </div>
                    <div style={{ height: '5px', width: '100%', background: 'rgba(148, 163, 184, 0.25)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: tone.bar, borderRadius: '9999px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#475569' }}>
                      <span>{mod.staff_used_seats ?? 0} Staff • {mod.admin_used_seats ?? 0} Admin</span>
                      <span style={{ fontWeight: 700, color: tone.badgeColor }}>{tone.tag}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Billing & Invoices Ledger */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '1.1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Receipt size={17} style={{ color: '#4f46e5' }} />
              Billing &amp; Invoices History ({filteredInvoices.length})
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search invoice #, UTR, desc..."
                style={{
                  width: '100%',
                  padding: '0.4rem 1.7rem 0.4rem 1.9rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary, #f8fafc)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {['ALL', 'ACTIVE', 'PAID', 'PENDING', 'VOID'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => { setStatusFilter(st); setCurrentPage(1); }}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: statusFilter === st ? '#2563eb' : 'var(--border-light)',
                  background: statusFilter === st ? '#eff6ff' : 'var(--bg-surface)',
                  color: statusFilter === st ? '#2563eb' : 'var(--text-secondary)',
                  fontSize: '0.76rem',
                  fontWeight: statusFilter === st ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : st === 'PAID' ? 'Paid' : st === 'PENDING' ? 'Pending' : 'Void / Cancelled'}
              </button>
            ))}

            <TableViewToggle view={tableView} onChange={setTableView} style={{ marginLeft: 0 }} />
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)', minHeight: '280px' }}>
            <MobileTableView id="settings_tenant_billing_view" view={tableView} hideToggle={true}>
              <table style={{ width: '100%', minWidth: `${getTotalTableWidth()}px`, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: 'var(--bg-surface)',
                    boxShadow: 'inset 0 -1px 0 var(--border-light)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.73rem',
                    textTransform: 'uppercase'
                  }}>
                    {[
                      ['invoice_no', 'Invoice #'],
                      ['date_ist', 'Date (IST)'],
                      ['period', 'Period / Added'],
                      ['description', 'Description'],
                      ['base_amt', 'Base Amount'],
                      ['gst_amt', 'GST Tax'],
                      ['total_amt', 'Total Payable'],
                      ['payment_ref', 'Payment & Ref'],
                      ['status', 'Status'],
                      ['action', 'Action']
                    ].map(([key, label]) => (
                      <th key={key} style={{ position: 'sticky', top: 0, zIndex: 10, padding: '0.75rem 0.9rem', width: `${colWidths[key]}px`, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>{label}</div>
                        <ColumnResizer columnKey={key} isResizing={resizingCol === key} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No billing records or invoices found for this workspace yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map(inv => {
                      const totals = saasInvoiceTotals(inv.amount, inv.gst_type || 'IGST', inv);
                      const statusUpper = String(inv.status || '').toUpperCase();
                      const isPaid = statusUpper === 'PAID';
                      const isVoid = statusUpper === 'VOID' || statusUpper === 'CANCELLED';
                      const isPending = statusUpper === 'PENDING';
                      const isLog = ['TRIAL_LOG', 'LOGGED', 'COMPLETED'].includes(statusUpper);
                      const periodText = inv.valid_from && inv.valid_until
                        ? `${formatISTDate(inv.valid_from)} → ${formatISTDate(inv.valid_until)}`
                        : inv.additional_seats > 0
                          ? `+${inv.additional_seats} Seat${inv.additional_seats > 1 ? 's' : ''}${inv.total_seats ? ` (Total ${inv.total_seats})` : ''}`
                          : inv.requested_users
                            ? `${inv.requested_users} User${inv.requested_users > 1 ? 's' : ''}`
                            : inv.days_added > 0
                              ? `+${inv.days_added} Day${inv.days_added > 1 ? 's' : ''}`
                              : inv.months_added > 0
                                ? `+${inv.months_added} Month${inv.months_added > 1 ? 's' : ''}`
                                : inv.new_seats
                                  ? `${inv.new_seats} Seats`
                                  : 'Standard';
                      return (
                        <tr key={inv.invoice_number} style={{ borderBottom: '1px solid var(--border-light)', opacity: isVoid ? 0.65 : 1 }}>
                          <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700, fontFamily: 'monospace', color: isVoid ? '#991b1b' : '#3730a3' }}>
                            {inv.invoice_number}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', color: 'var(--text-secondary)' }}>
                            {formatISTDateTime(inv.created_at)}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', fontWeight: 600 }}>
                            {periodText}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', overflowWrap: 'anywhere' }}>
                            {inv.description || inv.category}
                            {isVoid && inv.void_reason && (
                              <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px' }}>{inv.void_reason}</div>
                            )}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', fontFamily: 'monospace' }}>
                            ₹{Number(totals.amount ?? inv.amount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            ₹{Number(totals.tax_amount ?? 0).toLocaleString('en-IN')}
                            <div style={{ fontSize: '0.68rem' }}>{inv.gst_type}</div>
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>
                            ₹{Number(totals.total_payable ?? inv.amount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem', fontSize: '0.76rem' }}>
                            <div>{inv.payment_mode || '—'}</div>
                            {inv.transaction_id && <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{inv.transaction_id}</div>}
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.18rem 0.55rem',
                              borderRadius: '9999px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isVoid ? '#fef2f2' : isPaid ? '#ecfdf5' : isLog ? '#f1f5f9' : '#fffbeb',
                              color: isVoid ? '#dc2626' : isPaid ? '#047857' : isLog ? '#475569' : '#b45309',
                              border: `1px solid ${isVoid ? '#fecaca' : isPaid ? '#a7f3d0' : isLog ? '#cbd5e1' : '#fde68a'}`
                            }}>
                              {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              {isVoid ? statusUpper : isLog ? (statusUpper === 'TRIAL_LOG' ? 'TRIAL' : 'LOGGED') : (inv.status || 'PAID')}
                            </span>
                          </td>
                          <td style={{ padding: '0.7rem 0.9rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedInvoice(inv)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.3rem 0.65rem',
                                  borderRadius: '6px',
                                  border: '1px solid #c7d2fe',
                                  background: '#eef2ff',
                                  color: '#3730a3',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                <Printer size={12} /> View / Print
                              </button>
                              {isPending && (
                                <button
                                  type="button"
                                  disabled={cancellingInv === inv.invoice_number}
                                  onClick={() => handleCancelProforma(inv.invoice_number)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    padding: '0.3rem 0.55rem',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: '0.73rem',
                                    fontWeight: 600,
                                    cursor: cancellingInv === inv.invoice_number ? 'not-allowed' : 'pointer'
                                  }}
                                  title="Cancel this pending proforma request"
                                >
                                  <X size={12} /> {cancellingInv === inv.invoice_number ? '...' : 'Cancel'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </MobileTableView>
          </div>

          <StandardTablePagination
            currentPage={currentPage}
            totalRecords={filteredInvoices.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* Module Users Breakdown Modal */}
      {selectedModuleUsage && (() => {
        const allAssigned = Array.isArray(selectedModuleUsage.assigned_users) ? selectedModuleUsage.assigned_users : [];
        const q = moduleUserSearch.trim().toLowerCase();
        const filteredAssigned = allAssigned.filter(u => {
          if (moduleRoleFilter === 'STAFF' && u.is_admin) return false;
          if (moduleRoleFilter === 'ADMIN' && !u.is_admin) return false;
          if (!q) return true;
          return (
            String(u.emp_name || '').toLowerCase().includes(q) ||
            String(u.email || '').toLowerCase().includes(q) ||
            String(u.emp_id || '').toLowerCase().includes(q) ||
            String(u.role || '').toLowerCase().includes(q)
          );
        });
        const used = Number(selectedModuleUsage.used_seats ?? allAssigned.length);
        const licensed = Number(selectedModuleUsage.licensed_seats || 0);
        const isOver = licensed > 0 && used > licensed;

        return (
          <div
            onClick={() => setSelectedModuleUsage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              zIndex: 9998,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '680px',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                color: '#111827'
              }}
            >
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Module Seat Usage Breakdown
                  </div>
                  <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedModuleUsage.display_name || selectedModuleUsage.process_code}
                  </h3>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.76rem' }}>
                    <span style={{
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px',
                      background: isOver ? '#fee2e2' : '#eff6ff',
                      color: isOver ? '#b91c1c' : '#1d4ed8'
                    }}>
                      {used} / {licensed} Users Used
                    </span>
                    <span style={{ color: '#475569' }}>
                      <strong>{selectedModuleUsage.staff_used_seats ?? 0}</strong> Assigned Staff • <strong>{selectedModuleUsage.admin_used_seats ?? 0}</strong> Admin (Auto Access)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedModuleUsage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '0.2rem' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    value={moduleUserSearch}
                    onChange={e => setModuleUserSearch(e.target.value)}
                    placeholder="Search employee name, ID, email or role..."
                    style={{
                      width: '100%',
                      padding: '0.42rem 0.65rem 0.42rem 1.95rem',
                      borderRadius: '7px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      background: '#ffffff',
                      color: '#0f172a'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {[
                    { id: 'ALL', label: `All (${allAssigned.length})` },
                    { id: 'STAFF', label: `Staff (${selectedModuleUsage.staff_used_seats ?? 0})` },
                    { id: 'ADMIN', label: `Admins (${selectedModuleUsage.admin_used_seats ?? 0})` }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setModuleRoleFilter(tab.id)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '7px',
                        border: moduleRoleFilter === tab.id ? '1px solid #2563eb' : '1px solid #cbd5e1',
                        background: moduleRoleFilter === tab.id ? '#2563eb' : '#ffffff',
                        color: moduleRoleFilter === tab.id ? '#ffffff' : '#334155',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 1.25rem 1rem' }}>
                {filteredAssigned.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                    No active users match your filter for this module.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                        <th style={{ padding: '0.55rem 0.4rem', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '0.55rem 0.4rem', fontWeight: 700 }}>Employee</th>
                        <th style={{ padding: '0.55rem 0.4rem', fontWeight: 700 }}>Email / ID</th>
                        <th style={{ padding: '0.55rem 0.4rem', fontWeight: 700 }}>Role</th>
                        <th style={{ padding: '0.55rem 0.4rem', fontWeight: 700, textAlign: 'right' }}>Access Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssigned.map((u, idx) => (
                        <tr key={u.user_id || `${u.email}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem 0.4rem', color: '#64748b', fontSize: '0.74rem' }}>{idx + 1}</td>
                          <td style={{ padding: '0.5rem 0.4rem', fontWeight: 700, color: '#0f172a' }}>{u.emp_name}</td>
                          <td style={{ padding: '0.5rem 0.4rem', color: '#475569', fontSize: '0.75rem' }}>
                            {u.email || '—'}{u.emp_id ? ` (${u.emp_id})` : ''}
                          </td>
                          <td style={{ padding: '0.5rem 0.4rem', textTransform: 'capitalize', color: '#334155', fontSize: '0.76rem' }}>{u.role || 'staff'}</td>
                          <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.12rem 0.45rem',
                              borderRadius: '9999px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: u.is_admin ? '#eef2ff' : '#ecfdf5',
                              color: u.is_admin ? '#3730a3' : '#047857'
                            }}>
                              {u.is_admin ? 'Admin (Auto)' : 'Assigned Staff'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                  Showing {filteredAssigned.length} of {allAssigned.length} active user(s)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!subscription?.never_expires && !isMasterAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModuleUsage(null);
                        window.dispatchEvent(new CustomEvent('open-addon-modal'));
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <UserPlus size={14} /> Add More Seats
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedModuleUsage(null)}
                    style={{
                      background: '#ffffff',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Printable Invoice Modal */}
      {selectedInvoice && (
        <div className="tenant-invoice-print-backdrop" style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .tenant-invoice-print-backdrop, .tenant-invoice-print-backdrop * { visibility: visible !important; }
              .tenant-invoice-print-backdrop { position: static !important; background: #fff !important; padding: 0 !important; }
              .tenant-invoice-print-card { max-width: 100% !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; padding: 0 !important; }
              .tenant-invoice-print-scroll { max-height: none !important; overflow: visible !important; }
              .tenant-invoice-no-print { display: none !important; }
            }
          `}</style>
          <div className="tenant-invoice-print-card" style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            color: '#111827'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                  {String(selectedInvoice.status || '').toUpperCase() === 'PAID' ? 'Tax Invoice / Payment Receipt' : 'Proforma Invoice'}
                </div>
                <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  {selectedInvoice.invoice_number}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>
                  Issued: {formatISTDateTime(selectedInvoice.created_at)} IST
                </div>
              </div>
              <button
                type="button"
                className="tenant-invoice-no-print"
                onClick={() => setSelectedInvoice(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
              <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Billed To</div>
                <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{tenantInfo?.name || userCompany}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: '#3730a3' }}>Code: {tenantInfo?.tenant_code}</div>
                {tenantInfo?.gstin && <div style={{ fontSize: '0.76rem', marginTop: '0.2rem' }}>GSTIN: {tenantInfo.gstin}</div>}
              </div>
              <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Subscription &amp; Payment</div>
                <div style={{ marginTop: '0.2rem' }}>Plan: <strong>{subscription?.plan_name}</strong></div>
                <div>Mode: <strong>{selectedInvoice.payment_mode || '—'}</strong></div>
                {selectedInvoice.transaction_id && <div>Ref: <strong>{selectedInvoice.transaction_id}</strong></div>}
              </div>
            </div>

            {(() => {
              const totals = saasInvoiceTotals(selectedInvoice.amount, selectedInvoice.gst_type || 'IGST', selectedInvoice);
              const items = Array.isArray(selectedInvoice.line_items) ? selectedInvoice.line_items : [];
              return (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.25rem', fontSize: '0.84rem' }}>
                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 700 }}>
                    {selectedInvoice.description || selectedInvoice.category}
                    {selectedInvoice.pricing_basis && (
                      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#4338ca', marginTop: '0.25rem' }}>
                        Basis: {selectedInvoice.pricing_basis}
                      </div>
                    )}
                  </div>
                  {items.length > 0 && (
                    <div className="tenant-invoice-print-scroll" style={{ maxHeight: '220px', overflowY: 'auto', borderBottom: '1px solid #e5e7eb' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#475569' }}>
                            <th style={{ padding: '0.45rem 0.7rem', textAlign: 'left' }}>Module / Item</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Users</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Rate</th>
                            <th style={{ padding: '0.45rem 0.7rem', textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((li, i) => (
                            <tr key={li.module_key || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.45rem 0.7rem', fontWeight: 600, color: '#1e293b' }}>
                                {li.display_name || li.module_key}
                                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 400 }}>
                                  {li.days_remaining
                                    ? `${li.days_remaining}/30 days prorated`
                                    : `${li.months || 12} mo${li.discount_percent ? ` (-${li.discount_percent}% disc)` : ''}`}
                                </div>
                              </td>
                              <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{li.seats}</td>
                              <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>₹{Number(li.rate_per_user || 0).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '0.45rem 0.7rem', textAlign: 'right', fontWeight: 700 }}>₹{Number(li.net_amount || 0).toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Taxable Base Amount</span>
                      <strong>₹{Number(totals.amount ?? selectedInvoice.amount ?? 0).toLocaleString('en-IN')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                      <span>GST ({selectedInvoice.gst_type || 'IGST'})</span>
                      <span>₹{Number(totals.tax_amount ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', paddingTop: '0.45rem', fontSize: '0.95rem', fontWeight: 800 }}>
                      <span>Total Payable</span>
                      <span style={{ color: '#2563eb' }}>₹{Number(totals.total_payable ?? selectedInvoice.amount ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="tenant-invoice-no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handlePrintInvoice(selectedInvoice)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Printer size={14} /> Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                style={{
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '0.5rem 0.9rem',
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
    </div>
  );
}
