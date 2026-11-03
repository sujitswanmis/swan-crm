'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar, Users, AlertTriangle, CheckCircle2, Search, Filter,
  RefreshCw, Star, TrendingUp, ShieldAlert, Edit3,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Package, Truck, Wrench, Receipt, Headphones, UserCheck, RotateCcw, Sparkles,
  Download, FileSpreadsheet, FileText, ChevronDown
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { getMonthlyHealthCheckQueue, saveMonthlyHealthCheckAudit } from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';
import StandardTablePagination from '../common/StandardTablePagination';

const RATING_THEMES = {
  1: {
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    tag: '1 ★ Poor'
  },
  2: {
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.35)',
    tag: '2 ★ Low'
  },
  3: {
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.35)',
    tag: '3 ★ Avg'
  },
  4: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.35)',
    tag: '4 ★ Good'
  },
  5: {
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
    tag: '5 ★ Excellent'
  }
};

function StarRatingInput({
  label,
  icon: Icon,
  value = 0,
  onChange,
  disabled = false
}) {
  const starLabels = {
    1: '1 Star - Critical / Poor',
    2: '2 Stars - Needs Attention',
    3: '3 Stars - Moderate / Neutral',
    4: '4 Stars - Good / Satisfactory',
    5: '5 Stars - Excellent / Superb'
  };

  const activeValue = value || 0;
  const theme = RATING_THEMES[activeValue] || {
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'var(--border-light)',
    tag: 'Not Rated'
  };

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: value === 0 ? '1.5px dashed rgba(245,158,11,0.35)' : `1px solid ${theme.border}`,
      borderRadius: '10px',
      padding: '0.7rem 0.85rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
      transition: 'border-color 0.2s ease, background 0.2s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {Icon && <Icon size={15} style={{ color: value > 0 ? theme.color : 'var(--text-secondary)' }} />}
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {label}
          </span>
        </div>
        {activeValue === 0 ? (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#f59e0b',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.3)',
            padding: '0.15rem 0.45rem',
            borderRadius: '5px'
          }}>
            ⏳ Not Rated
          </span>
        ) : (
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: theme.color,
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            padding: '0.15rem 0.45rem',
            borderRadius: '5px',
            transition: 'all 0.2s ease'
          }}>
            {theme.tag}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.15rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {[1, 2, 3, 4, 5].map(star => {
            const isFilled = value > 0 && star <= value;
            return (
              <button
                key={star}
                type="button"
                disabled={disabled}
                onClick={() => onChange(star)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: disabled ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: value === star ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform 0.15s ease, color 0.15s ease',
                  color: isFilled ? theme.color : 'var(--border-light, #475569)'
                }}
                title={`Click to rate ${star} Star`}
              >
                <Star
                  size={22}
                  fill={isFilled ? theme.color : 'none'}
                  stroke={isFilled ? theme.color : 'currentColor'}
                  strokeWidth={isFilled ? 1 : 1.5}
                />
              </button>
            );
          })}
        </div>
        <div style={{
          fontSize: '0.7rem',
          color: activeValue === 0 ? '#94a3b8' : theme.color,
          fontWeight: activeValue === 0 ? 400 : 600,
          fontStyle: activeValue === 0 ? 'italic' : 'normal',
          transition: 'color 0.2s ease'
        }}>
          {activeValue === 0 ? 'Click star to rate (1-5)' : starLabels[activeValue]}
        </div>
      </div>
    </div>
  );
}

