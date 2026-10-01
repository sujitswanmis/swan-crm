'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  DollarSign,
  Building,
  Users,
  Calendar,
  Save,
  RefreshCw,
  PlusCircle,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Award
} from 'lucide-react';
import {
  getProcessCatalog,
  getCycleDiscounts,
  updateProcessRate,
  updateCycleDiscount,
  getAllTenantsWithSubscriptions,
  extendTenantSubscription,
  updateTenantSeats,
  updateTenantCustomRate
} from '@/app/actions/saasSubscription';

export default function SuperAdminSaasPanel() {
  const [activeTab, setActiveTab] = useState('pricing'); // 'pricing' | 'tenants'
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Pricing & Discounts State
  const [catalog, setCatalog] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [customRates, setCustomRates] = useState({});
  const [discountInputs, setDiscountInputs] = useState({});

  // Tenants State
  const [tenants, setTenants] = useState([]);
  const [extendingId, setExtendingId] = useState(null);
  const [seatModalTenant, setSeatModalTenant] = useState(null);
  const [newSeatValue, setNewSeatValue] = useState(5);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, cycleRes, tenantsRes] = await Promise.all([
        getProcessCatalog(),
        getCycleDiscounts(),
        getAllTenantsWithSubscriptions()
      ]);

      if (catRes.success) {
        setCatalog(catRes.catalog || []);
        const ratesMap = {};
        (catRes.catalog || []).forEach(c => {
          ratesMap[c.process_code] = c.monthly_rate_per_user;
        });
        setCustomRates(ratesMap);
      }

      if (cycleRes.success) {
        setCycles(cycleRes.cycles || []);
        const discMap = {};
        (cycleRes.cycles || []).forEach(cy => {
          discMap[cy.cycle_code] = cy.discount_percent;
        });
        setDiscountInputs(discMap);
      }

      if (tenantsRes.success) {
        setTenants(tenantsRes.tenants || []);
      }
    } catch (err) {
      console.error('Failed to load SaaS admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initData = async () => {
      try {
        const [catRes, cycleRes, tenantsRes] = await Promise.all([
          getProcessCatalog(),
          getCycleDiscounts(),
          getAllTenantsWithSubscriptions()
        ]);

        if (!isMounted) return;

        if (catRes.success) {
          setCatalog(catRes.catalog || []);
          const ratesMap = {};
          (catRes.catalog || []).forEach(c => {
            ratesMap[c.process_code] = c.monthly_rate_per_user;
          });
          setCustomRates(ratesMap);
        }

        if (cycleRes.success) {
          setCycles(cycleRes.cycles || []);
          const discMap = {};
          (cycleRes.cycles || []).forEach(cy => {
            discMap[cy.cycle_code] = cy.discount_percent;
          });
          setDiscountInputs(discMap);
        }

        if (tenantsRes.success) {
          setTenants(tenantsRes.tenants || []);
        }
      } catch (err) {
        console.error('Failed to load SaaS admin data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initData();
    return () => { isMounted = false; };
  }, []);

  const showNotification = (msg, isError = false) => {
    setStatusMessage({ text: msg, isError });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleSavePrice = async (processCode) => {
    const rate = customRates[processCode];
    if (isNaN(rate) || rate < 0) {
      showNotification('कृपया मान्य राशि दर्ज करें', true);
      return;
    }
    setSavingCode(processCode);
    try {
      const res = await updateProcessRate(processCode, rate);
      if (res.success) {
        showNotification(res.message);
      } else {
        showNotification(res.error || 'अपडेट करने में विफल', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setSavingCode(null);
    }
  };

  const handleSaveDiscount = async (cycleCode) => {
    const disc = discountInputs[cycleCode];
    if (isNaN(disc) || disc < 0 || disc > 100) {
      showNotification('कृपया 0 से 100 के बीच प्रतिशत दर्ज करें', true);
      return;
    }
    setSavingCode(cycleCode);
    try {
      const res = await updateCycleDiscount(cycleCode, disc);
      if (res.success) {
        showNotification(res.message);
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setSavingCode(null);
    }
  };

  const handleExtend = async (tenantId, months) => {
    setExtendingId(tenantId);
    try {
      const res = await extendTenantSubscription(tenantId, months);
      if (res.success) {
        showNotification(res.message);
        await loadData();
      } else {
        showNotification(res.error || 'वैलिडिटी बढ़ाने में विफल', true);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setExtendingId(null);
    }
  };

  const handleUpdateSeats = async () => {
    if (!seatModalTenant) return;
    try {
      const res = await updateTenantSeats(seatModalTenant.id, newSeatValue);
      if (res.success) {
        showNotification(res.message);
        setSeatModalTenant(null);
        await loadData();
      } else {
        showNotification(res.error, true);
      }
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>SaaS Master Control & Pricing Studio</h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#dbeafe', color: '#1d4ed8' }}>
              Master Admin
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.3rem 0 0 0' }}>
            लाइव प्रॉडक्ट प्राइसिंग, 8-मॉड्यूल कैटलॉग, डिस्काउंट और सभी टेनेंट्स का केंद्रीय प्रबंधन
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> रिफ्रेश करें
        </button>
      </div>

      {/* Status Toast */}
      {statusMessage && (
        <div style={{
          backgroundColor: statusMessage.isError ? '#fee2e2' : '#ecfdf5',
          color: statusMessage.isError ? '#991b1b' : '#065f46',
          border: `1px solid ${statusMessage.isError ? '#fecaca' : '#a7f3d0'}`,
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.25rem',
          fontSize: '0.9rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {statusMessage.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {statusMessage.text}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>कुल टेनेंट्स (Companies)</span>
            <Building size={18} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{tenants.length}</div>
          <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>1 Master + {Math.max(0, tenants.length - 1)} SaaS Workspaces</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>एक्टिव बिजनेस प्रोसेस</span>
            <Award size={18} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>8 Modules</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>100% Decoupled À la Carte</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <span>मास्टर प्रोडक्शन टेनेंट</span>
            <ShieldCheck size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>New Swan Group</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Branches: NSMLR & NSTLP (Unlimited)</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('pricing')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            borderBottom: activeTab === 'pricing' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'pricing' ? '#2563eb' : 'var(--text-secondary)'
          }}
        >
          <DollarSign size={16} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'text-bottom' }} />
          डायनामिक प्राइसिंग व कैटलॉग एडिटर
        </button>

        <button
          onClick={() => setActiveTab('tenants')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 600,
            borderBottom: activeTab === 'tenants' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'tenants' ? '#2563eb' : 'var(--text-secondary)'
          }}
        >
          <Building size={16} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'text-bottom' }} />
          कंपनी टेनेंट्स व सब्सक्रिप्शन ({tenants.length})
        </button>
      </div>

      {/* TAB 1: PRICING & DISCOUNTS */}
      {activeTab === 'pricing' && (
        <div>
          {/* Process Catalog Table */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              8 बिजनेस प्रोसेस - मंथली रेट एडिटर (₹ / यूज़र / माह)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              यहाँ कोई भी बदलाव करने पर वेबसाइट के कैलकुलेटर और नए सब्सक्रिप्शन इनवॉइस में तुरंत नया दाम लागू हो जाएगा।
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>कोड</th>
                    <th style={{ padding: '0.75rem 1rem' }}>प्रोसेस का नाम</th>
                    <th style={{ padding: '0.75rem 1rem' }}>कैटेगरी</th>
                    <th style={{ padding: '0.75rem 1rem' }}>विवरण</th>
                    <th style={{ padding: '0.75rem 1rem', width: '200px' }}>रेट (₹ / यूज़र / माह)</th>
                    <th style={{ padding: '0.75rem 1rem', width: '120px' }}>एक्शन</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map(item => (
                    <tr key={item.process_code} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.82rem' }}>
                        {item.process_code}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        {item.display_name}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: 'var(--bg-muted)' }}>
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {item.description}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600 }}>₹</span>
                          <input
                            type="number"
                            value={customRates[item.process_code] ?? item.monthly_rate_per_user}
                            onChange={(e) => setCustomRates({ ...customRates, [item.process_code]: Number(e.target.value) })}
                            style={{
                              width: '100px',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              background: 'var(--bg-surface)',
                              fontSize: '0.9rem',
                              fontWeight: 600
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          onClick={() => handleSavePrice(item.process_code)}
                          disabled={savingCode === item.process_code}
                          style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#fff',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Save size={13} /> {savingCode === item.process_code ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Billing Cycle Discounts */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              बिलिंग साइकिल्स और डिस्काउंट प्रतिशत (%)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              क्लाइंट जितने लंबी अवधि का प्लान लेगा, उसे उतना डिस्काउंट मिलेगा।
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {cycles.map(cycle => (
                <div key={cycle.cycle_code} style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{cycle.display_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        value={discountInputs[cycle.cycle_code] ?? cycle.discount_percent}
                        onChange={(e) => setDiscountInputs({ ...discountInputs, [cycle.cycle_code]: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '0.45rem 2rem 0.45rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-surface)',
                          fontWeight: 600
                        }}
                      />
                      <Percent size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    </div>
                    <button
                      onClick={() => handleSaveDiscount(cycle.cycle_code)}
                      disabled={savingCode === cycle.cycle_code}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#10b981',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {savingCode === cycle.cycle_code ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TENANTS & WORKSPACES */}
      {activeTab === 'tenants' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>कंपनी टेनेंट्स और एक्टिव प्लान्स</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                किसी भी क्लाइंट की वैलिडिटी (महीने) आगे बढ़ाएं या सीट्स कोटा अपडेट करें।
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>कंपनी का नाम</th>
                  <th style={{ padding: '0.75rem 1rem' }}>स्टेटस</th>
                  <th style={{ padding: '0.75rem 1rem' }}>सीट्स (Active / Limit)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>सक्रिय मॉड्यूल्स</th>
                  <th style={{ padding: '0.75rem 1rem' }}>एक्सपायरी डेट (IST)</th>
                  <th style={{ padding: '0.75rem 1rem', width: '280px' }}>क्विक एक्शन्स</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => {
                  const isDefault = t.id === '00000000-0000-0000-0000-000000000001';
                  const sub = t.subscription;
                  const expiryFormatted = sub?.valid_until
                    ? new Date(sub.valid_until).toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })
                    : 'N/A';

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {t.tenant_code} {isDefault && '• (Master Production)'}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          background: isDefault ? '#d1fae5' : (sub?.is_expired ? '#fee2e2' : (sub?.is_expiring_soon ? '#fef3c7' : '#dbeafe')),
                          color: isDefault ? '#065f46' : (sub?.is_expired ? '#991b1b' : (sub?.is_expiring_soon ? '#92400e' : '#1e40af'))
                        }}>
                          {isDefault ? 'LIFETIME ACTIVE' : (sub?.is_expired ? 'EXPIRED' : (sub?.is_expiring_soon ? 'EXPIRING SOON' : 'ACTIVE'))}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <strong>{t.active_users_count}</strong> / {isDefault ? 'Unlimited' : t.user_seat_limit}
                        {!isDefault && (
                          <button
                            onClick={() => {
                              setSeatModalTenant(t);
                              setNewSeatValue(t.user_seat_limit);
                            }}
                            style={{
                              marginLeft: '0.5rem',
                              border: 'none',
                              background: 'none',
                              color: '#2563eb',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              textDecoration: 'underline'
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {isDefault ? (
                            <span style={{ fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              All 8 Modules
                            </span>
                          ) : (
                            t.entitlements.map(mod => (
                              <span key={mod} style={{ fontSize: '0.72rem', background: 'var(--bg-muted)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                {mod}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        <div>{expiryFormatted}</div>
                        {sub?.days_remaining !== null && !isDefault && (
                          <div style={{ fontSize: '0.75rem', color: sub?.days_remaining <= 7 ? '#dc2626' : 'var(--text-secondary)' }}>
                            {sub.days_remaining > 0 ? `(${sub.days_remaining} दिन बाकी)` : '(समाप्त हो चुका)'}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        {isDefault ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Protected Master</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleExtend(t.id, 1)}
                              disabled={extendingId === t.id}
                              style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                background: '#fff',
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              +1 Month
                            </button>

                            <button
                              onClick={() => handleExtend(t.id, 6)}
                              disabled={extendingId === t.id}
                              style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #2563eb',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              +6 Months
                            </button>

                            <button
                              onClick={() => handleExtend(t.id, 12)}
                              disabled={extendingId === t.id}
                              style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#10b981',
                                color: '#fff',
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              +1 Year
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Seat Edit Modal */}
      {seatModalTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000
        }}>
          <div className="card" style={{ padding: '2rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>सीट लिमिट बदलें</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              कंपनी: <strong>{seatModalTenant.name}</strong>
            </p>

            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem', fontWeight: 500 }}>
              स्वीकृत कुल सीट्स (User Limit):
            </label>
            <input
              type="number"
              min="1"
              max="10000"
              value={newSeatValue}
              onChange={(e) => setNewSeatValue(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                marginBottom: '1.5rem',
                fontSize: '1rem',
                fontWeight: 600
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setSeatModalTenant(null)}
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'none', cursor: 'pointer' }}
              >
                रद्द करें
              </button>
              <button
                onClick={handleUpdateSeats}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                सेव करें
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
