'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar, Users, AlertTriangle, CheckCircle2, Search, Filter,
  RefreshCw, Star, TrendingUp, ShieldAlert, Edit3
} from 'lucide-react';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';
import { getMonthlyHealthCheckQueue, saveMonthlyHealthCheckAudit } from '@/app/actions/orderFulfillment';
import MaskedPhoneDisplay from '../common/MaskedPhoneDisplay';

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

  // 5-Dimension Audit Form
  const [auditForm, setAuditForm] = useState({
    rating_order_delivery: 5,
    rating_product_quality: 5,
    rating_sales_support: 5,
    rating_account_billing: 5,
    rating_overall: 5,
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
    health_stars: 200,
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
    setAuditForm({
      rating_order_delivery: a?.rating_order_delivery || 5,
      rating_product_quality: a?.rating_product_quality || 5,
      rating_sales_support: a?.rating_sales_support || a?.tse_support_rating || 5,
      rating_account_billing: a?.rating_account_billing || 5,
      rating_overall: a?.rating_overall || 5,
      next_month_demand_plan: a?.next_month_demand_plan || '',
      competitor_schemes: a?.competitor_schemes || '',
      dealer_suggestions: a?.dealer_suggestions || ''
    });
  };

  const handleSaveAudit = async (e) => {
    e.preventDefault();
    if (!selectedPartyForAudit) return;
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

  // KPI Ribbon counts
  const kpis = useMemo(() => {
    const total = queue.length;
    const audited = queue.filter(q => q.isAudited).length;
    const dormant = queue.filter(q => q.isDormant).length;
    const healthy = total - dormant;
    return { total, audited, dormant, healthy };
  }, [queue]);

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
                <th style={{ width: `${columnWidths.partner}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Channel Partner
                  <ColumnResizer onMouseDown={e => startResize('partner', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.location}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Location
                  <ColumnResizer onMouseDown={e => startResize('location', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.period}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Audit Month
                  <ColumnResizer onMouseDown={e => startResize('period', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.days_inactive}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Dormancy Status
                  <ColumnResizer onMouseDown={e => startResize('days_inactive', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.health_stars}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  5-Dim Health Score
                  <ColumnResizer onMouseDown={e => startResize('health_stars', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.demand_plan}px`, padding: '0.85rem 1rem', position: 'relative' }}>
                  Demand Forecast &amp; Intel
                  <ColumnResizer onMouseDown={e => startResize('demand_plan', e)} onDoubleClick={() => resetWidths()} />
                </th>
                <th style={{ width: `${columnWidths.actions}px`, padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
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
                filteredQueue.map(item => {
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#fbbf24' }}>
                              {'★'.repeat(a.rating_overall || 5)}
                              {'☆'.repeat(5 - (a.rating_overall || 5))}
                              <span style={{ fontWeight: 800, color: 'var(--text-primary)', marginLeft: '0.3rem', fontSize: '0.85rem' }}>
                                {a.rating_overall || 5}/5
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              Del: {a.rating_order_delivery || 5}★ • QA: {a.rating_product_quality || 5}★ • Sales: {a.rating_sales_support || 5}★
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

            <form onSubmit={handleSaveAudit} style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {/* 5-Dimension Ratings Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    1. Overall Relationship Health *
                  </label>
                  <select
                    value={auditForm.rating_overall}
                    onChange={e => setAuditForm({ ...auditForm, rating_overall: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ 5 - Healthy &amp; Thriving</option>
                    <option value={4}>⭐⭐⭐⭐ 4 - Good Partner</option>
                    <option value={3}>⭐⭐⭐ 3 - Neutral</option>
                    <option value={2}>⭐⭐ 2 - Strained / At Risk</option>
                    <option value={1}>⭐ 1 - Critical Dormant Risk</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    2. Order &amp; Delivery Punctuality
                  </label>
                  <select
                    value={auditForm.rating_order_delivery}
                    onChange={e => setAuditForm({ ...auditForm, rating_order_delivery: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value={5}>5 Stars - Highly Punctual</option>
                    <option value={4}>4 Stars - Satisfactory</option>
                    <option value={3}>3 Stars - Moderate</option>
                    <option value={2}>2 Stars - Delays Occur</option>
                    <option value={1}>1 Star - Frequent Delays</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    3. Product Quality &amp; Reliability
                  </label>
                  <select
                    value={auditForm.rating_product_quality}
                    onChange={e => setAuditForm({ ...auditForm, rating_product_quality: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value={5}>5 Stars - Zero Defect Trust</option>
                    <option value={4}>4 Stars - Good Machine Quality</option>
                    <option value={3}>3 Stars - Minor Issues</option>
                    <option value={2}>2 Stars - Quality Complaints</option>
                    <option value={1}>1 Star - Severe Failures</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    4. Field Sales &amp; TSE Support
                  </label>
                  <select
                    value={auditForm.rating_sales_support}
                    onChange={e => setAuditForm({ ...auditForm, rating_sales_support: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value={5}>5 Stars - Proactive TSE Visits</option>
                    <option value={4}>4 Stars - Good Field Presence</option>
                    <option value={3}>3 Stars - Occasional Visits</option>
                    <option value={2}>2 Stars - Rare TSE Contact</option>
                    <option value={1}>1 Star - No Support At All</option>
                  </select>
                </div>
              </div>

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
