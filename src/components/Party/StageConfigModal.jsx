'use client';

import React, { useState } from 'react';
import {
  X,
  Check,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Building2,
  Users
} from 'lucide-react';
import { ALL_INDIAN_STATES } from '@/config/indianStateDistricts';

export const PRODUCT_GROUPS = [
  { id: 'ROTAVATOR', name: 'Rotavator (Champion & Regular Series)', category: 'Implement' },
  { id: 'LASER_LEVELLER', name: 'Swan Laser Land Leveller & Transmitter', category: 'Implement' },
  { id: 'MULCHER', name: 'Straw Mulcher & Shrub Master', category: 'Implement' },
  { id: 'SUPER_SEEDER', name: 'Super Seeder & Happy Seeder', category: 'Implement' },
  { id: 'CULTIVATOR_TILLER', name: 'Spring Loaded Cultivator & Tiller', category: 'Implement' },
  { id: 'DISC_HARROW', name: 'Heavy Duty Disc Harrow', category: 'Implement' },
  { id: 'SPARE_PARTS', name: 'Genuine Swan Blades, Gearbox & Spares', category: 'Spare Part' }
];

export const ALL_CLIENT_TEAM_ROLES = [
  { id: 'NSM', label: 'NSM (National Sales Manager)' },
  { id: 'RSM', label: 'RSM (Regional Sales Manager)' },
  { id: 'ASM', label: 'ASM (Area Sales Manager)' },
  { id: 'Sales Executive', label: 'Sales Executive (TSE / Field Rep)' },
  { id: 'Telecaller', label: 'Telecaller (Order Taking & Followup)' },
  { id: 'Sales Coordinator', label: 'Sales Coordinator (Backend Desk)' },
  { id: 'CRM', label: 'CRM (Relationship Manager)' }
];

/**
 * Reusable Chip / Tag Input Component
 */
