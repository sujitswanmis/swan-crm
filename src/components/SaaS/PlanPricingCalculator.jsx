'use client';

import React, { useState, useEffect } from 'react';
import {
  Check,
  Zap,
  PhoneCall,
  FileSpreadsheet,
  CheckSquare,
  ListTodo,
  Clock,
  UserCheck,
  Building2,
  Users,
  Calendar,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Plus,
  Minus
} from 'lucide-react';
import { getProcessCatalog, getCycleDiscounts } from '@/app/actions/saasSubscription';

const PROCESS_ICONS = {
  LEADS_ONLY: FileSpreadsheet,
  CALLING_STANDALONE: PhoneCall,
  LEADS_WITH_CALLING: Zap,
  TASK_DELEGATION: ListTodo,
  SMART_CHECKLIST: CheckSquare,
  ATTENDANCE: Clock,
  RECRUITER: UserCheck,
  PARTY_MASTER: Building2
};

const CATEGORY_COLORS = {
  SALES: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  TELEPHONY: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
  COMBO: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  OPERATIONS: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  HR: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' }
};

export default function PlanPricingCalculator({
  initialProcessCodes = ['LEADS_WITH_CALLING'],
  initialSeats = 5,
  initialCycle = 'YEARLY',
  showHeading = true,
  onPlanChange = null,
  onProceed = null,
  proceedButtonText = 'Select Plan & Continue'
}) {
  const [catalog, setCatalog] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedProcesses, setSelectedProcesses] = useState(initialProcessCodes);
  const [seatCount, setSeatCount] = useState(Math.max(1, parseInt(initialSeats, 10) || 5));
  const [selectedCycle, setSelectedCycle] = useState(initialCycle);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [catRes, cycRes] = await Promise.all([
          getProcessCatalog(),
          getCycleDiscounts()
        ]);
        if (!isMounted) return;
        if (catRes.success) setCatalog(catRes.catalog);
        if (cycRes.success) setCycles(cycRes.cycles);
      } catch (err) {
        console.error('PlanPricingCalculator load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleProcess = (code) => {
    setSelectedProcesses((prev) => {
      let updated;
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // Keep at least one
        updated = prev.filter((c) => c !== code);
      } else {
        // Mutually exclusive handling: if choosing LEADS_WITH_CALLING, uncheck LEADS_ONLY and CALLING_STANDALONE
        if (code === 'LEADS_WITH_CALLING') {
          updated = [...prev.filter((c) => c !== 'LEADS_ONLY' && c !== 'CALLING_STANDALONE'), code];
        } else if (code === 'LEADS_ONLY' || code === 'CALLING_STANDALONE') {
          updated = [...prev.filter((c) => c !== 'LEADS_WITH_CALLING'), code];
        } else {
          updated = [...prev, code];
        }
      }
      return updated;
    });
  };

  const selectAll = () => {
    const all = catalog.map((p) => p.process_code);
    setSelectedProcesses(all);
  };

  const selectCoreCrm = () => {
    setSelectedProcesses(['LEADS_WITH_CALLING']);
  };

  // Pricing math
  const activeCycle = cycles.find((c) => c.cycle_code === selectedCycle) || {
    cycle_code: 'YEARLY',
    months_count: 12,
    discount_percent: 20
  };

  const months = activeCycle.months_count || 1;
  const discountPercent = Number(activeCycle.discount_percent || 0);

  const selectedItems = catalog.filter((p) => selectedProcesses.includes(p.process_code));
  const ratePerSeatMonthly = selectedItems.reduce(
    (sum, item) => sum + Number(item.monthly_rate_per_user || 0),
    0
  );

  const monthlySubtotal = ratePerSeatMonthly * seatCount;
  const grossTotal = monthlySubtotal * months;
  const discountAmount = Math.round(grossTotal * (discountPercent / 100) * 100) / 100;
  const netTotal = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);
  const effectiveMonthlyPerSeat =
    months > 0 && seatCount > 0 ? Math.round(netTotal / (months * seatCount)) : 0;

  // Notify parent of updates
  useEffect(() => {
    if (onPlanChange && !loading) {
      onPlanChange({
        processCodes: selectedProcesses,
        seats: seatCount,
        cycleCode: selectedCycle,
        calculation: {
          ratePerSeatMonthly,
          seatCount,
          months,
          discountPercent,
          monthlySubtotal,
          grossTotal,
          discountAmount,
          netTotal,
          effectiveMonthlyPerSeat
        }
      });
    }
  }, [
    selectedProcesses,
    seatCount,
    selectedCycle,
    ratePerSeatMonthly,
    months,
    discountPercent,
    monthlySubtotal,
    grossTotal,
    discountAmount,
    netTotal,
    effectiveMonthlyPerSeat,
    onPlanChange,
    loading
  ]);

  const presetSeats = [1, 5, 10, 25, 50, 100];

  return (
    <div style={{ width: '100%' }}>
      {showHeading && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Sparkles size={20} style={{ color: '#4f46e5' }} />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
              कस्टम SaaS प्लान एवं प्राइसिंग कैलकुलेटर
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
            अपनी आवश्यकता अनुसार केवल वही मॉड्यूल चुनें जिनकी आपके व्यवसाय को ज़रूरत है। कभी भी बदलें या अपग्रेड करें।
          </p>
        </div>
      )}

      {/* QUICK PRESET FILTERS */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e2e8f0'
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
          मॉड्यूल चुनें ({selectedProcesses.length} चयनित):
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={selectCoreCrm}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#e0e7ff',
              color: '#4338ca',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Core CRM (Calling+Leads)
          </button>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            All 8 Modules (Complete Suite)
          </button>
        </div>
      </div>

      {/* 8 PROCESSES GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem'
        }}
      >
        {catalog.map((proc) => {
          const isSelected = selectedProcesses.includes(proc.process_code);
          const IconComp = PROCESS_ICONS[proc.process_code] || Zap;
          const catStyle = CATEGORY_COLORS[proc.category] || CATEGORY_COLORS.SALES;

          return (
            <div
              key={proc.process_code}
              onClick={() => toggleProcess(proc.process_code)}
              style={{
                border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                backgroundColor: isSelected ? '#f5f3ff' : '#ffffff',
                borderRadius: '10px',
                padding: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                boxShadow: isSelected ? '0 4px 12px rgba(79, 70, 229, 0.1)' : '0 1px 3px rgba(0,0,0,0.03)'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#4f46e5' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <IconComp size={18} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: catStyle.bg,
                        color: catStyle.text,
                        border: `1px solid ${catStyle.border}`
                      }}
                    >
                      {proc.category}
                    </span>
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '5px',
                        border: isSelected ? '2px solid #4f46e5' : '2px solid #cbd5e1',
                        backgroundColor: isSelected ? '#4f46e5' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff'
                      }}
                    >
                      {isSelected && <Check size={13} strokeWidth={3} />}
                    </div>
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '0.2rem' }}>
                  {proc.display_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.35, marginBottom: '0.5rem' }}>
                  {proc.description}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid #f1f5f9'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>प्रति यूज़र / माह:</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  ₹{proc.monthly_rate_per_user}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* USER SEATS & BILLING CYCLES ROW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
          backgroundColor: '#f8fafc',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* SEATS SELECTOR */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <Users size={16} style={{ color: '#4f46e5' }} />
            <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
              यूज़र सीट्स की संख्या (User Seats):
            </label>
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginBottom: '0.65rem' }}>
            जितने कर्मचारी इस CRM को इस्तेमाल करेंगे
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <button
              type="button"
              onClick={() => setSeatCount((prev) => Math.max(1, prev - 1))}
              disabled={seatCount <= 1}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                cursor: seatCount <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700
              }}
            >
              <Minus size={15} />
            </button>

            <input
              type="number"
              min={1}
              max={10000}
              value={seatCount}
              onChange={(e) => setSeatCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{
                width: '80px',
                height: '36px',
                textAlign: 'center',
                fontSize: '1.1rem',
                fontWeight: 700,
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff'
              }}
            />

            <button
              type="button"
              onClick={() => setSeatCount((prev) => prev + 1)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700
              }}
            >
              <Plus size={15} />
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Users</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {presetSeats.map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setSeatCount(cnt)}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: seatCount === cnt ? 700 : 500,
                  backgroundColor: seatCount === cnt ? '#4f46e5' : '#ffffff',
                  color: seatCount === cnt ? '#ffffff' : '#475569',
                  border: `1px solid ${seatCount === cnt ? '#4f46e5' : '#cbd5e1'}`,
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {cnt} {cnt === 1 ? 'Seat' : 'Seats'}
              </button>
            ))}
          </div>
        </div>

        {/* BILLING CYCLE SELECTOR */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <Calendar size={16} style={{ color: '#4f46e5' }} />
            <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
              बिलिंग साइकल (अवधि):
            </label>
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', marginBottom: '0.65rem' }}>
            लंबी अवधि पर विशेष छूट प्राप्त करें
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.45rem' }}>
            {cycles.map((cyc) => {
              const isSelected = selectedCycle === cyc.cycle_code;
              const hasDiscount = Number(cyc.discount_percent) > 0;
              return (
                <div
                  key={cyc.cycle_code}
                  onClick={() => setSelectedCycle(cyc.cycle_code)}
                  style={{
                    border: isSelected ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                    backgroundColor: isSelected ? '#ffffff' : '#f1f5f9',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: isSelected ? 700 : 600, color: '#1e293b' }}>
                      {cyc.display_name}
                    </span>
                    {hasDiscount && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          backgroundColor: '#dcfce7',
                          color: '#15803d',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px'
                        }}
                      >
                        {cyc.discount_percent}% छूट
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PRICE SUMMARY CARD */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          padding: '1.35rem 1.5rem',
          boxShadow: '0 8px 24px rgba(49, 46, 129, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
            paddingBottom: '1rem'
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              कुल अनुमानित बिलिंग (Plan Pricing Summary)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '2.1rem', fontWeight: 800 }}>₹{netTotal.toLocaleString('en-IN')}</span>
              <span style={{ fontSize: '0.9rem', color: '#a5b4fc' }}>
                / {activeCycle.display_name} ({seatCount} Users)
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: '#c7d2fe' }}>प्रभावी दर प्रति यूज़र:</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
              ₹{effectiveMonthlyPerSeat} / माह
            </div>
          </div>
        </div>

        {/* MATH BREAKDOWN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.8rem',
            color: '#e0e7ff'
          }}
        >
          <div>
            <span style={{ opacity: 0.75 }}>चयनित मॉड्यूल दर:</span>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>₹{ratePerSeatMonthly} / यूज़र / माह</div>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>सकल राशि (Gross):</span>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>₹{grossTotal.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>अवधि छूट ({discountPercent}%):</span>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#86efac' }}>
              - ₹{discountAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div>
            <span style={{ opacity: 0.75 }}>कुल शुद्ध देय (Net):</span>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
              ₹{netTotal.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* TELECOM EXCLUSION NOTICE */}
        <div
          style={{
            fontSize: '0.74rem',
            color: '#c7d2fe',
            backgroundColor: 'rgba(255,255,255,0.08)',
            padding: '0.55rem 0.85rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ShieldCheck size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <span>
            <strong>नोट:</strong> इसमें सॉफ़्टवेयर व वेबआरटीसी (WebRTC) प्लेटफ़ॉर्म लाइसेंस शामिल है। क्लाउड कॉलिंग के वास्तविक मिनट/कैरियर शुल्क Plivo द्वारा अलग से देय हैं।
          </span>
        </div>

        {onProceed && (
          <button
            type="button"
            onClick={() => {
              onProceed({
                processCodes: selectedProcesses,
                seats: seatCount,
                cycleCode: selectedCycle,
                calculation: {
                  ratePerSeatMonthly,
                  seatCount,
                  months,
                  discountPercent,
                  monthlySubtotal,
                  grossTotal,
                  discountAmount,
                  netTotal,
                  effectiveMonthlyPerSeat
                }
              });
            }}
            style={{
              width: '100%',
              padding: '0.85rem',
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '9px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginTop: '0.25rem'
            }}
          >
            {proceedButtonText}
          </button>
        )}
      </div>
    </div>
  );
}
