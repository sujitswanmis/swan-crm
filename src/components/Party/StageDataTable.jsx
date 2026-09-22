'use client';

import React, { useState, useMemo } from 'react';
import {
  Search, Filter, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Building2, ShieldCheck, Check, Plus, ExternalLink, RefreshCw,
  Users, MapPin, Phone, Shield, ChevronRight
} from 'lucide-react';

const STAGE_CONFIGS = {
  s01: {
    badge: 'STAGE S01',
    badgeColor: '#38bdf8',
    badgeBg: 'rgba(56,189,248,0.15)',
    title: 'S01 Party Master Creation — Channel Partner Pipeline',
    desc: 'Incoming and on-file channel partners. Verify legal firm identity, constitution, GSTIN, and primary contact channels.',
    filterTiers: null,
    isEligible: (app) => Boolean(app.s00),
    checkApproval: (app) => app.s01,
    col5Title: 'GSTIN & Source Origin'
  },
  s02: {
    badge: 'STAGE S02',
    badgeColor: '#60a5fa',
    badgeBg: 'rgba(96,165,250,0.15)',
    title: 'S02 Distributor Registration — Master Channel Hubs',
    desc: 'Level 1 Super Stockists and Master Regional Hubs. Allocate jurisdiction zones and logistics territories.',
    filterTiers: ['Distributor'],
    isEligible: (app) => Boolean(app.s01),
    checkApproval: (app) => app.s02,
    col5Title: 'Jurisdiction Zone & Route'
  },
  s03: {
    badge: 'STAGE S03',
    badgeColor: '#34d399',
    badgeBg: 'rgba(16,185,129,0.15)',
    title: 'S03 Dealer Registration — Authorized Showrooms',
    desc: 'Level 2 Authorized Showroom Dealerships. Mandatory mapping to an active Parent Distributor.',
    filterTiers: ['Dealer'],
    isEligible: (app) => Boolean(app.s01),
    checkApproval: (app) => app.s03,
    col5Title: 'Parent Distributor & Showroom'
  },
  s04: {
    badge: 'STAGE S04',
    badgeColor: '#fbbf24',
    badgeBg: 'rgba(245,158,11,0.15)',
    title: 'S04 Sub-Dealer Registration — Retail Counters',
    desc: 'Level 3 Retail Counters. Mandatory mapping to an active Parent Dealer and auto-linked Distributor.',
    filterTiers: ['Sub-Dealer'],
    isEligible: (app) => Boolean(app.s01),
    checkApproval: (app) => app.s04,
    col5Title: 'Parent Dealer & Derived Distributor'
  },
  s05: {
    badge: 'STAGE S05',
    badgeColor: '#f59e0b',
    badgeBg: 'rgba(245,158,11,0.15)',
    title: 'S05 Commercial Security Details & Billing Route Pipeline',
    desc: 'Configure Direct Company Billing vs Distributor Billed, Security Deposit Amount, and Security Cheque/PDC.',
    filterTiers: null,
    isEligible: (app) => Boolean(app.tier),
    checkApproval: (app) => app.s05,
    col5Title: 'Billing Route & Security Terms'
  },
  s06: {
    badge: 'STAGE S06',
    badgeColor: '#38bdf8',
    badgeBg: 'rgba(56,189,248,0.15)',
    title: 'S06 Product Authorization & Territory Allocation Pipeline',
    desc: 'Authorize implement machinery categories (Rotavator, Mulcher, etc.) and assign geographic districts.',
    filterTiers: null,
    isEligible: (app) => Boolean(app.s05),
    checkApproval: (app) => app.s06,
    col5Title: 'Category, Products & Territory'
  },
  s07: {
    badge: 'STAGE S07',
    badgeColor: '#a78bfa',
    badgeBg: 'rgba(167,139,250,0.15)',
    title: 'S07 Sales Team Assignment Pipeline (7 Dedicated Roles)',
    desc: 'Assign dedicated company personnel across 7 roles (NSM, RSM, ASM, Telecaller, Order Booking, CRM).',
    filterTiers: null,
    isEligible: (app) => Boolean(app.s06),
    checkApproval: (app) => app.s07,
    col5Title: 'Assigned Sales Staff & Roles'
  },
  s08: {
    badge: 'STAGE S08',
    badgeColor: '#10b981',
    badgeBg: 'rgba(16,185,129,0.15)',
    title: 'S08 Partner Activation & Operational Status Desk',
    desc: 'Validate 5-gate pre-flight readiness checklist and assign live operational status (Active, Hold, Payment Issues).',
    filterTiers: null,
    isEligible: (app) => Boolean(app.s07),
    checkApproval: (app) => app.s08,
    col5Title: 'Pre-Flight Readiness & Status'
  }
};

