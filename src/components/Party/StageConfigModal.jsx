'use client';

import React, { useState } from 'react';
import {
  X,
  Check,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Building2,
  Users,
  Search,
  Trash2,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { ALL_INDIAN_STATES, INDIAN_STATE_DISTRICTS } from '@/config/indianStateDistricts';
import { PRODUCT_GROUPS } from '@/config/productCatalog';
export { PRODUCT_GROUPS };

export const ALL_CLIENT_TEAM_ROLES = [
  { id: 'NSM', label: 'NSM (National Sales Manager)' },
  { id: 'RSM', label: 'RSM (Regional Sales Manager)' },
  { id: 'ASM', label: 'ASM (Area Sales Manager)' },
  { id: 'Sales Executive', label: 'Sales Executive (TSE / Field Rep)' },
  { id: 'Telecaller', label: 'Telecaller (Order Taking & Followup)' },
  { id: 'Sales Coordinator', label: 'Sales Coordinator (Backend Desk)' },
  { id: 'CRM', label: 'CRM (Relationship Manager)' }
];

export const B2B_OPERATIONAL_STATUSES = [
  {
    id: 'Active',
    label: '🟢 Active',
    name: 'Active',
    icon: '🟢',
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.12)',
    border: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a, #15803d)',
    category: 'Live Business',
    desc: 'Fully operational channel partner. Commercial factory billing and dispatches allowed.',
    defaultSubStage: 'Regular (Credit Allowed)',
    subStages: [
      { id: 'Regular (Credit Allowed)', label: 'Regular (Credit Allowed)', hint: 'Full Credit & Orders Allowed according to S05 credit limit' },
      { id: 'Advance Payment (Stop Credit)', label: 'Advance Payment (Stop Credit)', hint: 'Credit stopped, factory billing allowed strictly on 100% advance payment (RTGS/NEFT/IMPS)' },
      { id: 'Seasonal Counter (Rabi/Kharif)', label: 'Seasonal Counter (Rabi/Kharif)', hint: 'Active in peak agri season, paused during off-season' }
    ]
  },
  {
    id: 'Hold',
    label: '🔴 Hold',
    name: 'Hold',
    icon: '🔴',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    border: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
    category: 'Temporary Restraint',
    desc: 'Orders / dispatches paused pending compliance, payment, or management review.',
    defaultSubStage: 'Payment Overdue (Ledger Block)',
    subStages: [
      { id: 'Payment Overdue (Ledger Block)', label: 'Payment Overdue (Ledger Block)', hint: 'Overdue balance outstanding, ledger locked until cleared' },
      { id: 'Security / PDC Pending', label: 'Security / PDC Pending', hint: 'PDC expired or security deposit commitment unfulfilled' },
      { id: 'Under Notice / Review', label: 'Under Notice / Review', hint: 'Audit, policy violation inquiry, or management verification underway' }
    ]
  },
  {
    id: 'Lost',
    label: '💔 Lost',
    name: 'Lost',
    icon: '💔',
    color: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    category: 'Discontinued (Swan Side Issues)',
    desc: 'Partner left due to company issues — Prime Win-Back Target.',
    defaultSubStage: 'Service Issues',
    subStages: [
      { id: 'Service Issues', label: '🛠️ Service Issues', hint: 'सर्विस / फील्ड इंजीनियर असंतोष / समय पर रिपेयर नहीं' },
      { id: 'Product Issues', label: '📦 Product Issues', hint: 'मॉडल / साइज / स्पेसिफिकेशन क्षेत्रीय मांग अनुसार नहीं जमा' },
      { id: 'Quality Issues', label: '⚙️ Quality Issues', hint: 'क्वालिटी / बार-बार ब्रेकडाउन व मैन्युफैक्चरिंग डिफेक्ट्स' },
      { id: 'Delivery Issues', label: '🚚 Delivery Issues', hint: 'सीजन में लेट डिलीवरी / समय पर गाड़ी व माल नहीं पहुंचा' },
      { id: 'Margin Issues', label: '💰 Margin Issues', hint: 'डीलर कमीशन / मार्जिन कम लगा या इंसेंटिव विवाद' },
      { id: 'Price Issues', label: '🏷️ Price Issues', hint: 'कंपटीटर से रेट महंगा लगा / मार्केट में रेट कंपटीशन' }
    ]
  },
  {
    id: 'Surrender',
    label: '📁 Surrender',
    name: 'Surrender',
    icon: '📁',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: '#64748b',
    gradient: 'linear-gradient(135deg, #64748b, #475569)',
    category: 'Partner Voluntary Exit',
    desc: 'Dealer-initiated voluntary exit, formally closed / NOC released.',
    defaultSubStage: 'Business Closed',
    subStages: [
      { id: 'Business Closed', label: 'Business Closed', hint: 'दुकान / फर्म का काम बंद कर दिया' },
      { id: 'Switched to Other Brand', label: 'Switched to Other Brand', hint: 'दूसरे ब्रांड की एक्सक्लूसिव डीलरशिप ले ली' },
      { id: 'Switched to Other Business', label: 'Switched to Other Business', hint: 'कृषि उपकरण छोड़ दूसरा कारोबार शुरू किया' }
    ]
  },
  {
    id: 'Terminated',
    label: '🛑 Terminated',
    name: 'Terminated',
    icon: '🛑',
    color: '#b91c1c',
    bg: 'rgba(185, 28, 28, 0.14)',
    border: '#b91c1c',
    gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)',
    category: 'Company Revocation',
    desc: 'Contract revoked due to breach, misconduct, or continuous non-performance.',
    defaultSubStage: 'Target Failure / Non-Performance',
    subStages: [
      { id: 'Target Failure / Non-Performance', label: 'Target Failure / Non-Performance', hint: 'लगातार कई तिमाहियों से टारगेट पूरा नहीं किया' },
      { id: 'Territory Breach / Cross-Selling', label: 'Territory Breach / Cross-Selling', hint: 'अधिकृत जिले/क्षेत्र के बाहर दूसरे के इलाके में माल बेचा' },
      { id: 'Promoting Competitor Brand', label: 'Promoting Competitor Brand', hint: 'प्रतिद्वंदी ब्रांड को सक्रिय प्रमोट किया / कंपनी को धोखा' },
      { id: 'Agreement & Policy Breach', label: 'Agreement & Policy Breach', hint: 'डीलरशिप एग्रीमेंट व कंपनी नियमों की गंभीर अवहेलना' },
      { id: 'Market Misconduct / Customer Complaints', label: 'Market Misconduct / Customer Complaints', hint: 'किसानों या मार्केट में बदनामी व वित्तीय धोखाधड़ी शिकायतें' }
    ]
  },
  {
    id: 'Blacklisted',
    label: '⛔ Blacklisted',
    name: 'Blacklisted',
    icon: '⛔',
    color: '#0f172a',
    bg: 'rgba(15, 23, 42, 0.15)',
    border: '#0f172a',
    gradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
    category: 'Permanent Ban',
    desc: 'Permanently Banned / Legal Action / Cheque Bounce (138 NI Act).',
    defaultSubStage: 'Cheque Bounce / Legal 138 Case',
    subStages: [
      { id: 'Cheque Bounce / Legal 138 Case', label: 'Cheque Bounce / Legal 138 Case', hint: 'चेक बाउंस / 138 NI Act कानूनी केस दर्ज' },
      { id: 'Fake / Duplicate Spares Selling', label: 'Fake / Duplicate Spares Selling', hint: 'नकली पार्ट्स बेचना / स्वान ब्रांड की पाइरेसी' },
      { id: 'Financial Fraud / Defaulter', label: 'Financial Fraud / Defaulter', hint: 'कंपनी का पैसा दबाकर भागना / दिवालिया घोषित' }
    ]
  }
];

