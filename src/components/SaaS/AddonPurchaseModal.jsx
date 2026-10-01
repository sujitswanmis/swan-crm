'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Sparkles,
  ShieldCheck,
  Zap,
  PhoneCall,
  FileSpreadsheet,
  CheckSquare,
  ListTodo,
  Clock,
  UserCheck,
  Building2,
  RefreshCw
} from 'lucide-react';
import {
  getProcessCatalog,
  purchaseAddonSeats,
  purchaseAddonModule
} from '@/app/actions/saasSubscription';

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

export default function AddonPurchaseModal({
  tenantId = null,
  subscription = null,
  entitlements = null,
  isOpen = false,
  onClose = null
}) {
  const [modalOpen, setModalOpen] = useState(isOpen);
  const [activeTab, setActiveTab] = useState('SEATS'); // 'SEATS' | 'MODULES'

  const [catalog, setCatalog] = useState([]);
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Listen for custom event 'open-addon-modal'
  useEffect(() => {
    const handleOpen = () => {
      setModalOpen(true);
      setSuccessMsg(null);
      setErrorMsg(null);
    };
    window.addEventListener('open-addon-modal', handleOpen);
    return () => {
      window.removeEventListener('open-addon-modal', handleOpen);
    };
  }, []);

  const isModalActive = modalOpen || isOpen;

  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const res = await getProcessCatalog(tenantId);
        if (isMounted && res.success) {
          setCatalog(res.catalog);
        }
      } catch (err) {
        console.error('Addon modal catalog fetch error:', err);
      }
    }
    if (isModalActive) {
      loadCatalog();
    }
    return () => {
      isMounted = false;
    };
  }, [isModalActive, tenantId]);

  if (!isModalActive) return null;

  const currentSeatLimit = subscription?.user_seat_limit || 5;
  const daysRemaining = subscription?.days_remaining || 30;

  // Calculate monthly rate per user across currently active modules
  const activeModuleKeys = entitlements ? Object.keys(entitlements).filter((k) => entitlements[k]) : [];
  const activeRatePerUser = catalog
    .filter((p) => activeModuleKeys.includes(p.process_code))
    .reduce((sum, p) => sum + Number(p.monthly_rate_per_user || 0), 0);

  // Prorated add-on seat cost for remaining days
  const effectiveMonthlyRate = activeRatePerUser > 0 ? activeRatePerUser : 199;
  const proratedMultiplier = Math.max(0.1, daysRemaining / 30);
  const estimatedSeatAddonCost = Math.round(additionalSeats * effectiveMonthlyRate * proratedMultiplier);

  const handleClose = () => {
    setModalOpen(false);
    onClose?.();
  };

  const handleAddSeats = async () => {
    if (!tenantId) {
      setErrorMsg('Tenant ID missing. Please refresh.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await purchaseAddonSeats(tenantId, additionalSeats);
      if (res.success) {
        setSuccessMsg(res.message);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'सीट जोड़ने में समस्या आई।');
      }
    } catch (err) {
      setErrorMsg(err.message || 'त्रुटि हुई।');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockModule = async (procCode) => {
    if (!tenantId) {
      setErrorMsg('Tenant ID missing. Please refresh.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await purchaseAddonModule(tenantId, procCode);
      if (res.success) {
        setSuccessMsg(res.message);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'मॉड्यूल अनलॉक करने में समस्या आई।');
      }
    } catch (err) {
      setErrorMsg(err.message || 'त्रुटि हुई।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#e0e7ff',
                color: '#4338ca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                ऐड-ऑन सीट्स एवं मॉड्यूल मैनेजर (SaaS Add-ons)
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                वर्तमान एक्टिव सीट्स: <strong>{currentSeatLimit} Users</strong> | शेष वैधता: <strong>{daysRemaining} दिन</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* FEEDBACK MESSAGES */}
        {errorMsg && (
          <div
            style={{
              margin: '1rem 1.5rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              margin: '1rem 1.5rem 0',
              padding: '0.75rem 1rem',
              backgroundColor: '#dcfce7',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#166534',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB TOGGLE */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '1rem 1.5rem 0',
            borderBottom: '1px solid #f1f5f9'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('SEATS')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.1rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: 'none',
              borderBottom: activeTab === 'SEATS' ? '3px solid #4f46e5' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'SEATS' ? '#4f46e5' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <UserPlus size={16} /> अतिरिक्त सीट्स जोड़ें (Add Seats)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MODULES')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.65rem 1.1rem',
              fontSize: '0.88rem',
              fontWeight: 700,
              border: 'none',
              borderBottom: activeTab === 'MODULES' ? '3px solid #4f46e5' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'MODULES' ? '#4f46e5' : '#64748b',
              cursor: 'pointer'
            }}
          >
            <Layers size={16} /> नए मॉड्यूल अनलॉक करें (Unlock Modules)
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '1.25rem 1.5rem', flex: 1 }}>
          {activeTab === 'SEATS' && (
            <div>
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem'
                }}
              >
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                  कितनी नई सीट्स जोड़नी हैं?
                </label>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', marginBottom: '0.85rem' }}>
                  नई सीट्स तुरंत एक्टिव हो जाएंगी और नए कर्मचारियों को सीधे रजिस्टर करने की अनुमति देंगी।
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setAdditionalSeats((prev) => Math.max(1, prev - 1))}
                    disabled={additionalSeats <= 1}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      cursor: additionalSeats <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700
                    }}
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={additionalSeats}
                    onChange={(e) => setAdditionalSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: '90px',
                      height: '40px',
                      textAlign: 'center',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff'
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setAdditionalSeats((prev) => prev + 1)}
                    style={{
                      width: '40px',
                      height: '40px',
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
                    <Plus size={16} />
                  </button>

                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                    अतिरिक्त सीट्स (+{additionalSeats})
                  </span>
                </div>

                {/* QUICK BUTTONS */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[1, 2, 5, 10, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setAdditionalSeats(num)}
                      style={{
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.78rem',
                        fontWeight: additionalSeats === num ? 700 : 500,
                        backgroundColor: additionalSeats === num ? '#4f46e5' : '#ffffff',
                        color: additionalSeats === num ? '#ffffff' : '#475569',
                        border: `1px solid ${additionalSeats === num ? '#4f46e5' : '#cbd5e1'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      +{num} {num === 1 ? 'Seat' : 'Seats'}
                    </button>
                  ))}
                </div>
              </div>

              {/* PRORATED PRICE SUMMARY */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 600 }}>
                    प्रो-राटा अनुमानित लागत (Remaining {daysRemaining} Days):
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a8a' }}>
                    ₹{estimatedSeatAddonCost.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#60a5fa' }}>
                    नई कुल सीमा होगी: {currentSeatLimit + additionalSeats} Users
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSeats}
                  disabled={loading}
                  style={{
                    padding: '0.75rem 1.35rem',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {loading ? <RefreshCw size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {loading ? 'प्रक्रिया जारी है...' : `सीट्स जोड़ें (+${additionalSeats})`}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'MODULES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.25rem' }}>
                अपने वर्कस्पेस में नए फीचर्स तुरंत अनलॉक करें:
              </div>

              {catalog.map((proc) => {
                const isAlreadyActive = Boolean(entitlements?.[proc.process_code]);
                const IconComp = PROCESS_ICONS[proc.process_code] || Zap;

                return (
                  <div
                    key={proc.process_code}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isAlreadyActive ? '#f8fafc' : '#ffffff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: isAlreadyActive ? '#dcfce7' : '#eff6ff',
                          color: isAlreadyActive ? '#15803d' : '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <IconComp size={18} />
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                          {proc.display_name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          ₹{proc.monthly_rate_per_user} / यूज़र / माह
                        </div>
                      </div>
                    </div>

                    {isAlreadyActive ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#dcfce7',
                          color: '#15803d',
                          padding: '0.3rem 0.65rem',
                          borderRadius: '6px'
                        }}
                      >
                        <CheckCircle2 size={14} /> एक्टिव (Active)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUnlockModule(proc.process_code)}
                        disabled={loading}
                        style={{
                          padding: '0.45rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          backgroundColor: '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <Sparkles size={14} /> अनलॉक करें
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.76rem',
            color: '#64748b'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={14} style={{ color: '#10b981' }} />
            <span>सुरक्षित मल्टी-टेनेंट SaaS लाइसेंसिंग</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: '0.4rem 0.85rem',
              backgroundColor: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            बंद करें (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