export default function StageDataTable({
  stageId,
  parties = [],
  activePartyId = null,
  onSelectParty,
  getStageApprovalStatus,
  onNewParty
}) {
  const meta = STAGE_CONFIGS[stageId] || STAGE_CONFIGS.s01;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED'
  const [companyFilter, setCompanyFilter] = useState('ALL'); // 'ALL' | 'NSMLR' | 'NSTLP'
  const [onlyStageTier, setOnlyStageTier] = useState(Boolean(meta.filterTiers));

  // Compute status map for all parties
  const partyApprovalMap = useMemo(() => {
    const map = new Map();
    if (!parties || !getStageApprovalStatus) return map;
    for (const p of parties) {
      map.set(p.id, getStageApprovalStatus(p));
    }
    return map;
  }, [parties, getStageApprovalStatus]);

  // Filter parties that are eligible for this stage (previous stage confirmed) and tier filter
  const tierFilteredParties = useMemo(() => {
    if (!parties) return [];
    return parties.filter(p => {
      const app = partyApprovalMap.get(p.id) || {};
      // 1. Stage eligibility: previous stage MUST be confirmed before party shows here
      if (meta.isEligible && !meta.isEligible(app)) {
        return false;
      }
      // 2. Tier filter if applicable
      if (meta.filterTiers && onlyStageTier) {
        return meta.filterTiers.includes(p.party_type);
      }
      return true;
    });
  }, [parties, partyApprovalMap, meta, onlyStageTier]);

  // Summary counts
  const { totalCount, pendingCount, approvedCount } = useMemo(() => {
    let pending = 0;
    let approved = 0;
    for (const p of tierFilteredParties) {
      const app = partyApprovalMap.get(p.id) || {};
      const isApp = meta.checkApproval(app);
      if (isApp) approved++;
      else pending++;
    }
    return {
      totalCount: tierFilteredParties.length,
      pendingCount: pending,
      approvedCount: approved
    };
  }, [tierFilteredParties, partyApprovalMap, meta]);

  // Filter parties by search term and status
  const displayedParties = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return tierFilteredParties.filter(p => {
      const app = partyApprovalMap.get(p.id) || {};
      const isApproved = meta.checkApproval(app);

      // Status Filter
      if (statusFilter === 'PENDING' && isApproved) return false;
      if (statusFilter === 'APPROVED' && !isApproved) return false;

      // Company Filter
      if (companyFilter !== 'ALL' && (p.our_company || 'NSMLR') !== companyFilter) return false;

      // Search Term Filter
      if (!term) return true;

      const code = (p.party_universal_code || '').toLowerCase();
      const company = (p.our_company || '').toLowerCase();
      const firm = (p.firm_name || '').toLowerCase();
      const legal = (p.legal_name || '').toLowerCase();
      const phone = [
        p.primary_mobile, p.biz_contact_no_1, p.biz_contact_no_2,
        p.contact_mobile_1_1, p.contact_mobile_2_1, p.contact_mobile_3_1
      ].filter(Boolean).join(' ').toLowerCase();
      const contactPerson = [
        p.contact_person_name_1, p.contact_person_name_2, p.contact_person_name_3,
        p.owner_name, p.contact_person
      ].filter(Boolean).join(' ').toLowerCase();
      const district = (p.district_name || '').toLowerCase();
      const state = (p.state_name || '').toLowerCase();
      const gstin = (p.gstin || '').toLowerCase();

      return (
        code.includes(term) ||
        company.includes(term) ||
        firm.includes(term) ||
        legal.includes(term) ||
        phone.includes(term) ||
        contactPerson.includes(term) ||
        district.includes(term) ||
        state.includes(term) ||
        gstin.includes(term)
      );
    });
  }, [tierFilteredParties, partyApprovalMap, meta, statusFilter, companyFilter, searchTerm]);

  // Stage-specific column 5 content renderer
  const renderStageCol5 = (party, approvals) => {
    if (stageId === 's01') {
      return (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            GSTIN: <span style={{ color: party.gstin ? '#60a5fa' : '#94a3b8' }}>{party.gstin || 'Not Provided'}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {party.source_lead_id ? (
              <span style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                <ExternalLink size={11} /> Lead Transferred (S00)
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>Direct Onboarding</span>
            )}
            {party.constitution_type && ` • ${party.constitution_type}`}
          </div>
        </div>
      );
    }

    if (stageId === 's02') {
      return (
        <div>
          <div style={{ fontWeight: 700, color: party.zone ? '#60a5fa' : '#fbbf24' }}>
            {party.zone || '⚠️ Zone Unassigned'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {party.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '🏢 Direct Company' : '👑 Distributor Billed'}
          </div>
        </div>
      );
    }

    if (stageId === 's03') {
      return (
        <div>
          <div style={{ fontWeight: 600, color: party.parent_distributor_id ? '#34d399' : '#fbbf24' }}>
            👑 {party.parent_distributor_name || (party.parent_distributor_id ? 'Assigned Distributor' : '⚠️ Parent Pending')}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {party.showroom_area_sqft ? `${party.showroom_area_sqft} sqft` : '2,500 sqft'} • {party.dealership_type || 'EXCLUSIVE'}
          </div>
        </div>
      );
    }

    if (stageId === 's04') {
      return (
        <div>
          <div style={{ fontWeight: 600, color: party.parent_dealer_id ? '#38bdf8' : '#fbbf24' }}>
            🏬 {party.parent_dealer_name || (party.parent_dealer_id ? 'Assigned Dealer' : '⚠️ Parent Pending')}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Distributor: {party.parent_distributor_name || 'Auto-Linked'}
          </div>
        </div>
      );
    }

    if (stageId === 's05') {
      const depositAmt = party.security_deposit_amount || party.party_commercial_terms?.[0]?.security_deposit_amount;
      return (
        <div>
          <div style={{ fontWeight: 700, color: party.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '#34d399' : '#fbbf24' }}>
            {party.billing_route_type === 'DIRECT_COMPANY_BILLING' ? '🏢 Direct Company' : '👑 Distributor Billed'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Deposit: {depositAmt ? `₹${Number(depositAmt).toLocaleString('en-IN')}` : '₹0 / Nil'}
            {party.commercial_status === 'Completed' && ' • Verified'}
          </div>
        </div>
      );
    }

    if (stageId === 's06') {
      const authCount = party.product_authorizations?.length || 0;
      const cat = party.product_category || party.product_authorizations?.[0]?.product_category || (authCount > 1 ? 'Both' : (authCount === 1 ? (party.product_authorizations[0]?.product_name === 'SPARE_PARTS' ? 'Spare Part' : 'Implement') : null));
      const dist = party.district_name || 'All Mandis';
      const st = party.state_name || '';
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {cat && (
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                background: cat === 'Implement' ? 'rgba(56,189,248,0.2)' : (cat === 'Spare Part' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'),
                color: cat === 'Implement' ? '#38bdf8' : (cat === 'Spare Part' ? '#fbbf24' : '#34d399'),
                border: `1px solid ${cat === 'Implement' ? '#0284c7' : (cat === 'Spare Part' ? '#d97706' : '#059669')}`
              }}>
                {cat}
              </span>
            )}
            <span style={{ fontWeight: 700, color: authCount > 0 ? '#38bdf8' : '#fbbf24' }}>
              {authCount > 0 ? `📦 ${authCount} Products Auth.` : '⚠️ Products Pending'}
            </span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Territory: {dist}{st ? `, ${st}` : ''}
          </div>
        </div>
      );
    }

    if (stageId === 's07') {
      const staffCount = party.team_assignments?.length || 0;
      const roles = (party.team_assignments || []).map(a => a.role_in_party).filter(Boolean);
      const uniqueRoles = [...new Set(roles)];
      return (
        <div>
          <div style={{ fontWeight: 700, color: staffCount > 0 ? '#a78bfa' : '#fbbf24' }}>
            👥 {staffCount > 0 ? `${staffCount} Staff Assigned` : '⚠️ Staff Pending'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            {uniqueRoles.length > 0 ? uniqueRoles.slice(0, 3).join(', ') + (uniqueRoles.length > 3 ? '...' : '') : 'No role mapping'}
          </div>
        </div>
      );
    }

    if (stageId === 's08') {
      const preFlightGates = [approvals.s01, approvals.tier, approvals.s05, approvals.s06, approvals.s07];
      const passedCount = preFlightGates.filter(Boolean).length;
      const isAllReady = passedCount === 5;
      const opStatus = party.party_status || party.final_status || 'Draft';

      const opColors = {
        'Active': { bg: 'rgba(16,185,129,0.2)', text: '#34d399', border: '#10b981' },
        'Inactive': { bg: 'rgba(148,163,184,0.2)', text: '#cbd5e1', border: '#64748b' },
        'Hold': { bg: 'rgba(245,158,11,0.2)', text: '#fbbf24', border: '#f59e0b' },
        'Payment Issues': { bg: 'rgba(239,68,68,0.2)', text: '#f87171', border: '#ef4444' }
      };
      const opConfig = opColors[opStatus] || { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: '#3b82f6' };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              background: isAllReady ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
              color: isAllReady ? '#34d399' : '#fbbf24'
            }}>
              {isAllReady ? '5/5 Pre-Flight Ready' : `${passedCount}/5 Gates Pending`}
            </span>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              background: opConfig.bg,
              color: opConfig.text,
              border: `1px solid ${opConfig.border}`
            }}>
              {opStatus}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: '12px',
      border: '1px solid var(--border-light)',
      padding: '1.25rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.12)'
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '0.85rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              padding: '0.25rem 0.65rem',
              borderRadius: '4px',
              background: meta.badgeBg,
              color: meta.badgeColor,
              letterSpacing: '0.04em'
            }}>
              {meta.badge}
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {meta.title}
            </h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '0.35rem 0 0 0' }}>
            {meta.desc}
          </p>
        </div>

        {/* Action button if S01 */}
        {stageId === 's01' && onNewParty && (
          <button
            type="button"
            onClick={onNewParty}
            style={{
              padding: '0.55rem 1.15rem',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
            }}
          >
            <Plus size={15} /> + Direct Partner Entry (Without Lead)
          </button>
        )}
      </div>

      {/* Filter and search control toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', minWidth: '260px', flex: '1 1 260px', maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search firm, code, mobile, district, GSTIN..."
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.2rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.84rem'
            }}
          />
        </div>

        {/* Status filter pills & Tier toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {meta.filterTiers && (
            <button
              type="button"
              onClick={() => setOnlyStageTier(prev => !prev)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                background: onlyStageTier ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: onlyStageTier ? '#60a5fa' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {onlyStageTier ? `Filter: ${meta.filterTiers[0]}s Only` : 'Showing All Tiers'}
            </button>
          )}

          <div style={{ display: 'inline-flex', background: 'var(--bg-primary)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              style={{
                padding: '0.35rem 0.75rem',
                border: 'none',
                borderRadius: '6px',
                background: statusFilter === 'ALL' ? (meta.badgeColor || 'var(--accent-color, #2563eb)') : 'transparent',
                color: statusFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              All ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              style={{
                padding: '0.35rem 0.75rem',
                border: 'none',
                borderRadius: '6px',
                background: statusFilter === 'PENDING' ? 'rgba(245,158,11,0.2)' : 'transparent',
                color: statusFilter === 'PENDING' ? '#d97706' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Clock size={12} /> Pending ({pendingCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('APPROVED')}
              style={{
                padding: '0.35rem 0.75rem',
                border: 'none',
                borderRadius: '6px',
                background: statusFilter === 'APPROVED' ? 'rgba(16,185,129,0.2)' : 'transparent',
                color: statusFilter === 'APPROVED' ? '#059669' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <CheckCircle2 size={12} /> Approved ({approvedCount})
            </button>
          </div>

          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            style={{
              padding: '0.35rem 0.65rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600
            }}
          >
            <option value="ALL">All Companies (Our Company)</option>
            <option value="NSMLR">NSMLR</option>
            <option value="NSTL">NSTL</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '10px',
        overflow: 'hidden',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--table-header-bg, #e2e8f0)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-light, #cbd5e1)', color: 'var(--table-header-text, #1e293b)' }}>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Universal Code</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Our Company</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Firm &amp; Legal Name</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Channel Tier</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Contact &amp; Location</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>{meta.col5Title}</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700 }}>Stage Status</th>
              <th style={{ padding: '0.75rem 0.9rem', fontWeight: 700, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedParties.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.98rem', marginBottom: '0.3rem' }}>
                    No channel partners found.
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                    {searchTerm ? `No records match search term "${searchTerm}".` : 'No channel partner records currently match this filter criteria.'}
                  </p>
                  {(searchTerm || statusFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }}
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.4rem 0.85rem',
                        background: 'rgba(59,130,246,0.15)',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        color: '#60a5fa',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              displayedParties.map(party => {
                const approvals = partyApprovalMap.get(party.id) || {};
                const isApproved = meta.checkApproval(approvals);
                const isSelected = activePartyId === party.id;

                // Tier badge colors with high-contrast text for both themes
                const tierColors = {
                  'Distributor': { bg: 'rgba(139,92,246,0.15)', text: '#7c3aed', border: 'rgba(139,92,246,0.4)' },
                  'Dealer': { bg: 'rgba(37,99,235,0.15)', text: '#2563eb', border: 'rgba(37,99,235,0.4)' },
                  'Sub-Dealer': { bg: 'rgba(13,148,136,0.15)', text: '#0d9488', border: 'rgba(13,148,136,0.4)' }
                };
                const tierConfig = tierColors[party.party_type] || tierColors['Dealer'];

                return (
                  <tr
                    key={party.id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      background: isSelected ? 'rgba(16,185,129,0.08)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #10b981' : '3px solid transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    {/* Universal Code */}
                    <td style={{ padding: '0.75rem 0.9rem', fontWeight: 700, color: '#38bdf8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>{party.party_universal_code || `PRT-${party.id?.slice(0, 6)}`}</span>
                        {party.source_lead_id && (
                          <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(56,189,248,0.2)', color: '#38bdf8', fontWeight: 700 }} title="Transferred from Lead Stage 07">
                            S00
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Our Company */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '5px',
                        background: (party.our_company === 'NSTL' || party.our_company === 'NSTLP') ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                        color: (party.our_company === 'NSTL' || party.our_company === 'NSTLP') ? '#ec4899' : '#f59e0b',
                        border: `1px solid ${(party.our_company === 'NSTL' || party.our_company === 'NSTLP') ? 'rgba(236,72,153,0.35)' : 'rgba(245,158,11,0.35)'}`
                      }}>
                        {party.our_company === 'NSTLP' ? 'NSTL' : (party.our_company || 'NSMLR')}
                      </span>
                    </td>

                    {/* Firm Name */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {party.firm_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {party.legal_name && party.legal_name !== party.firm_name ? party.legal_name : (party.contact_person_name_1 || party.owner_name || 'Sole Entity')}
                      </div>
                    </td>

                    {/* Tier */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '5px',
                        background: tierConfig.bg,
                        color: tierConfig.text,
                        border: `1px solid ${tierConfig.border}`
                      }}>
                        {party.party_type}
                      </span>
                    </td>

                    {/* Contact & Location */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Phone size={11} className="text-emerald-400" />
                        <span>{party.primary_mobile || party.biz_contact_no_1 || party.contact_mobile_1_1 || '-'}</span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                        <MapPin size={11} className="text-sky-400" />
                        <span>{party.district_name || 'District'}{party.state_name ? `, ${party.state_name}` : ''}</span>
                      </div>
                    </td>

                    {/* Stage Details (Column 5) */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      {renderStageCol5(party, approvals)}
                    </td>

                    {/* Stage Status */}
                    <td style={{ padding: '0.75rem 0.9rem' }}>
                      {stageId === 's08' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.22rem 0.6rem',
                          borderRadius: '5px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          background: (party.party_status === 'Active' || party.final_status === 'Active') ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                          color: (party.party_status === 'Active' || party.final_status === 'Active') ? '#34d399' : '#fbbf24'
                        }}>
                          {(party.party_status === 'Active' || party.final_status === 'Active') ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {(party.party_status === 'Active' || party.final_status === 'Active') ? '✓ Live Active' : '⏳ Pending Activation'}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.22rem 0.6rem',
                          borderRadius: '5px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          background: isApproved ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                          color: isApproved ? '#34d399' : '#fbbf24'
                        }}>
                          {isApproved ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {isApproved ? '✓ Approved' : '⏳ Pending'}
                        </span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td style={{ padding: '0.75rem 0.9rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => onSelectParty(party)}
                        style={{
                          padding: '0.42rem 0.85rem',
                          background: isApproved ? meta.badgeBg : (meta.badgeColor || '#2563eb'),
                          border: isApproved ? `1px solid ${meta.badgeColor}` : 'none',
                          borderRadius: '6px',
                          color: isApproved ? meta.badgeColor : '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.76rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          boxShadow: isApproved ? 'none' : `0 2px 8px ${meta.badgeBg}`,
                          transition: 'all 0.15s'
                        }}
                      >
                        <ArrowRight size={13} /> {isApproved ? 'Edit / View ➔' : 'Configure ➔'}
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
  );
}