export const STAGE_THEME_MAP = {
  s01: {
    stage: 'S01',
    badge: 'STAGE S01',
    name: 'Party Master Creation',
    color: '#0284c7', // Sky Blue
    bg: 'rgba(2, 132, 199, 0.14)',
    border: 'rgba(2, 132, 199, 0.35)',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    shadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
  },
  s02: {
    stage: 'S02',
    badge: 'STAGE S02',
    name: 'Distributor Registration',
    color: '#2563eb', // Royal Blue
    bg: 'rgba(37, 99, 235, 0.14)',
    border: 'rgba(37, 99, 235, 0.35)',
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    shadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
  },
  s03: {
    stage: 'S03',
    badge: 'STAGE S03',
    name: 'Dealer Registration',
    color: '#059669', // Emerald Green
    bg: 'rgba(5, 150, 105, 0.14)',
    border: 'rgba(5, 150, 105, 0.35)',
    gradient: 'linear-gradient(135deg, #059669, #047857)',
    shadow: '0 4px 14px rgba(5, 150, 105, 0.35)'
  },
  s04: {
    stage: 'S04',
    badge: 'STAGE S04',
    name: 'Sub-Dealer Registration',
    color: '#d97706', // Amber Gold
    bg: 'rgba(217, 119, 6, 0.14)',
    border: 'rgba(217, 119, 6, 0.35)',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
    shadow: '0 4px 14px rgba(217, 119, 6, 0.35)'
  },
  s05: {
    stage: 'S05',
    badge: 'STAGE S05',
    name: 'Commercial Security Details',
    color: '#ea580c', // Orange
    bg: 'rgba(234, 88, 12, 0.14)',
    border: 'rgba(234, 88, 12, 0.35)',
    gradient: 'linear-gradient(135deg, #ea580c, #c2410c)',
    shadow: '0 4px 14px rgba(234, 88, 12, 0.35)'
  },
  s06: {
    stage: 'S06',
    badge: 'STAGE S06',
    name: 'Product Auth & Territory',
    color: '#0891b2', // Cyan / Teal
    bg: 'rgba(8, 145, 178, 0.14)',
    border: 'rgba(8, 145, 178, 0.35)',
    gradient: 'linear-gradient(135deg, #0891b2, #0e7490)',
    shadow: '0 4px 14px rgba(8, 145, 178, 0.35)'
  },
  s07: {
    stage: 'S07',
    badge: 'STAGE S07',
    name: 'Sales Team Assignment',
    color: '#7c3aed', // Purple / Violet
    bg: 'rgba(124, 58, 237, 0.14)',
    border: 'rgba(124, 58, 237, 0.35)',
    gradient: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    shadow: '0 4px 14px rgba(124, 58, 237, 0.35)'
  },
  s08: {
    stage: 'S08',
    badge: 'STAGE S08',
    name: 'Party Activation & Status',
    color: '#16a34a', // Emerald / Green
    bg: 'rgba(22, 163, 74, 0.14)',
    border: 'rgba(22, 163, 74, 0.35)',
    gradient: 'linear-gradient(135deg, #16a34a, #15803d)',
    shadow: '0 4px 14px rgba(22, 163, 74, 0.35)'
  }
};

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

  const activeSuggestions = inputVal
    ? suggestions.filter(s => s.toLowerCase().includes(inputVal.toLowerCase()) && !chips.includes(s))
    : suggestions.filter(s => !chips.includes(s)).slice(0, 10);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
        padding: '0.45rem',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #cbd5e1)',
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
              background: 'rgba(56,189,248,0.15)',
              border: '1px solid #0284c7',
              color: '#0284c7',
              borderRadius: '4px',
              padding: '0.15rem 0.45rem',
              fontSize: '0.78rem',
              fontWeight: 700
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
          onBlur={() => setShowDropdown(false)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? placeholder : ''}
          style={{
            flex: 1,
            minWidth: '120px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary, #0f172a)',
            outline: 'none',
            fontSize: '0.82rem'
          }}
        />
      </div>

      {showDropdown && activeSuggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-light, #cbd5e1)',
          borderRadius: '6px',
          marginTop: '0.2rem',
          maxHeight: '160px',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg, 0 10px 18px -3px rgba(15, 23, 42, 0.15))'
        }}>
          {activeSuggestions.map((s, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                addChip(s);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.82rem',
                color: 'var(--text-primary, #0f172a)',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-light, #f1f5f9)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary, #f8fafc)'}
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

/**
 * Reusable Searchable Party Select (Combobox) for S03 Parent Distributor & S04 Parent Dealer
 */
function SearchablePartySelect({
  label,
  placeholder = 'Search by Firm Name, Code, City...',
  selectedId,
  options = [],
  onChange,
  color = '#059669',
  required = false,
  emptyNotice = 'No matching party found'
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedParty = options.find(p => p.id === selectedId);

  const filtered = options.filter(p => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const code = (p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code || p.external_sap_code || '').toLowerCase();
    const firm = (p.firm_name || '').toLowerCase();
    const city = (p.city_village || p.district_name || p.district || p.state_name || p.state || '').toLowerCase();
    const phone = (p.primary_mobile || p.biz_contact_no_1 || p.contact_mobile_1_1 || '').toLowerCase();
    return code.includes(q) || firm.includes(q) || city.includes(q) || phone.includes(q);
  });

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700, color, marginBottom: '0.35rem' }}>
        <span>{label} {required && '*'}</span>
        {selectedParty && (
          <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Check size={12} /> Active Parent Selected
          </span>
        )}
      </label>

      {/* Selected Card View */}
      {selectedParty && !isOpen ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.95rem',
          borderRadius: '8px',
          border: `1.5px solid ${color}`,
          background: `${color}12`,
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.76rem',
              fontWeight: 800,
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              background: color,
              color: '#ffffff',
              fontFamily: 'monospace'
            }}>
              {selectedParty.distributor_code || selectedParty.dealer_code || selectedParty.party_universal_code || 'CODE'}
            </span>
            <span style={{ fontWeight: 800, color: 'var(--text-primary, #0f172a)', fontSize: '0.94rem' }}>
              {selectedParty.firm_name}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
              📍 {selectedParty.district_name || selectedParty.district || selectedParty.state_name || selectedParty.state || 'Punjab'}
            </span>
            {(selectedParty.primary_mobile || selectedParty.biz_contact_no_1) && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                📞 {selectedParty.primary_mobile || selectedParty.biz_contact_no_1}
              </span>
            )}
            {selectedParty.external_sap_code && (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#6366f1',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                ERP: {selectedParty.external_sap_code}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setSearchTerm('');
            }}
            style={{
              background: 'transparent',
              border: `1px solid ${color}`,
              color: color,
              padding: '0.3rem 0.7rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              whiteSpace: 'nowrap'
            }}
          >
            Change / Search
          </button>
        </div>
      ) : (
        /* Search Input and Floating Dropdown */
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-secondary, #94a3b8)', pointerEvents: 'none' }} />
            <input
              type="text"
              autoFocus={isOpen}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              style={{
                width: '100%',
                padding: '0.65rem 1rem 0.65rem 2.4rem',
                paddingRight: selectedParty ? '6.5rem' : '1rem',
                background: 'var(--bg-primary, #f8fafc)',
                border: `1.5px solid ${isOpen ? color : 'var(--border-light, #cbd5e1)'}`,
                borderRadius: '8px',
                fontSize: '0.86rem',
                color: 'var(--text-primary, #0f172a)',
                outline: 'none',
                boxShadow: isOpen ? `0 0 0 3px ${color}25` : 'none',
                boxSizing: 'border-box'
              }}
            />
            {selectedParty && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.55rem',
                  background: 'rgba(100,116,139,0.15)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                Keep Current
              </button>
            )}
          </div>

          {isOpen && (
            <>
              <div
                onClick={() => setIsOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              />
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                maxHeight: '260px',
                overflowY: 'auto',
                background: 'var(--bg-surface, #ffffff)',
                border: '1.5px solid var(--border-light, #cbd5e1)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                zIndex: 1000,
                padding: '0.35rem 0'
              }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', textAlign: 'center' }}>
                    {emptyNotice} {searchTerm ? `for "${searchTerm}"` : ''}
                  </div>
                ) : (
                  filtered.map(p => {
                    const isCurrent = p.id === selectedId;
                    const code = p.distributor_code || p.dealer_code || p.sub_dealer_code || p.party_universal_code || 'CODE';
                    const loc = [p.district_name || p.district, p.state_name || p.state].filter(Boolean).join(', ');
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          onChange(p.id);
                          setIsOpen(false);
                          setSearchTerm('');
                        }}
                        style={{
                          padding: '0.6rem 0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isCurrent ? `${color}18` : 'transparent',
                          borderBottom: '1px solid var(--border-light, #f1f5f9)',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${color}15`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? `${color}18` : 'transparent'; }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: isCurrent ? color : 'rgba(100, 116, 139, 0.15)',
                              color: isCurrent ? '#ffffff' : 'var(--text-primary)',
                              fontFamily: 'monospace'
                            }}>
                              {code}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                              {p.firm_name}
                            </span>
                            {p.external_sap_code && (
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '0.05rem 0.35rem',
                                borderRadius: '3px',
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: '#6366f1'
                              }}>
                                ERP: {p.external_sap_code}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary, #64748b)', paddingLeft: '0.2rem' }}>
                            {loc ? `📍 ${loc}` : ''} {(p.primary_mobile || p.biz_contact_no_1) ? `• 📞 ${p.primary_mobile || p.biz_contact_no_1}` : ''}
                          </div>
                        </div>

                        {isCurrent && (
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            <Check size={14} /> Selected
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 3-Tier Action Buttons Component for Stages S01-S08
 * Save as Draft (📝), Confirm Partial (⚡), Save & Confirm Stage (✓)
 */
function StageActionButtons({
  onClose,
  onSave,
  stageLabel = 'Stage',
  isSubmitting = false,
  cancelBtnStyle,
  submitBtnStyle,
  customColor
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '0.75rem',
      marginTop: '1.75rem',
      paddingTop: '1.25rem',
      borderTop: '1px solid var(--border-light, #e2e8f0)',
      flexWrap: 'wrap'
    }}>
      <button
        type="button"
        onClick={onClose}
        style={cancelBtnStyle}
      >
        <X size={15} /> Close [Esc]
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        {/* 1. Save as Draft */}
        <button
          type="button"
          onClick={(e) => onSave(e, 'DRAFT')}
          disabled={isSubmitting}
          title="Save entered details into database without strict validation. Stage remains Draft/WIP."
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.65rem 1.1rem',
            borderRadius: '8px',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            background: 'rgba(100, 116, 139, 0.12)',
            border: '1.5px solid #64748b',
            color: 'var(--text-primary, #334155)',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(100, 116, 139, 0.22)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(100, 116, 139, 0.12)'; }}
        >
          <FileText size={15} color="#64748b" /> Save as Draft
        </button>

        {/* 2. Confirm Partial */}
        <button
          type="button"
          onClick={(e) => onSave(e, 'PARTIAL')}
          disabled={isSubmitting}
          title="Provisional approval: saves data, marks stage as Partial, flags pending compliance."
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.65rem 1.1rem',
            borderRadius: '8px',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            background: 'rgba(245, 158, 11, 0.16)',
            border: '1.5px solid #f59e0b',
            color: '#d97706',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.26)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.16)'; }}
        >
          <AlertTriangle size={15} color="#d97706" /> Confirm Partial
        </button>

        {/* 3. Save & Confirm Stage */}
        <button
          type="button"
          onClick={(e) => onSave(e, 'CONFIRM')}
          disabled={isSubmitting}
          title="100% full verification: strict validation, marks stage Confirmed and unlocks next stage."
          style={{
            ...submitBtnStyle,
            background: customColor || 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            border: '1px solid #10b981',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
          }}
        >
          <CheckCircle2 size={16} /> Save &amp; Confirm {stageLabel}
        </button>
      </div>
    </div>
  );
}

export default function StageConfigModal({
  isOpen,
  activeTab,
  onClose,
  onSwitchTab,
  modalParty,
  onDeleteParty,
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
  s08SubStage = '',
  setS08SubStage,
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

  const currentTheme = STAGE_THEME_MAP[activeTab] || STAGE_THEME_MAP.s01;
  const [productSearch, setProductSearch] = useState('');

  // Reusable theme-adaptive style tokens for all modal forms
  const cardStyle = {
    background: 'var(--bg-primary, #f8fafc)',
    border: '1px solid var(--border-light, #e2e8f0)',
    borderRadius: '10px',
    padding: '1.25rem',
    marginBottom: '1.25rem'
  };

  const inputStyle = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    background: 'var(--bg-surface, #ffffff)',
    border: '1px solid var(--border-light, #cbd5e1)',
    borderRadius: '6px',
    color: 'var(--text-primary, #0f172a)',
    fontSize: '0.86rem'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '0.35rem',
    color: 'var(--text-secondary, #475569)',
    fontWeight: 600,
    fontSize: '0.82rem'
  };

  const sectionHeaderStyle = {
    fontSize: '0.9rem',
    fontWeight: 800,
    color: currentTheme.color,
    marginBottom: '0.85rem'
  };

  const cancelBtnStyle = {
    padding: '0.7rem 1.25rem',
    background: 'var(--bg-surface, #ffffff)',
    border: '1px solid var(--border-light, #cbd5e1)',
    borderRadius: '8px',
    color: 'var(--text-secondary, #475569)',
    fontWeight: 600,
    cursor: 'pointer'
  };

  const submitBtnStyle = {
    padding: '0.7rem 1.6rem',
    background: currentTheme.gradient,
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    boxShadow: currentTheme.shadow
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem 1rem'
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          border: '1.5px solid var(--border-light, #e2e8f0)',
          borderTop: `4px solid ${currentTheme.color}`,
          borderRadius: '16px',
          width: '100%',
          maxWidth: activeTab === 's01' ? '1140px' : '960px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl, 0 25px 60px -15px rgba(0, 0, 0, 0.25))',
          overflow: 'hidden'
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            background: 'var(--table-header-bg, var(--bg-surface, #ffffff))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              padding: '0.35rem 0.75rem',
              background: currentTheme.bg,
              border: `1px solid ${currentTheme.border}`,
              borderRadius: '8px',
              color: currentTheme.color,
              fontWeight: 800,
              fontSize: '0.8rem',
              letterSpacing: '0.05em'
            }}>
              {currentTheme.badge} ACTION
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                {stageTitles[activeTab]}
              </h3>
              <div style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {modalParty ? (
                  <>
                    <span style={{ color: currentTheme.color, fontWeight: 700 }}>
                      {modalParty.party_universal_code || modalParty.distributor_code || modalParty.dealer_code || modalParty.sub_dealer_code || 'Partner'}
                    </span>
                    <span>•</span>
                    <span style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600 }}>{modalParty.firm_name}</span>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '4px',
                      background: modalParty.party_type === 'Distributor' ? 'rgba(56,189,248,0.2)' : (modalParty.party_type === 'Dealer' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'),
                      color: modalParty.party_type === 'Distributor' ? '#0284c7' : (modalParty.party_type === 'Dealer' ? '#059669' : '#d97706'),
                      fontWeight: 700
                    }}>
                      {modalParty.party_type}
                    </span>
                    {(modalParty?.our_company || s00Form.our_company) && (
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '4px',
                        background: (modalParty?.our_company || s00Form.our_company).startsWith('NSTL') ? 'rgba(236,72,153,0.15)' : 'rgba(245,158,11,0.15)',
                        color: (modalParty?.our_company || s00Form.our_company).startsWith('NSTL') ? '#ec4899' : '#d97706',
                        border: `1px solid ${(modalParty?.our_company || s00Form.our_company).startsWith('NSTL') ? 'rgba(236,72,153,0.35)' : 'rgba(245,158,11,0.35)'}`,
                        fontWeight: 800
                      }}>
                        🏢 {(modalParty?.our_company || s00Form.our_company).startsWith('NSTL') ? 'NSTLP' : (modalParty?.our_company || s00Form.our_company)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: currentTheme.color, fontWeight: 700 }}>+ Direct Channel Partner Onboarding</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-surface, #ffffff)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: '8px',
              color: 'var(--text-secondary, #64748b)',
              padding: '0.45rem 0.85rem',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface, #ffffff)'; e.currentTarget.style.color = 'var(--text-secondary, #64748b)'; e.currentTarget.style.borderColor = 'var(--border-light, #e2e8f0)'; }}
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
              {/* Stage Audit Banner (Shows Last Employee & Timestamp) */}
              {modalParty?.stage_audit?.[activeTab] ? (
                <div style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '8px',
                  padding: '0.55rem 0.95rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.6rem',
                  fontSize: '0.78rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {modalParty.stage_audit[activeTab].status === 'DRAFT' ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.25)', color: '#94a3b8' }}>
                        📝 DRAFT
                      </span>
                    ) : modalParty.stage_audit[activeTab].status === 'PARTIAL' ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b' }}>
                        ⚡ PARTIAL
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.25)', color: '#10b981' }}>
                        ✓ CONFIRMED
                      </span>
                    )}
                    <span style={{ color: '#38bdf8', fontWeight: 800 }}>👤 By:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {modalParty.stage_audit[activeTab].emp_name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                    <span>🕒 Timestamp (IST):</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>
                      {modalParty.stage_audit[activeTab].timestamp}
                    </span>
                  </div>
                </div>
              ) : modalParty?.last_activity ? (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '0.45rem 0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  fontSize: '0.74rem',
                  color: 'var(--text-secondary)'
                }}>
                  <div>
                    Last Known Activity: <strong style={{ color: 'var(--text-primary)' }}>{modalParty.last_activity.emp_name}</strong>
                  </div>
                  <div style={{ fontFamily: 'monospace' }}>
                    {modalParty.last_activity.timestamp}
                  </div>
                </div>
              ) : null}

              {/* ========================================================= */}
              {/* STAGE S01 FORM */}
              {/* ========================================================= */}
              {activeTab === 's01' && (
                <form onSubmit={handleS00Submit}>
                  {/* Basic Firm Details */}
                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>Basic Firm Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.86rem' }}>
                      <div>
                        <label style={labelStyle}>Party Tier *</label>
                        <select
                          value={s00Form.party_type}
                          onChange={e => setS00Form({ ...s00Form, party_type: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Distributor">Level 1: Distributor (Super Stockist)</option>
                          <option value="Dealer">Level 2: Dealer (Authorized Showroom)</option>
                          <option value="Sub-Dealer">Level 3: Sub-Dealer (Retail Counter)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, color: '#f59e0b', fontWeight: 700 }}>Our Company Name *</label>
                        <select
                          value={(s00Form.our_company || '').startsWith('NSTL') ? 'NSTLP' : (s00Form.our_company || 'NSMLR')}
                          onChange={e => setS00Form({ ...s00Form, our_company: e.target.value })}
                          style={{ ...inputStyle, borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)' }}
                          required
                        >
                          <option value="">Select Company</option>
                          <option value="NSMLR">NSMLR</option>
                          <option value="NSTLP">NSTLP</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Firm / Trade Name *</label>
                        <input
                          type="text"
                          required
                          value={s00Form.firm_name}
                          onChange={e => setS00Form({ ...s00Form, firm_name: e.target.value })}
                          placeholder="e.g. Kisan Agro Machinery"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Legal Registered Name</label>
                        <input
                          type="text"
                          value={s00Form.legal_name}
                          onChange={e => setS00Form({ ...s00Form, legal_name: e.target.value })}
                          placeholder="As per GST/PAN"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Constitution Type</label>
                        <select
                          value={s00Form.constitution_type}
                          onChange={e => setS00Form({ ...s00Form, constitution_type: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="PROPRIETORSHIP">Proprietorship</option>
                          <option value="PARTNERSHIP">Partnership</option>
                          <option value="PVT_LTD">Pvt. Ltd.</option>
                          <option value="LTD">Public Ltd.</option>
                          <option value="LLP">LLP</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Tenant Custom / ERP ID</span>
                          <span style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 600 }}>Tally / Custom Software</span>
                        </label>
                        <input
                          type="text"
                          value={s00Form.external_sap_code || ''}
                          onChange={e => setS00Form({ ...s00Form, external_sap_code: e.target.value })}
                          placeholder="e.g. ERP-1049, TLY-88"
                          style={{
                            ...inputStyle,
                            borderColor: s00Form.external_sap_code ? 'rgba(99, 102, 241, 0.45)' : undefined,
                            background: s00Form.external_sap_code ? 'rgba(99, 102, 241, 0.04)' : undefined
                          }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>GSTIN</label>
                        <input
                          type="text"
                          value={s00Form.gstin}
                          onChange={e => setS00Form({ ...s00Form, gstin: e.target.value })}
                          placeholder="15-digit GSTIN"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>PAN</label>
                        <input
                          type="text"
                          value={s00Form.pan}
                          onChange={e => setS00Form({ ...s00Form, pan: e.target.value })}
                          placeholder="10-digit PAN"
                          style={inputStyle}
                        />
                      </div>

                      {/* State Name (Location Master) */}
                      <div>
                        <label style={{ ...labelStyle, color: currentTheme.color, fontWeight: 700 }}>
                          State Name * <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          value={s00Form.state_name}
                          onChange={e => handleS00StateChange(e.target.value)}
                          style={{ ...inputStyle, border: `1.5px solid ${currentTheme.color}` }}
                        >
                          {(locationStates.length > 0 ? locationStates.map(s => s.state_name || s.name) : ALL_INDIAN_STATES).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* District Name (Location Master) */}
                      <div>
                        <label style={{ ...labelStyle, color: currentTheme.color, fontWeight: 700 }}>
                          District Name * <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          required
                          value={s00Form.district_name}
                          onChange={e => setS00Form({ ...s00Form, district_name: e.target.value })}
                          style={{ ...inputStyle, border: `1.5px solid ${currentTheme.color}` }}
                        >
                          <option value="">-- Select District --</option>
                          {s00Districts.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* PIN Code */}
                      <div>
                        <label style={labelStyle}>PIN Code</label>
                        <input
                          type="text"
                          maxLength={6}
                          value={s00Form.pincode || ''}
                          onChange={e => setS00Form({ ...s00Form, pincode: e.target.value })}
                          placeholder="e.g. 141401"
                          style={inputStyle}
                        />
                      </div>

                      {/* City/Village Name */}
                      <div>
                        <label style={labelStyle}>City/Village Name</label>
                        <input
                          type="text"
                          value={s00Form.city_village || ''}
                          onChange={e => setS00Form({ ...s00Form, city_village: e.target.value })}
                          placeholder="e.g. Khanna"
                          style={inputStyle}
                        />
                      </div>

                      {/* Tehsil Name */}
                      <div>
                        <label style={labelStyle}>Tehsil Name</label>
                        <input
                          type="text"
                          value={s00Form.tehsil || ''}
                          onChange={e => setS00Form({ ...s00Form, tehsil: e.target.value })}
                          placeholder="e.g. Khanna"
                          style={inputStyle}
                        />
                      </div>

                      {/* Block Name */}
                      <div>
                        <label style={labelStyle}>Block Name</label>
                        <input
                          type="text"
                          value={s00Form.block_name || ''}
                          onChange={e => setS00Form({ ...s00Form, block_name: e.target.value })}
                          placeholder="e.g. Samrala"
                          style={inputStyle}
                        />
                      </div>

                      {/* Full Address */}
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={labelStyle}>Full Address</label>
                        <input
                          type="text"
                          value={s00Form.address || ''}
                          onChange={e => setS00Form({ ...s00Form, address: e.target.value })}
                          placeholder="Shop / Plot No., Industrial Area / Mandi, Full Postal Address..."
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sub-Tabs for Business Contacts vs Person 1 vs Person 2 */}
                  <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setS00ContactTab('biz')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'biz' ? '#0284c7' : 'var(--bg-surface, #ffffff)',
                        color: s00ContactTab === 'biz' ? '#ffffff' : 'var(--text-secondary, #475569)'
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
                        border: '1px solid var(--border-light)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'person1' ? '#059669' : 'var(--bg-surface, #ffffff)',
                        color: s00ContactTab === 'person1' ? '#ffffff' : 'var(--text-secondary, #475569)'
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
                        border: '1px solid var(--border-light)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'person2' ? '#d97706' : 'var(--bg-surface, #ffffff)',
                        color: s00ContactTab === 'person2' ? '#ffffff' : 'var(--text-secondary, #475569)'
                      }}
                    >
                      👥 Contact Person 2 (Secondary / Accounts)
                    </button>
                    <button
                      type="button"
                      onClick={() => setS00ContactTab('person3')}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: s00ContactTab === 'person3' ? '#8b5cf6' : 'var(--bg-surface, #ffffff)',
                        color: s00ContactTab === 'person3' ? '#ffffff' : 'var(--text-secondary, #475569)'
                      }}
                    >
                      👤 Contact Person 3 (Additional Key Official)
                    </button>
                  </div>

                  {/* TAB A: BUSINESS CONTACTS */}
                  {s00ContactTab === 'biz' && (
                    <div style={{ ...cardStyle, border: '1.5px solid rgba(2, 132, 199, 0.35)' }}>
                      <div style={{ ...sectionHeaderStyle, color: '#0284c7' }}>
                        Official Business Communication Channels
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div>
                          <label style={labelStyle}>Business Contact Number 1 *</label>
                          <input type="text" required value={s00Form.biz_contact_no_1} onChange={e => setS00Form({ ...s00Form, biz_contact_no_1: e.target.value })} placeholder="Main business phone" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Contact Number 2</label>
                          <input type="text" value={s00Form.biz_contact_no_2} onChange={e => setS00Form({ ...s00Form, biz_contact_no_2: e.target.value })} placeholder="Second office phone" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Alternate Number 1</label>
                          <input type="text" value={s00Form.biz_alt_no_1} onChange={e => setS00Form({ ...s00Form, biz_alt_no_1: e.target.value })} placeholder="Alternate landline / mobile" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Alternate Number 2</label>
                          <input type="text" value={s00Form.biz_alt_no_2} onChange={e => setS00Form({ ...s00Form, biz_alt_no_2: e.target.value })} placeholder="Secondary alternate" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Contact Mail ID 1</label>
                          <input type="email" value={s00Form.biz_email_1} onChange={e => setS00Form({ ...s00Form, biz_email_1: e.target.value })} placeholder="orders@domain.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Contact Mail ID 2</label>
                          <input type="email" value={s00Form.biz_email_2} onChange={e => setS00Form({ ...s00Form, biz_email_2: e.target.value })} placeholder="accounts@domain.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Alternate Mail ID 1</label>
                          <input type="email" value={s00Form.biz_alt_email_1} onChange={e => setS00Form({ ...s00Form, biz_alt_email_1: e.target.value })} placeholder="support@domain.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Business Alternate Mail ID 2</label>
                          <input type="email" value={s00Form.biz_alt_email_2} onChange={e => setS00Form({ ...s00Form, biz_alt_email_2: e.target.value })} placeholder="mgmt@domain.com" style={inputStyle} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB B: CONTACT PERSON 1 */}
                  {s00ContactTab === 'person1' && (
                    <div style={{ ...cardStyle, border: '1.5px solid rgba(5, 150, 105, 0.35)' }}>
                      <div style={{ ...sectionHeaderStyle, color: '#059669' }}>
                        Contact Person 1 (Primary Key Official / Director / Proprietor)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={labelStyle}>Contact Person Name 1 *</label>
                          <input type="text" required value={s00Form.contact_person_name_1} onChange={e => setS00Form({ ...s00Form, contact_person_name_1: e.target.value })} placeholder="e.g. Sardar Gurdeep Singh" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 1.1 *</label>
                          <input type="text" required value={s00Form.contact_mobile_1_1} onChange={e => setS00Form({ ...s00Form, contact_mobile_1_1: e.target.value })} placeholder="10-digit primary mobile" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 1.2</label>
                          <input type="text" value={s00Form.contact_mobile_1_2} onChange={e => setS00Form({ ...s00Form, contact_mobile_1_2: e.target.value })} placeholder="Second mobile" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 1.1</label>
                          <input type="text" value={s00Form.contact_alt_mobile_1_1} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_1_1: e.target.value })} placeholder="Home / Alternate 1" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 1.2</label>
                          <input type="text" value={s00Form.contact_alt_mobile_1_2} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_1_2: e.target.value })} placeholder="Alternate 2" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mail ID 1.2</label>
                          <input type="email" value={s00Form.contact_email_1_2} onChange={e => setS00Form({ ...s00Form, contact_email_1_2: e.target.value })} placeholder="person1@domain.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Alternate Mail ID 1.1</label>
                          <input type="email" value={s00Form.contact_alt_email_1_1} onChange={e => setS00Form({ ...s00Form, contact_alt_email_1_1: e.target.value })} placeholder="alt.person1@domain.com" style={inputStyle} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB C: CONTACT PERSON 2 */}
                  {s00ContactTab === 'person2' && (
                    <div style={{ ...cardStyle, border: '1.5px solid rgba(217, 119, 6, 0.35)' }}>
                      <div style={{ ...sectionHeaderStyle, color: '#d97706' }}>
                        Contact Person 2 (Secondary Official / Showroom Manager / Partner)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={labelStyle}>Contact Person Name 2</label>
                          <input type="text" value={s00Form.contact_person_name_2} onChange={e => setS00Form({ ...s00Form, contact_person_name_2: e.target.value })} placeholder="e.g. Balwinder Kaur" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 2.1</label>
                          <input type="text" value={s00Form.contact_mobile_2_1} onChange={e => setS00Form({ ...s00Form, contact_mobile_2_1: e.target.value })} placeholder="Secondary person mobile" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 2.2</label>
                          <input type="text" value={s00Form.contact_mobile_2_2} onChange={e => setS00Form({ ...s00Form, contact_mobile_2_2: e.target.value })} placeholder="Alternative mobile" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 2.1</label>
                          <input type="text" value={s00Form.contact_alt_mobile_2_1} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_2_1: e.target.value })} placeholder="Home / Alternate 1" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 2.2</label>
                          <input type="text" value={s00Form.contact_alt_mobile_2_2} onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_2_2: e.target.value })} placeholder="Alternate 2" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mail ID 2.2</label>
                          <input type="email" value={s00Form.contact_email_2_2} onChange={e => setS00Form({ ...s00Form, contact_email_2_2: e.target.value })} placeholder="person2@domain.com" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Alternate Mail ID 2.1</label>
                          <input type="email" value={s00Form.contact_alt_email_2_1} onChange={e => setS00Form({ ...s00Form, contact_alt_email_2_1: e.target.value })} placeholder="alt.person2@domain.com" style={inputStyle} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB D: CONTACT PERSON 3 */}
                  {s00ContactTab === 'person3' && (
                    <div style={{ ...cardStyle, border: '1.5px solid rgba(139, 92, 246, 0.35)' }}>
                      <div style={{ ...sectionHeaderStyle, color: '#8b5cf6' }}>
                        Contact Person 3 (Additional Key Official / Field Representative / Alternate)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.84rem' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label style={labelStyle}>Contact Person Name 3</label>
                          <input
                            type="text"
                            value={s00Form.contact_person_name_3 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_person_name_3: e.target.value })}
                            placeholder="e.g. Jaspreet Singh"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 3.1</label>
                          <input
                            type="text"
                            value={s00Form.contact_mobile_3_1 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_mobile_3_1: e.target.value })}
                            placeholder="Additional mobile"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mobile 3.2</label>
                          <input
                            type="text"
                            value={s00Form.contact_mobile_3_2 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_mobile_3_2: e.target.value })}
                            placeholder="Second mobile"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 3.1</label>
                          <input
                            type="text"
                            value={s00Form.contact_alt_mobile_3_1 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_3_1: e.target.value })}
                            placeholder="Home / Alternate 1"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Alternate Mobile 3.2</label>
                          <input
                            type="text"
                            value={s00Form.contact_alt_mobile_3_2 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_alt_mobile_3_2: e.target.value })}
                            placeholder="Alternate 2"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Mail ID 3.1</label>
                          <input
                            type="email"
                            value={s00Form.contact_email_3_1 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_email_3_1: e.target.value })}
                            placeholder="person3@domain.com"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Contact Person Alternate Mail ID 3.2</label>
                          <input
                            type="email"
                            value={s00Form.contact_email_3_2 || s00Form.contact_alt_email_3_1 || ''}
                            onChange={e => setS00Form({ ...s00Form, contact_email_3_2: e.target.value, contact_alt_email_3_1: e.target.value })}
                            placeholder="alt.person3@domain.com"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      {modalParty?.id && onDeleteParty && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onDeleteParty(modalParty);
                          }}
                          style={{
                            padding: '0.65rem 1.1rem',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            borderRadius: '8px',
                            color: '#ef4444',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                            e.currentTarget.style.color = '#ef4444';
                          }}
                        >
                          <Trash2 size={15} /> Delete Party
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={onClose}
                        style={cancelBtnStyle}
                      >
                        <X size={15} /> Close [Esc]
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleS00Submit(e, 'DRAFT')}
                        title="Save entered firm details as Draft without strict validation"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.65rem 1.1rem',
                          borderRadius: '8px',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: 'rgba(100, 116, 139, 0.12)',
                          border: '1.5px solid #64748b',
                          color: 'var(--text-primary, #334155)',
                          transition: 'all 0.15s'
                        }}
                      >
                        <FileText size={15} color="#64748b" /> Save as Draft
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleS00Submit(e, 'PARTIAL')}
                        title="Provisional confirmation: save S01 and mark as Partial"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.65rem 1.1rem',
                          borderRadius: '8px',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: 'rgba(245, 158, 11, 0.16)',
                          border: '1.5px solid #f59e0b',
                          color: '#d97706',
                          transition: 'all 0.15s'
                        }}
                      >
                        <AlertTriangle size={15} color="#d97706" /> Confirm Partial
                      </button>
                      <button
                        type="submit"
                        onClick={(e) => handleS00Submit(e, 'CONFIRM')}
                        style={submitBtnStyle}
                      >
                        <CheckCircle2 size={16} /> Save &amp; Confirm S01 Details
                      </button>
                    </div>
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

                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                      Distributor Territory Jurisdiction &amp; Operational Region
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div>
                        <label style={labelStyle}>Jurisdiction Zone (Macro-Region) *</label>
                        <select
                          value={s01DistForm.zone || 'North Zone'}
                          onChange={e => setS01DistForm({ ...s01DistForm, zone: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="North Zone">North Zone (Punjab, Haryana, HP, J&amp;K, Rajasthan)</option>
                          <option value="Central Zone">Central Zone (MP, UP, Chhattisgarh)</option>
                          <option value="West Zone">West Zone (Gujarat, Maharashtra)</option>
                          <option value="South Zone">South Zone (Karnataka, AP, Telangana, TN)</option>
                          <option value="East Zone">East Zone (Bihar, WB, Odisha, Assam)</option>
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>Primary Assigned State *</label>
                        <select
                          value={s01DistForm.state || modalParty?.state_name || 'Punjab'}
                          onChange={e => setS01DistForm({ ...s01DistForm, state: e.target.value })}
                          style={inputStyle}
                        >
                          {(locationStates.length > 0 ? locationStates.map(s => s.state_name || s.name) : ALL_INDIAN_STATES).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ gridColumn: '1 / -1' }}>
                        {(() => {
                          const currentDistState = s01DistForm.state || modalParty?.state_name || 'Punjab';
                          const availableDistricts = INDIAN_STATE_DISTRICTS[currentDistState] || [];
                          const chips = Array.isArray(s01DistForm.districts)
                            ? s01DistForm.districts
                            : (s01DistForm.district
                                ? (typeof s01DistForm.district === 'string' ? s01DistForm.district.split(',').map(s => s.trim()).filter(Boolean) : [])
                                : (modalParty?.district_name ? modalParty.district_name.split(',').map(s => s.trim()).filter(Boolean) : []));

                          const handleChipsChange = (newChips) => {
                            setS01DistForm({
                              ...s01DistForm,
                              districts: newChips,
                              district: newChips.join(', ')
                            });
                          };

                          return (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                                <label style={{ ...labelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  <span>Assigned Headquarter / Primary District(s) *</span>
                                  <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '4px',
                                    background: chips.length > 0 ? 'rgba(56,189,248,0.15)' : 'rgba(239,68,68,0.15)',
                                    color: chips.length > 0 ? '#38bdf8' : '#ef4444'
                                  }}>
                                    {chips.length > 0 ? `${chips.length} District${chips.length > 1 ? 's' : ''} Selected` : 'No District Added'}
                                  </span>
                                </label>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Type district &amp; press Enter, or click suggested chips
                                </span>
                              </div>

                              <ChipInput
                                chips={chips}
                                onChange={handleChipsChange}
                                placeholder="Type district / HQ name and press Enter (e.g. Ludhiana, Bathinda, Karnal)..."
                                suggestions={availableDistricts}
                              />

                              {/* Quick pick popular districts for selected state */}
                              {availableDistricts.length > 0 && (
                                <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Suggested for {currentDistState}:
                                  </span>
                                  {availableDistricts.slice(0, 12).map(distName => {
                                    const isSelected = chips.includes(distName);
                                    return (
                                      <button
                                        key={distName}
                                        type="button"
                                        onClick={() => {
                                          if (isSelected) {
                                            handleChipsChange(chips.filter(c => c !== distName));
                                          } else {
                                            handleChipsChange([...chips, distName]);
                                          }
                                        }}
                                        style={{
                                          fontSize: '0.72rem',
                                          padding: '0.15rem 0.55rem',
                                          borderRadius: '12px',
                                          border: isSelected ? '1px solid #10b981' : '1px solid var(--border-light, #cbd5e1)',
                                          background: isSelected ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary, #f8fafc)',
                                          color: isSelected ? '#10b981' : 'var(--text-primary, #0f172a)',
                                          cursor: 'pointer',
                                          fontWeight: isSelected ? 700 : 500,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.2rem',
                                          transition: 'all 0.15s'
                                        }}
                                      >
                                        {isSelected ? '✓ ' : '+ '}{distName}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS01DistSubmit(e, mode)}
                    stageLabel="S02 Distributor Details"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S03 FORM */}
              {/* ========================================================= */}
              {activeTab === 's03' && (
                <form onSubmit={handleS02DealerSubmit}>
                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                      Dealer Hierarchy Tagging &amp; Showroom Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <SearchablePartySelect
                          label="Parent Distributor (Strict Hierarchy Tagging)"
                          placeholder="Search active distributor by firm name, code, district, city..."
                          selectedId={s02DealerForm.parent_distributor_id}
                          options={activeDistributors}
                          onChange={(partyId) => setS02DealerForm({ ...s02DealerForm, parent_distributor_id: partyId })}
                          color="#059669"
                          required={true}
                          emptyNotice="No active Parent Distributor found"
                        />
                      </div>

                      <div>
                        <label style={labelStyle}>Dealership Type</label>
                        <select
                          value={s02DealerForm.dealership_type}
                          onChange={e => setS02DealerForm({ ...s02DealerForm, dealership_type: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Swan Exclusive Dealer">Swan Exclusive Dealer</option>
                          <option value="Multi-Brand Agro Showroom">Multi-Brand Agro Showroom</option>
                          <option value="Authorized Spares &amp; Implements">Authorized Spares &amp; Implements</option>
                        </select>
                      </div>

                      <div>
                        <label style={labelStyle}>Showroom Area (Sq. Ft)</label>
                        <input
                          type="number"
                          value={s02DealerForm.showroom_area_sqft}
                          onChange={e => setS02DealerForm({ ...s02DealerForm, showroom_area_sqft: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS02DealerSubmit(e, mode)}
                    stageLabel="S03 Dealer Mapping"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S04 FORM */}
              {/* ========================================================= */}
              {activeTab === 's04' && (
                <form onSubmit={handleS03SubDealerSubmit}>
                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>
                      Sub-Dealer Multi-Tier Hierarchy Placement
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <SearchablePartySelect
                          label="Parent Dealer (Mandatory Retail Counter Placement)"
                          placeholder="Search active parent dealer by firm name, code, district, city..."
                          selectedId={s03SubDealerForm.parent_dealer_id}
                          options={activeDealers}
                          onChange={(partyId) => setS03SubDealerForm({ ...s03SubDealerForm, parent_dealer_id: partyId })}
                          color="#d97706"
                          required={true}
                          emptyNotice="No active Parent Dealer found"
                        />
                      </div>

                      {/* AUTO-DERIVED READ-ONLY DISTRIBUTOR CARD */}
                      <div style={{
                        gridColumn: 'span 2',
                        background: 'rgba(217, 119, 6, 0.08)',
                        border: '1.5px solid rgba(217, 119, 6, 0.35)',
                        borderRadius: '10px',
                        padding: '1rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#d97706', fontWeight: 700, fontSize: '0.88rem' }}>
                          <Lock size={15} /> Auto-Derived Parent Distributor (System Enforced / Read-Only)
                        </div>
                        {s03SubDealerForm.parent_dealer_id ? (
                          (() => {
                            const selDlr = parties.find(p => p.id === s03SubDealerForm.parent_dealer_id);
                            const distName = selDlr?.parent_distributor?.firm_name || (selDlr?.parent_distributor_id ? 'Tagged Distributor' : 'Direct Company');
                            return (
                              <div style={{ marginTop: '0.4rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                                👑 {distName} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>(Derived from {selDlr?.firm_name})</span>
                              </div>
                            );
                          })()
                        ) : (
                          <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.85rem' }}>
                            Please select a Parent Dealer above to auto-identify Distributor.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS03SubDealerSubmit(e, mode)}
                    stageLabel="S04 Sub-Dealer Mapping"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S05 FORM */}
              {/* ========================================================= */}
              {activeTab === 's05' && (
                <form onSubmit={handleS04CommercialSubmit}>
                  {/* Direct vs Distributor Billing Route Selector */}
                  <div style={{
                    ...cardStyle,
                    border: '1.5px solid rgba(234, 88, 12, 0.35)',
                    marginBottom: '1.25rem'
                  }}>
                    <div style={{ ...sectionHeaderStyle, color: '#ea580c' }}>
                      ⚡ Billing Route Selection (Company vs Distributor Billing)
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input
                          type="radio"
                          name="billing_route"
                          value="DIRECT_COMPANY_BILLING"
                          checked={s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING'}
                          onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DIRECT_COMPANY_BILLING' })}
                        />
                        <span style={{ fontWeight: 600 }}>Direct Company Billing (Swan Agro Ltd.)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input
                          type="radio"
                          name="billing_route"
                          value="DISTRIBUTOR_BILLED"
                          checked={s04CommForm.billing_route_type === 'DISTRIBUTOR_BILLED'}
                          onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DISTRIBUTOR_BILLED' })}
                        />
                        <span style={{ fontWeight: 600 }}>Distributor Billed (via Tagged Distributor Godown)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input
                          type="radio"
                          name="billing_route"
                          value="DEALER_BILLED"
                          checked={s04CommForm.billing_route_type === 'DEALER_BILLED'}
                          onChange={() => setS04CommForm({ ...s04CommForm, billing_route_type: 'DEALER_BILLED' })}
                        />
                        <span style={{ fontWeight: 600 }}>Dealer Billed (via Tagged Dealer)</span>
                      </label>
                    </div>

                    {s04CommForm.billing_route_type === 'DIRECT_COMPANY_BILLING' && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>
                        ℹ️ Direct Billing selected: Tagged Distributor will automatically receive a <strong>{s04CommForm.distributor_commission_percent || 2.5}%</strong> Territory Override Commission.
                      </div>
                    )}
                    {s04CommForm.billing_route_type === 'DISTRIBUTOR_BILLED' && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#0284c7', fontWeight: 600 }}>
                        ℹ️ Distributor Billing selected: Tagged Distributor fulfills orders and bills directly from their godown.
                      </div>
                    )}
                    {s04CommForm.billing_route_type === 'DEALER_BILLED' && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#d97706', fontWeight: 600 }}>
                        ℹ️ Dealer Billing selected: Tagged Dealer supplies and bills this Sub-Dealer counter directly.
                      </div>
                    )}
                  </div>

                  <div style={cardStyle}>
                    <div style={sectionHeaderStyle}>Security Deposit &amp; Commercial Terms</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div>
                        <label style={labelStyle}>Security Deposit (₹)</label>
                        <input
                          type="number"
                          value={s04CommForm.security_deposit_amount}
                          onChange={e => setS04CommForm({ ...s04CommForm, security_deposit_amount: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Security Deposit Date *</label>
                        <input
                          type="date"
                          value={s04CommForm.security_deposit_date}
                          onChange={e => setS04CommForm({ ...s04CommForm, security_deposit_date: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Security Mode</label>
                        <select
                          value={s04CommForm.security_mode}
                          onChange={e => setS04CommForm({ ...s04CommForm, security_mode: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Cheque">Security Cheques</option>
                          <option value="Bank Guarantee">Bank Guarantee</option>
                          <option value="Fixed Deposit">Fixed Deposit Lien</option>
                          <option value="Cash">Cash Deposit</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Cheque / Receipt No.</label>
                        <input
                          type="text"
                          value={s04CommForm.receipt_no}
                          onChange={e => setS04CommForm({ ...s04CommForm, receipt_no: e.target.value })}
                          placeholder="e.g. CHQ-402911"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  {/* First Billing Milestone */}
                  <div style={{ ...cardStyle, marginTop: '1.25rem' }}>
                    <div style={{ ...sectionHeaderStyle, color: '#10b981' }}>
                      📦 First Billing Milestone (Billing 1st Date, Amount &amp; Status)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div>
                        <label style={labelStyle}>Billing 1st Date</label>
                        <input
                          type="date"
                          value={s04CommForm.billing_first_date || ''}
                          onChange={e => setS04CommForm({ ...s04CommForm, billing_first_date: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Billing 1st Amount (₹)</label>
                        <input
                          type="number"
                          value={s04CommForm.billing_first_amount ?? ''}
                          onChange={e => setS04CommForm({ ...s04CommForm, billing_first_amount: e.target.value === '' ? '' : Number(e.target.value) })}
                          placeholder="e.g. 250000"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Billing 1st Status</label>
                        <select
                          value={s04CommForm.billing_first_status || 'Pending'}
                          onChange={e => setS04CommForm({ ...s04CommForm, billing_first_status: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Pending">⏳ Pending (Order / Billing Awaited)</option>
                          <option value="Billed">📄 Billed (Invoice Generated)</option>
                          <option value="Dispatched">🚚 Dispatched (Goods in Transit)</option>
                          <option value="Delivered">📦 Delivered (Stock Received by Partner)</option>
                          <option value="Paid">✅ Paid (Payment Received / Settled)</option>
                          <option value="On Hold">⏸️ On Hold (Credit / Commercial Review)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS04CommercialSubmit(e, mode)}
                    stageLabel="S05 Commercial Details"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S06 FORM */}
              {/* ========================================================= */}
              {activeTab === 's06' && (
                <form onSubmit={handleS05CombinedSubmit}>
                  {/* 1. Product Authorization & Category */}
                  <div style={{ ...cardStyle, marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <div style={sectionHeaderStyle}>
                          1. Product Category &amp; Machinery Authorization
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                          Select product line category (Implement, Spare Part, or Both) and specify authorized machinery.
                        </p>
                      </div>
                    </div>

                    {/* Product Category Dropdown Field */}
                    <div style={{
                      marginBottom: '1.25rem',
                      background: 'var(--table-header-bg, #f8fafc)',
                      padding: '1rem',
                      borderRadius: '10px',
                      border: '1.5px solid rgba(8, 145, 178, 0.35)'
                    }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', color: '#0891b2', fontWeight: 800, fontSize: '0.88rem' }}>
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
                            ...inputStyle,
                            maxWidth: '320px',
                            border: '1.5px solid #0891b2',
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
                          background: s06ProductCategory === 'Implement' ? 'rgba(8, 145, 178, 0.12)' : (s06ProductCategory === 'Spare Part' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)'),
                          color: s06ProductCategory === 'Implement' ? '#0891b2' : (s06ProductCategory === 'Spare Part' ? '#d97706' : '#059669'),
                          border: `1px solid ${s06ProductCategory === 'Implement' ? '#0891b2' : (s06ProductCategory === 'Spare Part' ? '#d97706' : '#059669')}`
                        }}>
                          {s06ProductCategory === 'Implement' && '🚜 Farm Implements (Rotavator, Mulcher, Laser Leveller, etc.)'}
                          {s06ProductCategory === 'Spare Part' && '⚙️ Genuine Blades, Gearbox & Spare Parts only'}
                          {s06ProductCategory === 'Both' && '✨ Both Implements & Genuine Spare Parts'}
                        </span>
                      </div>
                    </div>

                    {/* Header bar with counter, search & select all */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>Select Allowed Products ({s06ProductCategory === 'Both' ? 'All Products' : s06ProductCategory + 's'}):</span>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '12px',
                          background: 'rgba(8, 145, 178, 0.15)',
                          color: '#0891b2',
                          border: '1px solid rgba(8, 145, 178, 0.3)'
                        }}>
                          {s05SelectedProducts.length} selected
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {/* Filter Search */}
                        <div style={{ position: 'relative', width: '210px' }}>
                          <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                          <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Search 37 products..."
                            style={{
                              ...inputStyle,
                              padding: '0.35rem 0.65rem 0.35rem 1.8rem',
                              fontSize: '0.78rem'
                            }}
                          />
                        </div>

                        {/* Select All */}
                        <button
                          type="button"
                          onClick={() => {
                            const applicable = PRODUCT_GROUPS.filter(p => {
                              if (s06ProductCategory === 'Implement') return p.category === 'Implement';
                              if (s06ProductCategory === 'Spare Part') return p.category === 'Spare Part';
                              return true;
                            }).map(p => p.id);
                            setS05SelectedProducts(Array.from(new Set([...s05SelectedProducts, ...applicable])));
                          }}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid rgba(8,145,178,0.4)',
                            background: 'rgba(8,145,178,0.1)',
                            color: '#0891b2',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ✓ Select All
                        </button>

                        {/* Clear */}
                        <button
                          type="button"
                          onClick={() => {
                            if (s06ProductCategory === 'Both') {
                              setS05SelectedProducts([]);
                            } else if (s06ProductCategory === 'Implement') {
                              setS05SelectedProducts(s05SelectedProducts.filter(id => {
                                const p = PRODUCT_GROUPS.find(x => x.id === id);
                                return p && p.category !== 'Implement';
                              }));
                            } else {
                              setS05SelectedProducts(s05SelectedProducts.filter(id => id !== 'SPARE_PARTS'));
                            }
                          }}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Products Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '0.65rem',
                      maxHeight: '340px',
                      overflowY: 'auto',
                      paddingRight: '0.25rem'
                    }}>
                      {PRODUCT_GROUPS.filter(p => {
                        if (s06ProductCategory === 'Implement' && p.category !== 'Implement') return false;
                        if (s06ProductCategory === 'Spare Part' && p.category !== 'Spare Part') return false;
                        if (productSearch.trim()) {
                          const q = productSearch.trim().toLowerCase();
                          return p.name.toLowerCase().includes(q) || (p.subCategory && p.subCategory.toLowerCase().includes(q));
                        }
                        return true;
                      }).map(p => {
                        const isChecked = s05SelectedProducts.includes(p.id) ||
                          s05SelectedProducts.includes(p.name) ||
                          (p.id.startsWith('ROTAVATOR_') && s05SelectedProducts.includes('ROTAVATOR')) ||
                          (p.id === 'LASER_LAND_LEVELLER' && s05SelectedProducts.includes('LASER_LEVELLER')) ||
                          (p.id === 'EXTRA_HEAVY_DUTY_CULTIVATOR' && s05SelectedProducts.includes('CULTIVATOR_TILLER')) ||
                          (p.id === 'HEAVY_DUTY_DISC_HARROW' && s05SelectedProducts.includes('DISC_HARROW'));

                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              if (isChecked) {
                                setS05SelectedProducts(s05SelectedProducts.filter(x =>
                                  x !== p.id && x !== p.name && x !== 'ROTAVATOR' && x !== 'LASER_LEVELLER' && x !== 'CULTIVATOR_TILLER' && x !== 'DISC_HARROW'
                                ));
                              } else {
                                setS05SelectedProducts([...s05SelectedProducts, p.id]);
                              }
                            }}
                            style={{
                              padding: '0.65rem 0.75rem',
                              borderRadius: '8px',
                              border: isChecked ? '1.5px solid #0891b2' : '1px solid var(--border-light, #e2e8f0)',
                              background: isChecked ? 'rgba(8, 145, 178, 0.08)' : 'var(--bg-surface, #ffffff)',
                              color: 'var(--text-primary, #0f172a)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.6rem',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                              <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '4px',
                                border: '1.5px solid',
                                borderColor: isChecked ? '#0891b2' : 'var(--border-light, #cbd5e1)',
                                background: isChecked ? '#0891b2' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isChecked && <Check size={12} color="#fff" />}
                              </div>
                              <span style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>
                                {p.name}
                              </span>
                            </div>
                            <span style={{
                              fontSize: '0.65rem',
                              padding: '0.12rem 0.35rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: p.category === 'Implement' ? 'rgba(8, 145, 178, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                              color: p.category === 'Implement' ? '#0891b2' : '#d97706',
                              flexShrink: 0
                            }}>
                              {p.subCategory || p.category}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Territory Allocation */}
                  <div style={cardStyle}>
                    <div style={{ ...sectionHeaderStyle, color: '#059669' }}>
                      2. Geographic Territory &amp; Market Coverage
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', fontSize: '0.86rem' }}>
                      <div>
                        <label style={labelStyle}>
                          State * <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          value={s05TerritoryForm.state}
                          onChange={e => handleS05StateChange(e.target.value)}
                          style={{
                            ...inputStyle,
                            border: '1.5px solid rgba(8, 145, 178, 0.4)'
                          }}
                        >
                          {(locationStates.length > 0 ? locationStates.map(s => s.state_name || s.name) : ALL_INDIAN_STATES).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          District * <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>(Location Master)</span>
                        </label>
                        <select
                          required
                          value={s05TerritoryForm.district}
                          onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, district: e.target.value })}
                          style={{
                            ...inputStyle,
                            border: '1.5px solid rgba(8, 145, 178, 0.4)'
                          }}
                        >
                          <option value="">-- Select District --</option>
                          {s05Districts.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Tehsil / Area</label>
                        <input
                          type="text"
                          value={s05TerritoryForm.tehsil_area}
                          onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, tehsil_area: e.target.value })}
                          placeholder="e.g. Khanna"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Territory Type</label>
                        <select
                          value={s05TerritoryForm.territory_type}
                          onChange={e => setS05TerritoryForm({ ...s05TerritoryForm, territory_type: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Exclusive">Exclusive (Single authorized dealer in this area)</option>
                          <option value="Shared">Shared Territory</option>
                          <option value="Open">Open Territory</option>
                        </select>
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ ...labelStyle, color: '#059669', fontWeight: 700 }}>
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

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS05CombinedSubmit(e, mode)}
                    stageLabel="S06 Products &amp; Territory"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
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
                      <div
                        key={role.id}
                        style={{
                          background: 'var(--bg-surface, #ffffff)',
                          padding: '1rem',
                          borderRadius: '10px',
                          border: '1.5px solid var(--border-light, #e2e8f0)',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                          <span style={{ fontWeight: 700, color: '#7c3aed' }}>{role.label}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>{s06TeamMap[role.id]?.length || 0} Assigned</span>
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

                  <StageActionButtons
                    onClose={onClose}
                    onSave={(e, mode) => handleS06TeamSubmit(e, mode)}
                    stageLabel="S07 Sales Team"
                    cancelBtnStyle={cancelBtnStyle}
                    submitBtnStyle={submitBtnStyle}
                    customColor={currentTheme.gradient}
                  />
                </form>
              )}

              {/* ========================================================= */}
              {/* STAGE S08 FORM */}
              {/* ========================================================= */}
              {activeTab === 's08' && (
                <div>
                  {activationErrors.length > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid #ef4444', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>❌ Cannot Activate Partner:</div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#b91c1c', fontSize: '0.85rem' }}>
                        {activationErrors.map((err, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Pre-Flight Checklist Card */}
                  <div style={{
                    ...cardStyle,
                    marginBottom: '1.5rem'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary, #0f172a)', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ShieldCheck size={18} color="#16a34a" /> Pre-Flight Verification Checklist
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', fontSize: '0.86rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <CheckCircle2 size={16} color="#16a34a" /> S01 Party Master Identity &amp; 22 Contacts
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <CheckCircle2 size={16} color="#16a34a" /> S02/S03/S04 Hierarchy Placement Validated
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <CheckCircle2 size={16} color="#16a34a" /> S05 Commercial Security &amp; Billing Route
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <CheckCircle2 size={16} color="#16a34a" /> S06 Product Authorizations &amp; Territory
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <CheckCircle2 size={16} color="#16a34a" /> S07 Sales Team (7 Dedicated Roles)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary, #0f172a)' }}>
                        <ShieldCheck size={16} color="#0891b2" /> Indian Standard Time (IST) Audit Logging
                      </div>
                    </div>
                  </div>

                  {/* 2-Tier B2B Operational Status Architecture */}
                  {(() => {
                    const currentStatusObj = B2B_OPERATIONAL_STATUSES.find(s => s.id === s08ActivationStatus) || B2B_OPERATIONAL_STATUSES[0];
                    const activeSub = s08SubStage || currentStatusObj.defaultSubStage;

                    const handleSelectMainStatus = (statusId) => {
                      setS08ActivationStatus(statusId);
                      const targetStatus = B2B_OPERATIONAL_STATUSES.find(s => s.id === statusId);
                      if (targetStatus && setS08SubStage) {
                        const isCurrentSubValid = targetStatus.subStages.some(sub => sub.id === s08SubStage);
                        if (!isCurrentSubValid) {
                          setS08SubStage(targetStatus.defaultSubStage || targetStatus.subStages[0]?.id || '');
                        }
                      }
                    };

                    return (
                      <>
                        {/* Tier 1: 6 Main Operational Status Cards */}
                        <div style={{ marginBottom: '1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                              Tier 1: Set Channel Partner Operational Status *
                            </label>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>
                              6 Enterprise B2B Categories
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                            {B2B_OPERATIONAL_STATUSES.map(st => {
                              const isSel = s08ActivationStatus === st.id;
                              return (
                                <div
                                  key={st.id}
                                  onClick={() => handleSelectMainStatus(st.id)}
                                  style={{
                                    padding: '0.9rem',
                                    borderRadius: '10px',
                                    border: isSel ? `2px solid ${st.border}` : '1.5px solid var(--border-light, #e2e8f0)',
                                    background: isSel ? st.bg : 'var(--bg-surface, #ffffff)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: isSel ? `0 2px 10px ${st.color}25` : 'none',
                                    position: 'relative'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: isSel ? st.color : 'var(--text-primary, #0f172a)' }}>
                                      {st.label}
                                    </span>
                                    <div style={{
                                      width: '16px',
                                      height: '16px',
                                      borderRadius: '50%',
                                      border: `2px solid ${isSel ? st.color : 'var(--border-light, #94a3b8)'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      {isSel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.color }} />}
                                    </div>
                                  </div>
                                  <div style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    color: isSel ? st.color : 'var(--text-secondary, #64748b)',
                                    marginBottom: '0.25rem'
                                  }}>
                                    {st.category}
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.35 }}>
                                    {st.desc}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Tier 2: Dynamic Sub-Stage Selector */}
                        <div style={{
                          marginBottom: '1.5rem',
                          padding: '1.1rem',
                          borderRadius: '10px',
                          background: currentStatusObj.bg,
                          border: `1.5px solid ${currentStatusObj.border}`
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                                Tier 2: Specific Operational Sub-Stage / Root Cause for {currentStatusObj.label} *
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.15rem' }}>
                                Choose the exact commercial classification or operational reason
                              </div>
                            </div>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '0.2rem 0.6rem',
                              borderRadius: '5px',
                              background: currentStatusObj.color,
                              color: '#ffffff'
                            }}>
                              {currentStatusObj.category}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.65rem' }}>
                            {currentStatusObj.subStages.map(sub => {
                              const isSubSel = activeSub === sub.id;
                              return (
                                <div
                                  key={sub.id}
                                  onClick={() => setS08SubStage && setS08SubStage(sub.id)}
                                  style={{
                                    padding: '0.75rem 0.85rem',
                                    borderRadius: '8px',
                                    border: isSubSel ? `2px solid ${currentStatusObj.color}` : '1.5px solid var(--border-light, #cbd5e1)',
                                    background: isSubSel ? 'var(--bg-surface, #ffffff)' : 'rgba(255, 255, 255, 0.65)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    boxShadow: isSubSel ? `0 2px 8px ${currentStatusObj.color}35` : 'none'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <span style={{ fontWeight: 800, fontSize: '0.86rem', color: isSubSel ? currentStatusObj.color : 'var(--text-primary, #0f172a)' }}>
                                      {sub.label}
                                    </span>
                                    <div style={{
                                      width: '14px',
                                      height: '14px',
                                      borderRadius: '50%',
                                      border: `2px solid ${isSubSel ? currentStatusObj.color : 'var(--border-light, #94a3b8)'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      {isSubSel && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: currentStatusObj.color }} />}
                                    </div>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.35 }}>
                                    {sub.hint}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Remarks */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <label style={labelStyle}>
                            Activation Remarks / Decision Notes
                          </label>
                          <textarea
                            rows="3"
                            value={s08Remarks}
                            onChange={e => setS08Remarks(e.target.value)}
                            placeholder="Enter reasons, special credit remarks, or audit notes for this status change..."
                            style={{
                              ...inputStyle,
                              resize: 'vertical'
                            }}
                          />
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginTop: '1.75rem',
                          paddingTop: '1.25rem',
                          borderTop: '1px solid var(--border-light, #e2e8f0)',
                          flexWrap: 'wrap'
                        }}>
                          <button
                            type="button"
                            onClick={onClose}
                            style={cancelBtnStyle}
                          >
                            <X size={15} /> Close [Esc]
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleS07Activation('DRAFT')}
                              title="Save remarks as Draft without activating partner"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.65rem 1.1rem',
                                borderRadius: '8px',
                                fontSize: '0.84rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: 'rgba(100, 116, 139, 0.12)',
                                border: '1.5px solid #64748b',
                                color: 'var(--text-primary, #334155)',
                                transition: 'all 0.15s'
                              }}
                            >
                              <FileText size={15} color="#64748b" /> Save as Draft
                            </button>

                            <button
                              type="button"
                              onClick={() => handleS07Activation('PARTIAL')}
                              title="Provisional activation status: save remarks and mark as Partial"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.65rem 1.1rem',
                                borderRadius: '8px',
                                fontSize: '0.84rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: 'rgba(245, 158, 11, 0.16)',
                                border: '1.5px solid #f59e0b',
                                color: '#d97706',
                                transition: 'all 0.15s'
                              }}
                            >
                              <AlertTriangle size={15} color="#d97706" /> Confirm Partial
                            </button>

                            <button
                              type="button"
                              onClick={() => handleS07Activation('CONFIRM')}
                              style={{
                                padding: '0.75rem 1.6rem',
                                background: currentStatusObj.gradient || 'linear-gradient(135deg, #16a34a, #15803d)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontWeight: 800,
                                fontSize: '0.92rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                              }}
                            >
                              <CheckCircle2 size={18} /> Confirm &amp; Set Status: &quot;{s08ActivationStatus}&quot; {activeSub ? `(${activeSub})` : ''}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