export function ChipInput({ chips = [], onChange, placeholder = 'Type and press Enter...', suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = inputVal.trim();
      if (val && !chips.includes(val)) {
        onChange([...chips, val]);
        setInputVal('');
        setShowDropdown(false);
      }
    }
  };

  const addChip = (val) => {
    if (val && !chips.includes(val)) {
      onChange([...chips, val]);
      setInputVal('');
      setShowDropdown(false);
    }
  };

  const removeChip = (indexToRemove) => {
    onChange(chips.filter((_, idx) => idx !== indexToRemove));
  };

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputVal.toLowerCase()) && !chips.includes(s)
  );

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
        padding: '0.45rem',
        background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '8px',
        minHeight: '40px'
      }}>
        {chips.map((chip, idx) => (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(56,189,248,0.2)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              borderRadius: '4px',
              padding: '0.15rem 0.45rem',
              fontSize: '0.78rem',
              fontWeight: 600
            }}
          >
            {chip}
            <X
              size={12}
              style={{ cursor: 'pointer' }}
              onClick={() => removeChip(idx)}
            />
          </span>
        ))}
        <input
          type="text"
          value={inputVal}
          onChange={e => {
            setInputVal(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : ''}
          style={{
            flex: 1,
            minWidth: '120px',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            outline: 'none',
            fontSize: '0.82rem'
          }}
        />
      </div>

      {showDropdown && inputVal && filteredSuggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '6px',
          marginTop: '0.2rem',
          maxHeight: '140px',
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          {filteredSuggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => addChip(s)}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                color: '#e2e8f0',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#334155'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              + {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StageConfigModal({
  isOpen,
  activeTab,
  onClose,
  onSwitchTab,
  modalParty,
  approvals = {},
  // S01
  s00Form,
  setS00Form,
  s00ContactTab,
  setS00ContactTab,
  s00Districts = [],
  locationStates = [],
  handleS00StateChange,
  handleS00Submit,
  // S02
  s01DistForm,
  setS01DistForm,
  handleS01DistSubmit,
  // S03
  s02DealerForm,
  setS02DealerForm,
  activeDistributors = [],
  handleS02DealerSubmit,
  // S04
  s03SubDealerForm,
  setS03SubDealerForm,
  activeDealers = [],
  parties = [],
  handleS03SubDealerSubmit,
  // S05
  s04CommForm,
  setS04CommForm,
  handleS04CommercialSubmit,
  // S06
  s05TerritoryForm,
  setS05TerritoryForm,
  s05Districts = [],
  s06ProductCategory,
  setS06ProductCategory,
  s05SelectedProducts = [],
  setS05SelectedProducts,
  handleS05StateChange,
  handleS05CombinedSubmit,
  // S07
  s06TeamMap = {},
  setS06TeamMap,
  employeeNames = [],
  handleS06TeamSubmit,
  // S08
  s08ActivationStatus,
  setS08ActivationStatus,
  s08Remarks,
  setS08Remarks,
  handleS07Activation,
  activationErrors = []
}) {
  if (!isOpen || !['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08'].includes(activeTab)) {
    return null;
  }

  // Gatekeeper verification logic
  let isGatekeeperLocked = false;
  let lockReason = '';
  let targetUnlockTab = 's01';
  let targetUnlockLabel = 'S01 Party Master Creation';

  if (modalParty) {
    if (activeTab === 's01') {
      if (modalParty?.source_lead_id && !approvals.s00) {
        isGatekeeperLocked = true;
        lockReason = 'This partner originated from Lead Data Stage 07. S00 Lead Transfer must be confirmed before creating S01 details.';
        targetUnlockTab = 's00';
        targetUnlockLabel = 'S00 Transfered to Party Master';
      }
    } else if (activeTab === 's02') {
      if (!approvals.s01) {
        isGatekeeperLocked = true;
        lockReason = 'S01 Party Master Creation must be Confirmed & Approved first.';
        targetUnlockTab = 's01';
        targetUnlockLabel = 'S01 Party Master Creation';
      }
    } else if (activeTab === 's03') {
      if (!approvals.s01) {
        isGatekeeperLocked = true;
        lockReason = 'S01 Party Master Creation must be Confirmed & Approved first.';
        targetUnlockTab = 's01';
        targetUnlockLabel = 'S01 Party Master Creation';
      }
    } else if (activeTab === 's04') {
      if (!approvals.s01) {
        isGatekeeperLocked = true;
        lockReason = 'S01 Party Master Creation must be Confirmed & Approved first.';
        targetUnlockTab = 's01';
        targetUnlockLabel = 'S01 Party Master Creation';
      }
    } else if (activeTab === 's05') {
      if (!approvals.s01 || !approvals.tier) {
        isGatekeeperLocked = true;
        lockReason = 'Channel Tier Registration (S02 Distributor / S03 Dealer / S04 Sub-Dealer) must be Confirmed & Approved first.';
        targetUnlockTab = modalParty?.party_type === 'Distributor' ? 's02' : (modalParty?.party_type === 'Dealer' ? 's03' : 's04');
        targetUnlockLabel = modalParty?.party_type === 'Distributor' ? 'S02 Distributor Registration' : (modalParty?.party_type === 'Dealer' ? 'S03 Dealer Registration' : 'S04 Sub-Dealer Registration');
      }
    } else if (activeTab === 's06') {
      if (!approvals.s05) {
        isGatekeeperLocked = true;
        lockReason = 'S05 Commercial Security Details must be Confirmed & Approved first.';
        targetUnlockTab = 's05';
        targetUnlockLabel = 'S05 Commercial Security Details';
      }
    } else if (activeTab === 's07') {
      if (!approvals.s06) {
        isGatekeeperLocked = true;
        lockReason = 'S06 Product Auth & Territory Allocation must be Confirmed & Approved first.';
        targetUnlockTab = 's06';
        targetUnlockLabel = 'S06 Product Auth & Territory';
      }
    } else if (activeTab === 's08') {
      if (!approvals.s01 || !approvals.tier || !approvals.s05 || !approvals.s06 || !approvals.s07) {
        isGatekeeperLocked = true;
        lockReason = 'Pre-Flight Verification Incomplete: All stages (S01 through S07) must be Confirmed & Approved before activating this Channel Partner.';
        if (!approvals.s01) { targetUnlockTab = 's01'; targetUnlockLabel = 'S01 Party Master'; }
        else if (!approvals.tier) { targetUnlockTab = modalParty?.party_type === 'Distributor' ? 's02' : (modalParty?.party_type === 'Dealer' ? 's03' : 's04'); targetUnlockLabel = 'Tier Registration'; }
        else if (!approvals.s05) { targetUnlockTab = 's05'; targetUnlockLabel = 'S05 Commercial Security'; }
        else if (!approvals.s06) { targetUnlockTab = 's06'; targetUnlockLabel = 'S06 Product & Territory'; }
        else if (!approvals.s07) { targetUnlockTab = 's07'; targetUnlockLabel = 'S07 Sales Team'; }
      }
    }
  }

  const stageTitles = {
    s01: 'Party Master Creation (Firm Identity & 22 Contact Channels)',
    s02: 'Distributor Registration (Level 1 Master Channel Hub)',
    s03: 'Dealer Registration (Level 2 Authorized Showroom)',
    s04: 'Sub-Dealer Registration (Level 3 Retail Counter)',
    s05: 'Commercial Security Details & Billing Route',
    s06: 'Product Authorization & Territory Allocation',
    s07: 'Sales Team Assignment (7 Dedicated Roles)',
    s08: 'Partner Activation & Final Status Desk'
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem 1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1.5px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: activeTab === 's01' ? '1140px' : '960px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden'
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: '#1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              padding: '0.35rem 0.75rem',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '8px',
              color: '#38bdf8',
              fontWeight: 800,
              fontSize: '0.8rem',
              letterSpacing: '0.05em'
            }}>
              {activeTab.toUpperCase()} ACTION
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                {stageTitles[activeTab]}
              </h3>
              <div style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {modalParty ? (
                  <>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {modalParty.party_universal_code || modalParty.distributor_code || modalParty.dealer_code || modalParty.sub_dealer_code || 'Partner'}
                    </span>
                    <span>•</span>
                    <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{modalParty.firm_name}</span>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '4px',
                      background: modalParty.party_type === 'Distributor' ? 'rgba(56,189,248,0.2)' : (modalParty.party_type === 'Dealer' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'),
                      color: modalParty.party_type === 'Distributor' ? '#38bdf8' : (modalParty.party_type === 'Dealer' ? '#34d399' : '#fbbf24'),
                      fontWeight: 700
                    }}>
                      {modalParty.party_type}
                    </span>
                  </>
                ) : (
                  <span style={{ color: '#34d399', fontWeight: 700 }}>+ Direct Channel Partner Onboarding</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '0.45rem 0.85rem',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <X size={16} /> Close [Esc]
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* Gatekeeper Check */}
          {isGatekeeperLocked ? (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid #ef4444', borderRadius: '12px', padding: '1.75rem', textAlign: 'center', margin: '1rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#f87171', fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                <Lock size={24} /> Stage Gatekeeper Rule: Prerequisite Pending Confirmation
              </div>
              <p style={{ color: '#fca5a5', fontSize: '0.92rem', maxWidth: '600px', margin: '0 auto 1.25rem auto' }}>
                {lockReason}
              </p>
              <button
                type="button"
                onClick={() => onSwitchTab(targetUnlockTab)}
                style={{
                  padding: '0.65rem 1.5rem',
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
                }}
              >
                ← Go to {targetUnlockLabel} to Approve &amp; Confirm
              </button>
            </div>
          ) : (
            <>
              {/* ========================================================= */}
              {/* STAGE S01 FORM */}
              {/* ========================================================= */}
              {activeTab === 's01' && (
                <form onSubmit={handleS00Submit}>
                  {/* Basic Firm Details */}
                  <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.75rem' }}>Basic Firm Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.86rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Party Tier *</label>
                        <select
                          value={s00Form.party_type}
                          onChange={e => setS00Form({ ...s00Form, party_type: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="Distributor">Level 1: Distributor (Super Stockist)</option>
                          <option value="Dealer">Level 2: Dealer (Authorized Showroom)</option>
                          <option value="Sub-Dealer">Level 3: Sub-Dealer (Retail Counter)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Firm / Trade Name *</label>
                        <input
                          type="text"
                          required
                          value={s00Form.firm_name}
                          onChange={e => setS00Form({ ...s00Form, firm_name: e.target.value })}
                          placeholder="e.g. Kisan Agro Machinery"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Legal Registered Name</label>
                        <input
                          type="text"
                          value={s00Form.legal_name}
                          onChange={e => setS00Form({ ...s00Form, legal_name: e.target.value })}
                          placeholder="As per GST/PAN"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Constitution Type</label>
                        <select
                          value={s00Form.constitution_type}
                          onChange={e => setS00Form({ ...s00Form, constitution_type: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="PROPRIETORSHIP">Proprietorship</option>
                          <option value="PARTNERSHIP">Partnership</option>
                          <option value="PVT_LTD">Pvt. Ltd.</option>
                          <option value="LTD">Public Ltd.</option>
                          <option value="LLP">LLP</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>GSTIN</label>
                        <input
                          type="text"
                          value={s00Form.gstin}
                          onChange={e => setS00Form({ ...s00Form, gstin: e.target.value })}
                          placeholder="15-digit GSTIN"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>PAN</label>
                        <input
                          type="text"
                          value={s00Form.pan}
                          onChange={e => setS00Form({ ...s00Form, pan: e.target.value })}
                          placeholder="10-digit PAN"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* State Name (Location Master) */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#38bdf8', fontWeight: 700 }}>
                          State Name * <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          value={s00Form.state_name}
                          onChange={e => handleS00StateChange(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1.5px solid rgba(56,189,248,0.4)', borderRadius: '6px', color: '#fff' }}
                        >
                          {(locationStates.length > 0 ? locationStates.map(s => s.state_name || s.name) : ALL_INDIAN_STATES).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* District Name (Location Master) */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#38bdf8', fontWeight: 700 }}>
                          District Name * <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          required
                          value={s00Form.district_name}
                          onChange={e => setS00Form({ ...s00Form, district_name: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1.5px solid rgba(56,189,248,0.4)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="">-- Select District --</option>
                          {s00Districts.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* PIN Code */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>PIN Code</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={s00Form.pincode || ''}
                          onChange={e => setS00Form({ ...s00Form, pincode: e.target.value })}
                          placeholder="e.g. 141401"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* City/Village Name */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>City/Village Name</label>
                        <input
                          type="text"
                          value={s00Form.city_village || ''}
                          onChange={e => setS00Form({ ...s00Form, city_village: e.target.value })}
                          placeholder="e.g. Khanna"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* Tehsil Name */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Tehsil Name</label>
                        <input
                          type="text"
                          value={s00Form.tehsil || ''}
                          onChange={e => setS00Form({ ...s00Form, tehsil: e.target.value })}
                          placeholder="e.g. Khanna"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* Block Name */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Block Name</label>
                        <input
                          type="text"
                          value={s00Form.block_name || ''}
                          onChange={e => setS00Form({ ...s00Form, block_name: e.target.value })}
                          placeholder="e.g. Samrala"
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>

                      {/* Full Address */}
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Full Address</label>
                        <input
                          type="text"
                          value={s00Form.address || ''}
                          onChange={e => setS00Form({ ...s00Form, address: e.target.value })}
                          placeholder="Shop / Plot No., Industrial Area / Mandi, Full Postal Address..."
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sub-Tabs for Business Contacts vs Person 1 vs Person 2 */}
                  <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setS00ContactTab('biz')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'biz' ? '#2563eb' : 'rgba(255,255,255,0.06)',
                        color: s00ContactTab === 'biz' ? '#fff' : '#cbd5e1'
                      }}
                    >
                      🏢 Business Contacts (Official Firm)
                    </button>
                    <button
                      type="button"
                      onClick={() => setS00ContactTab('person1')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'person1' ? '#10b981' : 'rgba(255,255,255,0.06)',
                        color: s00ContactTab === 'person1' ? '#fff' : '#cbd5e1'
                      }}
                    >
                      👤 Contact Person 1 (Primary Key Official)
                    </button>
                    <button
                      type="button"
                      onClick={() => setS00ContactTab('person2')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'person2' ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                        color: s00ContactTab === 'person2' ? '#fff' : '#cbd5e1'
                      }}
                    >
                      👥 Contact Person 2 (Secondary / Accounts)
                    </button>
                  </div>

                  {/* TAB A: BUSINESS CONTACTS */}
                  {s00ContactTab === 'biz' && (
                    <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.3)', marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#60a5fa', marginBottom: '0.75rem' }}>
                        Official Business Communication Channels
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Contact Number 1 *</label>
                          <input type="text" required value={s00Form.biz_contact_no_1} onChange={e => setS00Form({ ...s00Form, biz_contact_no_1: e.target.value })} placeholder="Main business phone" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Contact Number 2</label>
                          <input type="text" value={s00Form.biz_contact_no_2} onChange={e => setS00Form({ ...s00Form, biz_contact_no_2: e.target.value })} placeholder="Second office phone" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Alternate Number 1</label>
                          <input type="text" value={s00Form.biz_alt_no_1} onChange={e => setS00Form({ ...s00Form, biz_alt_no_1: e.target.value })} placeholder="Alternate landline / mobile" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Alternate Number 2</label>
                          <input type="text" value={s00Form.biz_alt_no_2} onChange={e => setS00Form({ ...s00Form, biz_alt_no_2: e.target.value })} placeholder="Secondary alternate" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Contact Mail ID 1</label>
                          <input type="email" value={s00Form.biz_email_1} onChange={e => setS00Form({ ...s00Form, biz_email_1: e.target.value })} placeholder="orders@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Contact Mail ID 2</label>
                          <input type="email" value={s00Form.biz_email_2} onChange={e => setS00Form({ ...s00Form, biz_email_2: e.target.value })} placeholder="accounts@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Alternate Mail ID 1</label>
                          <input type="email" value={s00Form.biz_alt_email_1} onChange={e => setS00Form({ ...s00Form, biz_alt_email_1: e.target.value })} placeholder="support@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Business Alternate Mail ID 2</label>
                          <input type="email" value={s00Form.biz_alt_email_2} onChange={e => setS00Form({ ...s00Form, biz_alt_email_2: e.target.value })} placeholder="mgmt@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB B: CONTACT PERSON 1 */}
                  {s00ContactTab === 'person1' && (
                    <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)', marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#34d399', marginBottom: '0.75rem' }}>
                        Contact Person 1 (Primary Key Official / Director / Proprietor)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Name 1 *</label>
                          <input type="text" required value={s00Form.contact_person_name_1} onChange={e => setS00Form({ ...s00Form, contact_person_name_1: e.target.value })} placeholder="e.g. Sardar Gurdeep Singh" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mobile 1.1 *</label>
                          <input type="text" required value={s00Form.contact_mobile_1_1} onChange={e => setS00Form({ ...s00Form, contact_mobile_1_1: e.target.value })} placeholder="10-digit primary mobile" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mobile 1.2</label>
                          <input type="text" value={s00Form.contact_mobile_1_2} onChange={e => setS00Form({ ...s00Form, contact_mobile_1_2: e.target.value })} placeholder="Second mobile" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Alternate Mobile 1.1</label>
                          <input type="text" value={s00Form.contact_alt_mobile_1_1} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_1_1: e.target.value })} placeholder="Home / Alternate 1" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Alternate Mobile 1.2</label>
                          <input type="text" value={s00Form.contact_alt_mobile_1_2} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_1_2: e.target.value })} placeholder="Alternate 2" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mail ID 1.2</label>
                          <input type="email" value={s00Form.contact_email_1_2} onChange={e => setS00Form({ ...s00Form, contact_email_1_2: e.target.value })} placeholder="person1@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Alternate Mail ID 1.1</label>
                          <input type="email" value={s00Form.contact_alt_email_1_1} onChange={e => setS00Form({ ...s00Form, contact_alt_email_1_1: e.target.value })} placeholder="alt.person1@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB C: CONTACT PERSON 2 */}
                  {s00ContactTab === 'person2' && (
                    <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.3)', marginBottom: '1.25rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.75rem' }}>
                        Contact Person 2 (Secondary Official / Showroom Manager / Partner)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Name 2</label>
                          <input type="text" value={s00Form.contact_person_name_2} onChange={e => setS00Form({ ...s00Form, contact_person_name_2: e.target.value })} placeholder="e.g. Balwinder Kaur" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mobile 2.1</label>
                          <input type="text" value={s00Form.contact_mobile_2_1} onChange={e => setS00Form({ ...s00Form, contact_mobile_2_1: e.target.value })} placeholder="Secondary person mobile" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mobile 2.2</label>
                          <input type="text" value={s00Form.contact_mobile_2_2} onChange={e => setS00Form({ ...s00Form, contact_mobile_2_2: e.target.value })} placeholder="Alternative mobile" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Alternate Mobile 2.1</label>
                          <input type="text" value={s00Form.contact_alt_mobile_2_1} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_2_1: e.target.value })} placeholder="Home / Alternate 1" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Alternate Mobile 2.2</label>
                          <input type="text" value={s00Form.contact_alt_mobile_2_2} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_2_2: e.target.value })} placeholder="Alternate 2" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Mail ID 2.2</label>
                          <input type="email" value={s00Form.contact_email_2_2} onChange={e => setS00Form({ ...s00Form, contact_email_2_2: e.target.value })} placeholder="person2@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8' }}>Contact Person Alternate Mail ID 2.1</label>
                          <input type="email" value={s00Form.contact_alt_email_2_1} onChange={e => setS00Form({ ...s00Form, contact_alt_email_2_1: e.target.value })} placeholder="alt.person2@domain.com" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S01 ➔ Move to Tier Registration
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S02 FORM */}
              {/* ========================================================= */}
              {activeTab === 's02' && (
                <form onSubmit={handleS01DistSubmit}>
                  {modalParty?.party_type && modalParty.party_type !== 'Distributor' && (
                    <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#fbbf24' }}>
                      ℹ️ Notice: Current partner is registered as a <strong>{modalParty.party_type}</strong>. S02 is reserved for Distributors.
                      <button type="button" onClick={() => onSwitchTab(modalParty.party_type === 'Dealer' ? 's03' : 's04')} style={{ marginLeft: '0.75rem', padding: '0.25rem 0.6rem', background: '#f59e0b', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 700, cursor: 'pointer' }}>
                        Go to {modalParty.party_type === 'Dealer' ? 'S03 Dealer Registration' : 'S04 Sub-Dealer Registration'} ➔
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', fontSize: '0.88rem', background: '#1e293b', padding: '1.25rem', borderRadius: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#94a3b8', fontWeight: 700 }}>Jurisdiction Zone *</label>
                      <select
                        value={s01DistForm.zone}
                        onChange={e => setS01DistForm({ ...s01DistForm, zone: e.target.value })}
                        style={{ width: '100%', padding: '0.65rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="North Zone">North Zone (Punjab, Haryana, HP, J&amp;K, Rajasthan)</option>
                        <option value="Central Zone">Central Zone (MP, UP, Chhattisgarh)</option>
                        <option value="West Zone">West Zone (Gujarat, Maharashtra)</option>
                        <option value="South Zone">South Zone (Karnataka, AP, Telangana, TN)</option>
                        <option value="East Zone">East Zone (Bihar, WB, Odisha, Assam)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S02 ➔ Move to S05 Commercial Security
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S03 FORM */}
              {/* ========================================================= */}
              {activeTab === 's03' && (
                <form onSubmit={handleS02DealerSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem', background: '#1e293b', padding: '1.25rem', borderRadius: '10px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#34d399', fontWeight: 700 }}>
                        Parent Distributor * (Strict Hierarchy Tagging)
                      </label>
                      <select
                        required
                        value={s02DealerForm.parent_distributor_id}
                        onChange={e => setS02DealerForm({ ...s02DealerForm, parent_distributor_id: e.target.value })}
                        style={{ width: '100%', padding: '0.7rem', background: '#0f172a', border: '1.5px solid #10b981', borderRadius: '8px', color: '#fff', fontWeight: 600 }}
                      >
                        <option value="">-- Select Active Parent Distributor --</option>
                        {activeDistributors.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.distributor_code || d.party_universal_code} | {d.firm_name} ({d.state_name || 'Punjab'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#94a3b8', fontWeight: 600 }}>Dealership Type</label>
                      <select
                        value={s02DealerForm.dealership_type}
                        onChange={e => setS02DealerForm({ ...s02DealerForm, dealership_type: e.target.value })}
                        style={{ width: '100%', padding: '0.65rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                      >
                        <option value="Swan Exclusive Dealer">Swan Exclusive Dealer</option>
                        <option value="Multi-Brand Agro Showroom">Multi-Brand Agro Showroom</option>
                        <option value="Authorized Spares &amp; Implements">Authorized Spares &amp; Implements</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#94a3b8', fontWeight: 600 }}>Showroom Area (Sq. Ft)</label>
                      <input
                        type="number"
                        value={s02DealerForm.showroom_area_sqft}
                        onChange={e => setS02DealerForm({ ...s02DealerForm, showroom_area_sqft: Number(e.target.value) })}
                        style={{ width: '100%', padding: '0.65rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S03 ➔ Move to S05 Commercial Security
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S04 FORM */}
              {/* ========================================================= */}
              {activeTab === 's04' && (
                <form onSubmit={handleS03SubDealerSubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem', background: '#1e293b', padding: '1.25rem', borderRadius: '10px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#fbbf24', fontWeight: 700 }}>
                        Parent Dealer * (Mandatory)
                      </label>
                      <select
                        required
                        value={s03SubDealerForm.parent_dealer_id}
                        onChange={e => setS03SubDealerForm({ ...s03SubDealerForm, parent_dealer_id: e.target.value })}
                        style={{ width: '100%', padding: '0.7rem', background: '#0f172a', border: '1.5px solid #f59e0b', borderRadius: '8px', color: '#fff', fontWeight: 600 }}
                      >
                        <option value="">-- Select Active Parent Dealer --</option>
                        {activeDealers.map(dlr => (
                          <option key={dlr.id} value={dlr.id}>
                            {dlr.dealer_code || dlr.party_universal_code} | {dlr.firm_name} ({dlr.state_name || 'Punjab'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* AUTO-DERIVED READ-ONLY DISTRIBUTOR CARD */}
                    <div style={{ gridColumn: 'span 2', background: 'rgba(16,185,129,0.12)', border: '1px solid #10b981', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399', fontWeight: 700, fontSize: '0.88rem' }}>
                        <Lock size={15} /> Auto-Derived Parent Distributor (System Enforced / Read-Only)
                      </div>
                      {s03SubDealerForm.parent_dealer_id ? (
                        (() => {
                          const selDlr = parties.find(p => p.id === s03SubDealerForm.parent_dealer_id);
                          const distName = selDlr?.parent_distributor?.firm_name || (selDlr?.parent_distributor_id ? 'Tagged Distributor' : 'Direct Company');
                          return (
                            <div style={{ marginTop: '0.4rem', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                              👑 {distName} <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>(Derived from {selDlr?.firm_name})</span>
                            </div>
                          );
                        })()
                      ) : (
                        <div style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                          Please select a Parent Dealer above to auto-identify Distributor.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(245,158,11,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S04 ➔ Move to S05 Commercial Security
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S05 FORM */}
              {/* ========================================================= */}
              {activeTab === 's05' && (
                <form onSubmit={handleS04CommercialSubmit}>
                  {/* Direct vs Distributor Billing Route Selector */}
                  <div style={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#60a5fa', fontWeight: 700, fontSize: '0.92rem' }}>
                      ⚡ Billing Route Selection (Company vs Distributor Billing)
                    </label>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="billing_route"
                          value="DIRECT_COMPANY_BILLING"
                          checked={s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING'}
                          onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DIRECT_COMPANY_BILLING' })}
                        />
                        <span style={{ fontWeight: 600 }}>Direct Company Billing (Swan Agro Ltd.)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="billing_route"
                          value="DISTRIBUTOR_BILLED"
                          checked={s04CommForm.billing_route_type === 'DISTRIBUTOR_BILLED'}
                          onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DISTRIBUTOR_BILLED' })}
                        />
                        <span style={{ fontWeight: 600 }}>Distributor Billed (via Tagged Distributor Godown)</span>
                      </label>
                    </div>

                    {s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING' && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#34d399' }}>
                        ℹ️ Direct Billing selected: Tagged Distributor will automatically receive a <strong>{s04CommForm.distributor_commission_percent}%</strong> Territory Override Commission.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem', background: '#1e293b', padding: '1.25rem', borderRadius: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', color: '#fbbf24', fontWeight: 700 }}>Security Deposit (₹)</label>
                      <input type="number" value={s04CommForm.security_deposit_amount} onChange={e => setS04CommForm({ ...s04CommForm, security_deposit_amount: Number(e.target.value) })} style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', color: '#fbbf24', fontWeight: 700 }}>Security Deposit Date *</label>
                      <input type="date" value={s04CommForm.security_deposit_date} onChange={e => setS04CommForm({ ...s04CommForm, security_deposit_date: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Security Mode</label>
                      <select value={s04CommForm.security_mode} onChange={e => setS04CommForm({ ...s04CommForm, security_mode: e.target.value })} style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}>
                        <option value="Cheque">Security Cheques</option>
                        <option value="Bank Guarantee">Bank Guarantee</option>
                        <option value="Fixed Deposit">Fixed Deposit Lien</option>
                        <option value="Cash">Cash Deposit</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', color: '#94a3b8', fontWeight: 600 }}>Cheque / Receipt No.</label>
                      <input type="text" value={s04CommForm.receipt_no} onChange={e => setS04CommForm({ ...s04CommForm, receipt_no: e.target.value })} placeholder="e.g. CHQ-402911" style={{ width: '100%', padding: '0.6rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S05 ➔ Move to S06 Product &amp; Territory
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S06 FORM */}
              {/* ========================================================= */}
              {activeTab === 's06' && (
                <form onSubmit={handleS05CombinedSubmit}>
                  {/* 1. Product Authorization & Category */}
                  <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#38bdf8' }}>
                          1. Product Category &amp; Machinery Authorization
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                          Select product line category (Implement, Spare Part, or Both) and specify authorized machinery.
                        </p>
                      </div>
                    </div>

                    {/* Product Category Dropdown Field */}
                    <div style={{ marginBottom: '1.25rem', background: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.25)' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#38bdf8', fontWeight: 800, fontSize: '0.88rem' }}>
                        Product Category *
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <select
                          value={s06ProductCategory}
                          onChange={e => {
                            const val = e.target.value;
                            setS06ProductCategory(val);
                            if (val === 'Spare Part') {
                              setS05SelectedProducts(['SPARE_PARTS']);
                            } else if (val === 'Implement') {
                              setS05SelectedProducts(prev => {
                                const filtered = prev.filter(x => x !== 'SPARE_PARTS');
                                return filtered.length > 0 ? filtered : ['ROTAVATOR'];
                              });
                            } else if (val === 'Both') {
                              setS05SelectedProducts(prev => prev.includes('SPARE_PARTS') ? prev : [...prev, 'SPARE_PARTS']);
                            }
                          }}
                          style={{
                            width: '100%',
                            maxWidth: '320px',
                            padding: '0.65rem 0.85rem',
                            background: '#1e293b',
                            border: '1.5px solid #38bdf8',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="Implement">Implement</option>
                          <option value="Spare Part">Spare Part</option>
                          <option value="Both">Both</option>
                        </select>

                        <span style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          background: s06ProductCategory === 'Implement' ? 'rgba(56,189,248,0.15)' : (s06ProductCategory === 'Spare Part' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'),
                          color: s06ProductCategory === 'Implement' ? '#38bdf8' : (s06ProductCategory === 'Spare Part' ? '#fbbf24' : '#34d399'),
                          border: `1px solid ${s06ProductCategory === 'Implement' ? '#0284c7' : (s06ProductCategory === 'Spare Part' ? '#d97706' : '#059669')}`
                        }}>
                          {s06ProductCategory === 'Implement' && '🚜 Farm Implements (Rotavator, Mulcher, Laser Leveller, etc.)'}
                          {s06ProductCategory === 'Spare Part' && '⚙️ Genuine Blades, Gearbox & Spare Parts only'}
                          {s06ProductCategory === 'Both' && '✨ Both Implements & Genuine Spare Parts'}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem' }}>
                      Select Allowed Products ({s06ProductCategory === 'Both' ? 'All Products' : s06ProductCategory + 's'}):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                      {PRODUCT_GROUPS.filter(p => {
                        if (s06ProductCategory === 'Implement') return p.category === 'Implement';
                        if (s06ProductCategory === 'Spare Part') return p.category === 'Spare Part';
                        return true;
                      }).map(p => {
                        const isChecked = s05SelectedProducts.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              if (isChecked) {
                                setS05SelectedProducts(s05SelectedProducts.filter(x => x !== p.id));
                              } else {
                                setS05SelectedProducts([...s05SelectedProducts, p.id]);
                              }
                            }}
                            style={{
                              padding: '0.75rem',
                              borderRadius: '8px',
                              border: isChecked ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                              background: isChecked ? 'rgba(16,185,129,0.15)' : '#0f172a',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.6rem'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '1.5px solid', borderColor: isChecked ? '#10b981' : '#94a3b8', background: isChecked ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isChecked && <Check size={12} color="#fff" />}
                              </div>
                              <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>{p.name}</span>
                            </div>
                            <span style={{
                              fontSize: '0.68rem',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: p.category === 'Implement' ? 'rgba(56,189,248,0.15)' : 'rgba(245,158,11,0.15)',
                              color: p.category === 'Implement' ? '#38bdf8' : '#fbbf24'
                            }}>
                              {p.category}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Territory Allocation */}
                  <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', marginBottom: '0.75rem' }}>
                      2. Geographic Territory &amp; Market Coverage
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.86rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#38bdf8', fontWeight: 700 }}>
                          State * <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          value={s05TerritoryForm.state}
                          onChange={e => handleS05StateChange(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1.5px solid rgba(56,189,248,0.4)', borderRadius: '6px', color: '#fff' }}
                        >
                          {(locationStates.length > 0 ? locationStates.map(s => s.state_name || s.name) : ALL_INDIAN_STATES).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#38bdf8', fontWeight: 700 }}>
                          District * <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          required
                          value={s05TerritoryForm.district}
                          onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, district: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1.5px solid rgba(56,189,248,0.4)', borderRadius: '6px', color: '#fff' }}
                        >
                          <option value="">-- Select District --</option>
                          {s05Districts.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Tehsil / Area</label>
                        <input type="text" value={s05TerritoryForm.tehsil_area} onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, tehsil_area: e.target.value })} placeholder="e.g. Khanna" style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#94a3b8', fontWeight: 600 }}>Territory Type</label>
                        <select value={s05TerritoryForm.territory_type} onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, territory_type: e.target.value })} style={{ width: '100%', padding: '0.55rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}>
                          <option value="Exclusive">Exclusive (Single authorized dealer in this area)</option>
                          <option value="Shared">Shared Territory</option>
                          <option value="Open">Open Territory</option>
                        </select>
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', color: '#34d399', fontWeight: 700 }}>
                          Market Coverage Areas (Type Mandi / Areas &amp; press Enter to create chips)
                        </label>
                        <ChipInput
                          chips={s05TerritoryForm.market_coverage_chips}
                          onChange={newChips => setS05TerritoryForm({ ...s05TerritoryForm, market_coverage_chips: newChips })}
                          placeholder="Type mandi, market or village and press Enter..."
                          suggestions={['Khanna Grain Market', 'Samrala Chowk', 'Doraha Bypass', 'Sahnewal Mandi', 'Payal Road']}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S06 ➔ Move to S07 Sales Team Assignment
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S07 FORM */}
              {/* ========================================================= */}
              {activeTab === 's07' && (
                <form onSubmit={handleS06TeamSubmit}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                    Assign dedicated personnel for all 7 organizational roles. Type or pick multiple persons as chips.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem', fontSize: '0.86rem' }}>
                    {ALL_CLIENT_TEAM_ROLES.map(role => (
                      <div key={role.id} style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                          <span style={{ fontWeight: 700, color: '#60a5fa' }}>{role.label}</span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{s06TeamMap[role.id]?.length || 0} Assigned</span>
                        </div>
                        <ChipInput
                          chips={s06TeamMap[role.id] || []}
                          onChange={newChips => setS06TeamMap({ ...s06TeamMap, [role.id]: newChips })}
                          placeholder={`Search or type ${role.id} employee...`}
                          suggestions={employeeNames}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.7rem 1.25rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.7rem 1.6rem',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} /> Approve &amp; Confirm S07 ➔ Move to S08 Partner Activation
                    </button>
                  </div>
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S08 FORM */}
              {/* ========================================================= */}
              {activeTab === 's08' && (
                <div>
                  {activationErrors.length > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>❌ Cannot Activate Partner:</div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                        {activationErrors.map((err, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Pre-Flight Checklist Card */}
                  <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#ffffff', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ShieldCheck size={18} className="text-emerald-400" /> Pre-Flight Verification Checklist
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', fontSize: '0.86rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                        <CheckCircle2 size={16} /> S01 Party Master Identity &amp; 22 Contacts
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                        <CheckCircle2 size={16} /> S02/S03/S04 Hierarchy Placement Validated
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                        <CheckCircle2 size={16} /> S05 Commercial Security &amp; Billing Route
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                        <CheckCircle2 size={16} /> S06 Product Authorizations &amp; Territory
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399' }}>
                        <CheckCircle2 size={16} /> S07 Sales Team (7 Dedicated Roles)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                        <ShieldCheck size={16} /> Indian Standard Time (IST) Audit Logging
                      </div>
                    </div>
                  </div>

                  {/* 4 Status Options Selector */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                      Set Partner Operational Status *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                      {[
                        { id: 'Active', label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: '#10b981', desc: 'Fully operational channel partner, active in daily ordering and billing.' },
                        { id: 'Inactive', label: 'Inactive', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', border: '#94a3b8', desc: 'Temporarily inactive / counter closed / seasonal recess.' },
                        { id: 'Hold', label: 'Hold', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', desc: 'On hold pending compliance check or management verification.' },
                        { id: 'Payment Issues', label: 'Payment Issues', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: '#ef4444', desc: 'Orders blocked due to overdue ledger, credit breach, or PDC bounce.' }
                      ].map(st => {
                        const isSel = s08ActivationStatus === st.id;
                        return (
                          <div
                            key={st.id}
                            onClick={() => setS08ActivationStatus(st.id)}
                            style={{
                              padding: '1rem',
                              borderRadius: '10px',
                              border: isSel ? `2px solid ${st.border}` : '1px solid rgba(255,255,255,0.1)',
                              background: isSel ? st.bg : '#0f172a',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.96rem', color: isSel ? st.color : '#cbd5e1' }}>
                                {st.label}
                              </span>
                              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${isSel ? st.color : '#64748b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isSel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.color }} />}
                              </div>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.35 }}>{st.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Remarks */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.35rem', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                      Activation Remarks / Decision Notes
                    </label>
                    <textarea
                      rows="3"
                      value={s08Remarks}
                      onChange={e => setS08Remarks(e.target.value)}
                      placeholder="Enter reasons, special credit remarks, or audit notes for this status change..."
                      style={{ width: '100%', padding: '0.65rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        padding: '0.75rem 1.4rem',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        color: '#cbd5e1',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Close [Esc]
                    </button>
                    <button
                      type="button"
                      onClick={handleS07Activation}
                      style={{
                        padding: '0.75rem 1.8rem',
                        background: s08ActivationStatus === 'Active' ? 'linear-gradient(135deg, #10b981, #059669)' : (s08ActivationStatus === 'Payment Issues' ? '#ef4444' : '#f59e0b'),
                        border: 'none',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
                      }}
                    >
                      <CheckCircle2 size={18} /> Confirm &amp; Set Partner Status: &quot;{s08ActivationStatus}&quot;
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