export default function MonthlyHealthCheckModule({
  tenantId
}) {
  const currentPeriodDefault = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
  }, []);

  const [period, setPeriod] = useState(currentPeriodDefault);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [selectedPartyForAudit, setSelectedPartyForAudit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // 6-Dimension Audit Form + Overall (Default: 0 - Unselected so telecaller must choose)
  const [auditForm, setAuditForm] = useState({
    rating_order: 0,
    rating_delivery: 0,
    rating_product_quality: 0,
    rating_account_billing: 0,
    rating_services: 0,
    rating_sales_person: 0,
    rating_overall: 0,
    is_overall_manual: false,
    next_month_demand_plan: '',
    competitor_schemes: '',
    dealer_suggestions: ''
  });

  // Table Column Resizer
  const defaultCols = {
    partner: 240,
    location: 170,
    period: 140,
    days_inactive: 150,
    health_stars: 240,
    demand_plan: 220,
    actions: 140
  };
  const { columnWidths, startResize, resetWidths } = useTableColumnResize('monthly_health_table_widths', defaultCols);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getMonthlyHealthCheckQueue(tenantId, period);
      setQueue(data || []);
    } catch (err) {
      console.error('Error loading monthly health check data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, tenantId]);

  const openAuditModal = (item) => {
    setSelectedPartyForAudit(item);
    setSuccessMsg('');
    const a = item.audit;
    // If reviewing an already conducted audit, load saved ratings; if fresh audit, default to 0 (unselected)
    setAuditForm({
      rating_order: a ? (a.rating_order || a.rating_order_delivery || 0) : 0,
      rating_delivery: a ? (a.rating_delivery || a.rating_order_delivery || 0) : 0,
      rating_product_quality: a ? (a.rating_product_quality || 0) : 0,
      rating_account_billing: a ? (a.rating_account_billing || 0) : 0,
      rating_services: a ? (a.rating_services || a.rating_sales_support || 0) : 0,
      rating_sales_person: a ? (a.rating_sales_person || a.rating_sales_support || 0) : 0,
      rating_overall: a ? (a.rating_overall || 0) : 0,
      is_overall_manual: !!a?.is_overall_manual,
      next_month_demand_plan: a?.next_month_demand_plan || '',
      competitor_schemes: a?.competitor_schemes || '',
      dealer_suggestions: a?.dealer_suggestions || ''
    });
  };

  const handleRatingChange = (key, val) => {
    setAuditForm(prev => {
      const updated = { ...prev, [key]: val };
      if (!prev.is_overall_manual) {
        const ratings = [
          updated.rating_order,
          updated.rating_delivery,
          updated.rating_product_quality,
          updated.rating_account_billing,
          updated.rating_services,
          updated.rating_sales_person
        ].filter(r => r > 0);

        if (ratings.length > 0) {
          const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
          updated.rating_overall = Math.max(1, Math.min(5, Math.round(avg)));
        } else {
          updated.rating_overall = 0;
        }
      }
      return updated;
    });
  };

  const handleOverallChange = (val) => {
    setAuditForm(prev => ({
      ...prev,
      rating_overall: val,
      is_overall_manual: true
    }));
  };

  const handleResetOverallToAuto = () => {
    setAuditForm(prev => {
      const ratings = [
        prev.rating_order,
        prev.rating_delivery,
        prev.rating_product_quality,
        prev.rating_account_billing,
        prev.rating_services,
        prev.rating_sales_person
      ].filter(r => r > 0);

      const newOverall = ratings.length > 0
        ? Math.max(1, Math.min(5, Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length)))
        : 0;

      return {
        ...prev,
        rating_overall: newOverall,
        is_overall_manual: false
      };
    });
  };

  const { exactAvg, ratedCount } = useMemo(() => {
    const ratings = [
      auditForm.rating_order,
      auditForm.rating_delivery,
      auditForm.rating_product_quality,
      auditForm.rating_account_billing,
      auditForm.rating_services,
      auditForm.rating_sales_person
    ].filter(r => r > 0);

    const count = ratings.length;
    const avg = count > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / count).toFixed(1) : '0.0';
    return { exactAvg: avg, ratedCount: count };
  }, [auditForm]);

  const handleSaveAudit = async (e) => {
    e.preventDefault();
    if (!selectedPartyForAudit) return;

    // Strict validation: Telecaller must select all 6 dimensions
    const pending = [];
    if (!auditForm.rating_order) pending.push('1. Order Related Rating');
    if (!auditForm.rating_delivery) pending.push('2. Delivery Related Rating');
    if (!auditForm.rating_product_quality) pending.push('3. Product Quality Rating');
    if (!auditForm.rating_account_billing) pending.push('4. Billing Related Rating');
    if (!auditForm.rating_services) pending.push('5. Services Related Rating');
    if (!auditForm.rating_sales_person) pending.push('6. Sales Person Rating');

    if (pending.length > 0) {
      alert(`⚠️ Kripya sabhi 6 dimensions me rating select karein!\n\nPending Ratings (${pending.length}/6):\n• ${pending.join('\n• ')}`);
      return;
    }

    if (!auditForm.next_month_demand_plan || !auditForm.next_month_demand_plan.trim()) {
      alert('⚠️ Kripya Next Month Projected Demand Plan bharein.');
      return;
    }

    setSaving(true);
    try {
      const res = await saveMonthlyHealthCheckAudit({
        party_id: selectedPartyForAudit.party_id,
        evaluation_period: period,
        days_inactive: selectedPartyForAudit.daysInactive,
        is_dormant_risk: selectedPartyForAudit.isDormant,
        ...auditForm
      }, tenantId);

      if (res.success) {
        setSuccessMsg('✓ Monthly health check audit recorded successfully!');
        loadData();
        setTimeout(() => {
          setSelectedPartyForAudit(null);
          setSuccessMsg('');
        }, 1000);
      } else {
        alert('Failed to save audit: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving audit: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Filtered queue
  const filteredQueue = useMemo(() => {
    return queue.filter(item => {
      if (riskFilter === 'DORMANT_ONLY' && !item.isDormant) return false;
      if (riskFilter === 'HEALTHY_ONLY' && item.isDormant) return false;
      if (riskFilter === 'AUDITED_ONLY' && !item.isAudited) return false;
      if (riskFilter === 'PENDING_ONLY' && item.isAudited) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase().trim();
      const code = (item.party?.distributor_code || item.party?.dealer_code || item.party?.party_universal_code || '').toLowerCase();
      const firm = (item.party?.firm_name || '').toLowerCase();
      const owner = (item.party?.owner_name || '').toLowerCase();
      const city = (item.party?.district_name || '').toLowerCase();

      return code.includes(term) || firm.includes(term) || owner.includes(term) || city.includes(term);
    });
  }, [queue, riskFilter, searchTerm]);

  // Reset page to 1 when search, filter, period or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, riskFilter, period, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredQueue.length / pageSize));

  // Auto-adjust page if current page exceeds total pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Paginated queue slice
  const paginatedQueue = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQueue.slice(start, start + pageSize);
  }, [filteredQueue, currentPage, pageSize]);

  // KPI Ribbon counts
  const kpis = useMemo(() => {
    const total = queue.length;
    const audited = queue.filter(q => q.isAudited).length;
    const dormant = queue.filter(q => q.isDormant).length;
    const healthy = total - dormant;
    return { total, audited, dormant, healthy };
  }, [queue]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setShowExportMenu(false);
    };
    if (showExportMenu) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [showExportMenu]);

  const getExportData = () => {
    return filteredQueue.map((item, index) => {
      const p = item.party;
      const a = item.audit;
      return {
        sr_no: index + 1,
        period: item.period || period,
        partner_code: p?.distributor_code || p?.dealer_code || p?.party_universal_code || '—',
        firm_name: p?.firm_name || '—',
        owner_name: p?.owner_name || '—',
        mobile: p?.primary_mobile || '—',
        district: p?.district_name || '—',
        state: p?.state_name || '—',
        dormancy_status: item.isDormant ? `Dormant Risk (${item.daysInactive}d)` : `Active (${item.daysInactive}d)`,
        days_inactive: item.daysInactive != null ? item.daysInactive : '—',
        audit_status: a ? 'Audited' : 'Audit Pending',
        overall_rating: a?.rating_overall ? `${a.rating_overall} / 5` : '—',
        rating_order: a ? (a.rating_order || a.rating_order_delivery || '—') : '—',
        rating_delivery: a ? (a.rating_delivery || a.rating_order_delivery || '—') : '—',
        rating_product_quality: a ? (a.rating_product_quality || '—') : '—',
        rating_account_billing: a ? (a.rating_account_billing || '—') : '—',
        rating_services: a ? (a.rating_services || a.rating_sales_support || '—') : '—',
        rating_sales_person: a ? (a.rating_sales_person || a.rating_sales_support || '—') : '—',
        is_manual_override: a?.is_overall_manual ? 'Yes (Manual)' : 'No (Auto)',
        demand_plan: a?.next_month_demand_plan || '—',
        competitor_schemes: a?.competitor_schemes || '—',
        dealer_suggestions: a?.dealer_suggestions || '—',
        recorded_at: a?.created_at
          ? new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              dateStyle: 'medium',
              timeStyle: 'short'
            }).format(new Date(a.created_at))
          : '—'
      };
    });
  };

  const exportToExcel = async () => {
    if (filteredQueue.length === 0) {
      alert('No partner records available to export for the current filters.');
      return;
    }
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`Health Checks (${period})`);

      worksheet.columns = [
        { header: 'S.No', key: 'sr_no', width: 8 },
        { header: 'Period', key: 'period', width: 12 },
        { header: 'Partner Code', key: 'partner_code', width: 22 },
        { header: 'Firm Name', key: 'firm_name', width: 30 },
        { header: 'Owner Name', key: 'owner_name', width: 22 },
        { header: 'Primary Mobile', key: 'mobile', width: 18 },
        { header: 'District', key: 'district', width: 18 },
        { header: 'State', key: 'state', width: 18 },
        { header: 'Dormancy Status', key: 'dormancy_status', width: 18 },
        { header: 'Days Inactive', key: 'days_inactive', width: 14 },
        { header: 'Audit Status', key: 'audit_status', width: 16 },
        { header: 'Overall Health Rating', key: 'overall_rating', width: 22 },
        { header: '1. Order Rating', key: 'rating_order', width: 16 },
        { header: '2. Delivery Rating', key: 'rating_delivery', width: 16 },
        { header: '3. Product Quality Rating', key: 'rating_product_quality', width: 22 },
        { header: '4. Billing Rating', key: 'rating_account_billing', width: 16 },
        { header: '5. Services Rating', key: 'rating_services', width: 16 },
        { header: '6. Sales Person Rating', key: 'rating_sales_person', width: 20 },
        { header: 'Manual Override', key: 'is_manual_override', width: 16 },
        { header: 'Next Month Demand Plan', key: 'demand_plan', width: 36 },
        { header: 'Competitor Schemes & Intel', key: 'competitor_schemes', width: 36 },
        { header: 'Dealer Suggestions & Feedback', key: 'dealer_suggestions', width: 36 },
        { header: 'Audit Recorded At (IST)', key: 'recorded_at', width: 24 }
      ];

      const rows = getExportData();
      rows.forEach(r => worksheet.addRow(r));

      // Style Header Row (Dark Navy Blue with White Bold Text)
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 26;

      // Auto zebra striping & borders
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'middle' };
          if (rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            };
          }
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Partner_Health_Checks_${period}_${Date.now()}.xlsx`);
    } catch (err) {
      console.error('Export to Excel error:', err);
      alert('Failed to export Excel: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = async () => {
    if (filteredQueue.length === 0) {
      alert('No partner records available to export for the current filters.');
      return;
    }
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const { saveAs } = await import('file-saver');
      const rows = getExportData();

      const headers = [
        'S.No', 'Period', 'Partner Code', 'Firm Name', 'Owner Name', 'Primary Mobile',
        'District', 'State', 'Dormancy Status', 'Days Inactive', 'Audit Status',
        'Overall Health Rating', '1. Order Rating', '2. Delivery Rating', '3. Product Quality Rating',
        '4. Billing Rating', '5. Services Rating', '6. Sales Person Rating', 'Manual Override',
        'Next Month Demand Plan', 'Competitor Schemes & Intel',
        'Dealer Suggestions & Feedback', 'Audit Recorded At (IST)'
      ];

      const csvContent = [
        headers.join(','),
        ...rows.map(r => [
          r.sr_no,
          `"${r.period}"`,
          `"${r.partner_code}"`,
          `"${String(r.firm_name || '').replace(/"/g, '""')}"`,
          `"${String(r.owner_name || '').replace(/"/g, '""')}"`,
          `"${r.mobile}"`,
          `"${String(r.district || '').replace(/"/g, '""')}"`,
          `"${String(r.state || '').replace(/"/g, '""')}"`,
          `"${r.dormancy_status}"`,
          `"${r.days_inactive}"`,
          `"${r.audit_status}"`,
          `"${r.overall_rating}"`,
          `"${r.rating_order}"`,
          `"${r.rating_delivery}"`,
          `"${r.rating_product_quality}"`,
          `"${r.rating_account_billing}"`,
          `"${r.rating_services}"`,
          `"${r.rating_sales_person}"`,
          `"${r.is_manual_override}"`,
          `"${String(r.demand_plan || '').replace(/"/g, '""')}"`,
          `"${String(r.competitor_schemes || '').replace(/"/g, '""')}"`,
          `"${String(r.dealer_suggestions || '').replace(/"/g, '""')}"`,
          `"${r.recorded_at}"`
        ].join(','))
      ].join('\r\n');

      // Prepend UTF-8 BOM so Excel opens Hindi & English text without character corruption
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `Partner_Health_Checks_${period}_${Date.now()}.csv`);
    } catch (err) {
      console.error('Export to CSV error:', err);
      alert('Failed to export CSV: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

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
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Audits Recorded</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{kpis.audited} / {kpis.total}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Active Network</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{kpis.healthy}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>Dormancy Risk (&gt;45d)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{kpis.dormant}</div>
          </div>
        </div>
      </div>

      {/* Filter and Period Selection Bar */}
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
          {/* Period Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Period:</label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                fontWeight: 600
              }}
            />
          </div>

          <select
            value={riskFilter}
            onChange={e => setRiskFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          >
            <option value="ALL">All Network Partners</option>
            <option value="DORMANT_ONLY">🔴 Dormancy Risk Only (&gt;45d)</option>
            <option value="HEALTHY_ONLY">🟢 Healthy Active Only</option>
            <option value="AUDITED_ONLY">✓ Audited This Month</option>
            <option value="PENDING_ONLY">⏳ Audit Pending</option>
          </select>

          <button
            type="button"
            onClick={loadData}
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

          {/* Export Dropdown Menu */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowExportMenu(prev => !prev)}
              disabled={isExporting || filteredQueue.length === 0}
              style={{
                padding: '0.5rem 0.85rem',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.2) 100%)',
                border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: '8px',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                cursor: (isExporting || filteredQueue.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
              title="Export partner health checks to Excel or CSV"
            >
              <Download size={13} />
              {isExporting ? 'Exporting...' : 'Export'}
              <ChevronDown size={12} />
            </button>

            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 5px)',
                  zIndex: 50,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  padding: '0.35rem',
                  minWidth: '160px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem'
                }}
              >
                <button
                  type="button"
                  onClick={exportToExcel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: '6px',
                    textAlign: 'left',
                    width: '100%'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <FileSpreadsheet size={15} style={{ color: '#10b981' }} />
                  <span>Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={exportToCSV}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderRadius: '6px',
                    textAlign: 'left',
                    width: '100%'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <FileText size={15} style={{ color: '#38bdf8' }} />
                  <span>CSV (.csv)</span>
                </button>
              </div>
            )}
          </div>
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
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.location}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Location
                  <ColumnResizer onMouseDown={e => startResize('location', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.period}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Audit Month
                  <ColumnResizer onMouseDown={e => startResize('period', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.days_inactive}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Dormancy Status
                  <ColumnResizer onMouseDown={e => startResize('days_inactive', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.health_stars}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  6-Dim Health Score
                  <ColumnResizer onMouseDown={e => startResize('health_stars', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.demand_plan}px`, padding: '0.85rem 1rem', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Demand Forecast &amp; Intel
                  <ColumnResizer onMouseDown={e => startResize('demand_plan', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
                  Audit Action
                  <ColumnResizer onMouseDown={e => startResize('actions', e)} onDoubleClick={() => resetWidths()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredQueue.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No channel partners found for the selected month and filter.
                  </td>
                </tr>
              ) : (
                paginatedQueue.map(item => {
                  const p = item.party;
                  const phone = p?.primary_mobile;
                  const a = item.audit;

                  return (
                    <tr key={item.party_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.9rem' }}>
                          {p?.distributor_code || p?.dealer_code || p?.party_universal_code}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                          {p?.firm_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <span>{p?.owner_name}</span>
                          <span>•</span>
                          <MaskedPhoneDisplay phone={phone} size="sm" />
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 600 }}>{p?.district_name || 'District'}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{p?.state_name || 'State'}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                        <span style={{ fontWeight: 700, color: '#60a5fa' }}>{period}</span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {item.isDormant ? (
                          <div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '4px',
                              background: 'rgba(239,68,68,0.15)',
                              color: '#ef4444'
                            }}>
                              🔴 Dormant Risk ({item.daysInactive}d)
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span style={{
                              display: 'inline-block',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '4px',
                              background: 'rgba(16,185,129,0.15)',
                              color: '#10b981'
                            }}>
                              🟢 Active ({item.daysInactive}d)
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {a ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: RATING_THEMES[a.rating_overall || 5]?.color || '#fbbf24' }}>
                              {'★'.repeat(a.rating_overall || 5)}
                              <span style={{ color: 'var(--border-light, #475569)', opacity: 0.5 }}>{'☆'.repeat(5 - (a.rating_overall || 5))}</span>
                              <span style={{ fontWeight: 800, color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.85rem' }}>
                                {a.rating_overall || 5}/5
                              </span>
                              {a.is_overall_manual && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }} title="Manual Override">
                                  ✏️
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: '1.3' }}>
                              Ord: {a.rating_order || a.rating_order_delivery || 5}★ • Del: {a.rating_delivery || a.rating_order_delivery || 5}★ • QA: {a.rating_product_quality || 5}★
                              <br />
                              Bill: {a.rating_account_billing || 5}★ • Serv: {a.rating_services || a.rating_sales_support || 5}★ • Sales: {a.rating_sales_person || a.rating_sales_support || 5}★
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem' }}>
                            Audit Pending
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                        {a?.next_month_demand_plan ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              📦 {a.next_month_demand_plan}
                            </div>
                            {a.competitor_schemes && (
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                                Intel: {a.competitor_schemes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openAuditModal(item)}
                          style={{
                            padding: '0.4rem 0.85rem',
                            background: a ? 'rgba(59,130,246,0.15)' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                            border: a ? '1px solid #3b82f6' : 'none',
                            color: a ? '#60a5fa' : '#fff',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {a ? 'Review Audit' : 'Conduct Audit'}
                        </button>
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
          totalRecords={filteredQueue.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Audit Modal */}
      {selectedPartyForAudit && (
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
            maxWidth: '680px',
            maxHeight: '92vh',
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
              background: 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, transparent 100%)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Monthly Partner Health Audit ({period})
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {selectedPartyForAudit.party?.firm_name} ({selectedPartyForAudit.party?.party_universal_code})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPartyForAudit(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAudit} style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
              {/* 6-Dimension Interactive Star Ratings Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                <StarRatingInput
                  icon={Package}
                  label="1. Order Related Rating"
                  value={auditForm.rating_order}
                  onChange={val => handleRatingChange('rating_order', val)}
                />
                <StarRatingInput
                  icon={Truck}
                  label="2. Delivery Related Rating"
                  value={auditForm.rating_delivery}
                  onChange={val => handleRatingChange('rating_delivery', val)}
                />
                <StarRatingInput
                  icon={Wrench}
                  label="3. Product Quality Rating"
                  value={auditForm.rating_product_quality}
                  onChange={val => handleRatingChange('rating_product_quality', val)}
                />
                <StarRatingInput
                  icon={Receipt}
                  label="4. Billing Related Rating"
                  value={auditForm.rating_account_billing}
                  onChange={val => handleRatingChange('rating_account_billing', val)}
                />
                <StarRatingInput
                  icon={Headphones}
                  label="5. Services Related Rating"
                  value={auditForm.rating_services}
                  onChange={val => handleRatingChange('rating_services', val)}
                />
                <StarRatingInput
                  icon={UserCheck}
                  label="6. Sales Person Rating"
                  value={auditForm.rating_sales_person}
                  onChange={val => handleRatingChange('rating_sales_person', val)}
                />
              </div>

              {/* Overall Relationship Rating Card (Auto-Calculated + Manual Selection) */}
              {(() => {
                const overallTheme = RATING_THEMES[auditForm.rating_overall] || {
                  color: '#94a3b8',
                  bg: 'rgba(148, 163, 184, 0.1)',
                  border: 'var(--border-light)'
                };

                return (
                  <div style={{
                    background: auditForm.rating_overall > 0
                      ? `linear-gradient(135deg, ${overallTheme.bg} 0%, rgba(15,23,42,0.6) 100%)`
                      : 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(56,189,248,0.04) 100%)',
                    border: `1.5px solid ${auditForm.rating_overall > 0 ? overallTheme.border : 'var(--accent-color, #3b82f6)'}`,
                    borderRadius: '12px',
                    padding: '0.85rem 1.1rem',
                    marginBottom: '1.25rem',
                    transition: 'all 0.25s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Star size={18} fill={auditForm.rating_overall > 0 ? overallTheme.color : 'none'} stroke={auditForm.rating_overall > 0 ? overallTheme.color : 'var(--text-secondary)'} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          Overall Relationship Rating
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {auditForm.is_overall_manual ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: overallTheme.color, background: overallTheme.bg, border: `1px solid ${overallTheme.border}`, padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                              ✏️ Manual Override ({auditForm.rating_overall}★)
                            </span>
                            <button
                              type="button"
                              onClick={handleResetOverallToAuto}
                              style={{
                                background: 'rgba(56,189,248,0.15)',
                                border: '1px solid #38bdf8',
                                color: '#38bdf8',
                                borderRadius: '4px',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Reset to average of selected ratings"
                            >
                              <RotateCcw size={11} /> Reset to Auto ({exactAvg}★)
                            </button>
                          </div>
                        ) : ratedCount === 0 ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '0.2rem 0.55rem', borderRadius: '4px' }}>
                            ⏳ Pending Selection (0/6 Rated)
                          </span>
                        ) : ratedCount < 6 ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.15)', padding: '0.2rem 0.55rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Sparkles size={11} /> Live Avg: {exactAvg}★ ({ratedCount}/6 Rated)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: overallTheme.color, background: overallTheme.bg, border: `1px solid ${overallTheme.border}`, padding: '0.2rem 0.55rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Sparkles size={11} /> Auto-Calculated (Avg: {exactAvg}★ - 6/6 Complete)
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {[1, 2, 3, 4, 5].map(star => {
                          const isFilled = auditForm.rating_overall > 0 && star <= auditForm.rating_overall;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleOverallChange(star)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '3px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: auditForm.rating_overall === star ? 'scale(1.2)' : 'scale(1)',
                                transition: 'transform 0.15s ease, color 0.15s ease',
                                color: isFilled ? overallTheme.color : 'var(--border-light, #475569)'
                              }}
                              title={`Click to set Overall Rating to ${star} Star manually`}
                            >
                              <Star
                                size={28}
                                fill={isFilled ? overallTheme.color : 'none'}
                                stroke={isFilled ? overallTheme.color : 'currentColor'}
                                strokeWidth={isFilled ? 1 : 1.5}
                              />
                            </button>
                          );
                        })}
                      </div>

                      <div style={{
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        color: auditForm.rating_overall > 0 ? overallTheme.color : 'var(--text-secondary)'
                      }}>
                        {auditForm.rating_overall === 0 ? (
                          <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Select all ratings above</span>
                        ) : (
                          <>
                            {auditForm.rating_overall} / 5 Stars
                            {auditForm.rating_overall === 5 && ' — Healthy & Thriving'}
                            {auditForm.rating_overall === 4 && ' — Good Partner'}
                            {auditForm.rating_overall === 3 && ' — Neutral / Steady'}
                            {auditForm.rating_overall === 2 && ' — Strained / At Risk'}
                            {auditForm.rating_overall === 1 && ' — Critical Dormant Risk'}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Demand Forecasting Input */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  📦 Next Month Projected Demand Plan *
                </label>
                <input
                  type="text"
                  required
                  value={auditForm.next_month_demand_plan}
                  onChange={e => setAuditForm({ ...auditForm, next_month_demand_plan: e.target.value })}
                  placeholder="e.g. Planning 5 Rotavator (Super) & 2 MB Ploughs in 1st week"
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              {/* Competitor Schemes */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  ⚔️ Competitor Schemes &amp; Market Intelligence
                </label>
                <textarea
                  rows="2"
                  value={auditForm.competitor_schemes}
                  onChange={e => setAuditForm({ ...auditForm, competitor_schemes: e.target.value })}
                  placeholder="Competitor discounts, credit extensions, dealer margins in region..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              {/* Suggestions */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  💡 Dealer Suggestions &amp; Management Feedback
                </label>
                <textarea
                  rows="2"
                  value={auditForm.dealer_suggestions}
                  onChange={e => setAuditForm({ ...auditForm, dealer_suggestions: e.target.value })}
                  placeholder="Suggestions on packaging, branding, spare parts availability..."
                  style={{ width: '100%', padding: '0.6rem 0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                />
              </div>

              {successMsg && (
                <div style={{ padding: '0.65rem 1rem', background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#34d399', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem' }}>
                  {successMsg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedPartyForAudit(null)}
                  style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.84rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.6rem 1.4rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '0.84rem'
                  }}
                >
                  {saving ? 'Saving...' : 'Record Health Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
