'use client';

import React, { useState, useMemo } from 'react';
import {
  Building2, Users, Plus, ArrowRight, CheckCircle2, Clock,
  AlertTriangle, ShieldCheck, DollarSign, RefreshCw, MapPin,
  TrendingUp, BarChart3, Truck, Star, MessageSquare, AlertCircle,
  ExternalLink, ChevronRight, Shield, Sparkles, Filter, Check,
  UserCheck, Award, Layers
} from 'lucide-react';

export default function PartyMasterDashboard({
  parties = [],
  transferredLeads = [],
  loadingTransfers = false,
  onSwitchTab,
  onNewParty,
  getStageApprovalStatus,
  onConfirmHandoffLead,
  resumeWizard,
  setIsStageModalOpen,
  refreshData,
  refreshTransferredLeads,
  orderFollowups = [],
  orderFeedbacks = [],
  monthlyFeedbacks = [],
  complaints = []
}) {
  const [companyFilter, setCompanyFilter] = useState('ALL'); // 'ALL' | 'NSMLR' | 'NSTL'
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      if (typeof refreshData === 'function') await refreshData();
      if (typeof refreshTransferredLeads === 'function') await refreshTransferredLeads();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter parties by selected company
  const filteredParties = useMemo(() => {
    if (!Array.isArray(parties)) return [];
    if (companyFilter === 'ALL') return parties;
    return parties.filter(p => {
      const comp = (p.our_company || '').toUpperCase();
      if (companyFilter === 'NSTL') return comp === 'NSTL' || comp === 'NSTLP';
      return comp === 'NSMLR';
    });
  }, [parties, companyFilter]);

  // Filter transferred leads by selected company
  const filteredTransferred = useMemo(() => {
    if (!Array.isArray(transferredLeads)) return [];
    if (companyFilter === 'ALL') return transferredLeads;
    return transferredLeads.filter(l => {
      const comp = (l.our_company || l.lead?.our_company || '').toUpperCase();
      if (companyFilter === 'NSTL') return comp === 'NSTL' || comp === 'NSTLP';
      return comp === 'NSMLR';
    });
  }, [transferredLeads, companyFilter]);

  // Non-draft active registered partners
  const activePartners = useMemo(() => {
    return filteredParties.filter(p =>
      p.party_status !== 'Draft_From_Lead' && p.onboarding_stage !== 'S00_Party_Entry'
    );
  }, [filteredParties]);

  // Partner tier breakdown
  const distributors = useMemo(() => activePartners.filter(p => p.party_type === 'Distributor'), [activePartners]);
  const dealers = useMemo(() => activePartners.filter(p => p.party_type === 'Dealer'), [activePartners]);
  const subDealers = useMemo(() => activePartners.filter(p => p.party_type === 'Sub-Dealer'), [activePartners]);

  // Direct vs Distributor billing
  const directBillingPartners = useMemo(() => {
    return activePartners.filter(p => p.billing_route_type === 'DIRECT_COMPANY_BILLING');
  }, [activePartners]);

  const distributorBilledPartners = useMemo(() => {
    return activePartners.filter(p => p.billing_route_type === 'DISTRIBUTOR_BILLED');
  }, [activePartners]);

  const dealerBilledPartners = useMemo(() => {
    return activePartners.filter(p => p.billing_route_type === 'DEALER_BILLED');
  }, [activePartners]);

  // Security deposit & Credit total
  const financialTotals = useMemo(() => {
    let totalDeposit = 0;
    let totalCredit = 0;
    activePartners.forEach(p => {
      const terms = Array.isArray(p.party_commercial_terms) && p.party_commercial_terms[0] ? p.party_commercial_terms[0] : null;
      if (terms) {
        totalDeposit += Number(terms.security_deposit_amount || 0);
        totalCredit += Number(terms.credit_limit || 0);
      } else {
        totalDeposit += Number(p.security_deposit_amount || 0);
        totalCredit += Number(p.credit_limit || 0);
      }
    });
    return { totalDeposit, totalCredit };
  }, [activePartners]);

  // S00 Pending transfers count
  const pendingS00Leads = useMemo(() => {
    return filteredTransferred.filter(l => l.transfer_status === 'PENDING_CONFIRMATION' || l.handoff_status === 'PENDING_CONFIRMATION');
  }, [filteredTransferred]);

  // Sequential Stage Gate Funnel Counts
  const funnelStats = useMemo(() => {
    let s01Count = 0;
    let s02Count = 0;
    let s03Count = 0;
    let s04Count = 0;
    let s05Count = 0;
    let s06Count = 0;
    let s07Count = 0;
    let s08Count = 0;

    filteredParties.forEach(p => {
      const approvals = typeof getStageApprovalStatus === 'function' ? getStageApprovalStatus(p) : {};
      if (approvals.s01) s01Count++;
      if (approvals.s02) s02Count++;
      if (approvals.s03) s03Count++;
      if (approvals.s04) s04Count++;
      if (approvals.s05) s05Count++;
      if (approvals.s06) s06Count++;
      if (approvals.s07) s07Count++;
      if (approvals.s08) s08Count++;
    });

    return {
      s00: pendingS00Leads.length,
      s01: s01Count,
      s02: s02Count,
      s03: s03Count,
      s04: s04Count,
      s05: s05Count,
      s06: s06Count,
      s07: s07Count,
      s08: s08Count
    };
  }, [filteredParties, pendingS00Leads, getStageApprovalStatus]);

  // State distribution
  const stateDistribution = useMemo(() => {
    const map = {};
    activePartners.forEach(p => {
      const st = p.state_name || 'Punjab';
      map[st] = (map[st] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const maxVal = entries[0]?.[1] || 1;
    return entries.slice(0, 7).map(([state, count]) => ({
      state,
      count,
      pct: Math.round((count / (activePartners.length || 1)) * 100),
      barWidth: Math.round((count / maxVal) * 100)
    }));
  }, [activePartners]);

  // Operations stats
  const openComplaintsCount = useMemo(() => {
    if (!Array.isArray(complaints)) return 0;
    return complaints.filter(c => c.status !== 'CLOSED' && c.status !== 'RESOLVED').length;
  }, [complaints]);

  const recentFollowupsCount = useMemo(() => {
    return Array.isArray(orderFollowups) ? orderFollowups.length : 0;
  }, [orderFollowups]);

  // Format currency in Indian format
  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '₹0';
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} Lakh`;
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* ========================================================= */}
      {/* 1. TOP EXECUTIVE HEADER WITH ACTIONS & COMPANY FILTER */}
      {/* ========================================================= */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.3))',
            border: '1.5px solid rgba(16,185,129,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            boxShadow: '0 4px 12px rgba(16,185,129,0.15)'
          }}>
            <Building2 size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Party Master Dashboard
              </h1>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.3)'
              }}>
                Channel Network Hub
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '0.25rem 0 0 0' }}>
              Sequential 3-tier channel pipeline gating, financial security metrics, and partner performance engines
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Company Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.25rem 0.6rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
            <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Company:</span>
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.82rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Companies (NSMLR & NSTL)</option>
              <option value="NSMLR">NSMLR</option>
              <option value="NSTL">NSTL</option>
            </select>
          </div>

          {/* S00 Transfers Queue Shortcut */}
          <button
            onClick={() => onSwitchTab('s00')}
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '10px',
              border: '1.5px solid rgba(239,68,68,0.35)',
              background: pendingS00Leads.length > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-primary)',
              color: '#ef4444',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.15s'
            }}
            title="Go to S00 Transfered to Party Master"
          >
            <span>🚀 S00 Queue</span>
            {pendingS00Leads.length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '0.1rem 0.45rem',
                borderRadius: '10px'
              }}>
                {pendingS00Leads.length} Pending
              </span>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            style={{
              padding: '0.55rem 0.9rem',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
            title="Refresh All Party Data"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Onboard New Partner Button */}
          <button
            onClick={onNewParty}
            style={{
              padding: '0.58rem 1.25rem',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
              transition: 'all 0.15s'
            }}
          >
            <Plus size={16} /> + Onboard Partner (S01)
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. EXECUTIVE KPI CARDS */}
      {/* ========================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Total Channel Partners */}
        <div
          onClick={() => onSwitchTab('report')}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = 'var(--accent-color)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--border-light)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL PARTNERS</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            {activePartners.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Verified in Network</span>
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>View Report ➔</span>
          </div>
        </div>

        {/* Level 1: Distributors */}
        <div
          onClick={() => onSwitchTab('s02')}
          style={{
            background: 'var(--bg-surface)',
            border: '1.5px solid rgba(56,189,248,0.25)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#38bdf8';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'rgba(56,189,248,0.25)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>👑 LEVEL 1 DISTRIBUTORS</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#38bdf8', marginTop: '0.35rem' }}>
            {distributors.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{Math.round((distributors.length / (activePartners.length || 1)) * 100)}% of network</span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>Stage S02 ➔</span>
          </div>
        </div>

        {/* Level 2: Dealers */}
        <div
          onClick={() => onSwitchTab('s03')}
          style={{
            background: 'var(--bg-surface)',
            border: '1.5px solid rgba(16,185,129,0.25)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>🏪 LEVEL 2 DEALERS</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#10b981', marginTop: '0.35rem' }}>
            {dealers.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{Math.round((dealers.length / (activePartners.length || 1)) * 100)}% of network</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>Stage S03 ➔</span>
          </div>
        </div>

        {/* Level 3: Sub-Dealers */}
        <div
          onClick={() => onSwitchTab('s04')}
          style={{
            background: 'var(--bg-surface)',
            border: '1.5px solid rgba(245,158,11,0.25)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#f59e0b';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>🛒 LEVEL 3 SUB-DEALERS</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#f59e0b', marginTop: '0.35rem' }}>
            {subDealers.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Retail distribution arms</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>Stage S04 ➔</span>
          </div>
        </div>

        {/* Direct Billing vs Dist Billing */}
        <div
          onClick={() => onSwitchTab('s05')}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--border-light)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>BILLING ROUTES</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            <span style={{ color: '#10b981' }}>{directBillingPartners.length}</span> <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Direct</span> / <span style={{ color: '#38bdf8' }}>{distributorBilledPartners.length}</span> <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Dist</span> / <span style={{ color: '#f59e0b' }}>{dealerBilledPartners.length}</span> <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Dealer</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Commercial routes</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>Stage S05 ➔</span>
          </div>
        </div>

        {/* Security Deposits / Credit Total */}
        <div
          onClick={() => onSwitchTab('s05')}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '14px',
            padding: '1.1rem 1.25rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#6366f1';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--border-light)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>TOTAL SECURITY DEPOSITS</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#818cf8', marginTop: '0.35rem' }}>
            {formatCurrency(financialTotals.totalDeposit)}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Credit Line: {formatCurrency(financialTotals.totalCredit)}</span>
            <span style={{ color: '#818cf8', fontWeight: 700 }}>Terms ➔</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. SEQUENTIAL PIPELINE FUNNEL (S00 TO S08 GATES) */}
      {/* ========================================================= */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '16px',
        padding: '1.35rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} className="text-emerald-500" />
              Channel Partner Sequential Pipeline Funnel
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
              Strict gate progression: Each stage unlocks only when preceding stage is verified and confirmed
            </p>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
            Click any gate to inspect records
          </div>
        </div>

        {/* Funnel Pipeline Flow Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem'
        }}>
          {/* Gate S00 */}
          <div
            onClick={() => onSwitchTab('s00')}
            style={{
              background: 'var(--bg-primary)',
              border: '1.5px solid rgba(239,68,68,0.35)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ef4444' }}>GATE S00</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Handoff</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Transferred Leads
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#ef4444' }}>
                {funnelStats.s00}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Open S00 ➔</span>
            </div>
          </div>

          {/* Gate S01 */}
          <div
            onClick={() => onSwitchTab('s01')}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8' }}>GATE S01</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Draft</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Party Master Creation
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {funnelStats.s01}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 700 }}>Stage S01 ➔</span>
            </div>
          </div>

          {/* Gate S02-S04 Hierarchy */}
          <div
            onClick={() => onSwitchTab('s02')}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#818cf8' }}>GATES S02-04</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(129,140,248,0.15)', color: '#818cf8', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Hierarchy</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Tier Registrations
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {funnelStats.s02 + funnelStats.s03 + funnelStats.s04}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700 }}>Inspect ➔</span>
            </div>
          </div>

          {/* Gate S05 Commercial & Security */}
          <div
            onClick={() => onSwitchTab('s05')}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981' }}>GATE S05</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Security</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Commercial & Deposit
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {funnelStats.s05}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Stage S05 ➔</span>
            </div>
          </div>

          {/* Gate S06 Product Auth & Territory */}
          <div
            onClick={() => onSwitchTab('s06')}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b' }}>GATE S06</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Catalog</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Product & Territory
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {funnelStats.s06}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>Stage S06 ➔</span>
            </div>
          </div>

          {/* Gate S07 Sales Team Assignment */}
          <div
            onClick={() => onSwitchTab('s07')}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ec4899' }}>GATE S07</span>
                <span style={{ fontSize: '0.65rem', background: 'rgba(236,72,153,0.15)', color: '#ec4899', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>Team</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Sales Team Assignment
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {funnelStats.s07}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#ec4899', fontWeight: 700 }}>Stage S07 ➔</span>
            </div>
          </div>

          {/* Gate S08 Partner Activation */}
          <div
            onClick={() => onSwitchTab('s08')}
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))',
              border: '1.5px solid rgba(16,185,129,0.4)',
              borderRadius: '12px',
              padding: '0.85rem 0.95rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#10b981'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981' }}>GATE S08</span>
                <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 800 }}>Active</span>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.3rem' }}>
                Activated Partners
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#10b981' }}>
                {funnelStats.s08}
              </div>
              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Stage S08 ➔</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. TWO-COLUMN GRID: OPERATIONS ENGINES & STATE BREAKDOWN */}
      {/* ========================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1rem'
      }}>
        {/* Operations Health Engines */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={18} className="text-amber-500" />
              Operational Engines Activity
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>4 Post-Sales Modules</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Engine 1: Order Followups */}
            <div
              onClick={() => onSwitchTab('order_followup')}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Daily Order Followups</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Log orders, advance dispatch planning</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6' }}>{recentFollowupsCount}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              </div>
            </div>

            {/* Engine 2: Post-Order Feedback */}
            <div
              onClick={() => onSwitchTab('order_feedback')}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Post-Order Feedback</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Delivery time, packaging & transit damage scores</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>{Array.isArray(orderFeedbacks) ? orderFeedbacks.length : 0}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              </div>
            </div>

            {/* Engine 3: Monthly Health Checks */}
            <div
              onClick={() => onSwitchTab('monthly_feedback')}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Monthly Health Checks</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Payment discipline, market demand & expansion</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>{Array.isArray(monthlyFeedbacks) ? monthlyFeedbacks.length : 0}</span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              </div>
            </div>

            {/* Engine 4: Complaint Management */}
            <div
              onClick={() => onSwitchTab('complaints')}
              style={{
                padding: '0.8rem 1rem',
                borderRadius: '10px',
                border: '1.5px solid rgba(239,68,68,0.3)',
                background: openComplaintsCount > 0 ? 'rgba(239,68,68,0.06)' : 'var(--bg-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Complaint Management</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Escalation SLA & Quality Assurance closeout</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>
                  {openComplaintsCount} Open
                </span>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Geographic State Distribution */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '16px',
          padding: '1.25rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <MapPin size={18} className="text-emerald-500" />
              State & Territory Distribution
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Top Geographies</span>
          </div>

          {stateDistribution.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No active partner territories registered yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {stateDistribution.map(item => (
                <div key={item.state} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.state}</span>
                    <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>
                      {item.count} <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({item.pct}%)</span>
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${item.barWidth}%`,
                      height: '100%',
                      borderRadius: '4px',
                      background: 'linear-gradient(90deg, #10b981, #059669)',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5. INCOMING S00 TRANSFERS QUEUE (WON LEADS AWAITING S01) */}
      {/* ========================================================= */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: 'rgba(239,68,68,0.03)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(239,68,68,0.18)', color: '#ef4444' }}>
                STAGE S00 ACTION QUEUE
              </span>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Incoming Leads Ready for Onboarding
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0.2rem 0 0 0' }}>
              Deals marked won in Stage 07 / 08 and transferred here. Confirming unlocks them into <strong>Stage S01</strong>.
            </p>
          </div>

          <button
            onClick={() => onSwitchTab('s00')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span>View All S00 Leads ({pendingS00Leads.length})</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--th-bg, rgba(255,255,255,0.02))', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Universal ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>Our Company</th>
                <th style={{ padding: '0.75rem 1rem' }}>Firm & Lead Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Contact & Phone</th>
                <th style={{ padding: '0.75rem 1rem' }}>State / District</th>
                <th style={{ padding: '0.75rem 1rem' }}>Handoff Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingTransfers ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.4rem auto' }} />
                    Loading incoming transfers...
                  </td>
                </tr>
              ) : pendingS00Leads.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={24} style={{ color: '#10b981', margin: '0 auto 0.4rem auto' }} />
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>All Transferred Leads Processed</div>
                    <div style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>No pending transfers in S00 queue right now.</div>
                  </td>
                </tr>
              ) : (
                pendingS00Leads.slice(0, 5).map(lead => {
                  const comp = lead.our_company === 'NSTLP' ? 'NSTL' : (lead.our_company || 'NSMLR');
                  return (
                    <tr key={lead.handoff_id || lead.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--accent-color)', fontFamily: 'monospace' }}>
                        {lead.lead_universal_id || 'LEAD'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          background: comp === 'NSTL' ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                          color: comp === 'NSTL' ? '#ec4899' : '#f59e0b',
                          border: `1px solid ${comp === 'NSTL' ? 'rgba(236,72,153,0.3)' : 'rgba(245,158,11,0.3)'}`
                        }}>
                          {comp}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lead.firm_name || lead.lead_name}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{lead.order_category || 'Agro Implements'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{lead.contact_person || lead.lead_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{lead.primary_mobile}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                        <div>{lead.state_name || 'Punjab'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{lead.district_name || 'Amritsar'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444'
                        }}>
                          ⏳ Pending Confirmation
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            if (typeof onConfirmHandoffLead === 'function') {
                              onConfirmHandoffLead(lead);
                            } else {
                              onSwitchTab('s00');
                            }
                          }}
                          style={{
                            padding: '0.4rem 0.85rem',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 2px 6px rgba(16,185,129,0.3)'
                          }}
                        >
                          <CheckCircle2 size={13} /> Confirm &amp; Move to S01 ➔
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

      {/* ========================================================= */}
      {/* 6. RECENT ACTIVE CHANNEL PARTNERS TABLE */}
      {/* ========================================================= */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <div style={{
          padding: '1.1rem 1.4rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Recent Channel Partners
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '0.2rem 0 0 0' }}>
              Recently active partners across Distributor, Dealer, and Sub-Dealer tiers
            </p>
          </div>

          <button
            onClick={() => onSwitchTab('report')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span>Complete Party Master Report</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--th-bg, rgba(255,255,255,0.02))', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Party Code & Tier</th>
                <th style={{ padding: '0.75rem 1rem' }}>Our Company</th>
                <th style={{ padding: '0.75rem 1rem' }}>Firm Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Contact & Mobile</th>
                <th style={{ padding: '0.75rem 1rem' }}>State / Territory</th>
                <th style={{ padding: '0.75rem 1rem' }}>Billing Route</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activePartners.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No active partners found for the selected company filter.
                  </td>
                </tr>
              ) : (
                activePartners.slice(0, 6).map(p => {
                  const isDist = p.party_type === 'Distributor';
                  const isDealer = p.party_type === 'Dealer';
                  const comp = (p.our_company === 'NSTL' || p.our_company === 'NSTLP') ? 'NSTL' : 'NSMLR';
                  const code = p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code;

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: isDist ? '#38bdf8' : isDealer ? '#10b981' : '#f59e0b' }}>
                          {code}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          background: isDist ? 'rgba(56,189,248,0.15)' : isDealer ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color: isDist ? '#38bdf8' : isDealer ? '#10b981' : '#f59e0b',
                          marginTop: '0.15rem'
                        }}>
                          {isDist ? '👑 Distributor' : isDealer ? '🏪 Dealer' : '🛒 Sub-Dealer'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          background: comp === 'NSTL' ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                          color: comp === 'NSTL' ? '#ec4899' : '#f59e0b'
                        }}>
                          {comp}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {p.firm_name || p.legal_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{p.contact_person_name_1 || '-'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#10b981' }}>{p.biz_contact_no_1 || p.contact_mobile_1_1 || '-'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                        <div>{p.state_name || 'Punjab'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{p.district_name || '-'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          background: p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                            ? 'rgba(16,185,129,0.15)'
                            : p.billing_route_type === 'DEALER_BILLED'
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(56,189,248,0.15)',
                          color: p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                            ? '#10b981'
                            : p.billing_route_type === 'DEALER_BILLED'
                            ? '#f59e0b'
                            : '#38bdf8'
                        }}>
                          {p.billing_route_type === 'DIRECT_COMPANY_BILLING'
                            ? '⚡ Direct Billing'
                            : p.billing_route_type === 'DEALER_BILLED'
                            ? '🏬 Dealer Billed'
                            : '📦 Dist Billed'}
                        </span>
                        {p.billing_first_amount ? (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            1st: ₹{Number(p.billing_first_amount).toLocaleString('en-IN')}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            if (typeof resumeWizard === 'function') {
                              resumeWizard(p, 's01');
                              if (typeof setIsStageModalOpen === 'function') setIsStageModalOpen(true);
                            } else {
                              onSwitchTab('report');
                            }
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            fontSize: '0.76rem',
                            cursor: 'pointer'
                          }}
                        >
                          View ➔
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

    </div>
  );
}
